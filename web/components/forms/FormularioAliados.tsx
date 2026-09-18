"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import Turnstile from "@/components/forms/Turnstile";
import { PARTNER_LEADS_ENABLED } from "@/lib/flags";
import { medir } from "@/lib/analitica";

const MUNICIPIOS = [
  { valor: "mara", etiqueta: "Municipio Mara" },
  { valor: "maracaibo", etiqueta: "Maracaibo" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

const TIPOS = [
  { valor: "comida", etiqueta: "Comida preparada" },
  { valor: "mercado", etiqueta: "Mercado o abasto" },
  { valor: "farmacia", etiqueta: "Farmacia" },
  { valor: "licores", etiqueta: "Licores" },
  { valor: "reposteria", etiqueta: "Repostería" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

const CAMPOS_TEXTO = [
  { id: "nombre", etiqueta: "Tu nombre", tipo: "text", autocompletar: "name", requerido: true },
  { id: "negocio", etiqueta: "Nombre del negocio", tipo: "text", autocompletar: "organization", requerido: true },
  { id: "telefono", etiqueta: "Teléfono", tipo: "tel", autocompletar: "tel", requerido: true },
  { id: "email", etiqueta: "Correo", tipo: "email", autocompletar: "email", requerido: true },
] as const;

/**
 * «Quiero que +58Express me contacte», y sólo eso.
 *
 * No es un alta de comercio: el producto de comercios todavía no existe en el
 * backend. Pedir horarios, catálogo o cuenta bancaria fingiría un onboarding que
 * no hay detrás, y la primera impresión de un comercio sería descubrir que lo
 * que rellenó no servía para nada.
 *
 * Apagado mientras `PARTNER_LEADS_ENABLED` sea false: `/aliados` sigue ofreciendo
 * la conversación por WhatsApp, que es una puerta real.
 */
export default function FormularioAliados() {
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallos, setFallos] = useState<Record<string, string>>({});
  const [testigo, setTestigo] = useState("");
  /* En un efecto y no en el render: `Date.now()` es impuro y React lo prohíbe
     durante el render. Tras montar mide lo mismo — el momento en que la persona
     puede ver el formulario. El porqué largo está en `FormularioWaitlist`. */
  const abiertoEn = useRef(0);
  useEffect(() => {
    abiertoEn.current = Date.now();
  }, []);
  const form = useRef<HTMLFormElement>(null);

  if (!PARTNER_LEADS_ENABLED) return null;

  function enfocarPrimerFallo(campos: Record<string, string>) {
    const primero = Object.keys(campos)[0];
    if (!primero) return;
    const el = form.current?.querySelector<HTMLElement>(`#al-${primero}`);
    el?.focus();
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setFallos({});

    const datos = new FormData(evento.currentTarget);
    const cuerpo = {
      nombre: String(datos.get("nombre") ?? "").trim(),
      negocio: String(datos.get("negocio") ?? "").trim(),
      telefono: String(datos.get("telefono") ?? "").trim(),
      email: String(datos.get("email") ?? "").trim(),
      municipio: String(datos.get("municipio") ?? ""),
      tipoComercio: String(datos.get("tipoComercio") ?? ""),
      mensaje: String(datos.get("mensaje") ?? "").trim() || null,
      consentimiento: datos.get("consentimiento") === "on",
      turnstileToken: testigo,
      trampa: String(datos.get("apellido2") ?? ""),
      abiertoEn: abiertoEn.current,
    };

    setEnviando(true);
    try {
      const r = await fetch("/api/leads/partners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });

      if (r.status === 429) {
        setError("Demasiados intentos seguidos. Prueba otra vez dentro de un rato.");
        return;
      }
      if (!r.ok) {
        const respuesta = (await r.json().catch(() => null)) as
          | { error?: string; fallos?: { campo: string; mensaje: string }[] }
          | null;
        if (respuesta?.fallos?.length) {
          const mapa = Object.fromEntries(respuesta.fallos.map((f) => [f.campo, f.mensaje]));
          setFallos(mapa);
          enfocarPrimerFallo(mapa);
          return;
        }
        setError("No pudimos enviarlo. Inténtalo otra vez en un momento.");
        return;
      }

      medir("lead_aliado_enviado", {
        municipio: cuerpo.municipio,
        tipo_comercio: cuerpo.tipoComercio,
      });
      setHecho(true);
    } catch {
      setError("No hay conexión. Inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] border border-signal/30 bg-signal/[0.06] p-7 sm:p-9"
      >
        <p className="display text-[clamp(1.6rem,3.4vw,2.2rem)] text-paper">Recibimos lo tuyo</p>
        <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-paper-dim">
          Te mandamos un acuse a tu correo. Alguien del equipo revisa tu negocio y se pone
          en contacto contigo.
        </p>
      </div>
    );
  }

  const clase =
    "mt-2 h-12 w-full rounded-xl border border-white/15 bg-ink-900 px-4 text-[16px] text-paper outline-none placeholder:text-paper-mute focus-visible:border-signal";

  return (
    <form
      ref={form}
      onSubmit={enviar}
      noValidate
      className="rounded-[var(--radius-card)] border border-white/10 bg-ink-850 p-7 sm:p-9"
    >
      <h3 className="display text-[clamp(1.7rem,3.4vw,2.3rem)] text-paper">
        Cuéntanos sobre <span className="text-signal">tu comercio</span>
      </h3>
      <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-paper-dim">
        Déjanos cómo encontrarte y nuestro equipo se pone en contacto contigo.
      </p>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {CAMPOS_TEXTO.map((c) => (
          <div key={c.id}>
            <label htmlFor={`al-${c.id}`} className="block text-[14px] font-bold text-paper">
              {c.etiqueta}
            </label>
            <input
              id={`al-${c.id}`}
              name={c.id}
              type={c.tipo}
              autoComplete={c.autocompletar}
              aria-describedby={fallos[c.id] ? `al-${c.id}-error` : undefined}
              aria-invalid={fallos[c.id] ? true : undefined}
              className={clase}
            />
            {fallos[c.id] && (
              <p id={`al-${c.id}-error`} className="mt-2 text-[14px] font-bold text-signal">
                {fallos[c.id]}
              </p>
            )}
          </div>
        ))}

        <div>
          <label htmlFor="al-municipio" className="block text-[14px] font-bold text-paper">
            ¿Dónde estás?
          </label>
          <select id="al-municipio" name="municipio" defaultValue="" className={clase}>
            <option value="" disabled>
              Elige una opción
            </option>
            {MUNICIPIOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
          {fallos.municipio && (
            <p className="mt-2 text-[14px] font-bold text-signal">{fallos.municipio}</p>
          )}
        </div>

        <div>
          <label htmlFor="al-tipoComercio" className="block text-[14px] font-bold text-paper">
            Tipo de comercio
          </label>
          <select id="al-tipoComercio" name="tipoComercio" defaultValue="" className={clase}>
            <option value="" disabled>
              Elige una opción
            </option>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
          {fallos.tipoComercio && (
            <p className="mt-2 text-[14px] font-bold text-signal">{fallos.tipoComercio}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="al-mensaje" className="block text-[14px] font-bold text-paper">
            ¿Algo más? <span className="font-normal text-paper-mute">(opcional)</span>
          </label>
          <textarea
            id="al-mensaje"
            name="mensaje"
            rows={3}
            className="mt-2 w-full rounded-xl border border-white/15 bg-ink-900 p-4 text-[16px] leading-relaxed text-paper outline-none placeholder:text-paper-mute focus-visible:border-signal"
            placeholder="Qué vendes, en qué horario, cualquier cosa que nos sirva."
          />
        </div>
      </div>

      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="al-apellido2">No rellenes esto</label>
        <input id="al-apellido2" name="apellido2" tabIndex={-1} autoComplete="off" />
      </div>

      <label
        htmlFor="al-consentimiento"
        className="mt-6 flex min-h-[44px] items-start gap-3 text-[15px] leading-relaxed text-paper-dim"
      >
        <input
          id="al-consentimiento"
          name="consentimiento"
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-signal)]"
        />
        <span>
          Acepto que +58Express guarde estos datos para ponerse en contacto conmigo sobre
          mi comercio.
        </span>
      </label>
      {fallos.consentimiento && (
        <p className="mt-2 text-[14px] font-bold text-signal">{fallos.consentimiento}</p>
      )}

      <div className="mt-6">
        <Turnstile onTestigo={setTestigo} />
      </div>

      {error && (
        <p role="alert" className="mt-5 text-[15px] font-bold text-signal">
          {error}
        </p>
      )}

      <div className="mt-7">
        <Button type="submit" size="lg" disabled={enviando} className="w-full sm:w-auto">
          {enviando ? "Enviando…" : "Quiero que me contacten"}
        </Button>
      </div>
    </form>
  );
}
