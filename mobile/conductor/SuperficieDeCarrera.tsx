/**
 * Superficie de Carrera Activa para el Conductor (+58Express).
 *
 * Resuelve el ciclo de vida completo de la carrera:
 * - DRIVER_ASSIGNED: Vas a recoger a la pasajera (CTA: Llegué al punto)
 * - ARRIVED: Esperando a la pasajera (CTA: Iniciar viaje)
 * - IN_PROGRESS: Viaje en curso hacia el destino (CTA: Finalizar viaje)
 *
 * Cero solapamientos con el panel inferior, diseño premium para Modo Claro y Modo Oscuro,
 * y cumplimiento estricto del sistema de diseño (sin colores hexadecimales literales).
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { useTema, useEsquema } from '../theme/ThemeContext';
import type { AccionDelConductor, FaseDeLaAccion } from '../domain/accionesDelConductor';

export interface DatosPasajeroCarrera {
  readonly nombre: string;
  readonly iniciales: string;
  readonly calificacion?: string;
  readonly viajes?: number;
  readonly telefono?: string;
}

export interface SuperficieDeCarreraProps {
  readonly titular?: string;
  readonly origen?: string;
  readonly destino?: string;
  readonly tarifa?: string;
  readonly tarifaBs?: string;
  readonly metodoPago?: string;
  readonly accion: AccionDelConductor;
  readonly fase: FaseDeLaAccion;
  readonly fallo: string | null;
  readonly sePuede: boolean;
  readonly pasajero?: DatosPasajeroCarrera;
  readonly mensajesSinLeer?: number;
  readonly tiempoEspera?: string;
  readonly onPulsar: () => void;
  readonly onMensaje?: () => void;
  readonly onLlamar?: () => void;
}

export function SuperficieDeCarrera({
  titular,
  origen,
  destino,
  tarifa = '.50',
  tarifaBs = 'Bs. 210,00',
  metodoPago = 'Efectivo',
  accion,
  fase,
  fallo,
  sePuede,
  pasajero = {
    nombre: 'Ana Rondón',
    iniciales: 'AR',
    calificacion: '4.98',
    viajes: 42
  },
  mensajesSinLeer = 0,
  tiempoEspera,
  onPulsar,
  onMensaje,
  onLlamar
}: SuperficieDeCarreraProps) {
  const tema = useTema();
  const esquema = useEsquema();
  const esOscuro = esquema === 'oscuro';
  const enviando = fase === 'SUBMITTING';

  const origenLimpio = origen && origen.trim().length > 0 ? origen : 'Punto de recogida acordado';
  const destinoLimpio = destino && destino.trim().length > 0 ? destino : 'Destino solicitado por pasajera';

  // Determinación de estado y etiquetas
  const esRecogida = accion.estadoQuePide === 'ARRIVED';
  const esEsperando = accion.estadoQuePide === 'IN_PROGRESS';
  const esEnCurso = accion.estadoQuePide === 'COMPLETED';

  const badgeEstadoTexto = esRecogida
    ? 'EN CAMINO A RECOGER'
    : esEsperando
    ? 'EN EL PUNTO DE ENCUENTRO'
    : 'VIAJE EN CURSO A DESTINO';

  const badgePuntoColor = esRecogida
    ? tema.color.exito
    : esEsperando
    ? tema.color.acento
    : tema.color.textoPrimario;

  const titularCalculado = titular || (
    esRecogida
      ? 'Vas a recoger a la pasajera'
      : esEsperando
      ? 'Esperando a la pasajera'
      : 'Viaje en curso a destino'
  );

  return (
    <View
      testID="superficie-de-carrera"
      style={[
        estilos.contenedor,
        {
          backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
          borderTopColor: tema.color.borde,
          shadowColor: tema.color.textoPrimario
        }
      ]}
    >
      {/* Indicador táctil superior */}
      <View style={estilos.centroAsa}>
        <View style={[estilos.asa, { backgroundColor: tema.color.borde }]} />
      </View>

      {/* 1. Header con Badge de Estado y Cobro */}
      <View style={estilos.filaCabecera}>
        <View style={estilos.columnaEstado}>
          <View style={estilos.filaPill}>
            <View style={[estilos.puntoLuminoso, { backgroundColor: badgePuntoColor }]} />
            <Text style={[estilos.textoPill, { color: tema.color.textoSecundario }]}>
              {badgeEstadoTexto}
            </Text>
          </View>
          <Text style={[estilos.tituloPrincipal, { color: tema.color.textoPrimario }]}>
            {titularCalculado}
          </Text>
          {esEsperando && tiempoEspera ? (
            <Text style={[estilos.tiempoEsperaTexto, { color: tema.color.acento }]}>
              {tiempoEspera}
            </Text>
          ) : null}
        </View>

        {/* Tarifa destacada */}
        <View
          style={[
            estilos.tarjetaTarifa,
            {
              backgroundColor: tema.color.superficieHundida,
              borderColor: tema.color.borde
            }
          ]}
        >
          <Text style={[estilos.montoTarifa, { color: tema.color.textoPrimario }]}>
            {tarifa}
          </Text>
          <Text style={[estilos.detalleTarifa, { color: tema.color.textoSecundario }]}>
            {metodoPago}
          </Text>
        </View>
      </View>

      {/* 2. Tarjeta del Pasajero con Contacto Directo */}
      <View
        style={[
          estilos.tarjetaPasajero,
          {
            backgroundColor: tema.color.superficieHundida,
            borderColor: tema.color.borde
          }
        ]}
      >
        <View style={[estilos.avatarContenedor, { backgroundColor: tema.color.superficieElevada }]}>
          <Text style={[estilos.avatarTexto, { color: tema.color.textoPrimario }]}>
            {pasajero.iniciales}
          </Text>
        </View>

        <View style={estilos.datosPasajero}>
          <Text style={[estilos.nombrePasajero, { color: tema.color.textoPrimario }]}>
            {pasajero.nombre}
          </Text>
          <View style={estilos.filaEstrellas}>
            <Icono nombre="estrella" color={tema.color.acento} tamano={13} activo />
            <Text style={[estilos.ratingTexto, { color: tema.color.textoSecundario }]}>
              {pasajero.calificacion || '5.0'} {pasajero.viajes ? `(${pasajero.viajes} viajes)` : ''}
            </Text>
          </View>
        </View>

        {/* Botones de acción rápida: Chat y Llamada */}
        <View style={estilos.accionesPasajero}>
          {onMensaje ? (
            <Pressable
              onPress={onMensaje}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensaje a la pasajera"
              style={({ pressed }) => [
                estilos.botonCircular,
                {
                  backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficie,
                  borderColor: tema.color.borde
                }
              ]}
            >
              <Icono nombre="mensaje" color={tema.color.textoPrimario} tamano={18} />
              {mensajesSinLeer > 0 ? (
                <View style={[estilos.badgeMensaje, { backgroundColor: tema.color.peligro }]}>
                  <Text style={[estilos.textoBadgeMensaje, { color: tema.color.sobreAcento }]}>{mensajesSinLeer}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {onLlamar ? (
            <Pressable
              onPress={onLlamar}
              accessibilityRole="button"
              accessibilityLabel="Llamar a la pasajera"
              style={({ pressed }) => [
                estilos.botonCircular,
                {
                  backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficie,
                  borderColor: tema.color.borde
                }
              ]}
            >
              <Icono nombre="telefono" color={tema.color.textoPrimario} tamano={18} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* 3. Hoja de Ruta Estructurada */}
      <View
        style={[
          estilos.tarjetaRuta,
          {
            backgroundColor: tema.color.superficieHundida,
            borderColor: tema.color.borde
          }
        ]}
      >
        {/* Punto Recogida */}
        <View style={estilos.filaParada}>
          <View style={estilos.columnaIconoRuta}>
            <View style={[estilos.iconoPunto, { backgroundColor: tema.color.exito }]} />
            <View style={[estilos.lineaConectora, { backgroundColor: tema.color.borde }]} />
          </View>
          <View style={estilos.textosParada}>
            <Text style={[estilos.etiquetaParada, { color: tema.color.textoTenue }]}>
              PUNTO DE RECOGIDA
            </Text>
            <Text style={[estilos.direccionParada, { color: tema.color.textoPrimario }]} numberOfLines={1}>
              {origenLimpio}
            </Text>
          </View>
        </View>

        {/* Punto Destino */}
        <View style={estilos.filaParada}>
          <View style={estilos.columnaIconoRuta}>
            <View style={[estilos.iconoPunto, { backgroundColor: tema.color.textoPrimario }]} />
          </View>
          <View style={estilos.textosParada}>
            <Text style={[estilos.etiquetaParada, { color: tema.color.textoTenue }]}>
              DESTINO
            </Text>
            <Text style={[estilos.direccionParada, { color: tema.color.textoPrimario }]} numberOfLines={1}>
              {destinoLimpio}
            </Text>
          </View>
        </View>
      </View>

      {/* Avisos o Fallos */}
      {fase === 'OFFLINE' ? (
        <View style={[estilos.bannerAlerta, { backgroundColor: tema.color.superficieHundida }]}>
          <Text style={[estilos.textoAlerta, { color: tema.color.textoTenue }]}>
            Sin conexión. La acción se enviará automáticamente al recuperar señal.
          </Text>
        </View>
      ) : null}

      {fallo ? (
        <View style={[estilos.bannerAlerta, { backgroundColor: tema.color.superficieHundida }]}>
          <Text style={[estilos.textoAlerta, { color: tema.color.peligro }]}>
            {fallo}
          </Text>
        </View>
      ) : null}

      {/* 4. Botón de Acción Principal Grande */}
      <View style={estilos.contenedorBotonPrincipal}>
        <Pressable
          testID={accion.testID}
          onPress={onPulsar}
          disabled={!sePuede || enviando}
          accessibilityRole="button"
          accessibilityLabel={enviando ? accion.textoEnviando : accion.texto}
          style={({ pressed }) => [
            estilos.botonAccionPrincipal,
            {
              backgroundColor: !esOscuro
                ? (pressed ? tema.color.textoSecundario : tema.color.textoPrimario)
                : (pressed ? tema.color.acentoPresionado : tema.color.acento),
              opacity: !sePuede || enviando ? 0.5 : 1
            }
          ]}
        >
          {enviando ? (
            <ActivityIndicator color={!esOscuro ? tema.color.superficieElevada : tema.color.sobreAcento} />
          ) : (
            <Text
              style={[
                estilos.textoBotonAccionPrincipal,
                {
                  color: !esOscuro ? tema.color.superficieElevada : tema.color.sobreAcento
                }
              ]}
            >
              {accion.texto}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 13,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8
  },
  centroAsa: {
    alignItems: 'center',
    paddingVertical: 4
  },
  asa: {
    width: 38,
    height: 4,
    borderRadius: 2
  },
  filaCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  columnaEstado: {
    flex: 1,
    gap: 3
  },
  filaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  puntoLuminoso: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  textoPill: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  tituloPrincipal: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  tiempoEsperaTexto: {
    fontSize: 13,
    fontWeight: '600'
  },
  tarjetaTarifa: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 84,
    borderRadius: 12,
    borderWidth: 1
  },
  montoTarifa: {
    fontSize: 18,
    fontWeight: '800'
  },
  detalleTarifa: {
    fontSize: 11,
    fontWeight: '500'
  },
  tarjetaPasajero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12
  },
  avatarContenedor: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarTexto: {
    fontSize: 16,
    fontWeight: '700'
  },
  datosPasajero: {
    flex: 1,
    gap: 2
  },
  nombrePasajero: {
    fontSize: 15,
    fontWeight: '700'
  },
  filaEstrellas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  ratingTexto: {
    fontSize: 12,
    fontWeight: '500'
  },
  accionesPasajero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  botonCircular: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  badgeMensaje: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3
  },
  textoBadgeMensaje: {
    fontSize: 10,
    fontWeight: '800'
  },
  tarjetaRuta: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10
  },
  filaParada: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  columnaIconoRuta: {
    alignItems: 'center',
    width: 14,
    marginTop: 3
  },
  iconoPunto: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  lineaConectora: {
    width: 2,
    height: 22,
    marginVertical: 2
  },
  textosParada: {
    flex: 1,
    gap: 1
  },
  etiquetaParada: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6
  },
  direccionParada: {
    fontSize: 13,
    fontWeight: '600'
  },
  bannerAlerta: {
    padding: 10,
    borderRadius: 10
  },
  textoAlerta: {
    fontSize: 12,
    textAlign: 'center'
  },
  contenedorBotonPrincipal: {
    marginTop: 2
  },
  botonAccionPrincipal: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  textoBotonAccionPrincipal: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3
  }
});
