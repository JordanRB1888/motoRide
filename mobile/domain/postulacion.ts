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
 * DOS DIMENSIONES: EL VEHÍCULO Y EL SERVICIO
 *
 * Con qué se trabaja (moto o carro) y para qué (llevar personas, llevar
 * paquetes) son cosas distintas. Una moto puede hacer las dos; un carro
 * también. Por eso no hay «mototaxi» como opción cerrada: hay un vehículo y
 * una lista de servicios, y cualquier combinación vale. El delivery se puede
 * elegir desde hoy, pero el servicio todavía no opera y la pantalla lo dice.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 *
 * Aquí están las reglas que se pueden comprobar sin red: qué campos hacen
 * falta, qué formato tienen, qué documentos pide cada vehículo, cuántos quedan
 * y cuánto se lleva hecho. Sirven para no dejar que alguien rellene ocho
 * campos y descubra al final que la cédula estaba mal.
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
// El vehículo y el servicio
// ---------------------------------------------------------------------------

/** Con qué se trabaja. Los mismos nombres que el servidor. */
export const VEHICULOS = ['MOTO', 'CAR'] as const;
export type TipoDeVehiculo = (typeof VEHICULOS)[number];

export function esVehiculo(valor: unknown): valor is TipoDeVehiculo {
  return typeof valor === 'string' && (VEHICULOS as readonly string[]).includes(valor);
}

export const VEHICULOS_DESCRITOS: readonly { readonly tipo: TipoDeVehiculo; readonly titulo: string; readonly detalle: string }[] = Object.freeze([
  Object.freeze({ tipo: 'MOTO', titulo: 'Moto', detalle: 'Motocicleta o scooter.' }),
  Object.freeze({ tipo: 'CAR', titulo: 'Carro', detalle: 'Carro o camioneta.' })
] as const);

/** Para qué se postula. Los mismos nombres que el servidor. */
export const SERVICIOS_DEL_SERVIDOR = ['PASSENGER_TRANSPORT', 'DELIVERY'] as const;
export type ClaveDeServicio = (typeof SERVICIOS_DEL_SERVIDOR)[number];

export function esServicio(valor: unknown): valor is ClaveDeServicio {
  return typeof valor === 'string' && (SERVICIOS_DEL_SERVIDOR as readonly string[]).includes(valor);
}

export interface ServicioDePostulacion {
  readonly clave: ClaveDeServicio;
  readonly titulo: string;
  readonly detalle: string;
  /**
   * Si el servicio ya está operando.
   *
   * Delivery todavía no: el despacho no sabe qué es un paquete. Se puede
   * postular a él, pero la pantalla lo dice en vez de prometer carreras que
   * no van a llegar.
   */
  readonly operando: boolean;
}

export const SERVICIOS: readonly ServicioDePostulacion[] = Object.freeze([
  Object.freeze({
    clave: 'PASSENGER_TRANSPORT',
    titulo: 'Llevar personas',
    detalle: 'Pasajeros, a donde vayan.',
    operando: true
  }),
  Object.freeze({
    clave: 'DELIVERY',
    titulo: 'Llevar paquetes',
    detalle: 'Encomiendas y pedidos. El servicio empieza pronto.',
    operando: false
  })
] as const);

export function describirServicio(clave: ClaveDeServicio): ServicioDePostulacion {
  const servicio = SERVICIOS.find(item => item.clave === clave);
  if (!servicio) throw new Error(`servicio desconocido: ${String(clave)}`);
  return servicio;
}

/** Qué grado de licencia sirve para cada vehículo. Espejo del servidor. */
export const GRADOS_DE_LICENCIA: Readonly<Record<TipoDeVehiculo, readonly number[]>> = Object.freeze({
  MOTO: Object.freeze([2]),
  CAR: Object.freeze([3, 4, 5])
});

/** Con qué papel se acredita el vehículo. Espejo del servidor. */
export const DOCUMENTOS_LEGALES_DEL_VEHICULO = Object.freeze([
  Object.freeze({ clave: 'CIRCULATION_CARD', titulo: 'Carnet de circulación' }),
  Object.freeze({ clave: 'OWNERSHIP_TITLE', titulo: 'Título de propiedad' }),
  Object.freeze({ clave: 'ORIGIN_CERTIFICATE', titulo: 'Certificado de origen' })
] as const);
export type DocumentoLegalDelVehiculo = (typeof DOCUMENTOS_LEGALES_DEL_VEHICULO)[number]['clave'];

export function esDocumentoLegal(valor: unknown): valor is DocumentoLegalDelVehiculo {
  return DOCUMENTOS_LEGALES_DEL_VEHICULO.some(item => item.clave === valor);
}

// ---------------------------------------------------------------------------
// Los documentos
// ---------------------------------------------------------------------------

/**
 * Los tipos que acepta el backend, con el mismo nombre y la misma regla de
 * exigencia. Hay una prueba que compara las dos listas: si el servidor añade
 * un documento y la aplicación no se entera, alguien enviaría una solicitud
 * incompleta y se la rechazarían sin saber por qué.
 */
export interface DocumentoPedido {
  readonly tipo: string;
  readonly titulo: string;
  /** Qué tiene que salir en la foto. */
  readonly instruccion: string;
  /** A quién se le exige. `comun`: a todos. `MOTO`/`CAR`: solo a ese vehículo. */
  readonly requisito: 'comun' | TipoDeVehiculo | 'opcional' | 'heredado';
  readonly medio: 'imagen' | 'video';
  /** Si hoy se puede subir. El vídeo todavía no. */
  readonly subible: boolean;
}

export const DOCUMENTOS: readonly DocumentoPedido[] = Object.freeze([
  Object.freeze({ tipo: 'identity_front', titulo: 'Cédula, por delante', instruccion: 'Que se lean el número y el nombre. Sin reflejos ni dedos encima.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'identity_back', titulo: 'Cédula, por detrás', instruccion: 'La cara de atrás, completa y enfocada.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'rif', titulo: 'RIF', instruccion: 'El comprobante del SENIAT, con el número completo visible.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'driver_license', titulo: 'Licencia de conducir', instruccion: 'Vigente. Que se vean el grado y la fecha de vencimiento.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'medical_certificate', titulo: 'Certificado médico', instruccion: 'El certificado médico vial vigente, con su fecha de vencimiento.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'vehicle_registration', titulo: 'Documento del vehículo', instruccion: 'El carnet de circulación, el título o el certificado de origen, con la placa visible.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'vehicle_front', titulo: 'Vehículo, por delante', instruccion: 'De frente y entero, con luz. Como lo verá tu pasajera al subirse.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'vehicle_rear', titulo: 'Vehículo, por detrás', instruccion: 'Desde atrás y entero. Que se vea la placa.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'plate_photo', titulo: 'Placa', instruccion: 'De cerca y recta. Los caracteres tienen que leerse sin esfuerzo.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'driver_selfie', titulo: 'Tu foto', instruccion: 'Cara descubierta, sin casco ni lentes oscuros. Es para verificar tu identidad.', requisito: 'comun', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'moto_helmets', titulo: 'Los cascos', instruccion: 'Los cascos con los que vas a prestar el servicio, juntos y enteros. El tuyo y el de tu pasajera.', requisito: 'MOTO', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'car_rear_interior', titulo: 'Asientos traseros', instruccion: 'El interior de atrás, donde va tu pasajera. Limpio y con luz.', requisito: 'CAR', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'vehicle_insurance', titulo: 'Póliza de seguro (RCV)', instruccion: 'Si la tienes, adjúntala. No es obligatoria para postularte.', requisito: 'opcional', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'vehicle_photo', titulo: 'Foto del vehículo', instruccion: 'De una postulación anterior. Vale como la foto de frente.', requisito: 'heredado', medio: 'imagen', subible: true }),
  Object.freeze({ tipo: 'presentation_video', titulo: 'Vídeo de presentación', instruccion: 'Un vídeo corto presentándote. Todavía no se puede subir.', requisito: 'opcional', medio: 'video', subible: false })
] as const);

/** Otros tipos que cuentan como este. Espejo de `satisfiedBy` en el servidor. */
const EQUIVALENTES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  vehicle_front: Object.freeze(['vehicle_photo'])
});

export function describirDocumento(tipo: string): DocumentoPedido | null {
  return DOCUMENTOS.find(documento => documento.tipo === tipo) ?? null;
}

/** Los obligatorios para un vehículo. Versión 1: los siete de antes. */
export function documentosRequeridos(vehiculo: TipoDeVehiculo, version = 2): readonly string[] {
  if (version < 2) {
    return Object.freeze(['identity_front', 'identity_back', 'driver_license', 'vehicle_registration', 'vehicle_photo', 'plate_photo', 'driver_selfie']);
  }
  return Object.freeze(
    DOCUMENTOS
      .filter(documento => documento.requisito === 'comun' || documento.requisito === vehiculo)
      .map(documento => documento.tipo)
  );
}

/** Qué obligatorios faltan todavía, para ese vehículo. */
export function documentosQueFaltan(entregados: readonly string[], vehiculo: TipoDeVehiculo, version = 2): readonly string[] {
  const hay = new Set(entregados);
  return documentosRequeridos(vehiculo, version).filter(tipo =>
    !hay.has(tipo) && !(EQUIVALENTES[tipo] ?? []).some(equivalente => hay.has(equivalente))
  );
}

// ---------------------------------------------------------------------------
// Los datos: las mismas reglas que el servidor
// ---------------------------------------------------------------------------

export interface DatosPersonales {
  readonly nombre: string;
  readonly apellido: string;
  readonly cedula: string;
  /** `V-12345678-9`. Obligatorio para enviar, no para empezar. */
  readonly rif: string;
  /** `YYYY-MM-DD`. */
  readonly nacimiento: string;
  readonly telefono: string;
  readonly correo: string;
  readonly direccion: string;
  readonly ciudad: string;
}

export interface DatosDelVehiculo {
  readonly tipo: TipoDeVehiculo;
  readonly marca: string;
  readonly modelo: string;
  readonly ano: string;
  readonly color: string;
  readonly placa: string;
  readonly documentoLegal: DocumentoLegalDelVehiculo;
}

export interface DatosDeLicencia {
  /** `'2'`, `'3'`… como lo escribe la persona. */
  readonly grado: string;
  /** `YYYY-MM-DD`. */
  readonly vencimiento: string;
}

export interface DatosDelCertificadoMedico {
  /** `YYYY-MM-DD`, o vacío si no se sabe. No se inventa. */
  readonly vencimiento: string;
}

export type ErroresDePaso = Readonly<Record<string, string>>;

const soloDigitos = (valor: string) => valor.replace(/\D/g, '');

/** La cédula, como la guarda el servidor: `V-12345678`. */
export function normalizarCedula(valor: string): string {
  const compacta = valor.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const partes = compacta.match(/^([VEJPG]?)(\d{5,12})$/);
  return partes ? `${partes[1] ? `${partes[1]}-` : ''}${partes[2]}` : compacta;
}

/** El RIF, como lo guarda el servidor: `V-12345678-9`. Ocho dígitos y verificador. */
export function normalizarRif(valor: string): string {
  const compacta = valor.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compacta) return '';
  const partes = compacta.match(/^([VEJPG])(\d{8})(\d)$/);
  return partes ? `${partes[1]}-${partes[2]}-${partes[3]}` : compacta;
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

/** Días que faltan para una fecha `YYYY-MM-DD`. `NaN` si no es fecha. */
function diasHasta(iso: string, ahora: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return Number.NaN;
  const fecha = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? Number.NaN : (fecha.getTime() - ahora.getTime()) / 86_400_000;
}

export function validarPersonales(
  datos: DatosPersonales,
  { paraEnvio = false, ahora = new Date() }: { readonly paraEnvio?: boolean; readonly ahora?: Date } = {}
): ErroresDePaso {
  const errores: Record<string, string> = {};
  const telefono = soloDigitos(datos.telefono);
  const edad = edadEn(datos.nacimiento, ahora);
  const rif = normalizarRif(datos.rif);

  if (datos.nombre.trim().length < 2) errores.nombre = 'Escribe tu nombre.';
  if (datos.apellido.trim().length < 2) errores.apellido = 'Escribe tu apellido.';
  if (!/^[VEJPG]?[- ]?\d{5,12}$/i.test(normalizarCedula(datos.cedula))) {
    errores.cedula = 'Escribe tu cédula. Por ejemplo, V-12345678.';
  }
  if (rif && !/^[VEJPG]-\d{8}-\d$/.test(rif)) errores.rif = 'Escribe tu RIF completo. Por ejemplo, V-12345678-9.';
  if (paraEnvio && !rif) errores.rif = 'El RIF hace falta para enviar la solicitud.';
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

  if (!esVehiculo(datos.tipo)) errores.tipo = 'Elige moto o carro.';
  if (datos.marca.trim().length < 2) errores.marca = 'Escribe la marca.';
  if (datos.modelo.trim().length < 1) errores.modelo = 'Escribe el modelo.';
  if (!Number.isInteger(ano) || ano < 1980 || ano > anoMaximo) {
    errores.ano = `Escribe un año entre 1980 y ${anoMaximo}.`;
  }
  if (datos.color.trim().length < 2) errores.color = 'Escribe el color.';
  if (!/^[A-Z0-9-]{4,12}$/.test(normalizarPlaca(datos.placa))) {
    errores.placa = 'Escribe la placa, sin espacios.';
  }
  if (!esDocumentoLegal(datos.documentoLegal)) errores.documentoLegal = 'Elige con qué documento acreditas el vehículo.';

  return Object.freeze(errores);
}

export function validarLicencia(
  licencia: DatosDeLicencia,
  vehiculo: TipoDeVehiculo,
  { paraEnvio = false, ahora = new Date() }: { readonly paraEnvio?: boolean; readonly ahora?: Date } = {}
): ErroresDePaso {
  const errores: Record<string, string> = {};
  const grado = Number.parseInt(licencia.grado.trim(), 10);
  const hayGrado = licencia.grado.trim() !== '';

  if (hayGrado && !GRADOS_DE_LICENCIA[vehiculo].includes(grado)) {
    errores.grado = vehiculo === 'MOTO'
      ? 'Para moto hace falta licencia de segundo grado.'
      : 'Para carro hace falta licencia de tercer, cuarto o quinto grado.';
  }
  if (paraEnvio && !hayGrado) errores.grado = 'Indica el grado de tu licencia.';

  const hayVencimiento = licencia.vencimiento.trim() !== '';
  if (hayVencimiento && !(diasHasta(licencia.vencimiento.trim(), ahora) > 0)) {
    errores.vencimiento = 'La licencia está vencida o la fecha no es válida.';
  }
  if (paraEnvio && !hayVencimiento) errores.vencimiento = 'Indica hasta cuándo es válida tu licencia.';

  return Object.freeze(errores);
}

export function validarCertificadoMedico(datos: DatosDelCertificadoMedico, ahora: Date = new Date()): ErroresDePaso {
  const errores: Record<string, string> = {};
  const vencimiento = datos.vencimiento.trim();
  if (vencimiento !== '' && !(diasHasta(vencimiento, ahora) > 0)) {
    errores.vencimiento = 'El certificado médico está vencido o la fecha no es válida.';
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

export const PASOS = ['personal', 'vehiculo', 'documentos', 'confirmacion'] as const;
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
  Object.freeze({ paso: 'personal', titulo: 'Información personal', detalle: 'Estos datos deben coincidir con tus documentos.' }),
  Object.freeze({ paso: 'vehiculo', titulo: 'Tu vehículo', detalle: 'Con qué trabajas, para qué y sus datos.' }),
  Object.freeze({ paso: 'documentos', titulo: 'Tus documentos', detalle: 'Once fotos. Puedes hacerlas ahora o después.' }),
  Object.freeze({ paso: 'confirmacion', titulo: 'Confirmación', detalle: 'Revisa lo que enviarás y mándalo.' })
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
  readonly vehiculo: TipoDeVehiculo | null;
  readonly servicios: readonly ClaveDeServicio[];
  readonly personales: DatosPersonales | null;
  readonly datosDelVehiculo: DatosDelVehiculo | null;
  readonly licencia: DatosDeLicencia | null;
  readonly documentosEntregados: readonly string[];
  /** `true` cuando ya se mandó y está en manos de administración. */
  readonly enviada: boolean;
}

/**
 * Cuánto se lleva hecho.
 *
 * Los documentos pesan lo que son —once de las quince cosas que se piden—,
 * así que la barra no salta del 40 % al 100 % con una sola foto ni se queda
 * pegada mientras se hacen todas.
 */
export function avanceDeLaPostulacion(estado: EstadoDeLaPostulacion, ahora: Date = new Date()): AvanceDeLaPostulacion {
  const vehiculo = estado.vehiculo ?? 'MOTO';
  const faltan = estado.vehiculo === null
    ? documentosRequeridos('MOTO')
    : documentosQueFaltan(estado.documentosEntregados, vehiculo);
  const hechos: Paso[] = [];

  // Personal: los datos de la persona, con su ciudad entre las que se cubren.
  const personalHecho = estado.personales !== null
    && esCiudadCubierta(estado.personales.ciudad)
    && pasoCompleto(validarPersonales(estado.personales, { paraEnvio: true, ahora }));
  // Vehículo: con qué se trabaja, para qué, y los datos del vehículo.
  const vehiculoHecho = estado.vehiculo !== null && estado.servicios.length > 0
    && estado.datosDelVehiculo !== null && estado.licencia !== null
    && pasoCompleto(validarVehiculo(estado.datosDelVehiculo, ahora))
    && pasoCompleto(validarLicencia(estado.licencia, estado.datosDelVehiculo.tipo, { paraEnvio: true, ahora }));

  if (personalHecho) hechos.push('personal');
  if (vehiculoHecho) hechos.push('vehiculo');
  if (estado.vehiculo !== null && faltan.length === 0) hechos.push('documentos');
  if (estado.enviada) hechos.push('confirmacion');

  // Cada paso vale uno, salvo documentos, que vale por sus fotos.
  const pesoDeDocumentos = documentosRequeridos(vehiculo).length;
  const total = (PASOS.length - 1) + pesoDeDocumentos;
  const entregados = pesoDeDocumentos - faltan.length;
  const ganado = hechos.filter(paso => paso !== 'documentos').length + entregados;
  const fraccion = Math.min(1, ganado / total);

  const siguiente = PASOS.find(paso => !hechos.includes(paso)) ?? null;
  const listaParaEnviar = personalHecho && vehiculoHecho && faltan.length === 0 && !estado.enviada;

  return Object.freeze({
    fraccion,
    porcentaje: Math.round(fraccion * 100),
    pasosHechos: Object.freeze(hechos),
    siguiente,
    documentosQueFaltan: faltan,
    listaParaEnviar
  });
}
