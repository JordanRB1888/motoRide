import { crearRepositorioEnMemoria } from "./memoria";
import { crearRepositorioPostgres } from "./postgres";
import type { RepositorioWeb } from "./tipos";

export type { RepositorioWeb } from "./tipos";
export * from "./tipos";
export { cerrarPoolWeb, crearRepositorioPostgres, poolWeb } from "./postgres";

/**
 * Qué almacén usa la web.
 *
 * Hay dos implementaciones del mismo contrato y este fichero es el único sitio
 * donde se elige entre ellas. Ni las rutas ni los formularios saben cuál les ha
 * tocado, que es justo lo que permitió construir y probar toda la Fase 1-B
 * cuando todavía no había ninguna base contratada.
 *
 * EL ORDEN IMPORTA, Y ESTE ES EL PORQUÉ DE CADA PASO
 *
 * 1. Una salida explícita para las pruebas. Tiene que ser una decisión escrita
 *    —una variable puesta a mano—, nunca una deducción: si el almacén de memoria
 *    se colara por inferencia en un sitio que no toca, se perderían datos de
 *    gente real sin que nadie viera un error.
 * 2. Si hay cadena de conexión, Postgres. En vista previa y en producción por
 *    igual: una vista previa que guardara en memoria probaría otra cosa distinta
 *    de la que se va a publicar.
 * 3. En producción sin cadena, se rompe. A gritos.
 * 4. Fuera de producción y sin cadena, memoria: `npm run dev` tiene que arrancar
 *    en una máquina recién clonada sin credenciales de nadie.
 */
let instancia: RepositorioWeb | null = null;

export function repositorioWeb(): RepositorioWeb {
  if (instancia) return instancia;

  if (process.env.WEB_DATOS_EN_MEMORIA === "1") {
    instancia = crearRepositorioEnMemoria();
    return instancia;
  }

  const cadena = process.env.WEB_DATABASE_URL;
  if (cadena) {
    instancia = crearRepositorioPostgres(cadena);
    return instancia;
  }

  if (process.env.NODE_ENV === "production") {
    /* Nunca fingir persistencia. Aceptar un alta que se va a evaporar al
       reciclarse la instancia es peor que rechazarla: la persona se queda
       creyendo que está apuntada. */
    throw new Error("ALMACEN_WEB_NO_CONFIGURADO");
  }

  instancia = crearRepositorioEnMemoria();
  return instancia;
}

/** Sólo para las pruebas: devuelve un almacén limpio en cada caso. */
export function reiniciarRepositorioParaPruebas(): RepositorioWeb {
  instancia = crearRepositorioEnMemoria();
  return instancia;
}

/**
 * ¿Hay almacén utilizable?
 *
 * Las rutas lo consultan ANTES de tocar nada: sin almacén, una petición no puede
 * cumplirse, y es mejor decirlo que aceptar un dato que se va a perder. En
 * producción no basta con que el proceso arranque: hace falta la cadena de
 * conexión de verdad.
 */
export function hayAlmacen(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(process.env.WEB_DATABASE_URL);
}
