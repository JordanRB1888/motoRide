"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import Turnstile from "@/components/forms/Turnstile";
import { WAITLIST_ENABLED } from "@/lib/flags";
import { medir } from "@/lib/analitica";

const ROLES = [
  { valor: "pasajero", etiqueta: "Quiero pedir viajes" },
  { valor: "conductor", etiqueta: "Quiero conducir" },
  { valor: "comercio", etiqueta: "Tengo un comercio" },
] as const;

const ZONAS = [
  { valor: "santa-cruz-de-mara", etiqueta: "Santa Cruz de Mara" },
  { valor: "el-mojan", etiqueta: "El Moján" },
  { valor: "maracaibo", etiqueta: "Maracaibo" },
] as const;

/**
 * Formulario de la lista de espera.
 *
 * **Mientras `WAITLIST_ENABLED` sea false no se pinta nada.** No es un adorno
 * deshabilitado ni un campo en gris: sencillamente no existe en la página. Un
 * formulario que no puede guardar lo que le escriben engaña a quien lo rellena,
 * y esa es la única razón por la que este componente comprueba el interruptor
 * antes que nada.
 *
 * Accesibilidad, que en un formulario no es un extra:
 *  · etiquetas de verdad, no marcadores de posición haciendo de etiqueta;
 *  · cada error atado a su campo con `aria-describedby`, y el foco va al primero;
 *  · el resultado se anuncia por una región viva, para quien no ve la pantalla;
 *  · 44 px de alto en todo lo que se toca.
 */
export default function FormularioWaitlist({ origen }: { origen?: string }) {
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testigo, setTestigo] = useState("");
  /* Cuándo apareció el formulario, para descartar los envíos instantáneos que
     sólo hace un robot.

     La marca se toma en un efecto y no en el render: `Date.now()` es impuro y
     llamarlo mientras React renderiza devuelve un valor distinto en cada
     repintado, aunque `useRef` sólo se quede con el primero. El efecto corre una
     vez, tras montar, que es justo el momento en que la persona puede ver el
     formulario — así que mide lo mismo y deja de mentirle a React. */
  const abiertoEn = useRef(0);
  useEffect(() => {
    abiertoEn.current = Date.now();
  }, []);
  const refEmail = useRef<HTMLInputElement>(null);
  const refConsent = useRef<HTMLInputElement>(null);

  if (!WAITLIST_ENABLED) return null;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);

    const form = evento.currentTarget;
    const datos = new FormData(form);
    const email = String(datos.get("email") ?? "").trim();
    const consentimiento = datos.get("consentimiento") === "on";

    if (!email) {
      setError("Escribe tu correo para poder avisarte.");
      refEmail.current?.focus();
      return;
    }
    if (!consentimiento) {
      setError("Necesitamos tu permiso para escribirte una vez.");
      refConsent.current?.focus();
      return;
    }

    setEnviando(true);
    medir("waitlist_iniciada", {
      rol: String(datos.get("rol") ?? "") || undefined,
      zona: String(datos.get("zona") ?? "") || undefined,
    });

    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          rol: String(datos.get("rol") ?? "") || null,
          zona: String(datos.get("zona") ?? "") || null,
          consentimiento: true,
          turnstileToken: testigo,
          trampa: String(datos.get("apellido2") ?? ""),
          abiertoEn: abiertoEn.current,
          origen: origen ?? null,
        }),
      });

      if (r.status === 429) {
        setError("Demasiados intentos seguidos. Prueba otra vez dentro de un rato.");
        return;
      }
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(
          cuerpo?.error === "EMAIL_INVALIDO"
            ? "Ese correo no parece válido. Revísalo."
            : "No pudimos guardarlo. Inténtalo otra vez en un momento.",
        );
        return;
      }
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
        className="rounded-[var(--radius-card)] border border-signal/30 bg-signal/[0.06] p-6 sm:p-7"
      >
        <p className="text-[17px] font-bold text-paper">Revisa tu correo</p>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-paper-dim">
          Te mandamos un mensaje para confirmar que la dirección es tuya. Un toque al
          botón y quedas en la lista.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="rounded-[var(--radius-card)] border border-white/10 bg-white/[0.03] p-6 sm:p-7"
    >
      <p className="text-[17px] font-bold text-paper">
        ¿Quieres que te avisemos cuando esté disponible?
      </p>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-paper-dim">
        Te avisaremos una sola vez, el día que +58Express esté disponible. Ni boletines,
        ni promociones.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <div>
          <label htmlFor="wl-email" className="block text-[14px] font-bold text-paper">
            Tu correo
          </label>
          <input
            ref={refEmail}
            id="wl-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            aria-describedby={error ? "wl-error" : undefined}
            aria-invalid={error ? true : undefined}
            className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-ink-900 px-4 text-[16px] text-paper outline-none placeholder:text-paper-mute focus-visible:border-signal"
            placeholder="nombre@correo.com"
          />
        </div>

        <fieldset>
          <legend className="text-[14px] font-bold text-paper">
            ¿Qué te interesa? <span className="font-normal text-paper-mute">(opcional)</span>
          </legend>
          <select
            name="rol"
            defaultValue=""
            className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-ink-900 px-4 text-[16px] text-paper outline-none focus-visible:border-signal"
          >
            <option value="">Prefiero no decirlo</option>
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset>
          <legend className="text-[14px] font-bold text-paper">
            ¿Dónde estás? <span className="font-normal text-paper-mute">(opcional)</span>
          </legend>
          <select
            name="zona"
            defaultValue=""
            className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-ink-900 px-4 text-[16px] text-paper outline-none focus-visible:border-signal"
          >
            <option value="">Prefiero no decirlo</option>
            {ZONAS.map((z) => (
              <option key={z.valor} value={z.valor}>
                {z.etiqueta}
              </option>
            ))}
          </select>
        </fieldset>

        {/* Trampa: ningún humano la ve ni la tabula, un programa la rellena.
            `aria-hidden` + `tabIndex={-1}` la dejan fuera del lector de pantalla
            y del recorrido con teclado: no estorba a nadie. */}
        <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="wl-apellido2">No rellenes esto</label>
          <input id="wl-apellido2" name="apellido2" tabIndex={-1} autoComplete="off" />
        </div>

        <label htmlFor="wl-consent" className="flex min-h-[44px] items-start gap-3 text-[15px] leading-relaxed text-paper-dim">
          <input
            ref={refConsent}
            id="wl-consent"
            name="consentimiento"
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-signal)]"
          />
          <span>
            Acepto que +58Express guarde mi correo para avisarme del lanzamiento. Puedo
            salir de la lista en cualquier momento.
          </span>
        </label>

        <Turnstile onTestigo={setTestigo} />

        {error && (
          <p id="wl-error" role="alert" className="text-[15px] font-bold text-signal">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={enviando} className="w-full sm:w-auto">
          {enviando ? "Enviando…" : "Avísenme cuando salga"}
        </Button>
      </div>
    </form>
  );
}
