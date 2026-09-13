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
      if (existente) return { creado: false, registro: existente };

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

    async contarIntentos(clave, ventanaMs, ahora) {
      const desde = ahora - ventanaMs;
      const previos = (intentos.get(clave) ?? []).filter((t) => t > desde);
      previos.push(ahora);
      intentos.set(clave, previos);
      return previos.length;
    },
  };
}
