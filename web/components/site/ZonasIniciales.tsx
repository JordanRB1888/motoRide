import Image from "next/image";

/**
 * Las tres plazas por las que empieza +58Express.
 *
 * QUÉ SON ESTAS IMÁGENES — importa para el texto alternativo
 *
 * Son **representaciones generadas**, no fotografías documentales de esos tres
 * monumentos. Antes el `alt` decía «La plaza de Santa Cruz de Mara, con su
 * estatua ecuestre…» y «Vista aérea de la iglesia de El Moján…», es decir,
 * afirmaba ante un lector de pantalla —lo único que oye quien no ve la
 * pantalla— que aquello era ese sitio exacto. No lo es, y además no coincidía
 * con las fotos que la propia portada usaba para los mismos pueblos.
 *
 * Ahora cada `alt` empieza por «Representación visual de…» y el pie lo dice una
 * vez, en una frase. No hace falta un aviso grande: basta con no hacer pasar una
 * ilustración por documentación.
 *
 * POR QUÉ TRES IMÁGENES Y NO UN MONTAJE
 *
 * Lo evidente sería pegar las tres fotos en un solo JPEG y colocarlo. Sería peor
 * por tres razones que se notan: en un teléfono ese montaje se vería a un tercio
 * de tamaño y no se distinguiría nada; tendría un único texto alternativo para
 * tres sitios distintos, así que quien use un lector de pantalla oiría «tres
 * plazas» en vez de saber cuáles; y el optimizador de imágenes no podría servir
 * cada una al tamaño que toca. Tres imágenes con su pie se ven igual de juntas y
 * funcionan en los dos sitios.
 *
 * EL RECORTE. Las tres vienen ya en 4:5 —1122×1402—, que es justo la proporción
 * de la tarjeta, así que `object-cover` no llega a recortar nada. Se mantiene por
 * seguridad: el día que alguien sustituya una por otra de proporción distinta, se
 * encuadrará sola en vez de deformarse.
 */

const SITIOS = [
  {
    id: "santa-cruz-de-mara",
    src: "/zulia/santa-cruz-de-mara.webp",
    nombre: "Santa Cruz de Mara",
    nota: "La plaza, con su estatua y la iglesia al fondo.",
    alt: "Representación visual de Santa Cruz de Mara: una plaza con estatua sobre pedestal y una iglesia al fondo entre palmeras.",
    /* La única de las tres con resolución de sobra: se pide con prioridad y a
       mayor tamaño porque es la que más se amplía en escritorio. */
    ancho: 1122,
    alto: 1402,
  },
  {
    id: "el-mojan",
    src: "/zulia/el-mojan.webp",
    nombre: "El Moján",
    nota: "La iglesia y la plaza, con el lago detrás.",
    alt: "Representación visual de El Moján: vista aérea de una plaza con su iglesia y el lago al fondo.",
    ancho: 1122,
    alto: 1402,
  },
  {
    id: "maracaibo",
    src: "/zulia/maracaibo.webp",
    nombre: "Maracaibo",
    nota: "El monumento a la Chinita y sus fuentes.",
    alt: "Representación visual de Maracaibo: una basílica, un monumento y las fuentes de la plaza en primer plano.",
    ancho: 1122,
    alto: 1402,
  },
];

export default function ZonasIniciales() {
  /* El ancho ya no lo limita la calidad: las tres fuentes miden 1122×1402 y dan
     de sobra. Se acota por proporción — `/nosotros` es una página de texto, y un
     tríptico a sangre completa se comería lo que se está contando. A 1100 px
     cada tarjeta ronda los 355, que llena el hueco sin robar el protagonismo. */
  return (
    <figure className="m-0 max-w-[1100px]">
      <ul className="grid gap-4 sm:grid-cols-3 sm:gap-5">
        {SITIOS.map((s) => (
          <li key={s.id}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] border border-white/10">
              <Image
                src={s.src}
                alt={s.alt}
                width={s.ancho}
                height={s.alto}
                /* El ancho real al que se pinta, no una fracción aproximada:
                   con «33vw» el navegador calculaba 422 px en una pantalla de
                   1280 y pedía un recorte distinto del que iba a usar. */
                sizes="(max-width: 640px) 100vw, 360px"
                className="h-full w-full object-cover"
                /* Sin `quality`: `next.config.ts` sólo admite 75 y 92 —el 92
                   existe para las capturas de la app, cuyo texto fino se
                   deshace—. Un valor fuera de esa lista NO sube la calidad: Next
                   lo descarta y sirve el 75 por defecto, así que declararlo sólo
                   servía para aparentar un ajuste que no ocurría. Para una
                   fotografía a 285 px, 75 es de sobra. */
              />
              {/* Un velo desde abajo: sin él, el nombre en blanco sobre el cielo
                  claro de dos de las tres fotos no se leería. */}
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink-900 via-ink-900/70 to-transparent"
              />
              <p className="absolute inset-x-0 bottom-0 p-4 text-[17px] font-bold leading-snug text-paper">
                {s.nombre}
              </p>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-paper-mute">{s.nota}</p>
          </li>
        ))}
      </ul>
      <figcaption className="mt-6 text-[15px] leading-relaxed text-paper-mute">
        Santa Cruz de Mara, El Moján y Maracaibo: las zonas iniciales previstas para el
        lanzamiento en el estado Zulia. Las imágenes son representaciones, no fotografías
        de esos lugares.
      </figcaption>
    </figure>
  );
}
