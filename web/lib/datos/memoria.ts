import { randomUUID } from "node:crypto";
import type {
  LeadAliado,
  RegistroWaitlist,
  RepositorioWeb,
  ResultadoAlta,
} from "./tipos";

/**
 * Almacén en memoria.
 *
 * Es una implementación COMPLETA del contrato, no un esqueleto: las pruebas
 * ejercitan con ella el alta, la confirmación, la caducidad, la baja, el límite
 * de peticiones y los comercios, de modo que la lógica queda verificada de
 * verdad antes de que exista ningún proveedor contratado.
 *
 * NO sirve para producción y no lo disimula: en un despliegue sin servidor cada
 * instancia tendría su propia copia y todo se perdería al reciclarse. El
 * selector de `index.ts` sólo la entrega fuera de producción.
 */
export function crearRepositorioEnMemoria(): RepositorioWeb {
  const espera = new Map<string, RegistroWaitlist>();
  const leads: LeadAliado[] = [];
  const envios = new Map<string, string>();
  const intentos = new Map<string, number[]>();

  const porEmail = (email: string) =>
    [...espera.values()].find((r) => r.email === email) ?? null;

  return {
    async altaEnEspera(datos): Promise<ResultadoAlta> {
      const existente = porEmail(datos.email);
      if (existente) {
        /* El mismo criterio que en Postgres, y por las mismas dos razones: si el
           testigo anterior ya no sirve hay que dar uno nuevo —si no, quien dejó
           caducar el enlace no podría confirmarse nunca más—, pero si sigue vivo
           no se toca, porque entonces cualquiera podría anular el enlace de otra
           persona escribiendo su dirección en el formulario. */
        const caducado =
          !existente.tokenConfirmacion ||
          !existente.tokenExpiraEn ||
          new Date(existente.tokenExpiraEn).getTime() < Date.now();

        if ((existente.estado === "pendiente" || existente.estado === "caducado") && caducado) {
          existente.tokenConfirmacion = datos.tokenConfirmacion;
          existente.tokenExpiraEn = datos.tokenExpiraEn;
          existente.estado = "pendiente";
          existente.actualizadoEn = new Date().toISOString();
        }
        return { creado: false, registro: existente };
      }

      const ahora = new Date().toISOString();
      const registro: RegistroWaitlist = {
        id: randomUUID(),
        email: datos.email,
        rol: datos.rol,
        zona: datos.zona,
        estado: "pendiente",
        tokenConfirmacion: datos.tokenConfirmacion,
        tokenExpiraEn: datos.tokenExpiraEn,
        tokenBaja: datos.tokenBaja,
        confirmadoEn: null,
        bajaEn: null,
        origen: datos.origen,
        ipHash: datos.ipHash,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };
      espera.set(registro.id, registro);
      return { creado: true, registro };
    },

    async buscarPorTokenConfirmacion(token) {
      if (!token) return null;
      return [...espera.values()].find((r) => r.tokenConfirmacion === token) ?? null;
    },

    async buscarPorTokenBaja(token) {
      if (!token) return null;
      return [...espera.values()].find((r) => r.tokenBaja === token) ?? null;
    },

    async confirmarEnEspera(id) {
      const r = espera.get(id);
      if (!r) return null;
      r.estado = "confirmado";
      r.confirmadoEn = new Date().toISOString();
      r.actualizadoEn = r.confirmadoEn;
      // El testigo se quema: un enlace de confirmación vale UNA vez.
      r.tokenConfirmacion = null;
      r.tokenExpiraEn = null;
      return r;
    },

    async caducarEnEspera(id) {
      const r = espera.get(id);
      if (!r) return null;
      r.estado = "caducado";
      r.actualizadoEn = new Date().toISOString();
      r.tokenConfirmacion = null;
      return r;
    },

    async darDeBajaEnEspera(id) {
      const r = espera.get(id);
      if (!r) return null;
      r.estado = "baja";
      r.bajaEn = new Date().toISOString();
      r.actualizadoEn = r.bajaEn;
      return r;
    },

    async ultimoEnvioDeConfirmacion(email) {
      return envios.get(email) ?? null;
    },

    async registrarEnvioDeConfirmacion(email, cuando) {
      envios.set(email, cuando);
    },

    async crearLeadAliado(datos) {
      const lead: LeadAliado = {
        ...datos,
        id: randomUUID(),
        estado: "nuevo",
        creadoEn: new Date().toISOString(),
      };
      leads.push(lead);
      return lead;
    },

    async purgarPorRetencion(ahora) {
      // Los mismos plazos y los mismos criterios que en Postgres. Si las dos
      // implementaciones divergieran, las pruebas de unidad dejarían de decir
      // nada sobre lo que ocurre de verdad.
      const dias = (n: number) => n * 24 * 60 * 60 * 1000;
      const SIN_CONFIRMAR = new Set(["pendiente", "caducado", "rebotado"]);

      let esperaEliminadas = 0;
      for (const [id, r] of [...espera.entries()]) {
        if (!SIN_CONFIRMAR.has(r.estado)) continue;
        if (new Date(r.creadoEn).getTime() >= ahora - dias(30)) continue;
        espera.delete(id);
        esperaEliminadas += 1;
      }

      let aliadosEliminados = 0;
      for (let i = leads.length - 1; i >= 0; i -= 1) {
        if (new Date(leads[i].creadoEn).getTime() < ahora - dias(365)) {
          leads.splice(i, 1);
          aliadosEliminados += 1;
        }
      }

      let intentosEliminados = 0;
      for (const [clave, marcas] of [...intentos.entries()]) {
        const vivas = marcas.filter((t) => t > ahora - dias(1));
        if (vivas.length === 0) {
          intentos.delete(clave);
          intentosEliminados += 1;
        } else if (vivas.length !== marcas.length) {
          intentos.set(clave, vivas);
        }
      }

      return { esperaEliminadas, aliadosEliminados, intentosEliminados };
    },

    async contarIntentos(clave, ventanaMs, ahora) {
      const desde = ahora - ventanaMs;
      const previos = (intentos.get(clave) ?? []).filter((t) => t > desde);
      previos.push(ahora);
      intentos.set(clave, previos);
      return previos.length;
    },
  };
}
