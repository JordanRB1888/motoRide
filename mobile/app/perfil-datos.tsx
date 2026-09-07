/**
 * Editar el perfil, dentro de la ruta protegida.
 *
 * La pantalla no sabe de red: recibe el perfil y devuelve los cambios. Aquí se
 * traduce eso a `PATCH /api/auth/me` y se traducen sus errores de vuelta.
 *
 * EL SERVIDOR GANA
 *
 * Lo que se pinta después de guardar es lo que el servidor DEVOLVIÓ, no lo que
 * el formulario mandó: si recortó un espacio o pasó una placa a mayúsculas, esa
 * es la verdad.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { C2TusDatos } from '../preview/pantallaTusDatos';
import { Boton, Txt } from '../ui/componentes';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { guardarPerfil, pedirPerfil } from '../services/perfil';
import {
  erroresDelServidor,
  type BorradorDePerfil,
  type ErroresDeCampo,
  type PerfilDeUsuario
} from '../domain/perfil';

export default function PantallaDeTusDatos() {
  const tema = useTema();
  const { sesion } = useSesion();

  const [perfil, setPerfil] = useState<PerfilDeUsuario | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const respuesta = await pedirPerfil();
    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      return;
    }
    setPerfil(respuesta.datos);
  }, []);

  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO') void cargar();
  }, [sesion.estado, cargar]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  if (error !== null) {
    return (
      <Centro>
        <Txt nivel="cuerpo" centrado>{error}</Txt>
        <Boton titulo="Reintentar" onPress={() => { void cargar(); }} />
      </Centro>
    );
  }
  if (perfil === null) {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }

  /**
   * Devuelve los errores por campo, o `null` si se guardó.
   *
   * Un fallo sin campo concreto —sin red, servidor caído— devuelve un objeto
   * VACÍO, no `null`: la pantalla lo distingue y avisa sin decir que fue bien.
   */
  async function guardar(cambios: BorradorDePerfil): Promise<ErroresDeCampo | null> {
    const respuesta = await guardarPerfil(cambios);
    if (respuesta.ok) {
      setPerfil(respuesta.datos);
      return null;
    }
    return erroresDelServidor(respuesta.codigo, respuesta.detalle);
  }

  return (
    <C2TusDatos
      perfil={perfil}
      onVolver={() => router.back()}
      onGuardar={guardar}
    />
  );
}

function Centro({ children }: { readonly children: React.ReactNode }) {
  const tema = useTema();
  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: tema.ritmo.entreElementos,
      padding: tema.ritmo.margenPantalla,
      backgroundColor: tema.color.fondo
    }}>
      {children}
    </View>
  );
}
