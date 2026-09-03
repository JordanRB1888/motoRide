/**
 * Inicio de pasajera: el HUB aprobado, con datos de verdad.
 *
 * LO QUE HABÍA AQUÍ, Y POR QUÉ ERA UN PROBLEMA
 *
 * Una tarjeta que decía «el mapa y la solicitud de viaje llegan en la siguiente
 * entrega» y tres botones. La siguiente entrega llegó —`app/pedir.tsx` existe
 * desde PASSENGER-TRIP-1— pero nadie enlazó la puerta: desde aquí no se podía
 * llegar. El dueño, sin botón, entró por el laboratorio y vio el recorrido de
 * diseño con sus datos de ejemplo creyendo que era la aplicación.
 *
 * ES LA MISMA PANTALLA QUE EL RECORRIDO DE DISEÑO
 *
 * `C2InicioPasajera` se importa, no se copia, igual que el conductor importa
 * `C2InicioConductor`. Lo único que cambia es de dónde salen los datos: el
 * nombre de la sesión, y NADA de lo que todavía no existe de verdad —ni tasa,
 * ni campañas, ni aliados, ni sitios guardados—. Lo que no hay, no se pinta.
 *
 * Con guardia de sesión: sin sesión confirmada por el backend aquí no se
 * entra. La comprobación mira el ESTADO real, no la ruta ni la preferencia
 * guardada — un enlace profundo no puede saltársela.
 *
 * EL AVISO DE LA POSTULACIÓN
 *
 * Quien mandó una solicitud para conducir se enteraba de la respuesta sólo si
 * se le ocurría entrar al perfil y tocar «Cambiar de modo». Ahora el inicio se
 * lo dice, en la tarjeta que Antigravity dejó preparada bajo el buscador.
 *
 * Esa tarjeta NO bloquea nada. El inicio se pinta entero aunque la consulta
 * tarde o falle: si no hay respuesta, no hay tarjeta, y el mapa, el buscador y
 * los servicios siguen ahí. Un expediente es una noticia, no un requisito para
 * pedir una carrera.
 */

import { useEffect, useMemo } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { C2InicioPasajera, type DatosDelInicio } from '../preview/pantallaInicioPasajera';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { useViajeActivo } from '../realtime/ViajeActivo';
import { useEstadoDePostulacion } from '../context/EstadoDePostulacion';
import { avisoDePostulacion } from '../domain/avisoDePostulacion';
import { expedienteParaElInicio } from '../services/postulacion';
import { CAMARA_DE_MARACAIBO, type ModeloDelMapa } from '../mapa/modelo';

/** Modelo estable: evita reconstruir el mapa cada vez que cambia la hoja. */
const MAPA_DEL_HOME: ModeloDelMapa = Object.freeze({
  camara: CAMARA_DE_MARACAIBO,
  marcadores: Object.freeze([]),
  ruta: Object.freeze([]),
  eligiendoPunto: false,
  aireInferior: 96
});

/**
 * De clave a ruta REAL.
 *
 * Las claves son las mismas que usa el recorrido de diseño —los componentes
 * son los mismos— pero aquí llevan a las rutas con sesión. Lo que todavía no
 * tiene pantalla real no navega a ninguna parte: mejor un toque que no hace
 * nada que un toque que abre una pantalla de ejemplo.
 */
function irA(clave: string, parametros?: Record<string, string>) {
  if (clave === 'pedir') { router.push('/pedir'); return; }
  if (clave === 'historial') { router.replace('/historial'); return; }
  if (clave === 'perfil') { router.replace('/perfil'); return; }
  if (clave === 'avisos') { router.push('/avisos'); return; }
  // La casilla grande de «Viajes» es la otra puerta a pedir. El resto de
  // servicios —comercios, envíos, comida— no existen aún de verdad.
  if (clave === 'servicio' && parametros?.servicio === 'viajes') { router.push('/pedir'); }
}

/** Las iniciales de un nombre, para el disco de la cabecera. */
function inicialesDe(nombre: string, apellido: string): string {
  const letras = [nombre, apellido].map(parte => parte.trim().charAt(0).toUpperCase()).filter(Boolean);
  return letras.join('') || '·';
}

export default function InicioDePasajera() {
  const tema = useTema();
  const { sesion, revalidar } = useSesion();
  const { estado: viajeActivo } = useViajeActivo();

  /**
   * Volver al viaje en marcha.
   *
   * Si alguien cierra la aplicación con un viaje en curso y la vuelve a abrir,
   * no puede aparecer en el inicio como si no pasara nada. Sólo con
   * `CON_VIAJE`: durante `RESINCRONIZANDO` o `ERROR` no se salta, porque lo
   * que se sabe puede estar viejo y un salto de pantalla es lo más brusco que
   * puede hacer una aplicación sola.
   */
  useEffect(() => {
    if (viajeActivo.fase === 'CON_VIAJE') router.replace('/viaje-activo');
  }, [viajeActivo.fase]);

  const usuario = sesion.estado === 'AUTENTICADO' ? sesion.usuario : null;
  // Sólo se pregunta con sesión confirmada: el expediente es de alguien.
  const { solicitud } = useEstadoDePostulacion({ activo: usuario !== null });

  /**
   * Qué decir de la postulación, si hay algo que decir.
   *
   * La traducción de estado a palabras vive en el dominio, y el destino de cada
   * botón sale de `destinoDePostulacion`. Aquí no se decide nada: se pinta lo
   * que sale de ahí y se conecta la navegación.
   */
  const avisoPostulacion = useMemo(() => {
    const aviso = avisoDePostulacion(expedienteParaElInicio(solicitud), { rolReal: usuario?.role ?? null });
    if (aviso === null) return null;

    const abrir = () => {
      // Al aprobarse, primero se le vuelve a preguntar al servidor quién es
      // esta persona. El rol lo concede el backend; la aplicación no se lo
      // escribe a sí misma. La pantalla de estado lleva a conducir en cuanto
      // el backend lo reconoce, y si todavía no, deja ver el estado.
      if (aviso.revalidarLaSesion) {
        void revalidar().finally(() => { router.push(aviso.destino); });
        return;
      }
      router.push(aviso.destino);
    };

    return {
      variante: aviso.variante,
      titulo: aviso.titulo,
      descripcion: aviso.descripcion,
      etiqueta: aviso.etiqueta,
      ...(aviso.textoCTA === null ? { mostrarCTA: false } : { textoCTA: aviso.textoCTA, mostrarCTA: true }),
      onPress: abrir,
      testID: aviso.testID
    };
  }, [solicitud, usuario, revalidar]);


  // Sólo lo que es de verdad. La tasa, las campañas, los aliados y los sitios
  // guardados no tienen todavía una fuente real: no se inventan.
  const datos: DatosDelInicio | null = useMemo(() => {
    if (usuario === null) return null;
    return {
      nombre: usuario.firstName || 'bienvenida',
      iniciales: inicialesDe(usuario.firstName ?? '', usuario.lastName ?? ''),
      zona: null,
      tasa: null,
      avisosSinLeer: 0,
      lugares: [],
      campanas: [],
      conAliados: false
    };
  }, [usuario]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tema.color.fondo }}>
        <ActivityIndicator color={tema.color.acento} size="large" />
      </View>
    );
  }

  // Sin autoridad fresca no se entra. `SIN_VERIFICAR` incluido: hay token, pero
  // nadie ha confirmado que valga.
  if (sesion.estado !== 'AUTENTICADO' || datos === null) return <Redirect href="/" />;

  return (
    <ProveedorDeNavegacion ir={irA}>
      <C2InicioPasajera datos={datos} modeloDelMapa={MAPA_DEL_HOME} avisoPostulacion={avisoPostulacion} />
    </ProveedorDeNavegacion>
  );
}
