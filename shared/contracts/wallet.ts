/**
 * Contratos de cartera, métodos de retiro y solicitudes de retiro.
 *
 * Se comparten entre frontend y backend porque las dos mitades hablan del mismo
 * dinero, y duplicar su forma es la manera más fácil de que se desincronicen.
 *
 * REGLA QUE NO SE NEGOCIA: los importes viajan como CADENA DECIMAL, nunca como
 * `number`. Es la misma regla que FX-BCV-1 y por el mismo motivo: un `double`
 * de JavaScript no representa exactamente los céntimos, y el saldo actual del
 * producto —`walletBalance`, un `number` redondeado con `Math.round(x*100)/100`—
 * es justo lo que esta fundación existe para sustituir.
 */

/** La moneda económica base del sistema. Los bolívares son una conversión. */
export const WALLET_CURRENCY = 'USD' as const;

// ---------------------------------------------------------------------------
// Clases de fondos
// ---------------------------------------------------------------------------

/**
 * De dónde salió el dinero.
 *
 * Importa porque **no todo saldo es retirable**. Una promoción de bienvenida es
 * saldo utilizable dentro de la aplicación y no dinero que la plataforma deba
 * transferir a una cuenta bancaria; tratarlos igual convierte cada campaña de
 * marketing en una vía de extracción de efectivo.
 */
export const FUND_CLASSES = [
  /** Ganancias de un conductor por viajes prestados. */
  'EARNED',
  /** Dinero que la persona metió: recargas verificadas. */
  'DEPOSITED',
  /** Devolución de un cobro. */
  'REFUND',
  /** Crédito promocional. */
  'PROMO',
  /** Bonificación otorgada por la plataforma. */
  'BONUS',
  /** Crédito por invitar a alguien. */
  'REFERRAL',
  /** Ajuste manual de administración. */
  'ADJUSTMENT'
] as const;
export type FundClass = (typeof FUND_CLASSES)[number];

/**
 * Si una clase de fondos puede convertirse en dinero fuera de la aplicación.
 *
 * `UNDECIDED` **no es un valor por defecto cómodo**: es la constatación de que
 * el producto todavía no ha tomado esa decisión comercial, y se trata como no
 * retirable hasta que la tome. Inventar aquí una política sería decidir por el
 * dueño algo que tiene consecuencias de dinero real.
 */
export const WITHDRAWABILITY = ['WITHDRAWABLE', 'NON_WITHDRAWABLE', 'UNDECIDED'] as const;
export type Withdrawability = (typeof WITHDRAWABILITY)[number];

// ---------------------------------------------------------------------------
// Cartera
// ---------------------------------------------------------------------------

/**
 * El estado de una cartera.
 *
 * Tres cifras, no una. El saldo único de hoy (`walletBalance`) no puede
 * expresar que parte del dinero está comprometido en un retiro en curso ni que
 * parte no es retirable, y por eso hacen falta las tres.
 */
export interface WalletBalances {
  readonly currency: typeof WALLET_CURRENCY;
  /** Utilizable ahora mismo dentro de la aplicación. */
  readonly available: string;
  /** Comprometido en retiros en curso. Sigue siendo de la persona. */
  readonly reserved: string;
  /** La parte de `available` que además puede salir de la aplicación. */
  readonly withdrawableAvailable: string;
}

// ---------------------------------------------------------------------------
// Libro mayor
// ---------------------------------------------------------------------------

export const LEDGER_DIRECTIONS = ['CREDIT', 'DEBIT'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/**
 * Qué provocó el movimiento.
 *
 * `WITHDRAWAL_RESERVE`, `WITHDRAWAL_RELEASE` y `WITHDRAWAL_SETTLE` son los tres
 * momentos de un retiro, y son movimientos distintos a propósito: reservar no
 * es pagar, y liberar no es cobrar.
 */
export const LEDGER_ENTRY_TYPES = [
  'WITHDRAWAL_RESERVE',
  'WITHDRAWAL_RELEASE',
  'WITHDRAWAL_SETTLE',
  'WALLET_CREDIT',
  'WALLET_DEBIT'
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export interface LedgerEntry {
  readonly id: string;
  readonly direction: LedgerDirection;
  /** Siempre positivo. El sentido lo da `direction`, nunca el signo. */
  readonly amount: string;
  readonly currency: typeof WALLET_CURRENCY;
  readonly type: LedgerEntryType;
  readonly fundClass: FundClass;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly createdAt: string;
  /** Saldos resultantes, para poder auditar sin recalcular todo el libro. */
  readonly availableAfter: string;
  readonly reservedAfter: string;
}

// ---------------------------------------------------------------------------
// Métodos de retiro
// ---------------------------------------------------------------------------

export const PAYMENT_METHOD_TYPES = ['BANK_TRANSFER', 'PAGO_MOVIL'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type PaymentMethodStatus = (typeof PAYMENT_METHOD_STATUSES)[number];

export const ACCOUNT_TYPES = ['CORRIENTE', 'AHORRO'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Los documentos de identidad que se usan en Venezuela. */
export const DOCUMENT_TYPES = ['V', 'E', 'J', 'G', 'P'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Un método tal y como se le muestra a su dueño: **enmascarado**.
 *
 * Nunca lleva el número de cuenta ni el teléfono completos. Quien ya es dueño
 * de la cuenta no necesita que se la repitan entera para reconocerla, y una
 * respuesta de API que la lleva es una respuesta que acaba en un registro, en
 * una captura de pantalla o en una herramienta de terceros.
 */
export interface PaymentMethodSummary {
  readonly id: string;
  readonly type: PaymentMethodType;
  readonly status: PaymentMethodStatus;
  readonly bankCode: string;
  readonly bankName: string;
  /** Últimos dígitos, con el resto oculto: `****1234`. */
  readonly maskedIdentifier: string;
  readonly holderName: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Retiros
// ---------------------------------------------------------------------------

/**
 * Los estados de una solicitud de retiro.
 *
 * `APPROVED` y `PAID` son estados DISTINTOS, y la diferencia no es burocrática:
 * aprobar es una decisión administrativa, pagar es que el dinero salió de una
 * cuenta y entró en otra. Confundirlos —como hace el flujo actual del
 * producto, que descuenta el saldo y notifica «Liquidación pagada» al aprobar—
 * significa que el sistema cree haber pagado cosas que no ha pagado.
 */
export const WITHDRAWAL_STATUSES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'REJECTED',
  'CANCELLED'
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/** Estados desde los que ya no se sale. */
export const TERMINAL_WITHDRAWAL_STATUSES = ['PAID', 'REJECTED', 'CANCELLED'] as const;

/**
 * La instantánea del tipo de cambio con la que se calculó el equivalente en
 * bolívares.
 *
 * Se congela al crear la solicitud. Volver a preguntarle al BCV para
 * reconstruir cuánto representaba un retiro daría otra cifra en cuanto el BCV
 * publique una corrección, y la persona vería cambiar un importe que ya se le
 * había comunicado.
 */
export interface FxSnapshot {
  readonly rate: string;
  readonly effectiveDate: string;
  readonly fetchedAt: string;
  readonly source: string;
}

/** Una solicitud de retiro, como la ve su dueño. */
export interface WithdrawalRequest {
  readonly id: string;
  readonly status: WithdrawalStatus;
  readonly amount: string;
  readonly currency: typeof WALLET_CURRENCY;
  readonly method: PaymentMethodSummary;
  /** Presente sólo si la solicitud fijó un equivalente en bolívares. */
  readonly fx: FxSnapshot | null;
  readonly amountVes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Referencia bancaria del pago, disponible sólo cuando ya se pagó. */
  readonly paymentReference: string | null;
}
