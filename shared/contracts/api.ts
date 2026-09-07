/**
 * Forma de las respuestas de la API.
 *
 * Fuente: `src/services/httpErrorCodes.js` y el manejo de respuestas de
 * `src/services/apiService.js`. Se declara lo que el cliente YA recibe hoy: no
 * se propone un formato nuevo ni se cambia ningún contrato de ejecución.
 *
 * Neutral respecto al entorno: no menciona `Response`, `fetch` ni nada del DOM,
 * para que la futura app nativa pueda importarlo igual.
 */

/**
 * Códigos de error que el cliente sabe interpretar cuando el cuerpo no trae
 * uno propio.
 *
 * Fuente: `errorCodeForStatus` en `httpErrorCodes.js`. Existen porque perder el
 * código costó un fallo real: un 429 llegaba a la pantalla como «credenciales
 * incorrectas» y la persona reintentaba, que es lo peor con el cupo agotado.
 */
export const ERROR_CODES_BY_STATUS = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED'
} as const;

export type MappedErrorCode = (typeof ERROR_CODES_BY_STATUS)[keyof typeof ERROR_CODES_BY_STATUS];

/** Los dos códigos de reserva que no salen del mapa por estado. */
export type FallbackErrorCode = 'SERVER_ERROR' | 'REQUEST_FAILED';

/**
 * Cualquier código que `errorCodeForStatus` puede devolver.
 *
 * Es una unión ABIERTA a propósito (`| (string & {})`): el servidor manda su
 * propio código en el cuerpo cuando lo tiene —`INSUFFICIENT_BALANCE`,
 * `TRIP_NOT_CANCELLABLE`, `MONEY_OPERATION_CONFLICT`…— y cerrar la unión aquí
 * obligaría a tocar este fichero cada vez que el backend añade uno, o peor, a
 * mentir con un `as`.
 */
export type ApiErrorCode = MappedErrorCode | FallbackErrorCode | (string & {});

/**
 * El error que `buildRequestError` compone y que el cliente guarda.
 *
 * `status` va siempre y nunca lo sobrescribe el cuerpo: es lo único que se
 * conoce con certeza cuando la respuesta no es JSON.
 *
 * `error` es OPCIONAL, y eso describe lo que el código hace hoy — no lo que
 * sería deseable. `buildRequestError` esparce el cuerpo del servidor cuando
 * existe, así que una respuesta JSON sin campo `error` produce un error
 * compuesto sin código:
 *
 *     buildRequestError(400, { message: 'algo' })  ->  { message, status }
 *
 * Los consumidores ya lo contemplan (`apiService.lastError?.error === '...'`
 * cae en `undefined` y usa su mensaje por defecto), así que en ejecución no se
 * rompe nada. Declararlo obligatorio aquí sería prometer una garantía que
 * ningún código sostiene, y esa es justo la clase de mentira que TypeScript
 * debe evitar, no fabricar.
 *
 * Anotado como candidato para una fase futura en `docs/typescript.md`;
 * cambiarlo ahora sería modificar el contrato de ejecución de los errores, y
 * eso no pertenece a TYPESCRIPT-1.
 */
export interface ApiError {
  readonly status: number;
  readonly error?: ApiErrorCode;
  /** Mensaje legible, cuando el servidor lo manda. */
  readonly message?: string;
}

/**
 * Página de un listado del panel de administración.
 *
 * Fuente: `server/domain/pagination.js` (`paginate`), que es lo que devuelven
 * hoy `/api/users` y los listados de soporte. El cursor es OPACO: quien
 * consume la API no debe construirlo ni deducir nada de él, y por eso aquí es
 * `string` y no una forma estructurada.
 */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number;
}

/**
 * Página de un listado con paginador numerado.
 *
 * Fuente: `paginateByPage` en el mismo fichero. Convive con el cursor porque no
 * sirven para lo mismo: el cursor recorre en orden, y hay pantallas donde
 * saltar a la página cuatro es justo lo que se espera.
 */
export interface NumberedPage<T> extends CursorPage<T> {
  readonly page: number;
  readonly totalPages: number;
}
