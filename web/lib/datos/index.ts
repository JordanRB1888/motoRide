import { crearRepositorioEnMemoria } from "./memoria";
import type { RepositorioWeb } from "./tipos";

export type { RepositorioWeb } from "./tipos";
export * from "./tipos";

/**
 * Qué almacén usa la web, y por qué puede no haber ninguno todavía.
 *
 * Hoy el proyecto web no tiene ni una variable de entorno: no hay base
 * provisionada, y no se ha contratado nada a espaldas del dueño. Eso no impide
 * que la infraestructura esté construida y probada, porque toda la lógica habla
 * con `RepositorioWeb` y no con un proveedor.
 *
 * Cuando exista la base, este fichero es el ÚNICO que cambia: se añade el
 * adaptador y se elige aquí. Ni las rutas ni los formularios se enteran.
 */
let instancia: RepositorioWeb | null = null;

export function repositorioWeb(): RepositorioWeb {
  if (instancia) return instancia;

  // Aquí entrará el adaptador real cuando haya base:
  //   if (process.env.WEB_DATABASE_URL) { instancia = crearRepositorioPostgres(...); return instancia }

  if (process.env.NODE_ENV === "production") {
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
 * cumplirse, y es mejor decirlo que aceptar un dato que se va a perder.
 */
export function hayAlmacen(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(process.env.WEB_DATABASE_URL);
}
