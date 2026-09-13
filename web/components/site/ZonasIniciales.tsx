import Image from "next/image";

/**
 * Las tres plazas por las que empieza +58Express.
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
 * EL RECORTE. Las tres vienen con proporciones distintas —una apaisada, una
 * vertical, una casi cuadrada—. Se encuadran todas en 4:5 con `object-cover`, que
 * recorta por los bordes y deja el motivo centrado: la estatua, la iglesia y el
 * monumento quedan dentro en los tres casos.
 */

const SITIOS = [
  {
    id: "santa-cruz-de-mara",
    nombre: "Santa Cruz de Mara",
    nota: "La plaza, con su estatua al Libertador.",
    alt: "La plaza de Santa Cruz de Mara, con la estatua de Simón Bolívar sobre su pedestal y las palmas alrededor.",
    /* La única de las tres con resolución de sobra: se pide con prioridad y a
       mayor tamaño porque es la que más se amplía en escritorio. */
    ancho: 1600,
    alto: 900,
  },
  {
    id: "el-mojan",
    nombre: "El Moján",
    nota: "La iglesia y la plaza, con el lago detrás.",
    alt: "Vista aérea de la iglesia de El Moján y su plaza, con el lago de Maracaibo al fondo.",
    ancho: 335,
    alto: 597,
  },
  {
    id: "maracaibo",
    nombre: "Maracaibo",
    nota: "El monumento a la Chinita y sus fuentes.",
    alt: "El monumento a la Virgen de Chiquinquirá en Maracaibo, con las fuentes de la plaza en primer plano.",
    ancho: 1080,
    alto: 795,
  },
];

export default function ZonasIniciales() {
  /* Ancho acotado, y no por gusto: la foto de El Moján sólo mide 335 px de ancho
     en origen. Estirada a lo ancho de la página se vería blanda, y una imagen
     borrosa en un sitio que se presenta como premium se nota más que no tenerla.
     A este tamaño cada tarjeta ronda los 285 px y la foto llega justa pero
     entera. El día que haya una de más resolución, se quita este límite. */
  return (
    <figure className="m-0 max-w-[900px]">
      <ul className="grid gap-4 sm:grid-cols-3 sm:gap-5">
        {SITIOS.map((s) => (
          <li key={s.id}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] border border-white/10">
              <Image
                src={`/zulia/${s.id}.jpg`}
                alt={s.alt}
                width={s.ancho}
                height={s.alto}
                /* El ancho real al que se pinta, no una fracción aproximada:
                   con «33vw» el navegador calculaba 422 px en una pantalla de
                   1280 y pedía un recorte distinto del que iba a usar. */
                sizes="(max-width: 640px) 100vw, 300px"
                className="h-full w-full object-cover"
                quality={82}
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
        lanzamiento en el estado Zulia.
      </figcaption>
    </figure>
  );
}
