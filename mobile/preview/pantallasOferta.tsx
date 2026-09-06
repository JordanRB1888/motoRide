/**
 * Pantallas de previsualización para el flujo de ofertas y turno del conductor en +58Express.
 * SÓLO EN DESARROLLO / LABORATORIO.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { C2InicioConductor } from './pantallasC2';
import { SuperficieDeOferta } from '../conductor/SuperficieDeOferta';
import type { OfertaDeViaje } from '../domain/ofertaDeViaje';

const OFERTA_MOTO_DEMO: OfertaDeViaje = {
  id: 'oferta-moto-maracaibo',
  tipo: 'MOTO',
  dolares: 3.87,
  bolivares: 142.50,
  distanciaHastaRecogidaKm: 0.3,
  distanciaKm: 3.5,
  minutos: 7,
  formaDePago: 'Efectivo',
  recogida: {
    lat: 10.6427,
    lng: -71.6125,
    direccion: 'Vereda del Lago'
  },
  destino: {
    lat: 10.6850,
    lng: -71.6300,
    direccion: 'Sambil Maracaibo'
  }
};

const OFERTA_AUTO_DEMO: OfertaDeViaje = {
  id: 'oferta-auto-maracaibo',
  tipo: 'AUTO',
  dolares: 6.20,
  bolivares: 228.30,
  distanciaHastaRecogidaKm: 0.8,
  distanciaKm: 6.2,
  minutos: 14,
  formaDePago: 'Pago móvil',
  recogida: {
    lat: 10.6550,
    lng: -71.6200,
    direccion: 'Plaza de la República'
  },
  destino: {
    lat: 10.6900,
    lng: -71.6450,
    direccion: 'Aeropuerto La Chinita'
  }
};

/**
 * Superficie 1: Estado de disponibilidad / Resumen de turno con incidente
 * "Se acabó el tiempo / La carrera pasó a otro conductor / Seguir disponible"
 */
export function PreviewDriverTurnoExpirado() {
  const [disponible, setDisponible] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <C2InicioConductor
        enLinea
        incidente={
          disponible
            ? undefined
            : {
                titulo: 'Se acabó el tiempo',
                detalle: 'La carrera pasó a otro conductor.',
                icono: 'reloj',
                badge: 'Tiempo agotado',
                textoBoton: 'Seguir disponible',
                onAccion: () => setDisponible(true)
              }
        }
      />
    </View>
  );
}

/**
 * Superficie 2: Solicitud de carrera en moto entrante con moto amarilla integrada.
 */
export function PreviewDriverSolicitudMoto() {
  const [segundos, setSegundos] = useState(6);
  const [aceptando, setAceptando] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <C2InicioConductor enLinea />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <SuperficieDeOferta
          oferta={OFERTA_MOTO_DEMO}
          segundos={segundos}
          puedeAceptar={!aceptando}
          puedeRechazar={!aceptando}
          aceptando={aceptando}
          onAceptar={() => {
            setAceptando(true);
            setTimeout(() => setAceptando(false), 2000);
          }}
          onRechazar={() => setSegundos(0)}
          onMinimizar={() => {}}
        />
      </View>
    </View>
  );
}

/**
 * Superficie 2 (Variante Auto): Solicitud de carrera en auto.
 */
export function PreviewDriverSolicitudAuto() {
  const [segundos, setSegundos] = useState(8);
  const [aceptando, setAceptando] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <C2InicioConductor enLinea />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <SuperficieDeOferta
          oferta={OFERTA_AUTO_DEMO}
          segundos={segundos}
          puedeAceptar={!aceptando}
          puedeRechazar={!aceptando}
          aceptando={aceptando}
          onAceptar={() => {
            setAceptando(true);
            setTimeout(() => setAceptando(false), 2000);
          }}
          onRechazar={() => setSegundos(0)}
          onMinimizar={() => {}}
        />
      </View>
    </View>
  );
}
