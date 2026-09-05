/**
 * El Transporte Seguro de la pasajera. Pantalla REAL, y honesta sobre lo que
 * todavía no se puede hacer desde aquí.
 *
 * QUÉ ES EL TRANSPORTE SEGURO
 *
 * Un plan: alguien con una rutina de trabajo contrata una quincena y el sistema
 * le asigna una moto cada día, con un conductor principal y un suplente, para
 * que la promesa sea «sí o sí la van a buscar». No es pedir un viaje suelto: es
 * saber, el domingo, que el lunes a las seis y media hay alguien en la puerta.
 *
 * POR QUÉ TIENE PESTAÑA
 *
 * Porque es a lo que se VUELVE. El saldo se mira una vez y se olvida —por eso
 * bajó a una fila del perfil—; el plan se consulta todos los días: qué moto me
 * toca mañana, a qué hora, quién viene. Y porque es lo que diferencia a
 * +58express de pedir una carrera cualquiera: esa promesa no puede vivir
 * escondida detrás del botón amarillo.
 *
 * POR QUÉ ESTA PANTALLA NO ENSEÑA UN PLAN TODAVÍA
 *
 * El servidor SÍ tiene el Transporte Seguro construido —suscripciones, patrón
 * semanal, traslados programados, ventanas de cobertura, cobro por cartera— y
 * está detrás de una lista de piloto: quien no está autorizado recibe 404 y ni
 * siquiera sabe que existe.
 *
 * Este móvil todavía no habla con nada de eso. Y hasta que lo haga, lo único
 * honesto es decirlo: ni un plan de ejemplo, ni un traslado inventado, ni una
 * cifra que no venga del servidor. Un horario falso en esta pantalla es peor
 * que en ninguna otra, porque alguien podría organizar su semana con él.
 *
 * CUANDO SE CONECTE
 *
 * Este es el sitio. Se pregunta a `GET /api/transport/access`: sin autorización
 * se queda tal como está ahora; con ella, se sustituye este bloque por el plan
 * de `GET /api/transport/subscriptions` y los próximos traslados de
 * `GET /api/transport/scheduled-rides`. La pestaña, la barra y el botón
 * amarillo ya están donde tienen que estar.
 */

import { View } from 'react-native';

import { Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { ShellDePasajero } from '../navegacion/shellDePasajero';
import { useTema } from '../theme/ThemeContext';

function Cargando() {
  const tema = useTema();
  return <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID="seguro-cargando" />;
}

export default function PantallaDeTransporteSeguro() {
  const tema = useTema();

  return (
    <ShellDePasajero cargando={<Cargando />}>
      <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID="pantalla-seguro">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tema.color.superficieElevada,
              borderWidth: 1,
              borderColor: tema.color.borde
            }}
          >
            <Icono nombre="escudo" color={tema.color.textoTenue} tamano={30} />
          </View>

          <Txt nivel="encabezado" accessibilityRole="header" centrado>
            Transporte Seguro
          </Txt>
          <Txt nivel="cuerpo" tono="secundario" centrado>
            Tu traslado de siempre, con moto asignada cada día y alguien de
            respaldo si tu conductor no puede. Todavía no se puede contratar
            desde la aplicación; cuando se abra, tu plan y tus próximos
            traslados aparecerán aquí.
          </Txt>
          <Txt nivel="pie" tono="tenue" centrado>
            Mientras tanto puedes pedir cada viaje con el botón amarillo.
          </Txt>
        </View>

        {/* La misma barra y el mismo botón amarillo que en el resto del shell:
            desde aquí se sigue llegando a todo. */}
        <BarraDeNavegacion
          destinos={DESTINOS_DE_PASAJERA}
          activo="seguro"
          control={<ControlDePedido abierto={false} />}
        />
      </View>
    </ShellDePasajero>
  );
}
