/**
 * Pedir una carrera, de verdad.
 *
 * EL RECORRIDO
 *
 *   tu GPS  ──▶  origen
 *   mueve el mapa  ──▶  destino
 *   moto o auto
 *        ↓
 *   POST /api/pricing/estimate   ← el precio lo pone el servidor
 *        ↓
 *   POST /api/trips/create       ← y el viaje también
 *        ↓
 *   el almacén del viaje activo pasa a mandar  →  C2BuscandoVehiculo
 *
 * ES LA MISMA PANTALLA QUE APROBÓ EL DUEÑO
 *
 * Las tarjetas de moto y auto, el trayecto, la hoja inferior y la barra son los
 * componentes del recorrido de diseño, importados, no copiados. Lo único que
 * cambia es que los datos son reales y los botones hacen algo.
 *
 * LO QUE ESTA PANTALLA NO HACE
 *
 * No calcula precios. No inventa direcciones ni horas de llegada. No dibuja la
 * ruta —eso llega con su color propio, verde, en su fase—. Y no se queda con el
 * viaje una vez creado: a partir de ahí la autoridad es el almacén.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { Boton } from '../components/Boton';
import { Txt } from '../ui/componentes';
import { HojaInferior } from '../ui/HojaInferior';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LienzoDeMapa } from '../ui/Mapa';
import { Trayecto } from '../ui/Trayecto';
import {
  ALTO_DE_LA_BARRA, BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA
} from '../ui/Navegacion';
import { FilaDeVehiculo, type PrecioDeTarjeta } from '../preview/pantallasC2';
import { crearNavegacionDePasajero } from '../navegacion/shellDePasajero';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { useViajeActivo } from '../realtime/ViajeActivo';
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import { CAMARA_DE_MARACAIBO, distanciaKm } from '../mapa/modelo';
import { crearViaje, pedirEstimacion } from '../services/pedido';
import {
  claveDeIntento,
  estadoDelFallo,
  huellaDelIntento,
  PAGO_DE_ESTA_FASE,
  mensajeDelFallo,
  queFaltaParaPedir,
  puedeEstimar,
  puedePedir,
  type Estimacion,
  type FaseDelPedido,
  type PuntoDelViaje,
  type QueFalta,
  type TipoEnLaPantalla
} from '../domain/pedirViaje';

/**
 * Cómo se llama en el campo el destino elegido.
 *
 * Con dirección, la dirección. Sin ella --un punto del mapa no tiene nombre--
 * se dice lo que es, y no se le inventa uno.
 */
function nombreDelDestino(punto: PuntoDelViaje): string {
  return punto.direccion ?? 'El punto que elegiste';
}

/**
 * Menos de esto no es moverse: es el reticulo sin tocar sobre donde ya estas.
 * Cincuenta metros son media cuadra de Maracaibo.
 */
const DISTANCIA_MINIMA_KM = 0.05;

/** Lo que se le dice a quien no puede pedir todavía. */
const AVISO: Readonly<Record<QueFalta, string>> = Object.freeze({
  NADA: '',
  ORIGEN: 'Buscando dónde estás…',
  DESTINO: 'Elige a dónde vas',
  // Fuera de zona NO es un fallo: es que ahí todavía no llegamos.
  ORIGEN_FUERA_DEL_AREA: 'Todavía no operamos donde estás. Sólo Maracaibo, por ahora.',
  DESTINO_FUERA_DEL_AREA: 'Ese destino queda fuera de Maracaibo'
});

/**
 * Como se llama el punto de recogida en la hoja.
 *
 * «Tu ubicacion ahora» solo es verdad cuando viene del GPS. Si se eligio otro
 * sitio, seguir diciendolo seria mentir sobre donde va a llegar la moto, que es
 * justo el dato que no se puede equivocar.
 */
function nombreDelOrigen(punto: PuntoDelViaje): string {
  if (punto.fuente === 'gps') return 'Tu ubicación ahora';
  return punto.direccion ?? 'Punto elegido en el mapa';
}

export default function PantallaDePedir() {
  const tema = useTema();
  // Lo que la barra deja ocupado abajo. La hoja necesita saberlo para no
  // meter su botón por debajo de ella.
  const margenSeguroInferior = useSafeAreaInsets().bottom;
  const { sesion } = useSesion();
  const { estado: viajeActivo, refrescar: refrescarViaje } = useViajeActivo();
  const { estado: ubicacion, pedirUbicacion } = useUbicacion();

  // El permiso se pide AQUÍ: acaba de abrir «Pedir», así que saber dónde está
  // es exactamente lo que hace falta y el momento se explica solo.
  useEffect(() => { void pedirUbicacion(); }, [pedirUbicacion]);

  const [tipo, setTipo] = useState<TipoEnLaPantalla>('MOTO');
  const [destino, setDestino] = useState<PuntoDelViaje | null>(null);

  /**
   * EL ORIGEN PUEDE NO SER DONDE ESTAS
   *
   * Por omision es el GPS, que es lo que acierta casi siempre. Pero se pide un
   * viaje desde un portal cuando todavia se esta dentro, o para alguien que
   * espera en otra esquina, y sin poder cambiarlo la moto llega al sitio
   * equivocado. Cuando alguien elige un punto de recogida, manda sobre el GPS.
   */
  const [origenElegido, setOrigenElegido] = useState<PuntoDelViaje | null>(null);

  /**
   * LO QUE DEVUELVE LA BUSQUEDA.
   *
   * Viaja por los parametros de la ruta y no por un estado global: es un dato
   * que va de una pantalla a la siguiente y nada mas. `volverAlGps` es la
   * forma de deshacer una recogida elegida a mano sin tener que salir y
   * volver a entrar.
   */
  const elegido = useLocalSearchParams<{
    campo?: string;
    puntoLat?: string;
    puntoLng?: string;
    puntoNombre?: string;
    volverAlGps?: string;
    elegirEnMapa?: string;
  }>();

  // Quien pulso «mejor lo elijo en el mapa» dentro del buscador llega aqui con
  // el mapa ya abierto, y sobre el campo que estaba buscando.
  useEffect(() => {
    const cual = elegido.elegirEnMapa;
    if (cual !== 'origen' && cual !== 'destino') return;
    setCampoQueSeElige(cual);
    setEligiendoEnMapa(true);
    router.setParams({ elegirEnMapa: undefined } as never);
  }, [elegido.elegirEnMapa]);

  useEffect(() => {
    if (elegido.volverAlGps === '1') {
      setOrigenElegido(null);
      // Se vuelve a preguntar al telefono: la posicion guardada puede tener ya
      // varios minutos, y quien acaba de pedir «mi ubicacion» espera la de ahora.
      void actualizarMiUbicacion();
      router.setParams({ volverAlGps: undefined } as never);
      return;
    }
    const lat = Number(elegido.puntoLat);
    const lng = Number(elegido.puntoLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const punto: PuntoDelViaje = {
      lat,
      lng,
      // El nombre del sitio SI se conserva: se eligio de una lista, asi que no
      // se esta inventando nada. Un punto del mapa, en cambio, no tiene nombre.
      direccion: typeof elegido.puntoNombre === 'string' && elegido.puntoNombre !== ''
        ? elegido.puntoNombre
        : null,
      precision: null,
      fuente: 'mapa'
    };
    if (elegido.campo === 'origen') setOrigenElegido(punto);
    else setDestino(punto);

    // Se limpian: si se quedaran puestos, volver a esta pantalla por cualquier
    // otro camino los aplicaria otra vez.
    router.setParams({
      puntoLat: undefined, puntoLng: undefined, puntoNombre: undefined, campo: undefined
    } as never);
  }, [elegido.campo, elegido.puntoLat, elegido.puntoLng, elegido.puntoNombre, elegido.volverAlGps]);
  /**
   * ELEGIR EN EL MAPA ES UN MODO, NO UN EFECTO SECUNDARIO
   *
   * Antes el retículo estaba siempre puesto y el destino se fijaba solo en
   * cuanto el mapa se movía medio centímetro: nadie confirmaba nada, y la
   * pantalla decía «el punto que elegiste» de un punto que nadie eligió.
   *
   * Ahora se entra a elegir a propósito --desde «¿A dónde vas?» o desde
   * «Escoger en el mapa»--, el centro del mapa es sólo un CANDIDATO mientras
   * se mueve, y hace falta confirmarlo para que sea el destino.
   */
  const [eligiendoEnMapa, setEligiendoEnMapa] = useState(false);
  /** Cual de los dos puntos se esta señalando en el mapa. */
  const [campoQueSeElige, setCampoQueSeElige] = useState<'origen' | 'destino'>('destino');
  const [candidato, setCandidato] = useState<PuntoDelViaje | null>(null);
  /** Lo que ocupa la hoja, medido. El mapa lo necesita para no esconder su
   *  punto de mira debajo de ella. */
  const [altoDeLaHoja, setAltoDeLaHoja] = useState(0);
  const [fase, setFase] = useState<FaseDelPedido>('ELIGIENDO');
  /** La clave de ESTE intento de pedir. Vive mientras la huella no cambie. */
  const claveDelIntento = useRef<string | null>(null);
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  /**
   * El origen sale del GPS.
   *
   * Sin dirección: nadie la ha escrito ni elegido, y el servidor no la exige.
   * Poner «Mi ubicación» la mandaría hasta la pantalla del conductor como si
   * fuera un sitio al que puede ir.
   */
  const origen: PuntoDelViaje | null = useMemo(() => {
    // Lo elegido a mano manda sobre el GPS: quien lo cambio sabe algo que el
    // telefono no.
    if (origenElegido !== null) return origenElegido;
    const posicion = ubicacion.posicion;
    if (posicion === null) return null;
    return {
      lat: posicion.lat,
      lng: posicion.lng,
      direccion: null,
      precision: posicion.precision,
      fuente: 'gps'
    };
  }, [ubicacion.posicion, origenElegido]);

  const falta = queFaltaParaPedir(origen, destino);

  // LA HUELLA DEL INTENTO
  //
  // Mientras no cambie, los toques y los reintentos son EL MISMO intento y
  // llevan la misma clave de idempotencia. Cuando cambia, es otro viaje.
  //
  // Incluye el origen, que el borrado por destino y tipo se dejaba fuera: si
  // alguien cruza la calle para que le recojan enfrente, eso es otro viaje aunque
  // el destino sea el mismo. Va redondeado para que el temblor del GPS no
  // cuente como cambio.
  const huella = huellaDelIntento({ origen, destino, tipo, pago: PAGO_DE_ESTA_FASE });

  // Cambiar cualquier cosa invalida el precio: era el de otro recorrido, y con
  // él la clave, que era la de otro intento.
  useEffect(() => {
    setEstimacion(null);
    setProblema(null);
    claveDelIntento.current = null;
    setFase(previa => (previa === 'PIDIENDO' ? previa : 'ELIGIENDO'));
  }, [huella]);

  // ---------------------------------------------------------------------
  // Preguntar el precio
  // ---------------------------------------------------------------------
  const estimar = useCallback(async () => {
    if (origen === null || destino === null) return;
    if (!puedeEstimar(fase, falta)) return;

    setFase('ESTIMANDO');
    setProblema(null);

    const respuesta = await pedirEstimacion(tipo, origen, destino);
    if (!respuesta.ok) {
      setFase('RECHAZADO');
      setProblema(mensajeDelFallo(estadoDelFallo(respuesta), respuesta.mensaje));
      return;
    }

    setEstimacion(respuesta.datos);
    setFase('CON_PRECIO');
  }, [origen, destino, tipo, fase, falta]);

  // ---------------------------------------------------------------------
  // Crear el viaje
  // ---------------------------------------------------------------------
  //
  // UNA SOLA CREACIÓN EN VUELO
  //
  // `PIDIENDO` cierra la puerta hasta que el servidor responda. Sin eso, tres
  // toques seguidos —que es lo que hace cualquiera cuando algo tarda— serían
  // tres viajes buscando conductor a la vez.
  const pedir = useCallback(async () => {
    if (origen === null || destino === null) return;
    if (!puedePedir(fase, estimacion, viajeActivo.fase === 'CON_VIAJE', falta)) return;

    setFase('PIDIENDO');
    setProblema(null);

    // LA CLAVE DEL INTENTO, GENERADA UNA SOLA VEZ
    //
    // Se guarda para que un reintento --el segundo toque, o el reenvío después
    // de que se caiga la red-- lleve LA MISMA. El servidor devuelve entonces el
    // viaje que ya creó en vez de crear otro. Si se generase una por envío, un
    // corte de red a mitad acabaría en dos carreras y dos cobros.
    claveDelIntento.current ??= claveDeIntento();

    const respuesta = await crearViaje({
      origen,
      destino,
      tipo,
      clave: claveDelIntento.current
    });

    if (!respuesta.ok) {
      const estado = estadoDelFallo(respuesta);

      // YA HAY UN VIAJE EN MARCHA
      //
      // No es un fallo que haya que enseñar como tal: la persona ya tiene una
      // carrera y lo que quiere es verla. Se la enseña. El servidor manda el
      // viaje en el mismo 409, así que no hace falta preguntar otra vez.
      if (estado === 'ACTIVE_TRIP_EXISTS') {
        refrescarViaje();
        router.replace('/viaje-activo');
        return;
      }

      // SIN RED NO SE INVENTA NADA
      //
      // Ni viaje local, ni cola optimista, ni «ya se enviará». La clave del
      // intento SE CONSERVA: si el envío llegó y sólo se perdió la respuesta,
      // el reintento lleva la misma clave y el servidor devuelve aquel viaje
      // en vez de crear otro.
      setFase('RECHAZADO');
      setProblema(mensajeDelFallo(estado, respuesta.mensaje));
      return;
    }

    // A partir de aquí manda el almacén del viaje activo, no esta pantalla. Se
    // le pide que vuelva a preguntar al servidor —él es quien consulta
    // `/api/trips/active/me`— y la superficie del viaje aparece sola.
    refrescarViaje();
    router.replace('/viaje-activo');
  }, [origen, destino, tipo, fase, estimacion, viajeActivo.fase, refrescarViaje]);

  // EL MODELO DEL MAPA SE MEMORIZA, Y NO ES UN DETALLE
  //
  // El mapa nativo mueve la camara cuando cambia `modelo.camara` POR
  // IDENTIDAD. Construir el modelo inline hacia que cada `setDestino`
  // fabricara una camara nueva, el mapa se moviera, avisara de su centro y
  // volviera a `setDestino`: un bucle que React corta con «Maximum update
  // depth exceeded». Se vio en el emulador, no en las pruebas.
  //
  // Solo depende del origen: la camara arranca sobre ti y el reticulo esta
  // siempre puesto, elijas lo que elijas.
  //
  // LA CAMARA SE MEMORIZA APARTE, y hace falta: el modelo cambia tambien
  // cuando se mide la hoja, y si la camara viajara dentro con identidad nueva
  // el mapa se movería cada vez que la hoja crece. Sólo depende del origen.
  const camara = useMemo(
    () => (origen === null
      ? CAMARA_DE_MARACAIBO
      : { ...CAMARA_DE_MARACAIBO, centro: { lat: origen.lat, lng: origen.lng } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origen?.lat, origen?.lng]
  );

  const modelo = useMemo(() => ({
    camara,
    marcadores: [],
    ruta: [],
    // El reticulo de «mueve el mapa, no el pin». Solo mientras se elige: un
    // punto de mira permanente sobre un mapa que no esta eligiendo nada
    // promete una interaccion que no existe.
    eligiendoPunto: eligiendoEnMapa,
    // Sólo mientras se elige: el hueco de la hoja sube el centro del mapa --y
    // con él el punto de mira-- hasta la parte que se ve. Fuera de ese modo no
    // hay nada que apartar.
    aireInferior: eligiendoEnMapa ? altoDeLaHoja : 0
  }), [camara, eligiendoEnMapa, altoDeLaHoja]);

  // ---------------------------------------------------------------------
  // Elegir el destino en el mapa
  // ---------------------------------------------------------------------
  /**
   * Buscar un sitio ESCRIBIENDOLO.
   *
   * Tocar un campo que parece de texto y que se abra un mapa es lo contrario
   * de lo que espera cualquiera: se toca para escribir. Antes los dos campos y
   * el enlace del mapa hacian lo mismo --abrir el mapa-- y no habia forma de
   * teclear una direccion.
   *
   * `campo` decide si lo que vuelve es la recogida o el destino. La busqueda
   * se sesga hacia donde esta el telefono, para que salga primero lo cercano.
   */
  const buscarEscribiendo = useCallback((campo: 'origen' | 'destino') => {
    const cerca = origen ?? destino;
    router.push({
      pathname: '/destino',
      params: {
        campo,
        ...(cerca ? { lat: String(cerca.lat), lng: String(cerca.lng) } : {})
      }
    } as never);
  }, [origen, destino]);

  const abrirElMapa = useCallback(() => {
    setEligiendoEnMapa(true);
    // Se arranca desde donde ya estaba el destino, si lo habia: corregir un
    // punto es mas facil que volver a buscarlo desde cero.
    setCandidato(destino);
  }, [destino]);

  const confirmarElPunto = useCallback(() => {
    if (candidato === null) return;
    if (campoQueSeElige === 'origen') setOrigenElegido(candidato);
    else setDestino(candidato);
    setEligiendoEnMapa(false);
    setCandidato(null);
  }, [candidato, campoQueSeElige]);

  const dejarDeElegir = useCallback(() => {
    setEligiendoEnMapa(false);
    setCandidato(null);
  }, []);

  /**
   * Volver a preguntarle al telefono donde esta.
   *
   * `pedirUbicacion` pide el permiso si hace falta y una lectura nueva. Es lo
   * que corresponde a tocar «Tu ubicacion ahora»: confirmar que el punto de
   * recogida es el de verdad, no uno de hace un rato.
   */
  const actualizarMiUbicacion = useCallback(() => { void pedirUbicacion(); }, [pedirUbicacion]);

  // ---------------------------------------------------------------------
  // Guardias
  //
  // TODOS LOS HOOKS QUEDAN POR ENCIMA DE ESTA LINEA.
  //
  // Debajo hay cuatro salidas condicionales, y un hook por debajo de ellas
  // se ejecuta unas veces si y otras no. React cuenta los hooks de cada
  // render: en el arranque en frio la sesion pasa por ARRANCANDO --sale por
  // la primera puerta, con menos hooks-- y al render siguiente ya esta
  // AUTENTICADO y los ejecuta todos. Esa diferencia no da un aviso: tumba la
  // pantalla con "Rendered more hooks than during the previous render".
  // ---------------------------------------------------------------------
  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tema.color.fondo }}>
        <ActivityIndicator color={tema.color.acento} size="large" />
      </View>
    );
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;
  if (sesion.usuario.role !== 'passenger') return <Redirect href="/conductor" />;

  // Con un viaje en marcha no se pide otro. El servidor también lo impediría,
  // pero enseñar la pantalla de pedir a quien ya va en una moto es mentirle.
  if (viajeActivo.fase === 'CON_VIAJE') return <Redirect href="/viaje-activo" />;

  // La tabla completa del shell. Antes solo entendia 'inicio', asi que desde
  // aqui las pestanas de Historial, Saldo y Perfil no hacian nada.
  //
  // `enPedir` es lo unico propio de esta pantalla: estando ya en Pedir, el
  // boton amarillo cierra y vuelve al inicio en vez de abrir la hoja.
  const irA = crearNavegacionDePasajero({ enPedir: true });

  const trabajando = fase === 'ESTIMANDO' || fase === 'PIDIENDO';

  // El importe del servidor, solo en la tarjeta del vehiculo que se estimo.
  const precioDeTarjeta = (vehiculo: TipoEnLaPantalla): PrecioDeTarjeta | undefined => {
    if (estimacion === null || estimacion.tipo !== vehiculo) return undefined;
    return {
      dolares: `$${estimacion.dolares.toFixed(2)}`,
      bolivares: estimacion.bolivares === null ? null : `Bs. ${estimacion.bolivares.toFixed(2)}`
    };
  };

  return (
    <ProveedorDeNavegacion ir={irA}>
      <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
        <LienzoDeMapa
          conControles={false}
          modelo={modelo}
          onCentro={centro => {
            // EL CENTRO ES UN CANDIDATO, NO EL DESTINO
            //
            // Aquí se hacía `setDestino` en cuanto el mapa se movía: bastaba
            // con arrastrarlo sin querer para que la pantalla diera por
            // elegido un sitio que nadie eligió. Ahora sólo se apunta lo que
            // hay bajo el retículo; el destino se fija al CONFIRMAR.
            if (!eligiendoEnMapa) return;
            // El mismo punto dos veces no: el mapa avisa al asentarse aunque
            // nadie lo haya tocado, y repintarlo no cambia nada.
            if (candidato !== null && distanciaKm(candidato, centro) < 0.001) return;
            setCandidato({
              lat: centro.lat,
              lng: centro.lng,
              // Sin dirección: se eligió un punto en el mapa, no un sitio con
              // nombre. Inventarle uno sería peor que no tenerlo.
              direccion: null,
              precision: null,
              fuente: 'mapa'
            });
          }}
        >
          {/* LA HOJA CRECE CON SU CONTENIDO, Y DEJA EL HUECO DE LA BARRA
            *
            * Las dos cosas hacen falta y ninguna basta sola.
            *
            * `espacioInferior` porque la hoja llega hasta el fondo de la
            * pantalla y la barra de navegación se pinta encima: sin él, el
            * botón «Pedir viaje» quedaba DEBAJO de la barra. Se veía entero y
            * era imposible pulsarlo — en el centro el toque se lo llevaba el
            * disco, que cierra la petición, y a los lados una pestaña, que
            * navegaba a otra pantalla. Se llegaba a ver el precio y ahí se
            * acababa el camino.
            *
            * `alturaAutomatica` porque con la altura fija del estado «media» el
            * contenido crece al llegar el precio y el botón se salía por abajo
            * del área visible: el hueco lo apartaba de la barra y a cambio lo
            * dejaba fuera de la hoja. Creciendo con el contenido no se recorta
            * nada, que es como lo hace el recorrido de diseño. */}
          <HojaInferior
            alturaAutomatica
            desplazable
            espacioInferior={ALTO_DE_LA_BARRA + Math.max(margenSeguroInferior, 8)}
            onAlto={setAltoDeLaHoja}
          >
            {eligiendoEnMapa ? null : (
            <Trayecto
              origen={origen === null ? 'Buscando tu ubicación…' : nombreDelOrigen(origen)}
              destino={destino === null ? undefined : nombreDelDestino(destino)}
              // LOS TRES LLEVABAN A NINGUNA PARTE
              //
              // El componente aceptaba estos manejadores desde el principio y
              // esta pantalla no le pasaba ninguno: se veían tres controles y
              // no respondía ninguno.
              // CADA UNO A LO SUYO. Antes los tres abrian el mapa.
              onTocarOrigen={() => buscarEscribiendo('origen')}
              onTocarDestino={() => buscarEscribiendo('destino')}
              onElegirEnMapa={() => { setCampoQueSeElige('destino'); abrirElMapa(); }}
            />
            )}

            {/* ELIGIENDO EN EL MAPA: la hoja se aparta
              *
              * Mientras se elige, lo único que importa es el mapa y el botón
              * que confirma. Enseñar debajo los vehículos y el precio de un
              * recorrido que todavía no existe ocupa la pantalla que hace
              * falta para mover el mapa. */}
            {eligiendoEnMapa ? (
              <>
                <Txt nivel="encabezado">
                  {campoQueSeElige === 'origen' ? '¿Dónde te recogemos?' : '¿A dónde vas?'}
                </Txt>
                <View style={{ height: tema.ritmo.entreElementos }} />
                <Txt nivel="etiqueta" tono="tenue">
                  {campoQueSeElige === 'origen'
                    ? 'Mueve el mapa hasta el portal. El alfiler marca dónde te espera la moto.'
                    : 'Mueve el mapa hasta el sitio al que vas. El alfiler marca el destino.'}
                </Txt>
                <View style={{ height: tema.ritmo.entreBloques }} />
                <Boton
                  titulo={campoQueSeElige === 'origen' ? 'Confirmar la recogida' : 'Confirmar este destino'}
                  onPress={confirmarElPunto}
                  // Sin candidato --el mapa aún no se ha asentado-- y sobre el
                  // sitio donde ya estás no hay destino que confirmar.
                  deshabilitado={
                    candidato === null
                    || (origen !== null && distanciaKm(origen, candidato) < DISTANCIA_MINIMA_KM)
                  }
                />
                <View style={{ height: tema.ritmo.entreElementos }} />
                <Boton titulo="Cancelar" variante="secundario" onPress={dejarDeElegir} />
              </>
            ) : (
            <>
            <View style={{ height: tema.ritmo.entreBloques }} />
            <Txt nivel="etiqueta" tono="secundario">CÓMO QUIERES IR</Txt>
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
              {/* Sin minutos: nadie sabe cuánto tarda en llegar una moto, y
                  ponerlo sería prometer una hora que no se puede cumplir. */}
              {/* Y sin precio hasta que el servidor lo diga: la tarjeta elegida
                  ensena el importe de la estimacion, la otra nada. Un «$0,00»
                  esperando se leeria como una cotizacion de cero. */}
              <FilaDeVehiculo
                tipo="MOTO"
                activa={tipo === 'MOTO'}
                precio={precioDeTarjeta('MOTO')}
                onPress={() => setTipo('MOTO')}
              />
              <FilaDeVehiculo
                tipo="AUTO"
                activa={tipo === 'AUTO'}
                precio={precioDeTarjeta('AUTO')}
                onPress={() => setTipo('AUTO')}
              />
            </View>

            {/* EL PRECIO, TAL COMO LO DIJO EL SERVIDOR
                Ni un número más. Sin ETA, sin descuento, sin precio anterior:
                el servidor no manda nada de eso. Los bolívares sólo aparecen si
                hay tasa de verdad —con el cambio apagado valdría cero, y
                «Bs. 0,00» sería una cifra falsa—. */}
            {estimacion !== null && (
              <>
                <View style={{ height: tema.ritmo.entreBloques }} />
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Txt nivel="titulo" tono="acento">${estimacion.dolares.toFixed(2)}</Txt>
                  {estimacion.bolivares !== null && (
                    <Txt nivel="etiqueta" tono="tenue">Bs. {estimacion.bolivares.toFixed(2)}</Txt>
                  )}
                </View>
                {/* Distancia y tiempo salen de la MISMA respuesta que el
                    precio --el servidor los mide con Google Routes-- y estaban
                    llegando sin que nadie los enseñara: sólo se pintaban los
                    kilómetros. Quien decide si le sirve una carrera necesita
                    saber cuánto dura, no sólo cuánto cuesta. */}
                <Txt nivel="etiqueta" tono="tenue">
                  {estimacion.distanciaKm.toFixed(1)} km · {Math.max(1, Math.round(estimacion.minutos))} min
                  {estimacion.esDeNoche ? ' · tarifa nocturna' : ''}
                  {estimacion.esHoraPico ? ' · hora pico' : ''}
                </Txt>
              </>
            )}

            {falta !== 'NADA' && (
              <>
                <View style={{ height: tema.ritmo.entreElementos }} />
                <Txt nivel="etiqueta" tono="tenue">{AVISO[falta]}</Txt>
              </>
            )}

            {problema !== null && (
              <>
                <View style={{ height: tema.ritmo.entreElementos }} />
                <Txt nivel="etiqueta" tono="peligro">{problema}</Txt>
              </>
            )}

            <View style={{ height: tema.ritmo.entreBloques }} />
            {estimacion === null ? (
              <Boton
                titulo={fase === 'ESTIMANDO' ? 'Consultando…' : 'Ver precio'}
                onPress={() => { void estimar(); }}
                deshabilitado={trabajando || !puedeEstimar(fase, falta)}
              />
            ) : (
              <Boton
                titulo={fase === 'PIDIENDO' ? 'Pidiendo…' : 'Pedir viaje'}
                onPress={() => { void pedir(); }}
                // Aqui ya no puede haber viaje activo: si lo hubiera, esta
                // pantalla habria redirigido antes de llegar a pintar nada.
                //
                // `falta` SI se mira, y no es un detalle: el origen sale del
                // GPS y puede desaparecer despues de haber visto el precio.
                // Sin esto el boton seguia encendido, se pulsaba, y no pasaba
                // nada de nada.
                deshabilitado={trabajando || !puedePedir(fase, estimacion, false, falta)}
              />
            )}
            </>
            )}

          </HojaInferior>
        </LienzoDeMapa>

        <BarraDeNavegacion
          destinos={DESTINOS_DE_PASAJERA}
          activo="inicio"
          control={<ControlDePedido abierto />}
        />
      </View>
    </ProveedorDeNavegacion>
  );
}
