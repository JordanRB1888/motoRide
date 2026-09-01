/**
 * Los comercios aliados de +58express.
 *
 * QUÉ SON Y QUÉ NO SON
 *
 * Son ESPACIOS PAGADOS. +58express cobra por aparecer, no por lo que se venda:
 * no hay catálogo, ni carrito, ni cobro, ni pedido dentro de la aplicación. El
 * botón del comercio lleva FUERA —a su WhatsApp o a su web— y lo que pase a
 * partir de ahí es entre la persona y el negocio.
 *
 * Eso obliga a dos cosas en pantalla, y ninguna es decorativa:
 *
 *   1. que se vea que es publicidad, porque lo es y porque las dos tiendas lo
 *      exigen para el contenido pagado;
 *   2. que se vea que el pedido NO lo atiende +58express, para que nadie
 *      reclame aquí un pollo que llegó frío.
 *
 * DÓNDE VIVEN
 *
 * Un adelanto en la hoja de Inicio, debajo del buscador y de los sitios
 * guardados, y la lista completa detrás de «Ver todos». En la hoja y no en la
 * barra: el mapa sigue mandando en Inicio —eso es C2— y la barra tiene cuatro
 * sitios que todavía están pendientes de decidir.
 *
 * Lo que se quitó en su día de esta hoja —los destinos recientes, que se
 * repetían al pedir— sigue fuera. Esto se añade debajo, no en su lugar.
 *
 * SIN LOGOTIPOS TODAVÍA
 *
 * Cada comercio se dibuja con su inicial en un sello. No es un apaño: es el
 * hueco preparado para el logotipo de verdad. Mientras no lo haya, una inicial
 * es honesta donde un icono de categoría prestado mentiría —ya pasó con la casa
 * que en realidad era la pestaña de inicio—.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Boton, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
import { ALIADOS_DEMO, CATEGORIAS_DEMO } from './fixtures';

type Aliado = (typeof ALIADOS_DEMO)[number];

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

/** El hueco del logotipo. Hasta que lo haya, la inicial. */
export function SelloDeComercio({ inicial, tamano = 46 }: {
  readonly inicial: string;
  readonly tamano?: number;
}) {
  const tema = useTema();

  return (
    <View
      style={{
        width: tamano,
        height: tamano,
        borderRadius: Math.round(tamano * 0.3),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: tema.color.borde
      }}
    >
      <Txt nivel="encabezado" tono="acento">{inicial}</Txt>
    </View>
  );
}

/**
 * El rótulo de espacio pagado.
 *
 * No es una nota al pie: estos sitios se venden, y tanto la ley de publicidad
 * como App Store y Play Store piden que se distingan de lo que la aplicación
 * recomienda por su cuenta.
 */
export function RotuloPagado() {
  const tema = useTema();

  return (
    <View style={{
      borderWidth: 1,
      borderColor: tema.color.borde,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2
    }}>
      <Txt nivel="etiqueta" tono="tenue">PUBLICIDAD</Txt>
    </View>
  );
}

/**
 * La flecha de «esto te saca de la aplicación».
 *
 * Dibujada con vistas porque la familia de iconos no la tiene y no se añade un
 * glifo nuevo por una flecha. Son dos escuadras y una diagonal.
 */
export function FlechaDeSalida({ tamano = 13 }: { readonly tamano?: number }) {
  const tema = useTema();
  const grosor = 1.6;
  const caja = tamano * 0.62;

  return (
    <View style={{ width: tamano, height: tamano }} accessibilityLabel="Abre fuera de la aplicación">
      <View style={{
        position: 'absolute',
        left: 1,
        top: tamano - caja - 1,
        width: caja,
        height: caja,
        borderLeftWidth: grosor,
        borderBottomWidth: grosor,
        borderColor: tema.color.textoTenue
      }} />
      <View style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: caja * 0.85,
        height: caja * 0.85,
        borderTopWidth: grosor,
        borderRightWidth: grosor,
        borderColor: tema.color.textoTenue
      }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// El adelanto de la hoja de Inicio
// ---------------------------------------------------------------------------

/**
 * Tres comercios en horizontal, con su rótulo y el enlace a la lista.
 *
 * Tres y no todos: esto va en la hoja de Inicio, que en reposo tiene que dejar
 * el mapa a la vista. Quien quiera más, entra.
 */
export function AdelantoDeAliados({ onVerTodos, onAbrir }: {
  readonly onVerTodos?: () => void;
  readonly onAbrir?: (aliado: Aliado) => void;
}) {
  const tema = useTema();

  return (
    <View style={{ marginTop: tema.ritmo.entreBloques }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Txt nivel="etiqueta" tono="secundario">ALIADOS</Txt>
        <RotuloPagado />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onVerTodos ?? (() => undefined)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
        >
          <Txt nivel="etiqueta" tono="acento">Ver todos</Txt>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 10, marginRight: -tema.ritmo.margenPantalla }}
        contentContainerStyle={{ gap: 10, paddingRight: tema.ritmo.margenPantalla }}
      >
        {ALIADOS_DEMO.slice(0, 3).map(aliado => (
          <Pressable
            key={aliado.clave}
            onPress={() => onAbrir?.(aliado)}
            accessibilityRole="button"
            accessibilityLabel={`${aliado.nombre}, ${aliado.categoria}. Publicidad`}
            style={{
              width: 228,
              padding: 13,
              borderRadius: tema.radio.tarjeta,
              backgroundColor: tema.color.superficie,
              borderWidth: 1,
              borderColor: tema.color.borde,
              gap: 9
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SelloDeComercio inicial={aliado.inicial} tamano={34} />
              <View style={{ flex: 1, gap: 1 }}>
                <Txt nivel="cuerpo" numberOfLines={1}>{aliado.nombre}</Txt>
                <Txt nivel="pie" tono="tenue">{aliado.categoria}</Txt>
              </View>
              <FlechaDeSalida />
            </View>
            <Txt nivel="pie" tono="secundario" numberOfLines={1}>{aliado.gancho}</Txt>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// La lista completa
// ---------------------------------------------------------------------------

export function C2Aliados() {
  const tema = useTema();
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_DEMO[0]);
  const estrella = ALIADOS_DEMO.find(aliado => aliado.destacado) ?? ALIADOS_DEMO[0];

  const visibles = categoria === CATEGORIAS_DEMO[0]
    ? ALIADOS_DEMO
    : ALIADOS_DEMO.filter(aliado => aliado.categoria === categoria);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: 18,
          paddingBottom: tema.ritmo.entreElementos
        }}>
          <Txt nivel="titulo" accessibilityRole="header">Aliados</Txt>
          <View style={{ flex: 1 }} />
          <RotuloPagado />
        </View>

        <View style={{ paddingHorizontal: tema.ritmo.margenPantalla }}>
          {/* El destacado: el que paga más. Lleva el filo de marca, que es lo
              que en C2 significa «esto es lo principal de la pantalla». */}
          <View style={{
            overflow: 'hidden',
            padding: tema.ritmo.dentroDeTarjeta,
            borderRadius: tema.radio.tarjeta,
            backgroundColor: tema.color.superficie,
            gap: tema.ritmo.entreElementos
          }}>
            <View style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              backgroundColor: tema.color.acento
            }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <SelloDeComercio inicial={estrella.inicial} tamano={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt nivel="encabezado">{estrella.nombre}</Txt>
                <Txt nivel="pie" tono="tenue">{estrella.categoria} · {estrella.zona}</Txt>
              </View>
            </View>
            <Txt nivel="cuerpo" tono="secundario">{estrella.gancho}</Txt>
            <Boton titulo="Escribir al comercio" onPress={() => undefined} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <FlechaDeSalida />
              <Txt nivel="pie" tono="tenue">Te lleva fuera de +58express</Txt>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: tema.ritmo.entreBloques, marginRight: -tema.ritmo.margenPantalla }}
            contentContainerStyle={{ gap: 8, paddingRight: tema.ritmo.margenPantalla }}
          >
            {CATEGORIAS_DEMO.map(nombre => {
              const puesta = nombre === categoria;
              return (
                <Pressable
                  key={nombre}
                  onPress={() => setCategoria(nombre)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: puesta }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: puesta ? tema.color.superficieElevada : 'transparent',
                    borderWidth: 1,
                    borderColor: puesta ? tema.color.acento : tema.color.borde
                  }}
                >
                  <Txt nivel="etiqueta" tono={puesta ? 'acento' : 'tenue'}>{nombre}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 6 }}>
            {visibles.map((aliado, indice) => (
              <View key={aliado.clave}>
                {indice > 0 ? (
                  <View style={{ height: 1, backgroundColor: tema.color.borde }} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${aliado.nombre}, ${aliado.categoria}. Publicidad`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 }}
                >
                  <SelloDeComercio inicial={aliado.inicial} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt nivel="cuerpo">{aliado.nombre}</Txt>
                    <Txt nivel="pie" tono="tenue">{aliado.categoria} · {aliado.gancho}</Txt>
                    <Txt nivel="pie" tono="tenue">{aliado.zona}</Txt>
                  </View>
                  <FlechaDeSalida />
                </Pressable>
              </View>
            ))}
          </View>

          <AvisoDeQuienResponde
            texto="Estos comercios pagan por aparecer aquí. +58express no vende sus productos ni gestiona sus pedidos."
          />
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// La ficha del comercio
// ---------------------------------------------------------------------------

/**
 * Lo que hay detrás de una tarjeta.
 *
 * La pantalla dice tres cosas en este orden: quién es, cómo escribirle, y qué
 * parte es nuestra. Ese último bloque no es relleno: es lo único que
 * +58express hace de verdad aquí —llevarte, o traerte lo que compres— y sin él
 * la ficha sería un anuncio dentro de una aplicación de viajes sin explicar qué
 * pinta ahí.
 */
export function C2Comercio({ aliado = ALIADOS_DEMO[0] }: { readonly aliado?: Aliado }) {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: 18,
          paddingBottom: tema.ritmo.entreElementos
        }}>
          <SelloDeComercio inicial={aliado.inicial} tamano={56} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt nivel="titulo" accessibilityRole="header">{aliado.nombre}</Txt>
            <Txt nivel="pie" tono="tenue">{aliado.categoria} · {aliado.zona}</Txt>
          </View>
        </View>

        <View style={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          gap: tema.ritmo.entreBloques
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <RotuloPagado />
            <Txt nivel="pie" tono="tenue">Espacio pagado por el comercio</Txt>
          </View>

          <View style={{ gap: tema.ritmo.entreElementos }}>
            <Txt nivel="encabezado">{aliado.gancho}</Txt>
            <Txt nivel="cuerpo" tono="secundario">
              El comercio atiende por su cuenta. Escríbele para preguntar por lo que
              ofrece, los precios y cómo pagarle.
            </Txt>
          </View>

          <View style={{ gap: tema.ritmo.entreElementos }}>
            <Boton
              titulo={aliado.salida === 'whatsapp' ? 'Escribir por WhatsApp' : 'Abrir su página'}
              onPress={() => undefined}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
              <FlechaDeSalida />
              <Txt nivel="pie" tono="tenue">Sales de +58express</Txt>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: tema.color.borde }} />

          <View style={{ gap: tema.ritmo.entreElementos }}>
            <Txt nivel="etiqueta" tono="secundario">LO QUE SÍ HACEMOS NOSOTROS</Txt>
            <Pressable
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                padding: 14,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: tema.color.superficie
              }}
            >
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${tema.color.acento}26`
              }}>
                <Icono nombre="moto" color={tema.color.acentoTexto} tamano={20} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt nivel="cuerpo">Pedir un viaje hasta aquí</Txt>
                <Txt nivel="pie" tono="tenue">Te llevamos, o traemos lo que compres</Txt>
              </View>
            </Pressable>
          </View>

          <AvisoDeQuienResponde
            texto="+58express no vende ni entrega los productos de este comercio. Cualquier reclamo por el pedido va directo con ellos."
          />
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}

/**
 * Quién responde por lo que se compre.
 *
 * Va en las dos pantallas y con el mismo texto en ninguna de las dos por
 * casualidad: en un modelo de sólo publicidad, la frontera entre el anuncio y
 * el servicio tiene que estar escrita donde se ve, no en los términos.
 */
function AvisoDeQuienResponde({ texto }: { readonly texto: string }) {
  const tema = useTema();

  return (
    <View style={{
      flexDirection: 'row',
      gap: 10,
      padding: 14,
      borderRadius: tema.radio.campo,
      backgroundColor: tema.color.superficie
    }}>
      <Icono nombre="escudo" color={tema.color.textoTenue} tamano={17} />
      <View style={{ flex: 1 }}>
        <Txt nivel="pie" tono="tenue">{texto}</Txt>
      </View>
    </View>
  );
}
