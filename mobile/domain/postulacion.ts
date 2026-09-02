/**
 * La postulación para conducir: qué se pide, en qué orden y qué falta.
 *
 * SER CONDUCTOR NO ES REGISTRARSE
 *
 * Nadie conduce por abrir una cuenta. Se postula: entrega sus datos, los de su
 * vehículo y sus documentos, y **administración decide**. Mientras decide, la
 * persona no recibe carreras. Eso no es una regla de esta pantalla, es del
 * backend: `requireApprovedDriver` comprueba la aprobación en cada petición.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 *
 * Aquí están las reglas que se pueden comprobar sin red: qué campos hacen
 * falta, qué formato tienen, cuántos documentos quedan y cuánto se lleva
 * hecho. Sirven para no dejar que alguien rellene ocho campos y descubra al
 * final que la cédula estaba mal.
 *
 * NO están las decisiones. Aprobar, rechazar y pedir cambios son del backend,
 * y este módulo nunca las simula. Su validación es una CORTESÍA que se
 * adelanta a la del servidor; el servidor vuelve a validarlo todo y su palabra
 * es la única que cuenta. Por eso cada regla de aquí es un espejo exacto de
 * `server/domain/driverApplicationModel.js`, y hay pruebas que las comparan.
 */

import { REGIONES_Y_CIUDADES } from './cobertura';

// ---------------------------------------------------------------------------
// Dónde se opera
// ---------------------------------------------------------------------------

export { REGIONES_Y_CIUDADES };

/** Las ciudades donde +58Express presta servicio hoy. */
export const CIUDADES = REGIONES_Y_CIUDADES.flatMap(region =>
  region.ciudades.map(ciudad => ({ ciudad, region: region.region }))
);

export function esCiudadCubierta(ciudad: string): boolean {
  return CIUDADES.some(item => item.ciudad.toLowerCase() === ciudad.trim().toLowerCase());
}

export function regionDeLaCiudad(ciudad: string): string | null {
  const encontrada = CIUDADES.find(item => item.ciudad.toLowerCase() === ciudad.trim().toLowerCase());
  return encontrada?.region ?? null;
}

// ---------------------------------------------------------------------------
// A qué se postula
// ---------------------------------------------------------------------------

export interface ServicioDePostulacion {
  readonly clave: 'personas_moto' | 'personas_carro' | 'paqueteria_moto';
  readonly titulo: string;
  readonly detalle: string;
  /** Qué vehículo exige. Determina qué documentos se piden. */
  readonly vehiculo: 'MOTO' | 'CAR';
  /**
   * Si el servicio ya está operando.
   *
   * Paquetería todavía no: la aplicación de la pasajera la tiene marcada como
   * «pronto» y el despacho no sabe qué es un paquete. Se puede postular a
   * ella, pero la pantalla lo dice en vez de prometer carreras que no van a
   * llegar.
   */
  readonly operando: boolean;
}

export const SERVICIOS: readonly ServicioDePostulacion[] = Object.freeze([
  Object.freeze({
    clave: 'personas_moto',
    titulo: 'Personas en moto',
    detalle: 'Llevas pasajeros en tu moto.',
    vehiculo: 'MOTO',
    operando: true
  }),
  Object.freeze({
    clave: 'personas_carro',
    titulo: 'Personas en carro',
    detalle: 'Llevas pasajeros en tu carro o camioneta.',
    vehiculo: 'CAR',
    operando: true
  }),
  Object.freeze({
    clave: 'paqueteria_moto',
    titulo: 'Paquetería en moto',
    detalle: 'Llevas paquetes y encomiendas.',
    vehiculo: 'MOTO',
    operando: false
  })
] as const);

export type ClaveDeServicio = ServicioDePostulacion['clave'];

export function describirServicio(clave: ClaveDeServicio): ServicioDePostulacion {
  const servicio = SERVICIOS.find(item => item.clave === clave);
  if (!servicio) throw new Error(`servicio desconocido: ${String(clave)}`);
  return servicio;
}

/** Qué vehículo hay que declarar según lo elegido. Carro manda sobre moto. */
export function vehiculoDeLosServicios(claves: readonly ClaveDeServicio[]): 'MOTO' | 'CAR' {
  return claves.some(clave => describirServicio(clave).vehiculo === 'CAR') ? 'CAR' : 'MOTO';
}

// ---------------------------------------------------------------------------
// Los documentos
// ---------------------------------------------------------------------------

/**
 * Los tipos que acepta el backend, con el mismo nombre.
 *
 * `obligatorio` sale de `REQUIRED_DRIVER_DOCUMENTS`: el seguro es el único que
 * no lo es. Hay una prueba que compara las dos listas, porque si el servidor
 * añade un documento y la aplicación no se entera, alguien enviaría una
 * solicitud incompleta y se la rechazarían sin saber por qué.
 */
export interface DocumentoPedido {
  readonly tipo: string;
  readonly titulo: string;
  /** Qué tiene que salir en la foto. */
  readonly instruccion: string;
  readonly obligatorio: boolean;
  /** Sólo se pide si el vehículo es de este tipo. `null` = siempre. */
  readonly soloPara: 'MOTO' | 'CAR' | null;
}

export const DOCUMENTOS: readonly DocumentoPedido[] = Object.freeze([
  Object.freeze({
    tipo: 'identity_front',
    titulo: 'Cédula, por delante',
    instruccion: 'Que se lean el número y el nombre. Sin reflejos ni dedos encima.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'identity_back',
    titulo: 'Cédula, por detrás',
    instruccion: 'La cara de atrás, completa y enfocada.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'driver_license',
    titulo: 'Licencia de conducir',
    instruccion: 'Vigente. Que se vea el grado y la fecha de vencimiento.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'vehicle_registration',
    titulo: 'Carnet de circulación',
    instruccion: 'El documento del vehículo, con la placa visible.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'vehicle_photo',
    titulo: 'Foto del vehículo',
    instruccion: 'De lado y entero, con luz. Como lo verá tu pasajera al subirse.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'plate_photo',
    titulo: 'Foto de la placa',
    instruccion: 'De cerca y recta. Los caracteres tienen que leerse sin esfuerzo.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'driver_selfie',
    titulo: 'Tu foto',
    instruccion: 'Cara descubierta, sin casco ni lentes oscuros. Será tu foto de perfil.',
    obligatorio: true,
    soloPara: null
  }),
  Object.freeze({
    tipo: 'vehicle_insurance',
    titulo: 'Póliza de seguro (RCV)',
    instruccion: 'Si la tienes, adjúntala. No es obligatoria para postularte.',
    obligatorio: false,
    soloPara: null
  })
] as const);

export const DOCUMENTOS_OBLIGATORIOS: readonly string[] = Object.freeze(
  DOCUMENTOS.filter(documento => documento.obligatorio).map(documento => documento.tipo)
);

export function describirDocumento(tipo: string): DocumentoPedido | null {
  return DOCUMENTOS.find(documento => documento.tipo === tipo) ?? null;
}

/** Qué documentos obligatorios faltan todavía. */
export function documentosQueFaltan(entregados: readonly string[]): readonly string[] {
  const hay = new Set(entregados);
  return DOCUMENTOS_OBLIGATORIOS.filter(tipo => !hay.has(tipo));
}

// ---------------------------------------------------------------------------
// Los datos: las mismas reglas que el servidor
// ---------------------------------------------------------------------------

export interface DatosPersonales {
  readonly nombre: string;
  readonly apellido: string;
  readonly cedula: string;
  /** `YYYY-MM-DD`. */
  readonly nacimiento: string;
  readonly telefono: string;
  readonly correo: string;
  readonly direccion: string;
  readonly ciudad: string;
}

export interface DatosDelVehiculo {
  readonly tipo: 'MOTO' | 'CAR';
  readonly marca: string;
  readonly modelo: string;
  readonly ano: string;
  readonly color: string;
  readonly placa: string;
}

export type ErroresDePaso = Readonly<Record<string, string>>;

const soloDigitos = (valor: string) => valor.replace(/\D/g, '');

/** La cédula, como la guarda el servidor: `V-12345678`. */
export function normalizarCedula(valor: string): string {
  const compacta = valor.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const partes = compacta.match(/^([VEJPG]?)(\d{5,12})$/);
  return partes ? `${partes[1] ? `${partes[1]}-` : ''}${partes[2]}` : compacta;
}

/** La placa, como la guarda el servidor: sin espacios y en mayúsculas. */
export function normalizarPlaca(valor: string): string {
  return valor.replace(/\s+/g, '').toUpperCase();
}

/** Los años que tiene alguien nacido en esa fecha. `-1` si la fecha no vale. */
export function edadEn(nacimiento: string, ahora: Date = new Date()): number {
  const fecha = new Date(`${nacimiento}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return -1;
  return Math.floor((ahora.getTime() - fecha.getTime()) / 31_557_600_000);
}

export function validarPersonales(datos: DatosPersonales, ahora: Date = new Date()): ErroresDePaso {
  const errores: Record<string, string> = {};
  const telefono = soloDigitos(datos.telefono);
  const edad = edadEn(datos.nacimiento, ahora);

  if (datos.nombre.trim().length < 2) errores.nombre = 'Escribe tu nombre.';
  if (datos.apellido.trim().length < 2) errores.apellido = 'Escribe tu apellido.';
  if (!/^[VEJPG]?[- ]?\d{5,12}$/i.test(normalizarCedula(datos.cedula))) {
    errores.cedula = 'Escribe tu cédula. Por ejemplo, V-12345678.';
  }
  if (edad < 18) errores.nacimiento = 'Tienes que ser mayor de edad para conducir.';
  else if (edad > 80) errores.nacimiento = 'Revisa la fecha: no parece correcta.';
  if (telefono.length < 10 || telefono.length > 15) errores.telefono = 'Escribe un teléfono válido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo.trim())) errores.correo = 'Escribe un correo válido.';
  if (datos.direccion.trim().length < 8) errores.direccion = 'Escribe tu dirección, con calle y sector.';
  if (datos.ciudad.trim().length < 2) errores.ciudad = 'Elige tu ciudad.';
  else if (!esCiudadCubierta(datos.ciudad)) errores.ciudad = 'Todavía no operamos en esa ciudad.';

  return Object.freeze(errores);
}

export function validarVehiculo(datos: DatosDelVehiculo, ahora: Date = new Date()): ErroresDePaso {
  const errores: Record<string, string> = {};
  const ano = Number(datos.ano);
  const anoMaximo = ahora.getFullYear() + 1;

  if (datos.marca.trim().length < 2) errores.marca = 'Escribe la marca.';
  if (datos.modelo.trim().length < 1) errores.modelo = 'Escribe el modelo.';
  if (!Number.isInteger(ano) || ano < 1980 || ano > anoMaximo) {
    errores.ano = `Escribe un año entre 1980 y ${anoMaximo}.`;
  }
  if (datos.color.trim().length < 2) errores.color = 'Escribe el color.';
  if (!/^[A-Z0-9-]{4,12}$/.test(normalizarPlaca(datos.placa))) {
    errores.placa = 'Escribe la placa, sin espacios.';
  }

  return Object.freeze(errores);
}

/** La contraseña de la cuenta nueva. El servidor pide ocho como mínimo. */
export function validarContrasena(contrasena: string): string | null {
  return contrasena.length >= 8 ? null : 'La contraseña necesita al menos 8 caracteres.';
}

export function pasoCompleto(errores: ErroresDePaso): boolean {
  return Object.keys(errores).length === 0;
}

// ---------------------------------------------------------------------------
// Los pasos y el avance
// ---------------------------------------------------------------------------

export const PASOS = ['servicio', 'identidad', 'vehiculo', 'documentos', 'envio'] as const;
export type Paso = (typeof PASOS)[number];

export interface TituloDePaso {
  readonly paso: Paso;
  readonly titulo: string;
  readonly detalle: string;
}

/**
 * Los cinco pasos, con el nombre que ve la persona.
 *
 * NO hay vídeo tutorial ni entrega de kit. Estaban en la aplicación que sirvió
 * de referencia y el dueño confirmó que +58Express no los tiene: poner un paso
 * que nadie va a cumplir deja la barra clavada en el 80 % para siempre.
 */
export const TITULOS: readonly TituloDePaso[] = Object.freeze([
  Object.freeze({ paso: 'servicio', titulo: 'Qué vas a hacer', detalle: 'Elige tu servicio y tu ciudad.' }),
  Object.freeze({ paso: 'identidad', titulo: 'Quién eres', detalle: 'Tus datos, como aparecen en la cédula.' }),
  Object.freeze({ paso: 'vehiculo', titulo: 'Tu vehículo', detalle: 'Marca, modelo y placa.' }),
  Object.freeze({ paso: 'documentos', titulo: 'Tus documentos', detalle: 'Siete fotos. Puedes hacerlas ahora o después.' }),
  Object.freeze({ paso: 'envio', titulo: 'Enviar a revisión', detalle: 'Lo revisamos y te avisamos.' })
] as const);

export function describirPaso(paso: Paso): TituloDePaso {
  const titulo = TITULOS.find(item => item.paso === paso);
  if (!titulo) throw new Error(`paso desconocido: ${String(paso)}`);
  return titulo;
}

export interface AvanceDeLaPostulacion {
  /** De 0 a 1. */
  readonly fraccion: number;
  /** Redondeado, para enseñarlo. */
  readonly porcentaje: number;
  readonly pasosHechos: readonly Paso[];
  /** El primero que queda por hacer. `null` si ya está todo. */
  readonly siguiente: Paso | null;
  readonly documentosQueFaltan: readonly string[];
  /** `true` cuando se puede mandar a revisión. */
  readonly listaParaEnviar: boolean;
}

export interface EstadoDeLaPostulacion {
  readonly servicios: readonly ClaveDeServicio[];
  readonly personales: DatosPersonales | null;
  readonly vehiculo: DatosDelVehiculo | null;
  readonly documentosEntregados: readonly string[];
  /** `true` cuando ya se mandó y está en manos de administración. */
  readonly enviada: boolean;
}

/**
 * Cuánto se lleva hecho.
 *
 * Los documentos pesan lo que son —siete de las once cosas que se piden—, así
 * que la barra no salta del 40 % al 100 % con una sola foto ni se queda
 * pegada mientras se hacen todas.
 */
export function avanceDeLaPostulacion(estado: EstadoDeLaPostulacion): AvanceDeLaPostulacion {
  const faltan = documentosQueFaltan(estado.documentosEntregados);
  const hechos: Paso[] = [];

  if (estado.servicios.length > 0) hechos.push('servicio');
  if (estado.personales !== null && pasoCompleto(validarPersonales(estado.personales))) hechos.push('identidad');
  if (estado.vehiculo !== null && pasoCompleto(validarVehiculo(estado.vehiculo))) hechos.push('vehiculo');
  if (faltan.length === 0) hechos.push('documentos');
  if (estado.enviada) hechos.push('envio');

  // Cada paso vale uno, salvo documentos, que vale por sus siete fotos.
  const pesoDeDocumentos = DOCUMENTOS_OBLIGATORIOS.length;
  const total = (PASOS.length - 1) + pesoDeDocumentos;
  const entregados = pesoDeDocumentos - faltan.length;
  const ganado = hechos.filter(paso => paso !== 'documentos').length + entregados;
  const fraccion = Math.min(1, ganado / total);

  const siguiente = PASOS.find(paso => !hechos.includes(paso)) ?? null;
  const listaParaEnviar = hechos.includes('servicio')
    && hechos.includes('identidad')
    && hechos.includes('vehiculo')
    && faltan.length === 0
    && !estado.enviada;

  return Object.freeze({
    fraccion,
    porcentaje: Math.round(fraccion * 100),
    pasosHechos: Object.freeze(hechos),
    siguiente,
    documentosQueFaltan: faltan,
    listaParaEnviar
  });
}
