/**
 * Métodos de retiro venezolanos: validación, enmascarado y forma segura.
 *
 * QUÉ SE GUARDA Y QUÉ NO
 *
 * Se guardan los datos necesarios para que una persona de administración pueda
 * EJECUTAR una transferencia: banco, cuenta o teléfono, titular y documento.
 * Eso es una instrucción de pago, no una credencial.
 *
 * NUNCA se guarda nada que permita OPERAR la cuenta ajena: contraseña de banca
 * en línea, PIN, OTP, coordenadas o preguntas de seguridad. No hay campo donde
 * ponerlas, y hay una validación que rechaza el intento — porque el día que
 * alguien añada «por comodidad» un campo `pin` al formulario, esto debe
 * romperse en vez de aceptarlo en silencio.
 *
 * PAGO MÓVIL NO ES C2P
 *
 * Pago Móvil es una transferencia que la plataforma EMITE hacia el
 * teléfono/cédula de la persona. C2P es un cobro que la plataforma solicita y
 * que exige integración con el banco y una clave de un solo uso. Aquí sólo se
 * modela el primero; el segundo será una integración aparte y no se prepara
 * ningún campo para su clave.
 */

import type {
  AccountType,
  DocumentType,
  PaymentMethodType
} from '../../shared/contracts/wallet.ts';

export const MOTIVOS_DE_RECHAZO = [
  'TIPO_DESCONOCIDO',
  'BANCO_INVALIDO',
  'NOMBRE_DE_BANCO_VACIO',
  'CUENTA_INVALIDA',
  'CUENTA_NO_COINCIDE_CON_BANCO',
  'TIPO_DE_CUENTA_INVALIDO',
  'TELEFONO_INVALIDO',
  'DOCUMENTO_INVALIDO',
  'TITULAR_INVALIDO',
  'CREDENCIAL_PROHIBIDA'
] as const;
export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

/**
 * Campos que jamás deben llegar hasta aquí.
 *
 * Si aparecen, se rechaza la petición entera en lugar de ignorarlos: aceptar la
 * operación descartando el campo en silencio deja a quien lo envió creyendo que
 * el sistema guarda su PIN, y a nadie mirando el problema.
 */
const CAMPOS_PROHIBIDOS = [
  'password', 'clave', 'pin', 'otp', 'token', 'cvv', 'securityanswer',
  'preguntaseguridad', 'respuestaseguridad', 'coordenadas', 'claveinternet',
  'clavebanca', 'c2p'
];

/** Los prefijos de móvil que operan en Venezuela. */
const PREFIJOS_MOVILES = ['0412', '0414', '0416', '0424', '0426'];

const DOCUMENTOS: readonly DocumentType[] = ['V', 'E', 'J', 'G', 'P'];
const TIPOS_DE_CUENTA: readonly AccountType[] = ['CORRIENTE', 'AHORRO'];

const soloDigitos = (valor: unknown): string => String(valor ?? '').replace(/\D/g, '');
const texto = (valor: unknown): string => String(valor ?? '').trim();

export interface DatosDeTransferencia {
  readonly type: 'BANK_TRANSFER';
  readonly bankCode: string;
  readonly bankName: string;
  readonly accountType: AccountType;
  readonly accountNumber: string;
  readonly holderName: string;
  readonly holderDocumentType: DocumentType;
  readonly holderDocumentNumber: string;
}

export interface DatosDePagoMovil {
  readonly type: 'PAGO_MOVIL';
  readonly bankCode: string;
  readonly bankName: string;
  readonly phone: string;
  readonly holderName: string;
  readonly holderDocumentType: DocumentType;
  readonly holderDocumentNumber: string;
}

export type DatosDeMetodo = DatosDeTransferencia | DatosDePagoMovil;

export type ResultadoDeValidacion =
  | { readonly ok: true; readonly datos: DatosDeMetodo }
  | { readonly ok: false; readonly motivo: MotivoDeRechazo; readonly detalle: string };

const rechazar = (motivo: MotivoDeRechazo, detalle: string): ResultadoDeValidacion =>
  ({ ok: false, motivo, detalle });

/** Detecta cualquier campo que huela a credencial. */
function contieneCredenciales(entrada: Record<string, unknown>): string | null {
  for (const clave of Object.keys(entrada)) {
    const normalizada = clave.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const prohibido of CAMPOS_PROHIBIDOS) {
      if (normalizada.includes(prohibido)) return clave;
    }
  }
  return null;
}

/** El titular y su documento, comunes a los dos métodos. */
function validarTitular(entrada: Record<string, unknown>):
  | { readonly ok: true; readonly nombre: string; readonly tipo: DocumentType; readonly numero: string }
  | { readonly ok: false; readonly motivo: MotivoDeRechazo; readonly detalle: string } {
  const nombre = texto(entrada.holderName);
  // Dos caracteres es poco, pero apellidos cortos existen y no es asunto
  // nuestro decidir qué nombre es «suficientemente largo».
  if (nombre.length < 2 || nombre.length > 120) {
    return { ok: false, motivo: 'TITULAR_INVALIDO', detalle: 'el nombre del titular no es utilizable' };
  }

  const tipo = texto(entrada.holderDocumentType).toUpperCase() as DocumentType;
  if (!DOCUMENTOS.includes(tipo)) {
    return { ok: false, motivo: 'DOCUMENTO_INVALIDO', detalle: `tipo de documento no reconocido: ${tipo || '(vacío)'}` };
  }

  const numero = soloDigitos(entrada.holderDocumentNumber);
  if (numero.length < 5 || numero.length > 10) {
    return { ok: false, motivo: 'DOCUMENTO_INVALIDO', detalle: 'el número de documento no tiene una longitud creíble' };
  }

  return { ok: true, nombre, tipo, numero };
}

/**
 * Valida y normaliza un método de retiro.
 *
 * Devuelve datos NORMALIZADOS —dígitos sin guiones ni espacios, tipos en
 * mayúsculas— para que dos personas que escriben la misma cuenta de dos formas
 * distintas acaben con el mismo dato guardado.
 */
export function validarMetodoDePago(
  tipo: string,
  entrada: Record<string, unknown>
): ResultadoDeValidacion {
  const credencial = contieneCredenciales(entrada);
  if (credencial !== null) {
    // El detalle nombra el campo, nunca su valor.
    return rechazar('CREDENCIAL_PROHIBIDA', `el campo "${credencial}" no debe enviarse ni guardarse`);
  }

  const clase = texto(tipo).toUpperCase() as PaymentMethodType;
  if (clase !== 'BANK_TRANSFER' && clase !== 'PAGO_MOVIL') {
    return rechazar('TIPO_DESCONOCIDO', `método no soportado: ${clase || '(vacío)'}`);
  }

  // El código de banco venezolano son cuatro dígitos. No se valida contra una
  // lista de bancos: una lista incompleta bloquearía retiros legítimos, y
  // mantenerla al día sin una fuente oficial es una promesa que no podemos
  // cumplir. La comprobación fuerte es cruzada, más abajo.
  const bankCode = soloDigitos(entrada.bankCode);
  if (bankCode.length !== 4) {
    return rechazar('BANCO_INVALIDO', 'el código de banco debe tener cuatro dígitos');
  }
  const bankName = texto(entrada.bankName);
  if (bankName === '' || bankName.length > 120) {
    return rechazar('NOMBRE_DE_BANCO_VACIO', 'falta el nombre del banco');
  }

  const titular = validarTitular(entrada);
  if (!titular.ok) return rechazar(titular.motivo, titular.detalle);

  if (clase === 'BANK_TRANSFER') {
    const accountNumber = soloDigitos(entrada.accountNumber);
    if (accountNumber.length !== 20) {
      return rechazar('CUENTA_INVALIDA', 'una cuenta bancaria venezolana tiene veinte dígitos');
    }
    // La comprobación que de verdad atrapa errores: en Venezuela los cuatro
    // primeros dígitos de la cuenta SON el código del banco. Si no coinciden,
    // uno de los dos campos está mal, y una transferencia a la cuenta
    // equivocada no se deshace con un `UPDATE`.
    if (!accountNumber.startsWith(bankCode)) {
      return rechazar(
        'CUENTA_NO_COINCIDE_CON_BANCO',
        'los cuatro primeros dígitos de la cuenta deben ser el código del banco'
      );
    }

    const accountType = texto(entrada.accountType).toUpperCase() as AccountType;
    if (!TIPOS_DE_CUENTA.includes(accountType)) {
      return rechazar('TIPO_DE_CUENTA_INVALIDO', 'la cuenta debe ser CORRIENTE o AHORRO');
    }

    return {
      ok: true,
      datos: {
        type: 'BANK_TRANSFER',
        bankCode,
        bankName,
        accountType,
        accountNumber,
        holderName: titular.nombre,
        holderDocumentType: titular.tipo,
        holderDocumentNumber: titular.numero
      }
    };
  }

  const phone = soloDigitos(entrada.phone);
  if (phone.length !== 11 || !PREFIJOS_MOVILES.some(prefijo => phone.startsWith(prefijo))) {
    return rechazar(
      'TELEFONO_INVALIDO',
      'Pago Móvil necesita un móvil venezolano de once dígitos (0412/0414/0416/0424/0426)'
    );
  }

  return {
    ok: true,
    datos: {
      type: 'PAGO_MOVIL',
      bankCode,
      bankName,
      phone,
      holderName: titular.nombre,
      holderDocumentType: titular.tipo,
      holderDocumentNumber: titular.numero
    }
  };
}

/**
 * El identificador enmascarado con el que se le enseña un método a su dueño.
 *
 * Quien ya es dueño de la cuenta no necesita que se la repitan entera para
 * reconocerla, y una respuesta de API que la lleva es una respuesta que acaba
 * en un registro, en una captura de pantalla o en una herramienta de terceros.
 */
export function enmascararIdentificador(datos: DatosDeMetodo): string {
  if (datos.type === 'BANK_TRANSFER') {
    return `****${datos.accountNumber.slice(-4)}`;
  }
  // En el teléfono se deja ver el prefijo: identifica la operadora sin
  // identificar a la persona.
  return `${datos.phone.slice(0, 4)}****${datos.phone.slice(-3)}`;
}

/** El documento enmascarado, para pantallas donde no hace falta entero. */
export function enmascararDocumento(tipo: DocumentType, numero: string): string {
  return `${tipo}-****${numero.slice(-3)}`;
}

/**
 * La forma segura para registros y telemetría.
 *
 * Es lo ÚNICO que puede salir hacia un registro, Sentry o analítica. Nada de
 * cuenta, teléfono, documento ni nombre completo: un identificador y el banco
 * bastan para diagnosticar, y no reconstruyen a nadie.
 */
export function paraRegistro(id: string, datos: DatosDeMetodo): Record<string, string> {
  return { methodId: id, type: datos.type, bankCode: datos.bankCode };
}
