/**
 * Lo que todavía no está.
 *
 * A dónde llevan las casillas de Envíos, Comida, Mercado y Compra y vende.
 *
 * POR QUÉ UNA PANTALLA Y NO UN BOTÓN MUERTO
 *
 * Las cuatro alternativas eran peores:
 *
 *   - No dejar pulsar: la casilla dice PRONTO y aun así invita a tocarla. Quien
 *     la toca no sabe si falló la aplicación o si es que no hay nada.
 *   - Esconderlas: la rejilla queda coja y no dice a dónde va +58express.
 *   - Llevar a una pantalla vacía: peor que no llevar a ninguna.
 *   - Llevar a algo a medias: prometer lo que no hay, que es lo que las tiendas
 *     rechazan.
 *
 * Ésta dice qué falta, por qué, y ofrece lo único que sí existe: pedir un
 * viaje. Es la respuesta honesta a «esto todavía no».
 */

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Txt } from '../../ui/componentes';
import { Icono } from '../../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../../ui/Navegacion';
import { useTema } from '../../theme/ThemeContext';
import { SERVICIOS_DE_INICIO } from '../../preview/fixtures';
import { RUTA_DE_DESTINO } from '../../navegacion/rutas';

export default function Pronto() {
  const tema = useTema();
  const { servicio } = useLocalSearchParams<{ servicio?: string }>();
  const dato = SERVICIOS_DE_INICIO.find(uno => uno.clave === servicio);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingBottom: 90
      }}>
        <View style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tema.color.superficieHundida
        }}>
          <Icono nombre={dato?.icono ?? 'reloj'} color={tema.color.textoTenue} tamano={26} />
        </View>

        <Txt nivel="titulo" centrado>{dato?.titulo ?? 'Pronto'}</Txt>

        <Txt nivel="cuerpo" tono="secundario" centrado>
          Todavía no está construido. Cuando lo esté, aparecerá aquí sin que
          tengas que actualizar nada.
        </Txt>

        <Txt nivel="pie" tono="tenue" centrado>
          Mientras tanto, lo que sí puedes hacer es pedir un viaje.
        </Txt>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(RUTA_DE_DESTINO.pedir as never)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 4,
            paddingVertical: 13,
            paddingHorizontal: 20,
            borderRadius: tema.radio.boton,
            backgroundColor: tema.color.acento
          }}
        >
          <Icono nombre="moto" color={tema.color.sobreAcento} tamano={19} />
          <Txt nivel="etiqueta" tono="sobreAcento">Pedir un viaje</Txt>
        </Pressable>
      </View>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        onSeleccionar={clave => router.push(RUTA_DE_DESTINO[clave as never] as never)}
        control={<ControlDePedido abierto={false} onAlternar={() => router.push(RUTA_DE_DESTINO.pedir as never)} />}
      />
    </View>
  );
}
