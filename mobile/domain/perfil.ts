/**
 * El perfil: lo que se PINTA de la persona que entró.
 *
 * POR QUÉ NO VIVE EN `IdentidadDeUsuario`
 *
 * `authState.ts` guarda un subconjunto deliberado —id, rol, nombre, si está
 * verificada, estado de la cuenta— y ese subconjunto es la AUTORIDAD: lo que
 * decide si alguien entra, si opera como conductor, si se le deja pasar.
 *
 * Esto es otra cosa. El teléfono, la cédula, la fotografía y desde cuándo es
 * miembro no autorizan nada: se enseñan. Mezclarlos con la identidad invitaría
 * a preguntarle a un objeto de presentación si alguien puede hacer algo, y esa
 * pregunta tiene que ir siempre al backend.
 *
 * Salen los dos de la misma respuesta —`GET /api/auth/me`— y no hay dos
 * sesiones: el token sigue siendo uno y sigue viviendo en SecureStore.
 *
 * LO QUE EL BACKEND NO DA, AQUÍ NO SE INVENTA
 *
 * `publicUser` no devuelve valoración, ni número de viajes, ni si el teléfono
 * está verificado. Esos campos NO existen en este tipo, para que ninguna
 * pantalla pueda pintarlos por descuido creyendo que son reales.
 */

/**
 * Lo que se puede editar, por rol.
 *
 * Es el espejo EXACTO de la lista blanca de `PATCH /api/auth/me`
 * (`server/index.js`). Mandar un campo que no está aquí no rompe nada —el
 * servidor lo ignora— pero enseñar en pantalla un campo que el servidor no
 * guarda es prometer un cambio que se pierde al recargar.
 */
export const CAMPOS_DE_PASAJERA = ['firstName', 'lastName', 'phone', 'cedula'] as const;
export const CAMPOS_DE_CONDUCTOR = [
  ...CAMPOS_DE_PASAJERA,
  'vehicleBrand',
  'vehicleModel',
  'vehiclePlate',
  'vehicleColor'
] as const;

export type CampoDePerfil = (typeof CAMPOS_DE_CONDUCTOR)[number];

export function camposEditables(rol: string): readonly CampoDePerfil[] {
  return rol === 'driver' ? CAMPOS_DE_CONDUCTOR : CAMPOS_DE_PASAJERA;
}

export interface PerfilDeUsuario {
  readonly id: string;
  readonly role: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly cedula: string;
  readonly isVerified: boolean;
  readonly accountStatus: string;
  /**
   * Si el conductor esta en servicio, según el SERVIDOR.
   *
   * `AVAILABLE`, `BUSY`, `IN_TRIP`, `OFFLINE`, y también los de
   * administración —`SUSPENDED`, `PENDING_APPROVAL`— cuando toque. Cadena
   * vacía si el servidor no lo dice: en una cuenta de pasajera no existe.
   *
   * Es el estado de ARRANQUE. A partir de ahí manda `driverStatusChanged`,
   * que llega por el socket; este campo sólo dice de dónde se parte al
   * abrir la aplicación.
   */
  readonly driverStatus: string;
  /**
   * La ruta de la fotografía privada, tal como la deriva el servidor
   * (`/api/users/:id/photo`), o `null` si no hay ninguna. Nunca una URL
   * externa: el servidor la reconstruye del almacenamiento en cada respuesta.
   */
  readonly photoUrl: string | null;
  /** ISO-8601, o cadena vacía si el registro es antiguo y no lo tiene. */
  readonly createdAt: string;
  readonly vehicleBrand: string;
  readonly vehicleModel: string;
  readonly vehiclePlate: string;
  readonly vehicleColor: string;
  readonly rating?: number | null;
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

/**
 * Traduce la respuesta del backend a un perfil.
 *
 * Devuelve `null` si falta lo esencial —identificador y rol—, igual que
 * `leerIdentidad`: media identidad es peor que ninguna porque parece válida.
 * Los campos de presentación sí pueden faltar, y entonces quedan vacíos.
 */
export function leerPerfil(cuerpo: unknown): PerfilDeUsuario | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const dato = cuerpo as Record<string, unknown>;

  const id = texto(dato.id);
  const role = texto(dato.role);
  if (id === '' || (role !== 'passenger' && role !== 'driver' && role !== 'admin')) return null;

  const rawRating = dato.rating;
  const tieneRating = typeof rawRating === 'number'
    ? Number.isFinite(rawRating)
    : typeof rawRating === 'string' && rawRating.trim() !== '' && !Number.isNaN(Number(rawRating));
  const rating = tieneRating ? Number(rawRating) : null;

  const perfil: PerfilDeUsuario = {
    id,
    role,
    firstName: texto(dato.firstName),
    lastName: texto(dato.lastName),
    email: texto(dato.email),
    phone: texto(dato.phone),
    cedula: texto(dato.cedula),
    // Igual que en la identidad: sólo el `true` explícito cuenta.
    isVerified: dato.isVerified === true,
    accountStatus: texto(dato.accountStatus) || 'ACTIVE',
    driverStatus: texto(dato.status),
    photoUrl: typeof dato.photoUrl === 'string' && dato.photoUrl !== '' ? dato.photoUrl : null,
    createdAt: texto(dato.createdAt),
    vehicleBrand: texto(dato.vehicleBrand),
    vehicleModel: texto(dato.vehicleModel),
    vehiclePlate: texto(dato.vehiclePlate),
    vehicleColor: texto(dato.vehicleColor)
  };

  return rating !== null ? { ...perfil, rating } : perfil;
}

/**
 * Con quién se puede formar un nombre.
 *
 * No es el perfil entero a propósito. La identidad que ya trae la sesión tiene
 * estos dos campos, así que el perfil puede escribir el nombre y las iniciales
 * SIN esperar a `/api/auth/me`. Exigir el tipo grande obligaba a esperar a la
 * red para pintar algo que ya se sabía.
 */
export interface ConNombre {
  readonly firstName: string;
  readonly lastName: string;
}

/** El nombre para saludar. Vacío si el backend no dio ninguno. */
export function nombreDe(perfil: ConNombre): string {
  return [perfil.firstName, perfil.lastName].filter(parte => parte !== '').join(' ');
}

/**
 * Las iniciales del disco.
 *
 * Sin nombre no se inventa una letra: se devuelve cadena vacía y el disco queda
 * liso, que es honesto. Una «U» de «Usuario» parecería el apellido de alguien.
 */
export function inicialesDe(perfil: ConNombre): string {
  return [perfil.firstName, perfil.lastName]
    .map(parte => parte.trim().charAt(0).toUpperCase())
    .filter(letra => letra !== '')
    .slice(0, 2)
    .join('');
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
] as const;

/**
 * «Miembro desde …».
 *
 * Se corta al mes: el día exacto en que alguien se registró no le dice nada a
 * nadie y ocupa sitio. Si la fecha no se puede leer, la línea desaparece en vez
 * de enseñar «Invalid Date».
 */
export function desdeCuando(perfil: PerfilDeUsuario): string | null {
  if (perfil.createdAt === '') return null;
  const fecha = new Date(perfil.createdAt);
  if (Number.isNaN(fecha.getTime())) return null;
  return `Miembro desde ${MESES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// La edición
// ---------------------------------------------------------------------------

export type BorradorDePerfil = Partial<Record<CampoDePerfil, string>>;

/** El borrador con el que se abre el formulario: lo que hay hoy. */
export function borradorDe(perfil: PerfilDeUsuario): BorradorDePerfil {
  const borrador: BorradorDePerfil = {};
  for (const campo of camposEditables(perfil.role)) borrador[campo] = perfil[campo];
  return borrador;
}

/**
 * Sólo lo que CAMBIÓ.
 *
 * Mandar el teléfono intacto junto al nombre nuevo hace que el servidor lo
 * valide igual, y un teléfono que ya existía —el tuyo— chocaría contra su
 * propia comprobación de duplicados si algún día deja de excluirse a sí mismo.
 * Enviar sólo lo tocado evita depender de ese detalle.
 */
export function cambiosDePerfil(
  perfil: PerfilDeUsuario,
  borrador: BorradorDePerfil
): BorradorDePerfil {
  const cambios: BorradorDePerfil = {};
  for (const campo of camposEditables(perfil.role)) {
    const nuevo = (borrador[campo] ?? '').trim();
    if (nuevo !== perfil[campo]) cambios[campo] = nuevo;
  }
  return cambios;
}

export function hayCambios(perfil: PerfilDeUsuario, borrador: BorradorDePerfil): boolean {
  return Object.keys(cambiosDePerfil(perfil, borrador)).length > 0;
}

export type ErroresDeCampo = Partial<Record<CampoDePerfil, string>>;

/**
 * Las mismas reglas que el servidor, para avisar ANTES de la ida y vuelta.
 *
 * Esto es comodidad, no seguridad. El servidor vuelve a comprobarlo todo y su
 * respuesta manda: si alguna vez las dos discrepan, gana la de allá y se pinta
 * lo que diga. Por eso las reglas se escriben aquí igual de estrictas y ni una
 * más — una validación de cliente MÁS dura que la del servidor rechaza datos
 * que el sistema aceptaría.
 */
export function validarBorrador(borrador: BorradorDePerfil): ErroresDeCampo {
  const errores: ErroresDeCampo = {};

  for (const campo of ['firstName', 'lastName'] as const) {
    if (borrador[campo] === undefined) continue;
    if (borrador[campo]!.trim().length < 2) errores[campo] = 'Campo obligatorio.';
  }

  if (borrador.phone !== undefined) {
    const digitos = borrador.phone.replace(/\D/g, '').length;
    if (digitos < 10 || digitos > 15) errores.phone = 'Teléfono inválido.';
  }

  return errores;
}

/**
 * Los errores que vienen del servidor.
 *
 * `VALIDATION_FAILED` trae `fields` con el detalle por campo. `USER_EXISTS` no
 * trae ninguno —el servidor no dice de quién es el teléfono, y hace bien— así
 * que se traduce al campo que lo provocó.
 */
export function erroresDelServidor(codigo: string | null, cuerpo: unknown): ErroresDeCampo {
  if (codigo === 'USER_EXISTS') return { phone: 'Ese teléfono ya está en uso.' };
  if (codigo !== 'VALIDATION_FAILED') return {};

  const dato = typeof cuerpo === 'object' && cuerpo !== null
    ? (cuerpo as Record<string, unknown>).fields
    : null;
  if (typeof dato !== 'object' || dato === null) return {};

  const errores: ErroresDeCampo = {};
  for (const campo of CAMPOS_DE_CONDUCTOR) {
    const mensaje = (dato as Record<string, unknown>)[campo];
    if (typeof mensaje === 'string' && mensaje !== '') errores[campo] = mensaje;
  }
  return errores;
}
