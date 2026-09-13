/**
 * El contrato del almacén de la web pública.
 *
 * POR QUÉ UNA INTERFAZ Y NO LLAMAR AL PROVEEDOR DESDE LA RUTA
 *
 * Los datos que recoge la web —quién quiere que le avisen, qué comercio quiere
 * hablar— no tienen nada que ver con los viajes, ni con las cuentas de la
 * aplicación, ni con su base de producción. Mezclarlos ataría el ciclo de vida
 * de un dato de marketing al de un dato de operación, y una credencial de la web
 * daría acceso a la operación.
 *
 * Por eso el almacén de la web es OTRO, y por eso las rutas hablan con esta
 * interfaz y no con un proveedor concreto: cambiar de proveedor —o empezar con
 * uno de memoria mientras no haya ninguno provisionado— no debe tocar ni una
 * línea de la lógica.
 */

export type EstadoWaitlist =
  | "pendiente"
  | "confirmado"
  | "caducado"
  | "baja"
  | "rebotado";

export type RolWaitlist = "pasajero" | "conductor" | "comercio";

export type ZonaWaitlist = "santa-cruz-de-mara" | "el-mojan" | "maracaibo";

export type RegistroWaitlist = {
  id: string;
  /** Siempre normalizado: recortado y en minúsculas. */
  email: string;
  rol: RolWaitlist | null;
  zona: ZonaWaitlist | null;
  estado: EstadoWaitlist;
  tokenConfirmacion: string | null;
  tokenExpiraEn: string | null;
  tokenBaja: string | null;
  confirmadoEn: string | null;
  bajaEn: string | null;
  /** De dónde vino: campaña o `utm_source`. Nunca identifica a una persona. */
  origen: string | null;
  /** HMAC de la dirección IP. **Jamás** la IP en claro. */
  ipHash: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

export type EstadoLead =
  | "nuevo"
  | "contactado"
  | "en_conversacion"
  | "cerrado_ganado"
  | "cerrado_perdido";

export type LeadAliado = {
  id: string;
  nombre: string;
  negocio: string;
  telefono: string;
  email: string;
  municipio: string;
  tipoComercio: string;
  mensaje: string | null;
  /** CUÁNDO consintió, no un sí/no: un booleano no prueba nada. */
  consentimientoEn: string;
  estado: EstadoLead;
  ipHash: string | null;
  creadoEn: string;
};

/** Lo que devuelve un alta: si se creó o si ya existía. */
export type ResultadoAlta = {
  creado: boolean;
  registro: RegistroWaitlist;
};

export interface RepositorioWeb {
  // ---- Lista de espera ----

  /**
   * Da de alta un correo, o devuelve el registro que ya hubiera.
   *
   * Es idempotente a propósito: reenviar el formulario no duplica ni falla. La
   * ruta responde lo mismo en los dos casos para no revelar quién está en la
   * lista.
   */
  altaEnEspera(datos: {
    email: string;
    rol: RolWaitlist | null;
    zona: ZonaWaitlist | null;
    origen: string | null;
    ipHash: string | null;
    tokenConfirmacion: string;
    tokenExpiraEn: string;
    tokenBaja: string;
  }): Promise<ResultadoAlta>;

  buscarPorTokenConfirmacion(token: string): Promise<RegistroWaitlist | null>;
  buscarPorTokenBaja(token: string): Promise<RegistroWaitlist | null>;

  /** Marca como confirmado y **quema el testigo**: un enlace vale una vez. */
  confirmarEnEspera(id: string): Promise<RegistroWaitlist | null>;

  /** Marca como caducado sin confirmar. */
  caducarEnEspera(id: string): Promise<RegistroWaitlist | null>;

  darDeBajaEnEspera(id: string): Promise<RegistroWaitlist | null>;

  /** Para el límite de reenvíos: cuándo se le mandó el último correo. */
  ultimoEnvioDeConfirmacion(email: string): Promise<string | null>;
  registrarEnvioDeConfirmacion(email: string, cuando: string): Promise<void>;

  // ---- Comercios aliados ----

  crearLeadAliado(datos: Omit<LeadAliado, "id" | "estado" | "creadoEn">): Promise<LeadAliado>;

  // ---- Límite de peticiones ----

  /**
   * Cuenta los intentos de `clave` dentro de la ventana y registra el actual.
   *
   * Vive en el almacén, no en memoria: en un despliegue sin servidor cada
   * petición puede caer en una instancia distinta, y un contador en memoria
   * sería una protección imaginaria.
   */
  contarIntentos(clave: string, ventanaMs: number, ahora: number): Promise<number>;
}
