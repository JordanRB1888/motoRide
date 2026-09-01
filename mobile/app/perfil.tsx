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
import { pedirAvisos } from '../services/avisos';
import { contarSinLeer } from '../domain/avisos';
import { useAvisosEnVivo } from '../realtime/avisosEnVivo';
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
  // La campana del perfil cuenta avisos REALES. Se pide aparte del perfil
  // porque son dos endpoints distintos, y un fallo al contar avisos no puede
  // impedir que se vea el perfil: se queda a cero y ya.
  const [sinLeer, setSinLeer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  /**
   * Sólo el contador.
   *
   * Aparte del perfil a propósito: son dos endpoints distintos, un fallo al
   * contar avisos no puede impedir que se vea el perfil, y un aviso nuevo no
   * tiene por qué recargar los datos de la persona.
   */
  const refrescarAvisos = useCallback(async () => {
    const bandeja = await pedirAvisos();
    if (bandeja.ok) setSinLeer(contarSinLeer(bandeja.datos));
  }, []);

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

    await refrescarAvisos();
  }, [refrescarAvisos]);

  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO') void cargar();
  }, [sesion.estado, cargar]);

  // La campana también se entera sola: un aviso nuevo mientras el perfil está
  // abierto cambia el contador sin que haya que salir y volver.
  useAvisosEnVivo(() => { void refrescarAvisos(); });

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
        sinLeer={sinLeer}
        cerrando={cerrando}
        onFila={abrir}
        onCerrarSesion={() => { void cerrarSesion(); }}
      />
    </ProveedorDeNavegacion>
  );
}

/**
 * A dónde lleva cada fila del perfil, HOY.
 *
 * Sólo las tres que existen como pantalla real. Las demás no hacen nada, y es
 * deliberado: mandar «Tu saldo» o «Direcciones guardadas» a una maqueta desde
 * la aplicación de verdad enseñaría datos inventados a una persona real. Dos de
 * ellas ni siquiera tienen backend.
 */
function abrir(clave: string) {
  if (clave === 'datos') router.push('/perfil-datos');
  if (clave === 'avisos') router.push('/avisos');
  if (clave === 'configuracion') router.push('/configuracion');
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
  if (clave === 'historial') router.replace('/historial');
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
