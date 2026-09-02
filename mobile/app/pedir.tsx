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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { Boton } from '../components/Boton';
import { Txt } from '../ui/componentes';
import { HojaInferior } from '../ui/HojaInferior';
import { LienzoDeMapa } from '../ui/Mapa';
import { Trayecto } from '../ui/Trayecto';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { FilaDeVehiculo } from '../preview/pantallasC2';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { useViajeActivo } from '../realtime/ViajeActivo';
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import { CAMARA_DE_MARACAIBO } from '../mapa/modelo';
import { crearViaje, pedirEstimacion } from '../services/pedido';
import {
  metricasDelRecorrido,
  queFaltaParaPedir,
  puedeEstimar,
  puedePedir,
  type Estimacion,
  type FaseDelPedido,
  type PuntoDelViaje,
  type QueFalta,
  type TipoEnLaPantalla
} from '../domain/pedirViaje';

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

  // Cambiar cualquier cosa invalida el precio: era el de otro recorrido.
  useEffect(() => {
    setEstimacion(null);
    setProblema(null);
    setFase(previa => (previa === 'PIDIENDO' ? previa : 'ELIGIENDO'));
  }, [tipo, destino?.lat, destino?.lng]);

  // ---------------------------------------------------------------------
  // Preguntar el precio
  // ---------------------------------------------------------------------
  const estimar = useCallback(async () => {
    if (origen === null || destino === null) return;
    if (!puedeEstimar(fase, falta)) return;

    setFase('ESTIMANDO');
    setProblema(null);

    const respuesta = await pedirEstimacion(tipo, metricasDelRecorrido(origen, destino));
    if (!respuesta.ok) {
      setFase('RECHAZADO');
      setProblema(respuesta.mensaje);
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

    const respuesta = await crearViaje({
      origen,
      destino,
      tipo,
      metricas: metricasDelRecorrido(origen, destino)
    });

    if (!respuesta.ok) {
      setFase('RECHAZADO');
      setProblema(respuesta.mensaje);
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

  const irA = (destinoDeLaBarra: string) => {
    if (destinoDeLaBarra === 'inicio') router.replace('/pasajero');
  };

  const trabajando = fase === 'ESTIMANDO' || fase === 'PIDIENDO';

  return (
    <ProveedorDeNavegacion ir={irA}>
      <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
        <LienzoDeMapa
          conControles={false}
          modelo={{
            camara: origen === null
              ? CAMARA_DE_MARACAIBO
              : { ...CAMARA_DE_MARACAIBO, centro: { lat: origen.lat, lng: origen.lng } },
            marcadores: [],
            ruta: [],
            // El retículo de «mueve el mapa, no el pin»: mientras no haya
            // destino, el centro es lo que se está eligiendo.
            eligiendoPunto: true,
            aireInferior: 0
          }}
          onCentro={centro => setDestino({
            lat: centro.lat,
            lng: centro.lng,
            // Sin dirección: se eligió un punto en el mapa, no un sitio con
            // nombre. Inventarle uno sería peor que no tenerlo.
            direccion: null,
            precision: null,
            fuente: 'mapa'
          })}
        >
          <HojaInferior estado="media" desplazable>
            <Trayecto
              origen={origen === null ? 'Buscando tu ubicación…' : 'Tu ubicación ahora'}
              destino={destino === null ? undefined : 'El punto que elegiste'}
            />

            <View style={{ height: tema.ritmo.entreBloques }} />
            <Txt nivel="etiqueta" tono="secundario">CÓMO QUIERES IR</Txt>
            <View style={{ paddingTop: 4, gap: 8 }}>
              {/* Sin minutos: nadie sabe cuánto tarda en llegar una moto, y
                  ponerlo sería prometer una hora que no se puede cumplir. */}
              <FilaDeVehiculo tipo="MOTO" activa={tipo === 'MOTO'} onPress={() => setTipo('MOTO')} />
              <FilaDeVehiculo tipo="AUTO" activa={tipo === 'AUTO'} onPress={() => setTipo('AUTO')} />
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
