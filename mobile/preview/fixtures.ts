/**
 * Datos de demostración del laboratorio visual.
 *
 * OBVIAMENTE FICTICIOS, A PROPÓSITO
 *
 * Nada de nombres, teléfonos o documentos que puedan confundirse con datos
 * reales de alguien. Si una captura de estas acaba en una presentación, en un
 * chat o en un informe, no debe parecerse a la información de una persona.
 *
 * ESTO NO PUEDE LLEGAR A LA APLICACIÓN REAL
 *
 * Vive en `preview/`, sólo lo importan las pantallas del laboratorio, y el
 * laboratorio sólo existe en desarrollo. Hay una prueba que comprueba que
 * ningún fichero de `app/`, `services/` o `domain/` importa de aquí: unos datos
 * de demostración que acaban como respaldo en tiempo de ejecución son la forma
 * más silenciosa de enseñar información falsa como si fuera verdadera.
 */

export const PASAJERA_DEMO = {
  nombre: 'Demo Pasajera',
  iniciales: 'DP',
  zona: 'Zona demo · Maracaibo'
} as const;

export const CONDUCTOR_DEMO = {
  nombre: 'Demo Conductor',
  iniciales: 'DC',
  vehiculo: 'Moto demo · Placa DEMO-000',
  zona: 'Zona demo · Maracaibo'
} as const;

export const SERVICIOS_DEMO = [
  {
    clave: 'mototaxi',
    icono: 'moto' as const,
    titulo: 'Mototaxi',
    detalle: 'Lo más rápido en ciudad',
    precio: '$1,50',
    disponible: true
  },
  {
    clave: 'seguro',
    icono: 'escudo' as const,
    titulo: 'Transporte Seguro',
    detalle: 'Traslados programados',
    precio: 'Plan',
    disponible: true
  }
] as const;

export const DESTINOS_RECIENTES_DEMO = [
  { clave: 'd1', titulo: 'Destino de ejemplo 1', detalle: 'Guardado como «Casa»' },
  { clave: 'd2', titulo: 'Destino de ejemplo 2', detalle: 'Guardado como «Trabajo»' },
  { clave: 'd3', titulo: 'Destino de ejemplo 3', detalle: 'Visitado hace 2 días' }
] as const;

export const VIAJE_DEMO = {
  estado: 'En camino',
  eta: '4 min',
  conductor: 'Demo Conductor',
  iniciales: 'DC',
  vehiculo: 'Moto demo · DEMO-000',
  valoracion: '4,9',
  origen: 'Punto de recogida de ejemplo',
  destino: 'Destino de ejemplo 1',
  precio: '$1,50'
} as const;

/**
 * Cifras de la jornada del conductor.
 *
 * Son PREVIEW y no salen de ninguna API. La cartera y los retiros están
 * apagados en el backend, y enseñar una cifra como si fuera real sería
 * exactamente lo que no debe hacerse.
 */
export const JORNADA_DEMO = {
  viajes: '8',
  horas: '5 h 20 m',
  resumen: '—',
  nota: 'Cifras de ejemplo: la cartera todavía no está conectada.'
} as const;
