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
import { ShellCompartido } from '../navegacion/shellCompartido';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { shellDelRol } from '../domain/shellDeRol';
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
  // De quien es la barra de abajo: la decide el ROL que devuelve el servidor.
  const barraDelRol = shellDelRol(sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null) === 'conductor' ? 'conductor' : 'pasajera';

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
    <ShellCompartido cargando={<Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>}>
      <C2Perfil
        barra={barraDelRol}
        datos={datos}
        sinLeer={sinLeer}
        cerrando={cerrando}
        onFila={abrir}
        onCerrarSesion={() => { void cerrarSesion(); }}
      />
    </ShellCompartido>
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
  // «Cambiar de modo» es la puerta de quien ya tiene sesión abierta: la
  // bienvenida sólo se ve al entrar, y sin esto una persona con una solicitud
  // a medias no tendría por dónde volver a ella. Lleva a la postulación, que
  // pregunta al servidor y decide si empieza, continúa o enseña el estado.
  if (clave === 'conductor') router.push('/postulacion');
}

/**
 * A dónde llevan las pestañas de la barra, HOY.
 *
 * Sólo las dos que existen como ruta real. Las demás no hacen nada todavía, y
 * es deliberado: mandar «Saldo» a una pantalla de ejemplo desde la aplicación
 * de verdad enseñaría cifras inventadas a una persona real.
 */
// La tabla de navegacion ya no vive aqui: la trae `ShellCompartido`, que ademas
// elige la del rol real. Esta version entendia 'inicio', 'historial' y 'perfil'
// y nada mas, asi que el boton amarillo --que pide 'pedir'-- no hacia nada, y
// 'saldo' tampoco existia.

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
