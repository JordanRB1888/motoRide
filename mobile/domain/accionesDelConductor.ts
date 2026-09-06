/**
 * Lo que el conductor puede hacer con la carrera que ya es suya.
 */

export type EstadoQuePide = 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';

export interface AccionDelConductor {
  readonly estadoQuePide: EstadoQuePide;
  readonly texto: string;
  readonly textoEnviando: string;
  readonly testID: string;
}

const ACCIONES: Readonly<Record<string, AccionDelConductor>> = Object.freeze({
  DRIVER_ASSIGNED: {
    estadoQuePide: 'ARRIVED',
    texto: 'Llegué al punto',
    textoEnviando: 'Avisando…',
    testID: 'boton-llegue'
  },
  ARRIVED: {
    estadoQuePide: 'IN_PROGRESS',
    texto: 'Iniciar viaje',
    textoEnviando: 'Iniciando…',
    testID: 'boton-iniciar-viaje'
  },
  IN_PROGRESS: {
    estadoQuePide: 'COMPLETED',
    texto: 'Finalizar viaje',
    textoEnviando: 'Finalizando…',
    testID: 'boton-finalizar-viaje'
  }
});

export function accionParaElEstado(estado: string | null | undefined): AccionDelConductor | null {
  if (typeof estado !== 'string') return null;
  return ACCIONES[estado] ?? null;
}

const TITULAR: Readonly<Record<string, string>> = Object.freeze({
  DRIVER_ASSIGNED: 'Vas a recoger a la pasajera',
  ARRIVED: 'Esperando a la pasajera',
  IN_PROGRESS: 'Viaje en curso a destino'
});

export function titularDelConductor(estado: string | null | undefined): string | null {
  if (typeof estado !== 'string') return null;
  return TITULAR[estado] ?? null;
}

export type FaseDeLaAccion = 'IDLE' | 'SUBMITTING' | 'SUCCESS' | 'ERROR' | 'OFFLINE';

export function sePuedePulsar(fase: FaseDeLaAccion, hayConexion: boolean): boolean {
  if (!hayConexion) return false;
  return fase === 'IDLE' || fase === 'ERROR' || fase === 'OFFLINE';
}

const MOTIVOS: Readonly<Record<string, string>> = Object.freeze({
  INVALID_TRIP_TRANSITION: 'Esta carrera ya cambió de estado. Actualiza y vuelve a mirar.',
  INVALID_TRIP_STATUS: 'No se pudo aplicar ese cambio.',
  FORBIDDEN: 'Esta carrera no es tuya.',
  DATABASE_WRITE_FAILED: 'No se pudo guardar. Inténtalo otra vez.',
  INSUFFICIENT_WALLET_BALANCE: 'La pasajera no tiene saldo suficiente para cerrar el viaje.'
});

export function motivoDelFallo(codigo: string | null | undefined): string {
  if (typeof codigo !== 'string' || codigo === '') return 'No se pudo completar la acción.';
  return MOTIVOS[codigo] ?? 'No se pudo completar la acción.';
}
