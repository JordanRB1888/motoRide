import type { Provider } from '@nestjs/common';

/**
 * El reloj, como dependencia inyectable.
 *
 * Es una dependencia pequeña, pura y genuinamente util: convierte el
 * `timestamp` de una respuesta en algo COMPROBABLE en una prueba, en vez de un
 * valor que solo se puede mirar de reojo.
 *
 * Y es a proposito el ejemplo de inyeccion de dependencias de esta fase: no
 * envuelve nada del monolito. Un `LegacyEverythingService` demostraria que se
 * sabe escribir un `@Injectable`, no que la arquitectura vaya a alguna parte.
 */
export interface Reloj {
  ahora(): number;
}

/** El identificador de inyeccion. Es una interfaz, asi que necesita simbolo. */
export const RELOJ = Symbol('Reloj');

export const relojDelSistema: Reloj = {
  ahora: () => Date.now()
};

export const proveedorDeReloj: Provider = {
  provide: RELOJ,
  useValue: relojDelSistema
};
