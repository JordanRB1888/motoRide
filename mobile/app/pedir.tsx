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
import { Redirect, router } from 'expo-router';

import { Boton } from '../components/Boton';
import { Txt } from '../ui/componentes';
import { HojaInferior } from '../ui/HojaInferior';
import { LienzoDeMapa } from '../ui/Mapa';
import { Trayecto } from '../ui/Trayecto';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
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
 * Menos de esto no es moverse: es el reticulo sin tocar sobre donde ya estas.
 * Cincuenta metros son media cuadra de Maracaibo.
 */
const DISTANCIA_MINIMA_KM = 0.05;

/** Lo que se le dice a quien no puede pedir todavía. */
const AVISO: Readonly<Record<QueFalta, string>> = Object.freeze({
  NADA: '',
  ORIGEN: 'Buscando dónde estás…',
  DESTINO: 'Mueve el mapa para elegir a dónde vas',
  // Fuera de zona NO es un fallo: es que ahí todavía no llegamos.
  ORIGEN_FUERA_DEL_AREA: 'Todavía no operamos donde estás. Sólo Maracaibo, por ahora.',
  DESTINO_FUERA_DEL_AREA: 'Ese destino queda fuera de Maracaibo'
});

export default function PantallaDePedir() {
  const tema = useTema();
  const { sesion } = useSesion();
  const { estado: viajeActivo, refrescar: refrescarViaje } = useViajeActivo();
  const { estado: ubicacion, pedirUbicacion } = useUbicacion();

  // El permiso se pide AQUÍ: acaba de abrir «Pedir», así que saber dónde está
  // es exactamente lo que hace falta y el momento se explica solo.
  useEffect(() => { void pedirUbicacion(); }, [pedirUbicacion]);

  const [tipo, setTipo] = useState<TipoEnLaPantalla>('MOTO');
  const [destino, setDestino] = useState<PuntoDelViaje | null>(null);
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
    const posicion = ubicacion.posicion;
    if (posicion === null) return null;
    return {
      lat: posicion.lat,
      lng: posicion.lng,
      direccion: null,
      precision: posicion.precision,
      fuente: 'gps'
    };
  }, [ubicacion.posicion]);

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
    if (!puedePedir(fase, estimacion, viajeActivo.fase === 'CON_VIAJE')) return;

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

  // ---------------------------------------------------------------------
  // Guardias
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
  const modelo = useMemo(() => ({
    camara: origen === null
      ? CAMARA_DE_MARACAIBO
      : { ...CAMARA_DE_MARACAIBO, centro: { lat: origen.lat, lng: origen.lng } },
    marcadores: [],
    ruta: [],
    // El reticulo de «mueve el mapa, no el pin»: el centro es lo que se
    // esta eligiendo.
    eligiendoPunto: true,
    aireInferior: 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [origen?.lat, origen?.lng]);

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
            // El reticulo arranca centrado en donde estas. Hasta que el mapa se
            // mueva de ahi, no hay destino: un viaje a donde ya estas no es un
            // viaje, y «el punto que elegiste» seria mentira antes de elegir.
            if (origen !== null && distanciaKm(origen, centro) < DISTANCIA_MINIMA_KM) return;
            // Y el mismo punto dos veces tampoco: el mapa avisa al asentarse
            // aunque nadie lo haya tocado, y apuntarlo otra vez seria repintar
            // para nada.
            if (destino !== null && distanciaKm(destino, centro) < 0.001) return;
            setDestino({
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
          <HojaInferior estado="media" desplazable>
            <Trayecto
              origen={origen === null ? 'Buscando tu ubicación…' : 'Tu ubicación ahora'}
              destino={destino === null ? undefined : 'El punto que elegiste'}
            />

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
                <Txt nivel="etiqueta" tono="tenue">
                  {estimacion.distanciaKm.toFixed(1)} km
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
                deshabilitado={trabajando || !puedePedir(fase, estimacion, false)}
              />
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
