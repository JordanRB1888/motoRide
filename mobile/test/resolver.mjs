/**
 * Resolución de módulos para las pruebas de Node.
 *
 * EL PROBLEMA
 *
 * Dentro de `mobile/` los imports van sin extensión —`from './authState'`—,
 * que es lo normal en React Native: Metro resuelve `.ts`, `.tsx`, `.ios.ts` y
 * compañía por su cuenta. Node, en cambio, exige la extensión exacta y falla
 * con `ERR_MODULE_NOT_FOUND`.
 *
 * LA ALTERNATIVA QUE SE DESCARTÓ
 *
 * Escribir `from './authState.ts'` en el código haría feliz a Node y sería una
 * forma poco habitual de importar en React Native, sujeta a que el bundler la
 * siga tratando bien. No merece la pena cambiar cómo se escribe el código de
 * producción para acomodar al ejecutor de pruebas.
 *
 * Este resolvedor hace lo que hace Metro, sólo durante las pruebas: si un
 * import relativo no existe tal cual, prueba con `.ts` y `.tsx`.
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXTENSIONES = ['.ts', '.tsx'];

registerHooks({
  resolve(especificador, contexto, siguiente) {
    // Sólo los imports relativos sin extensión. Los paquetes y las rutas ya
    // completas se dejan al comportamiento normal de Node.
    const esRelativo = especificador.startsWith('./') || especificador.startsWith('../');
    const yaTieneExtension = /\.[a-z0-9]+$/i.test(especificador);

    if (esRelativo && !yaTieneExtension && contexto.parentURL) {
      for (const extension of EXTENSIONES) {
        const candidata = new URL(especificador + extension, contexto.parentURL);
        if (existsSync(fileURLToPath(candidata))) {
          return siguiente(especificador + extension, contexto);
        }
      }
    }

    return siguiente(especificador, contexto);
  }
});
