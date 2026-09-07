/**
 * El saldo de la pasajera. Pantalla REAL, y honesta sobre lo que todavía no hay.
 *
 * DÓNDE VIVE AHORA
 *
 * En una FILA DEL PERFIL, no en la barra. Tuvo pestaña un tiempo y la cedió al
 * Transporte Seguro, que es a lo que la gente vuelve todos los días. El saldo
 * es un dato de cuenta: se consulta de vez en cuando, igual que los datos
 * personales o la seguridad, y ese es exactamente el vecindario del perfil.
 *
 * La pantalla no cambió al mudarse. Sólo la barra sabe que ahora se llega desde
 * el perfil, y por eso deja encendida esa pestaña.
 *
 * POR QUÉ ESTA PANTALLA EXISTE
 *
 * Antes «Saldo» estaba en la barra pero no había ruta detrás ni ninguna función
 * de navegación entendía su clave: pulsarla no hacía absolutamente nada. Un
 * botón que no responde se lee como una avería de la aplicación, y quien lo
 * pulsa tres veces acaba pensando que el teléfono va lento.
 *
 * POR QUÉ NO SE REUTILIZA LA DEL CONDUCTOR
 *
 * La cartera del conductor tiene liquidaciones, comisiones y retiros. Nada de
 * eso es de la pasajera, y enseñárselo sería enseñarle las cuentas de otro
 * oficio. Tampoco se inventan cifras: un «Bs. 0,00» que no viene del servidor
 * es una mentira pequeña que alguien acabará creyendo.
 *
 * LO QUE SÍ SE HACE
 *
 * Decir la verdad: la recarga todavía no está disponible, y cuando lo esté se
 * verá aquí. La fila responde, el botón amarillo sigue funcionando y desde aquí
 * se llega a cualquier otra parte de la aplicación.
 *
 * CUANDO EXISTA LA CARTERA
 *
 * Este es el sitio: se sustituye el bloque de «todavía no» por el saldo y los
 * movimientos que devuelva el servidor. Y no es un asunto suelto: el
 * Transporte Seguro se cobra de ESTA cartera, carrera realizada a carrera
 * realizada, así que sin recarga no se puede contratar un plan. Las dos
 * pantallas son la misma decisión vista por dos lados.
 */

import { View } from 'react-native';

import { Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { ShellDePasajero } from '../navegacion/shellDePasajero';
import { useTema } from '../theme/ThemeContext';

function Cargando() {
  const tema = useTema();
  return <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID="saldo-cargando" />;
}

export default function PantallaDeSaldo() {
  const tema = useTema();

  return (
    <ShellDePasajero cargando={<Cargando />}>
      <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID="pantalla-saldo">
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
            <Icono nombre="dolar" color={tema.color.textoTenue} tamano={30} />
          </View>

          <Txt nivel="encabezado" accessibilityRole="header" centrado>
            Saldo
          </Txt>
          <Txt nivel="cuerpo" tono="secundario" centrado>
            Todavía no puedes recargar desde la aplicación. Cuando esté disponible, tu saldo y
            tus movimientos aparecerán aquí.
          </Txt>
          <Txt nivel="pie" tono="tenue" centrado>
            Mientras tanto puedes pagar tus viajes en efectivo.
          </Txt>
        </View>

        {/* `activo="perfil"`, y no «saldo»: el saldo YA NO ES UNA PESTAÑA. Se
            entra desde una fila del perfil, así que la que tiene que quedar
            encendida es aquella de la que vienes. Con la clave vieja no se
            encendería ninguna —no está en la barra— y el hueco viajero se
            quedaría en el sitio de la anterior, como si la barra estuviera
            rota. */}
        <BarraDeNavegacion
          destinos={DESTINOS_DE_PASAJERA}
          activo="perfil"
          control={<ControlDePedido abierto={false} />}
        />
      </View>
    </ShellDePasajero>
  );
}
