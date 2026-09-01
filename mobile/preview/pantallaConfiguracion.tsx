/**
 * Configuración, y dentro de ella la apariencia.
 *
 * QUÉ SE LE CUENTA A LA PERSONA
 *
 * «Cambia según la hora de Venezuela». No se dice `America/Caracas` ni se habla
 * de husos: eso es cómo está hecho, no qué hace. Pero sí se dice **Venezuela**,
 * porque es la parte que no se puede adivinar — alguien de viaje necesita saber
 * por qué su aplicación se pone oscura a las dos de la tarde.
 *
 * LO ELEGIDO SE VE SIN LEER
 *
 * Con el aro relleno y el filo amarillo, no sólo con el color del texto. Quien
 * mira de reojo tiene que ver cuál está puesta.
 */

import { type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '../ui/componentes';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import { Separador } from '../ui/HojaInferior';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { useApariencia, useTema } from '../theme/ThemeContext';
import { useAireDeArriba } from '../ui/seguro';
import type { Apariencia } from '../theme/horaVenezuela';

const ALTO_DE_LA_BARRA = 76;

const OPCIONES: readonly {
  readonly clave: Apariencia;
  readonly titulo: string;
  readonly detalle: string;
  readonly icono: NombreDeIcono;
}[] = [
  {
    clave: 'auto',
    titulo: 'Automático',
    detalle: 'Cambia según la hora de Venezuela',
    icono: 'reloj'
  },
  { clave: 'claro', titulo: 'Día', detalle: 'Siempre claro', icono: 'rayo' },
  { clave: 'oscuro', titulo: 'Noche', detalle: 'Siempre oscuro', icono: 'inicio' }
];

export function C2Configuracion({ real = false }: {
  /**
   * `true` dentro de la aplicación autenticada.
   *
   * Cambia UNA cosa: las filas que hoy no hacen nada dejan de anunciar un
   * estado. «Ahorro de datos · Desactivado» describe una preferencia que no
   * existe, no se guarda en ninguna parte y no apaga nada; enseñarla a una
   * persona real es decirle que hay un ajuste puesto cuando no lo hay.
   *
   * En el recorrido de diseño se siguen viendo como estaban, porque ahí la
   * pantalla es una maqueta y se entiende como tal.
   */
  readonly real?: boolean;
} = {}) {
  const tema = useTema();
  const { apariencia, esquema, cambiarApariencia } = useApariencia();
  const arriba = useAireDeArriba();

  // Lo que se pone donde iba un estado inventado. El mismo texto que ya usa el
  // perfil para el saldo, para no estrenar una forma nueva de decir lo mismo.
  const pendiente = real ? 'Todavía no está activo' : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{
        // Sin este aire, el título se mete bajo la hora y la batería.
        paddingTop: 18 + arriba,
        paddingBottom: tema.ritmo.entreElementos,
        paddingHorizontal: tema.ritmo.margenPantalla
      }}>
        <Txt nivel="titulo" accessibilityRole="header">Configuración</Txt>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingBottom: tema.ritmo.entreBloques + ALTO_DE_LA_BARRA
        }}
        showsVerticalScrollIndicator={false}
      >
        <Grupo titulo="Apariencia">
          <View style={{ gap: tema.ritmo.entreElementos }}>
            {OPCIONES.map(opcion => (
              <OpcionDeApariencia
                key={opcion.clave}
                titulo={opcion.titulo}
                detalle={opcion.detalle}
                icono={opcion.icono}
                activa={opcion.clave === apariencia}
                onPress={() => cambiarApariencia(opcion.clave)}
              />
            ))}
          </View>

          {/* Sólo cuando está en automático: en las otras dos, decir cuál se
              está viendo es repetir lo que ya está marcado arriba. */}
          {apariencia === 'auto' ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 9,
              marginTop: tema.ritmo.entreElementos,
              padding: 12,
              borderRadius: tema.radio.campo,
              backgroundColor: tema.color.superficie
            }}>
              <Icono nombre="reloj" color={tema.color.textoTenue} tamano={15} />
              <Txt nivel="pie" tono="tenue">
                Ahora se ve en modo {esquema === 'claro' ? 'día' : 'noche'}.
              </Txt>
            </View>
          ) : null}
        </Grupo>

        <Grupo titulo="Idioma">
          <Fila icono="perfil" titulo="Español" detalle="Idioma de la aplicación" />
        </Grupo>

        <Grupo titulo="Mapa">
          <Fila
            icono="destino"
            titulo="Vista del mapa"
            detalle={pendiente ?? 'Estándar'}
            sinDestino={real}
          />
          <Separador />
          <Fila
            icono="moto"
            titulo="Mostrar vehículos cercanos"
            detalle={pendiente ?? 'Activado'}
            sinDestino={real}
          />
        </Grupo>

        <Grupo titulo="Datos">
          <Fila
            icono="rayo"
            titulo="Ahorro de datos"
            detalle={pendiente ?? 'Desactivado'}
            sinDestino={real}
          />
        </Grupo>

        {/* Legal no anuncia ningún estado, así que no miente. Lo que no tiene
            es PANTALLA: los tres textos no están escritos todavía, y por eso
            en la aplicación real no llevan galón. */}
        <Grupo titulo="Legal">
          <Fila icono="escudo" titulo="Términos y condiciones" sinDestino={real} />
          <Separador />
          <Fila icono="escudo" titulo="Política de privacidad" sinDestino={real} />
          <Separador />
          <Fila icono="viajes" titulo="Licencias de terceros" sinDestino={real} />
        </Grupo>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="perfil"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}

/** Una opción de apariencia: icono, texto y el aro que dice cuál está puesta. */
function OpcionDeApariencia({ titulo, detalle, icono, activa, onPress }: {
  readonly titulo: string;
  readonly detalle: string;
  readonly icono: NombreDeIcono;
  readonly activa: boolean;
  readonly onPress?: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa }}
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        padding: 14,
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
        width: 38, height: 38, borderRadius: 19,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: activa ? `${tema.color.acento}26` : tema.color.superficieHundida
      }}>
        <Icono
          nombre={icono}
          color={activa ? tema.color.acentoTexto : tema.color.textoSecundario}
          tamano={19}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo">{titulo}</Txt>
        <Txt nivel="pie" tono="tenue">{detalle}</Txt>
      </View>

      {/* El aro. La elección no se transmite sólo con el color del texto: quien
          no distingue bien los tonos vería tres filas iguales. */}
      <View style={{
        width: 21, height: 21, borderRadius: 11,
        borderWidth: 2,
        borderColor: activa ? tema.color.acentoTexto : tema.color.borde,
        alignItems: 'center', justifyContent: 'center'
      }}>
        {activa ? (
          <View style={{
            width: 11, height: 11, borderRadius: 6,
            backgroundColor: tema.color.acentoTexto
          }} />
        ) : null}
      </View>
    </Pressable>
  );
}

function Fila({ icono, titulo, detalle, sinDestino = false }: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly detalle?: string;
  /** Sin destino todavía: se enseña, pero no se anuncia como botón. */
  readonly sinDestino?: boolean;
}) {
  const tema = useTema();

  return (
    <Pressable
      // Sin destino no es un botón: anunciarlo como tal a quien navega
      // escuchando es prometerle una acción que no existe.
      accessibilityRole={sinDestino ? 'text' : 'button'}
      accessibilityLabel={detalle ? `${titulo}. ${detalle}` : titulo}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 13,
        opacity: pressed ? 0.65 : 1
      })}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: tema.color.superficieElevada
      }}>
        <Icono nombre={icono} color={tema.color.textoSecundario} tamano={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo">{titulo}</Txt>
        {detalle ? <Txt nivel="pie" tono="tenue">{detalle}</Txt> : null}
      </View>
    </Pressable>
  );
}

function Grupo({ titulo, children }: { readonly titulo: string; readonly children: ReactNode }) {
  const tema = useTema();

  return (
    <View style={{ marginTop: tema.ritmo.entreBloques }}>
      <Txt nivel="etiqueta" tono="secundario">{titulo.toUpperCase()}</Txt>
      <View style={{ marginTop: 6 }}>{children}</View>
    </View>
  );
}
