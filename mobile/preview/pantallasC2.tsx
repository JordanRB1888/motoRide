/**
 * Las pantallas de C2.
 *
 * QUÉ CAMBIA RESPECTO A LAS DE C
 *
 * El mapa deja de ser una ilustración dentro de una tarjeta y pasa a ser el
 * suelo de la pantalla. Todo lo demás flota encima: una hoja inferior con lo
 * que la persona está haciendo, y la barra de navegación abajo.
 *
 * Y desaparece la sopa de tarjetas. Donde antes había una lista de rectángulos
 * —destino, servicios, seguridad, accesos— ahora hay una superficie con grupos
 * separados por espacio y por una línea de un píxel. Se sigue leyendo igual y
 * se ve mucho más tranquilo.
 *
 * LA DISCIPLINA DEL FILO
 *
 * El filo amarillo aparece UNA vez por zona visual. En la hoja de la pasajera
 * lo lleva Transporte Seguro; en el selector, sólo el vehículo elegido; en el
 * viaje, sólo el estado en curso. Si lo llevara todo, no señalaría nada — que
 * es justo lo que se corrigió al cerrar la dirección C.
 *
 * ESTO ES UNA MAQUETA
 *
 * Datos de demostración, sin llamadas a ninguna API y sin lógica real. La
 * pantalla de acceso de verdad es `app/acceso.tsx` y conserva intacto su
 * `AuthContext`; aquí sólo se prueba su aspecto.
 */

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Boton, Insignia, Superficie, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { Arranque } from '../ui/Arranque';
import { LienzoDeMapa, type HitoEnMapa, type VehiculoEnMapa } from '../ui/Mapa';
import { HojaInferior, Separador, type EstadoDeHoja } from '../ui/HojaInferior';
import {
  BarraDeNavegacion,
  ControlDeDisponibilidad,
  DESTINOS_DE_CONDUCTOR,
  DESTINOS_DE_PASAJERA
} from '../ui/Navegacion';
import { LogoHorizontal } from '../ui/Marca';
import { EntradaDeTransporteSeguro, SelectorDeServicio } from '../ui/Servicio';
import { useTema } from '../theme/ThemeContext';
import type { TipoDeVehiculo } from '../theme/marca';
import {
  CONDUCTOR_DEMO,
  DESTINOS_RECIENTES_DEMO,
  JORNADA_DEMO,
  PASAJERA_DEMO,
  VIAJE_DEMO
} from './fixtures';

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

/**
 * Vehículos repartidos por el mapa. Posiciones fijas: aquí no hay GPS.
 *
 * Van todos por encima del 40 % porque con la hoja a media altura, del mapa
 * sólo se ve la mitad de arriba. Repartidos por todo el lienzo, la mitad
 * quedaban tapados — y un mapa de movilidad sin vehículos a la vista es
 * justamente lo que no se quería enseñar.
 */
const MOTOS_CERCA: readonly VehiculoEnMapa[] = [
  { clave: 'm1', tipo: 'MOTO', en: { x: 26, y: 24 }, rumbo: 24 },
  { clave: 'm2', tipo: 'MOTO', en: { x: 69, y: 15 }, rumbo: -68 },
  { clave: 'm3', tipo: 'MOTO', en: { x: 80, y: 34 }, rumbo: 155 },
  { clave: 'a1', tipo: 'AUTO', en: { x: 38, y: 38 }, rumbo: 96 }
];

const HITOS_DE_VIAJE: readonly HitoEnMapa[] = [
  { clave: 'origen', en: { x: 28, y: 43 }, tipo: 'origen' },
  { clave: 'destino', en: { x: 73, y: 13 }, tipo: 'destino' }
];

/**
 * La fila de un lugar: un icono, un nombre y un detalle.
 *
 * Deliberadamente NO es una tarjeta. Tres destinos recientes como tres
 * rectángulos son tres bloques compitiendo; como tres filas con un separador,
 * son una lista, que es lo que son.
 */
function FilaDeLugar({ titulo, detalle, icono = 'destino', onPress }: {
  readonly titulo: string;
  readonly detalle: string;
  readonly icono?: 'destino' | 'inicio' | 'reloj';
  readonly onPress?: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 11,
        opacity: pressed ? 0.65 : 1
      })}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: tema.color.superficieElevada
      }}>
        <Icono nombre={icono} color={tema.color.textoSecundario} tamano={17} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt nivel="cuerpo">{titulo}</Txt>
        <Txt nivel="pie" tono="tenue">{detalle}</Txt>
      </View>
    </Pressable>
  );
}

/** El campo de «¿A dónde vas?». Es la acción principal de la pasajera. */
function CampoDeDestino({ onPress }: { readonly onPress?: () => void }) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="¿A dónde vas? Buscar destino"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingHorizontal: 15,
        height: 52,
        borderRadius: tema.radio.campo,
        backgroundColor: pressed ? tema.color.superficieElevada : tema.color.fondo
      })}
    >
      <Icono nombre="destino" color={tema.color.acento} tamano={19} />
      <Txt nivel="cuerpo" tono="secundario">¿A dónde vas?</Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 1 · Arranque
// ---------------------------------------------------------------------------

export function C2Arranque() {
  return <Arranque />;
}

// ---------------------------------------------------------------------------
// 2 · Selector de rol
// ---------------------------------------------------------------------------

/**
 * Refinado sobre la base de C: más aire arriba, el logotipo real en vez de un
 * título de texto, y la elección marcada con el filo.
 */
export function C2SelectorDeRol() {
  const tema = useTema();
  const [rol, setRol] = useState<'pasajero' | 'conductor'>('pasajero');

  const opciones = [
    { clave: 'pasajero' as const, icono: 'inicio' as const, titulo: 'Pasajero', detalle: 'Pide un viaje ahora' },
    { clave: 'conductor' as const, icono: 'moto' as const, titulo: 'Conductor', detalle: 'Conéctate y recibe viajes' }
  ];

  return (
    <View style={{
      flex: 1,
      backgroundColor: tema.color.fondo,
      paddingHorizontal: tema.ritmo.margenPantalla,
      paddingTop: 64,
      paddingBottom: 32
    }}>
      <View style={{ alignItems: 'center' }}>
        <LogoHorizontal ancho={214} />
      </View>

      <View style={{ marginTop: 52, gap: 8 }}>
        <Txt nivel="titulo">¿Cómo quieres continuar?</Txt>
        <Txt nivel="cuerpo" tono="secundario">
          Puedes cambiar de modo cuando quieras.
        </Txt>
      </View>

      <View style={{ marginTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
        {opciones.map(opcion => {
          const activa = opcion.clave === rol;
          return (
            <Pressable
              key={opcion.clave}
              onPress={() => setRol(opcion.clave)}
              accessibilityRole="radio"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={`${opcion.titulo}. ${opcion.detalle}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 15,
                padding: tema.ritmo.dentroDeTarjeta,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: activa ? tema.color.superficieElevada : tema.color.superficie,
                overflow: 'hidden'
              }}
            >
              {activa ? (
                <View style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: 3, backgroundColor: tema.color.acento
                }} />
              ) : null}
              <View style={{
                width: 46, height: 46, borderRadius: 23,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: activa ? `${tema.color.acento}1f` : tema.color.fondo
              }}>
                <Icono
                  nombre={opcion.icono}
                  color={activa ? tema.color.acento : tema.color.textoSecundario}
                  tamano={23}
                  activo={activa}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt nivel="encabezado">{opcion.titulo}</Txt>
                <Txt nivel="pie" tono="secundario">{opcion.detalle}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <Boton titulo="Continuar" onPress={() => undefined} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3 · Acceso
// ---------------------------------------------------------------------------

/**
 * El acceso, con marca de verdad.
 *
 * Antes era un formulario dentro de una tarjeta grande sobre fondo vacío:
 * correcto y de nadie. Ahora la mitad de arriba es la marca —el logotipo con la
 * moto, que es lo que hay que reconocer al abrir— y los campos van sobre el
 * fondo, sin recuadro que los envuelva.
 *
 * Esto es sólo el aspecto. La pantalla real mantiene su `AuthContext`, su
 * almacenamiento seguro y el backend como única autoridad.
 */
export function C2Acceso() {
  const tema = useTema();

  return (
    <View style={{
      flex: 1,
      backgroundColor: tema.color.fondo,
      paddingHorizontal: tema.ritmo.margenPantalla,
      paddingTop: 58,
      paddingBottom: 30
    }}>
      <View style={{ alignItems: 'center', gap: 22 }}>
        <LogoHorizontal ancho={232} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Txt nivel="titulo">Entra a tu cuenta</Txt>
          <Txt nivel="cuerpo" tono="secundario" centrado>
            Tu moto, a un toque.
          </Txt>
        </View>
      </View>

      <View style={{ marginTop: 40, gap: tema.ritmo.entreElementos }}>
        {[
          { etiqueta: 'Correo o teléfono', valor: 'demo@ejemplo.com' },
          { etiqueta: 'Contraseña', valor: '••••••••••' }
        ].map(campo => (
          <View key={campo.etiqueta} style={{ gap: 7 }}>
            <Txt nivel="etiqueta" tono="secundario">{campo.etiqueta}</Txt>
            <View style={{
              height: 54,
              justifyContent: 'center',
              paddingHorizontal: 15,
              borderRadius: tema.radio.campo,
              backgroundColor: tema.color.superficie
            }}>
              <Txt nivel="cuerpo" tono="secundario">{campo.valor}</Txt>
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
        <Boton titulo="Entrar" onPress={() => undefined} />
        <Boton titulo="Crear una cuenta" onPress={() => undefined} variante="silencioso" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 4 y 5 · Inicio de la pasajera
// ---------------------------------------------------------------------------

/**
 * El inicio de la pasajera, con el mapa de suelo.
 *
 * La hoja empieza a media altura: cabe lo importante —a dónde vas y los
 * lugares de siempre— y por encima queda mapa suficiente para ver dónde está y
 * qué motos hay cerca.
 *
 * Subiendo la hoja aparece el selector de vehículo. Es la misma pantalla en
 * otro estado, no otra pantalla: el mapa no se pierde en ningún momento.
 */
export function C2InicioPasajera({ estadoInicial = 'media' }: {
  readonly estadoInicial?: EstadoDeHoja;
}) {
  const tema = useTema();
  const [estado, setEstado] = useState<EstadoDeHoja>(estadoInicial);
  const [vehiculo, setVehiculo] = useState<TipoDeVehiculo>('MOTO');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa
        vehiculos={MOTOS_CERCA}
        hitos={[{ clave: 'yo', en: { x: 47, y: 29 }, tipo: 'origen' }]}
      >
        {/* Saludo flotando sobre el mapa: sin cabecera opaca que le robe alto. */}
        <View style={{
          position: 'absolute',
          left: tema.ritmo.margenPantalla,
          top: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingRight: 14, paddingLeft: 6, paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: tema.color.superficie
        }}>
          <View style={{
            width: 30, height: 30, borderRadius: 15,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: tema.color.superficieElevada
          }}>
            <Txt nivel="etiqueta">{PASAJERA_DEMO.iniciales}</Txt>
          </View>
          <Txt nivel="etiqueta" tono="secundario">{PASAJERA_DEMO.zona}</Txt>
        </View>

        <HojaInferior estado={estado} onCambiarEstado={setEstado} espacioInferior={0}>
          <CampoDeDestino onPress={() => setEstado('alta')} />

          {estado === 'baja' ? null : (
            <>
              <View style={{ height: tema.ritmo.entreElementos }} />
              <Separador />
              <View style={{ paddingTop: 4 }}>
                {DESTINOS_RECIENTES_DEMO.slice(0, estado === 'alta' ? 1 : 2).map(destino => (
                  <FilaDeLugar
                    key={destino.clave}
                    titulo={destino.titulo}
                    detalle={destino.detalle}
                    icono="reloj"
                  />
                ))}
              </View>
            </>
          )}

          {estado === 'alta' ? (
            <>
              <Separador />
              <View style={{ paddingTop: tema.ritmo.entreElementos, gap: tema.ritmo.entreElementos }}>
                <Txt nivel="etiqueta" tono="secundario">CÓMO QUIERES IR</Txt>
                <SelectorDeServicio
                  opciones={[
                    { tipo: 'MOTO', precio: '$1,50', minutos: 4 },
                    { tipo: 'AUTO', precio: '$3,20', minutos: 7 }
                  ]}
                  elegido={vehiculo}
                  onElegir={setVehiculo}
                />
                <EntradaDeTransporteSeguro />
                <Boton titulo="Pedir viaje" onPress={() => undefined} />
              </View>
            </>
          ) : (
            <>
              <Separador />
              <View style={{ paddingTop: tema.ritmo.entreElementos }}>
                <EntradaDeTransporteSeguro />
              </View>
            </>
          )}
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion destinos={DESTINOS_DE_PASAJERA} activo="inicio" />
    </View>
  );
}

/** El mismo inicio con la hoja arriba: el selector de vehículo a la vista. */
export function C2ServicioPasajera() {
  return <C2InicioPasajera estadoInicial="alta" />;
}

/** Elegir un punto tocando el mapa. Aquí sólo se pinta el estado. */
export function C2ElegirPuntoPasajera() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa eligiendoPunto vehiculos={MOTOS_CERCA} conControles={false}>
        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <View style={{ gap: 3 }}>
              <Txt nivel="etiqueta" tono="secundario">PUNTO DE RECOGIDA</Txt>
              <Txt nivel="encabezado">Punto de ejemplo</Txt>
            </View>
            <Boton titulo="Confirmar recogida" onPress={() => undefined} />
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 6 y 7 · Inicio del conductor
// ---------------------------------------------------------------------------

/**
 * La jornada del conductor. El mapa manda todavía más que en la pasajera:
 * quien conduce necesita ver la calle, no un tablero.
 *
 * Fuera de línea, la hoja explica qué falta para empezar y el control central
 * está apagado. En línea, la hoja se reduce a lo mínimo —zona, estado, cifras
 * de la jornada— y el control late en verde.
 *
 * No hay tablero financiero. La cartera está apagada en el servidor, y el
 * resumen del día se muestra vacío con su nota, igual que en C.
 */
export function C2InicioConductor({ enLinea = false }: { readonly enLinea?: boolean }) {
  const tema = useTema();
  const [conectado, setConectado] = useState(enLinea);

  const mio: VehiculoEnMapa = {
    clave: 'yo', tipo: 'MOTO', en: { x: 48, y: 30 }, rumbo: 12, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={conectado ? [mio, ...MOTOS_CERCA.slice(0, 2)] : [mio]}>
        {/* Estado, flotando. Es lo único que hace falta ver sobre el mapa. */}
        <View style={{
          position: 'absolute',
          left: tema.ritmo.margenPantalla,
          right: tema.ritmo.margenPantalla,
          top: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14, paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: tema.color.superficie
        }}>
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: conectado ? tema.color.exito : tema.color.textoTenue
          }} />
          <Txt nivel="etiqueta" tono={conectado ? 'exito' : 'tenue'}>
            {conectado ? 'En línea · GPS activo' : 'Fuera de línea'}
          </Txt>
          <View style={{ flex: 1 }} />
          <Txt nivel="etiqueta" tono="secundario">{CONDUCTOR_DEMO.zona}</Txt>
        </View>

        {/* Conectado, la hoja se encoge a lo que ocupan las tres cifras: el
            conductor necesita calle, no panel. Desconectado crece, porque ahí
            sí hay algo que leer. */}
        <HojaInferior
          estado={conectado ? 'baja' : 'media'}
          conAsa={!conectado}
          alturaAutomatica={conectado}
        >
          {conectado ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {[
                { etiqueta: 'Viajes', valor: JORNADA_DEMO.viajes },
                { etiqueta: 'En ruta', valor: JORNADA_DEMO.horas },
                { etiqueta: 'Resumen', valor: JORNADA_DEMO.resumen }
              ].map((dato, indice) => (
                <View key={dato.etiqueta} style={{ flex: 1, flexDirection: 'row' }}>
                  {indice > 0 ? (
                    <View style={{ width: 1, backgroundColor: tema.color.borde, marginRight: 12 }} />
                  ) : null}
                  <View style={{ gap: 3 }}>
                    <Txt nivel="etiqueta" tono="tenue">{dato.etiqueta}</Txt>
                    <Txt nivel="encabezado">{dato.valor}</Txt>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: tema.ritmo.entreElementos }}>
              <View style={{ gap: 5 }}>
                <Txt nivel="titulo">Listo para salir</Txt>
                <Txt nivel="cuerpo" tono="secundario">
                  Conéctate con el botón de abajo y empieza a recibir viajes.
                </Txt>
              </View>
              <Separador />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icono nombre="moto" color={tema.color.textoSecundario} tamano={19} />
                <Txt nivel="pie" tono="secundario">{CONDUCTOR_DEMO.vehiculo}</Txt>
                <View style={{ flex: 1 }} />
                <Insignia texto="Verificado" tono="exito" />
              </View>
            </View>
          )}
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="mapa"
        control={
          <ControlDeDisponibilidad
            enLinea={conectado}
            onAlternar={() => setConectado(valor => !valor)}
          />
        }
      />
    </View>
  );
}

export function C2ConductorFueraDeLinea() {
  return <C2InicioConductor enLinea={false} />;
}

export function C2ConductorEnLinea() {
  return <C2InicioConductor enLinea />;
}

// ---------------------------------------------------------------------------
// 8 · Viaje en curso
// ---------------------------------------------------------------------------

/**
 * El viaje. La jerarquía buena de C —estado, tiempo, persona, recorrido,
 * acciones— pero sobre el mapa y dentro de una sola superficie.
 *
 * La moto amarilla avanza por la ruta: es el único elemento que se mueve, y es
 * exactamente el que la persona está mirando.
 */
export function C2Viaje() {
  const tema = useTema();

  const conductorEnRuta: VehiculoEnMapa = {
    clave: 'conductor', tipo: 'MOTO', en: { x: 46, y: 30 }, rumbo: 38, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={[conductorEnRuta]} hitos={HITOS_DE_VIAJE} conRuta>
        <HojaInferior estado="media" conAsa>
          {/* El estado: la única zona de esta pantalla con filo. */}
          <Superficie destacada elevada>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt nivel="etiqueta" tono="secundario">ESTADO</Txt>
                <Txt nivel="encabezado">{VIAJE_DEMO.estado}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Txt nivel="etiqueta" tono="secundario">LLEGA EN</Txt>
                <Txt nivel="titulo" tono="acento">{VIAJE_DEMO.eta}</Txt>
              </View>
            </View>
          </Superficie>

          <View style={{ height: tema.ritmo.entreElementos }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: tema.color.superficieElevada
            }}>
              <Txt nivel="etiqueta">{VIAJE_DEMO.iniciales}</Txt>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt nivel="cuerpo">{VIAJE_DEMO.conductor}</Txt>
              <Txt nivel="pie" tono="tenue">{VIAJE_DEMO.vehiculo} · {VIAJE_DEMO.valoracion}</Txt>
            </View>
            {(['Llamar', 'Mensaje'] as const).map(accion => (
              <Pressable
                key={accion}
                accessibilityRole="button"
                accessibilityLabel={accion}
                style={{
                  width: 42, height: 42, borderRadius: 21,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: tema.color.superficieElevada
                }}
              >
                <Icono
                  nombre={accion === 'Llamar' ? 'rayo' : 'viajes'}
                  color={tema.color.textoSecundario}
                  tamano={18}
                />
              </Pressable>
            ))}
          </View>

          <View style={{ height: tema.ritmo.entreElementos }} />
          <Separador />
          <View style={{ paddingTop: tema.ritmo.entreElementos, gap: 10 }}>
            {[
              { punto: tema.color.textoPrimario, texto: VIAJE_DEMO.origen },
              { punto: tema.color.acento, texto: VIAJE_DEMO.destino }
            ].map(parada => (
              <View key={parada.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <View style={{
                  width: 9, height: 9, borderRadius: 4.5,
                  backgroundColor: parada.punto
                }} />
                <Txt nivel="cuerpo" tono="secundario" numberOfLines={1}>{parada.texto}</Txt>
              </View>
            ))}
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}
