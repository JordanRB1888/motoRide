/**
 * El perfil REAL, dentro de la ruta protegida.
 *
 * Primera pantalla de la interfaz nueva que se monta con datos de verdad. La
 * misma pieza que enseña el recorrido de diseño con el fixture —`C2Perfil`—,
 * aquí con la persona que entró.
 *
 * LA GUARDA ES LA MISMA DE SIEMPRE
 *
 * Sin sesión confirmada por el backend no se entra, y se comprueba el ESTADO,
 * no la ruta. Eso es lo que hace que volver atrás después de cerrar sesión no
 * devuelva a nadie aquí: al remontarse, el estado ya es `SIN_SESION` y
 * redirige. No hace falta manipular la pila de navegación.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { C2Perfil, type DatosDelPerfil } from '../preview/pantallasC2Secciones';
import { Boton, Txt } from '../ui/componentes';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { fuenteDeFoto, pedirPerfil } from '../services/perfil';
import {
  desdeCuando,
  inicialesDe,
  nombreDe,
  type PerfilDeUsuario
} from '../domain/perfil';

type Foto = { readonly uri: string; readonly headers?: Record<string, string> } | null;

export default function PantallaDePerfil() {
  const tema = useTema();
  const { sesion, salir } = useSesion();

  const [perfil, setPerfil] = useState<PerfilDeUsuario | null>(null);
  const [foto, setFoto] = useState<Foto>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const respuesta = await pedirPerfil();
    if (!respuesta.ok) {
      // Un fallo de red NO es una sesión inválida: aquí sólo se pinta el aviso
      // y se ofrece reintentar. Quien decide cerrar la sesión es el contexto,
      // y sólo ante un 401 de verdad.
      setError(respuesta.mensaje);
      return;
    }
    setPerfil(respuesta.datos);
    setFoto(await fuenteDeFoto(respuesta.datos));
  }, []);

  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO') void cargar();
  }, [sesion.estado, cargar]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }

  // Sin autoridad fresca no se entra. `SIN_VERIFICAR` incluido: hay token, pero
  // nadie ha confirmado que valga.
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

  const datos: DatosDelPerfil = {
    iniciales: inicialesDe(perfil),
    nombre: nombreDe(perfil),
    desde: desdeCuando(perfil),
    verificada: perfil.isVerified,
    // El backend NO devuelve cuántos viajes lleva alguien en `/api/auth/me`.
    // Se deja vacío y el sello no se pinta, en vez de inventar un número.
    viajes: null,
    foto
  };

  async function cerrarSesion() {
    if (cerrando) return;
    setCerrando(true);
    await salir('PETICION_DE_LA_PERSONA');
    // `replace` y no `push`: la pantalla protegida no debe quedar en la pila.
    // Aunque quedara, su guarda volvería a echar a quien vuelva.
    router.replace('/');
  }

  return (
    <ProveedorDeNavegacion ir={irA}>
      <C2Perfil
        datos={datos}
        cerrando={cerrando}
        onFila={clave => { if (clave === 'datos') router.push('/perfil-datos'); }}
        onCerrarSesion={() => { void cerrarSesion(); }}
      />
    </ProveedorDeNavegacion>
  );
}

/**
 * A dónde llevan las pestañas de la barra, HOY.
 *
 * Sólo las dos que existen como ruta real. Las demás no hacen nada todavía, y
 * es deliberado: mandar «Saldo» a una pantalla de ejemplo desde la aplicación
 * de verdad enseñaría cifras inventadas a una persona real.
 */
function irA(clave: string) {
  if (clave === 'inicio') router.replace('/pasajero');
  if (clave === 'perfil') router.replace('/perfil');
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
