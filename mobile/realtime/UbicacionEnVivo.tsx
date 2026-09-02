/**
 * La ubicación, saliendo y entrando por el socket.
 *
 * QUÉ HACE
 *
 *   tu GPS  ──regulador──▶  socket  ──▶  servidor
 *   servidor  ──▶  posición del conductor  ──▶  el mapa
 *
 * Y nada más. No decide sobre el viaje, no cambia el estado del conductor y no
 * pide GPS por su cuenta: lee del proveedor de ubicación, que es el único que
 * habla con el sistema.
 *
 * POR QUÉ HAY UNA SOLA TUBERÍA
 *
 * Si cada pantalla emitiera por su cuenta, dos pantallas abiertas mandarían la
 * misma posición dos veces y el limitador del servidor lo tomaría por abuso.
 * Aquí se emite en un solo sitio, con un solo regulador.
 *
 * SÓLO PRIMER PLANO
 *
 * El proveedor de ubicación para su observador cuando la aplicación se va al
 * fondo, así que aquí dejan de llegar muestras y deja de emitirse. No se
 * simula continuidad: si no se está midiendo, no se manda nada.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { escuchar, enviarUbicacionDeConductor, enviarUbicacionDePasajera } from './socket';
import { useTiempoReal } from './ProveedorDeTiempoReal';
import { useViajeActivo } from './ViajeActivo';
import { useSesion } from '../context/AuthContext';
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import { useDisponibilidad } from './Disponibilidad';
import { debeEmitirUbicacion } from '../domain/disponibilidad';
import { crearReguladorDeEnvio } from '../domain/envioDeUbicacion';
import {
  aceptarUbicacion,
  leerUbicacionDelConductor,
  limpiarSiYaNoCorresponde,
  siguePresente,
  type PosicionDelConductor
} from '../domain/ubicacionDelConductor';

interface ValorDeUbicacionEnVivo {
  /** Dónde está la moto asignada, si se sabe y sigue siendo reciente. */
  readonly conductor: PosicionDelConductor | null;
  /** Lo último que el servidor rechazó, para diagnóstico. Sin coordenadas. */
  readonly ultimoRechazo: string | null;
}

const Contexto = createContext<ValorDeUbicacionEnVivo>({ conductor: null, ultimoRechazo: null });

export function ProveedorDeUbicacionEnVivo({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const { estado: conexion } = useTiempoReal();
  const { viaje } = useViajeActivo();
  const { estado: ubicacion } = useUbicacion();
  const { disponibilidad } = useDisponibilidad();

  // CON LA PANTALLA APAGADA MANDA LA TAREA, NO EL SOCKET
  //
  // Los dos transportes existen para momentos distintos: el socket mientras
  // alguien mira, y una peticion HTTP cada quince segundos cuando el
  // telefono esta guardado. Si los dos mandaran a la vez seria el doble de
  // datos del conductor y el doble de escrituras en el servidor para decir
  // lo mismo.
  //
  // El estado de la aplicacion es lo unico que sabe de verdad donde esta la
  // pantalla, asi que es lo que marca la frontera.
  const [enPantalla, setEnPantalla] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente: AppStateStatus) => {
      setEnPantalla(siguiente === 'active');
    });
    return () => suscripcion.remove();
  }, []);

  const [conductor, setConductor] = useState<PosicionDelConductor | null>(null);
  const [ultimoRechazo, setUltimoRechazo] = useState<string | null>(null);

  const autenticada = sesion.estado === 'AUTENTICADO';
  const conectado = conexion === 'conectado';
  const rol = sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null;

  // Quién y qué viaje se está mirando ahora mismo. Es lo que decide qué
  // eventos de posición son de esta pantalla y cuáles son de otra.
  const esperado = useMemo(
    () => ({ conductorId: viaje?.conductor?.id ?? null, viajeId: viaje?.id ?? null }),
    [viaje?.conductor?.id, viaje?.id]
  );

  // El regulador vive entre repintados: si se recreara, cada cambio de estado
  // reiniciaría el suelo de dos segundos y volvería a permitir un envío.
  const regulador = useRef(crearReguladorDeEnvio());

  // ---------------------------------------------------------------------
  // Salida: tu posición hacia el servidor
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!autenticada || !conectado) return;

    // Sin pantalla, este camino calla: manda la tarea de segundo plano.
    if (!enPantalla) return;

    // Un conductor FUERA DE SERVICIO no manda su posicion. Su GPS sigue
    // midiendo para su propio mapa —ver donde esta no depende de estar
    // trabajando— pero mandarlo gasta datos y bateria que paga el, y no
    // sirve para nada: el despacho no le va a ofrecer viajes estando fuera.
    if (rol === 'driver' && !debeEmitirUbicacion(disponibilidad.estado)) return;

    // Sólo lo que las reglas de calidad ya aceptaron. No se vuelve a validar
    // aquí con otro criterio: dos validaciones distintas acaban discrepando.
    const posicion = ubicacion.posicion;
    if (posicion === null) return;

    const punto = { lat: posicion.lat, lng: posicion.lng };
    if (!regulador.current.debeEnviarse(punto)) return;

    // El rumbo sólo si el sistema lo dio de verdad.
    const enviado = rol === 'driver'
      ? enviarUbicacionDeConductor(punto)
      : enviarUbicacionDePasajera(punto, viaje?.id ?? null);

    // Marcar sólo si salió: con el socket caído, la siguiente muestra debe
    // poder intentarlo otra vez sin esperar al latido.
    if (enviado) regulador.current.seEnvio(punto);
  }, [autenticada, conectado, enPantalla, rol, ubicacion.posicion, viaje?.id, disponibilidad.estado]);

  // Tras una reconexión, la primera muestra vuelve a viajar: el servidor pudo
  // perder la anterior, y una posición de antes del corte no vale como actual.
  useEffect(() => {
    if (conexion !== 'conectado') regulador.current.reiniciar();
  }, [conexion]);

  // ---------------------------------------------------------------------
  // Entrada: dónde está la moto
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!autenticada || !conectado) return;

    const dejarDeEscuchar = escuchar('driverLocationUpdated', payload => {
      const llegada = leerUbicacionDelConductor(payload);
      setConductor(vigente => aceptarUbicacion(llegada, { vigente, esperado }));
    });

    return dejarDeEscuchar;
  }, [autenticada, conectado, esperado]);

  // Al cambiar de conductor o terminar el viaje, la posición guardada deja de
  // significar nada. Una moto parada en el mapa después de terminar se lee
  // como que sigue ahí.
  useEffect(() => {
    setConductor(vigente => limpiarSiYaNoCorresponde(vigente, esperado));
  }, [esperado]);

  // Los rechazos del servidor. No se reintenta: la siguiente muestra llegará
  // sola por el observador del GPS, y un reintento inmediato sobre un rechazo
  // por coordenada inválida sería un bucle contra el limitador.
  useEffect(() => {
    if (!autenticada || !conectado) return;

    // El motivo llega como texto corto y sin coordenadas: `INVALID_COORDINATES`
    // o `DATABASE_WRITE_FAILED`. Se guarda para diagnóstico y nada más.
    const anotarRechazo = (payload: unknown) => {
      const motivo = payload !== null && typeof payload === 'object'
        ? (payload as Record<string, unknown>).error
        : null;
      setUltimoRechazo(String(motivo ?? 'RECHAZO_SIN_MOTIVO'));
    };
    const dejarDeEscucharConductor = escuchar('driver:location_rejected', anotarRechazo);
    const dejarDeEscucharPasajera = escuchar('passenger:location_rejected', anotarRechazo);

    return () => {
      dejarDeEscucharConductor();
      dejarDeEscucharPasajera();
    };
  }, [autenticada, conectado]);

  // Una posición vieja deja de ser «dónde está» y pasa a ser «dónde estuvo».
  // Se comprueba al leer y no con un temporizador: un temporizador repintaría
  // la pantalla cada segundo para no cambiar nada casi nunca.
  const vigente = siguePresente(conductor) ? conductor : null;

  const valor = useMemo(
    () => ({ conductor: vigente, ultimoRechazo }),
    [vigente, ultimoRechazo]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useUbicacionEnVivo(): ValorDeUbicacionEnVivo {
  return useContext(Contexto);
}
