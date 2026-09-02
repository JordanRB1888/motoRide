/**
 * Lo que la persona va rellenando mientras se postula.
 *
 * EN MEMORIA Y NADA MÁS
 *
 * Ni AsyncStorage ni almacén seguro: si cierra la aplicación a medias, vuelve
 * a empezar. Es a propósito. Aquí hay una cédula, un RIF y una contraseña, y
 * un borrador en disco es un borrador que se filtra con el teléfono. La
 * cuenta y el expediente, una vez creados, viven en el servidor y se vuelven
 * a pedir; la contraseña sólo se retiene lo que dura el alta, para entrar
 * después con ella por el camino normal de sesión.
 *
 * El dominio no depende de cuántas pantallas haya: este contexto es sólo el
 * cubo donde cada pantalla deja lo suyo hasta que se manda.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type {
  ClaveDeServicio,
  DatosDeLicencia,
  DatosDelCertificadoMedico,
  DatosDelVehiculo,
  DatosPersonales,
  TipoDeVehiculo
} from '../domain/postulacion';
import type { SolicitudPropia } from '../services/postulacion';

export interface BorradorDePostulacion {
  readonly vehiculo: TipoDeVehiculo | null;
  readonly servicios: readonly ClaveDeServicio[];
  readonly personales: DatosPersonales;
  readonly datosDelVehiculo: DatosDelVehiculo;
  readonly licencia: DatosDeLicencia;
  readonly certificadoMedico: DatosDelCertificadoMedico;
  /** La de la cuenta nueva, o la de la cuenta de pasajera que ya existe. */
  readonly contrasena: string;
}

export const BORRADOR_VACIO: BorradorDePostulacion = Object.freeze({
  vehiculo: null,
  servicios: Object.freeze([]),
  personales: Object.freeze({
    nombre: '', apellido: '', cedula: '', rif: '', nacimiento: '',
    telefono: '', correo: '', direccion: '', ciudad: ''
  }),
  datosDelVehiculo: Object.freeze({
    tipo: 'MOTO', marca: '', modelo: '', ano: '', color: '', placa: '', documentoLegal: 'CIRCULATION_CARD'
  }),
  licencia: Object.freeze({ grado: '', vencimiento: '' }),
  certificadoMedico: Object.freeze({ vencimiento: '' }),
  contrasena: ''
});

export interface ValorDePostulacion {
  readonly borrador: BorradorDePostulacion;
  readonly actualizar: (parcial: Partial<BorradorDePostulacion>) => void;
  /** El expediente tal como lo devolvió el servidor la última vez. */
  readonly solicitud: SolicitudPropia | null;
  readonly fijarSolicitud: (solicitud: SolicitudPropia | null) => void;
  readonly reiniciar: () => void;
}

const Contexto = createContext<ValorDePostulacion | null>(null);

export function ProveedorDePostulacion({ children }: { readonly children: ReactNode }) {
  const [borrador, setBorrador] = useState<BorradorDePostulacion>(BORRADOR_VACIO);
  const [solicitud, setSolicitud] = useState<SolicitudPropia | null>(null);

  const actualizar = useCallback((parcial: Partial<BorradorDePostulacion>) => {
    setBorrador(anterior => ({ ...anterior, ...parcial }));
  }, []);
  const fijarSolicitud = useCallback((valor: SolicitudPropia | null) => { setSolicitud(valor); }, []);
  const reiniciar = useCallback(() => { setBorrador(BORRADOR_VACIO); setSolicitud(null); }, []);

  const valor = useMemo(
    () => ({ borrador, actualizar, solicitud, fijarSolicitud, reiniciar }),
    [borrador, actualizar, solicitud, fijarSolicitud, reiniciar]
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePostulacion(): ValorDePostulacion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('usePostulacion() fuera de ProveedorDePostulacion');
  return valor;
}
