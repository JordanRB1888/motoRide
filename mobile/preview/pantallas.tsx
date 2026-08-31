/**
 * Las pantallas del laboratorio visual.
 *
 * Son PRESENTACIONALES: reciben datos de demostración y no llaman a nada. Su
 * único propósito es que el dueño pueda ver las tres direcciones con el mismo
 * contenido y decidir.
 *
 * La única pantalla que existe también en la aplicación real —el acceso— se
 * reestiliza aparte, sobre la lógica de autenticación de Wave 1, que no se
 * toca.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import {
  Avatar,
  BarraInferior,
  Boton,
  Insignia,
  MapaSimulado,
  Superficie,
  TarjetaDeServicio,
  Txt,
  type PestanaInferior
} from '../ui/componentes';
import { Icono } from '../ui/Icono';
import {
  CONDUCTOR_DEMO,
  DESTINOS_RECIENTES_DEMO,
  JORNADA_DEMO,
  PASAJERA_DEMO,
  SERVICIOS_DEMO,
  VIAJE_DEMO
} from './fixtures';

const PESTANAS_PASAJERA: readonly PestanaInferior[] = [
  { clave: 'inicio', icono: 'inicio', etiqueta: 'Inicio' },
  { clave: 'viajes', icono: 'viajes', etiqueta: 'Viajes' },
  { clave: 'seguro', icono: 'escudo', etiqueta: 'Seguro' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
];

const PESTANAS_CONDUCTOR: readonly PestanaInferior[] = [
  { clave: 'inicio', icono: 'inicio', etiqueta: 'Jornada' },
  { clave: 'viajes', icono: 'viajes', etiqueta: 'Carreras' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
];

/** Envoltorio con el margen de la dirección activa. */
function Lienzo({ children, sinRelleno = false }: {
  readonly children: React.ReactNode;
  readonly sinRelleno?: boolean;
}) {
  const tema = useTema();
  return (
    <View style={{
      flex: 1,
      backgroundColor: tema.color.fondo,
      paddingHorizontal: sinRelleno ? 0 : tema.ritmo.margenPantalla
    }}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1 · Arranque
// ---------------------------------------------------------------------------

export function PreviewArranque() {
  const tema = useTema();
  return (
    <Lienzo>
      <View style={estilos.centro}>
        <View style={{ alignItems: 'center', gap: tema.ritmo.entreElementos }}>
          {/* La marca es tipográfica: el logotipo oficial va en el splash
              nativo, y repetirlo aquí a mayor tamaño lo abarataría. */}
          <Txt nivel="display" centrado>
            <Txt nivel="display" tono="acento">+58</Txt>Express
          </Txt>
          <View style={{
            width: 48, height: 3, borderRadius: 2,
            backgroundColor: tema.color.acento
          }} />
          <Txt nivel="pie" tono="tenue" centrado>Mototaxi en Maracaibo</Txt>
        </View>
      </View>
      <View style={{ paddingBottom: tema.ritmo.entreBloques }}>
        <Txt nivel="pie" tono="tenue" centrado>Preparando tu sesión…</Txt>
      </View>
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// 2 · Selector de experiencia
// ---------------------------------------------------------------------------

export function PreviewSelectorDeRol() {
  const tema = useTema();
  const [elegido, setElegido] = useState<'pasajera' | 'conductor' | null>(null);

  return (
    <Lienzo>
      <View style={{ paddingTop: tema.ritmo.entreBloques + 16, alignItems: 'center', gap: 6 }}>
        <Txt nivel="titulo" centrado>
          <Txt nivel="titulo" tono="acento">+58</Txt>Express
        </Txt>
        <Txt nivel="pie" tono="tenue">Mototaxi en Maracaibo</Txt>
      </View>

      <View style={[estilos.centro, { gap: tema.ritmo.entreBloques }]}>
        <Txt nivel="display" centrado accessibilityRole="header">¿Cómo quieres continuar?</Txt>

        <View style={{ gap: tema.ritmo.entreElementos }}>
          <TarjetaDeServicio
            icono="destino"
            titulo="Pasajero"
            detalle="Pide una carrera y llega a donde vas"
            seleccionada={elegido === 'pasajera'}
            onPress={() => setElegido('pasajera')}
            testID="preview-rol-pasajera"
          />
          <TarjetaDeServicio
            icono="moto"
            titulo="Conductor"
            detalle="Recibe carreras y gestiona tu jornada"
            seleccionada={elegido === 'conductor'}
            onPress={() => setElegido('conductor')}
            testID="preview-rol-conductor"
          />
        </View>

        <Boton titulo="Continuar" onPress={() => {}} deshabilitado={elegido === null} />
      </View>

      <View style={{ paddingBottom: tema.ritmo.entreBloques }}>
        <Txt nivel="pie" tono="tenue" centrado>
          Puedes cambiar de modo cuando quieras desde tu perfil.
        </Txt>
      </View>
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// 3 · Acceso
// ---------------------------------------------------------------------------

export function PreviewAcceso() {
  const tema = useTema();

  return (
    <Lienzo>
      <View style={{ paddingTop: tema.ritmo.entreBloques + 16, gap: 6 }}>
        <Txt nivel="titulo" accessibilityRole="header">Acceso de pasajera</Txt>
        <Txt nivel="cuerpo" tono="secundario">Entra con la cuenta que ya tienes.</Txt>
      </View>

      <View style={[estilos.centro, { gap: tema.ritmo.entreElementos }]}>
        <CampoSimulado etiqueta="Correo o teléfono" valor="demo@ejemplo.test" />
        <CampoSimulado etiqueta="Contraseña" valor="••••••••" />
        <Boton titulo="Entrar" onPress={() => {}} />
        <Boton titulo="Cambiar de modo" variante="secundario" onPress={() => {}} />
      </View>

      <View style={{ paddingBottom: tema.ritmo.entreBloques }}>
        <Txt nivel="pie" tono="tenue" centrado>
          ¿Olvidaste tu contraseña? Escríbenos.
        </Txt>
      </View>
    </Lienzo>
  );
}

function CampoSimulado({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: string }) {
  const tema = useTema();
  return (
    <View style={{ gap: 6 }}>
      <Txt nivel="etiqueta" tono="secundario">{etiqueta}</Txt>
      <View style={{
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: tema.ritmo.entreElementos,
        borderRadius: tema.radio.campo,
        backgroundColor: tema.color.superficie,
        borderWidth: 1, borderColor: tema.color.borde
      }}>
        <Txt nivel="cuerpo" tono="secundario">{valor}</Txt>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 4 · Inicio de pasajera
// ---------------------------------------------------------------------------

export function PreviewInicioPasajera() {
  const tema = useTema();
  const [servicio, setServicio] = useState('mototaxi');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: tema.ritmo.entreBloques,
          paddingBottom: tema.ritmo.entreBloques,
          gap: tema.ritmo.entreBloques
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.filaEntre}>
          <View style={{ gap: 2 }}>
            <Txt nivel="pie" tono="tenue">Buen día</Txt>
            <Txt nivel="titulo">{PASAJERA_DEMO.nombre}</Txt>
          </View>
          <Avatar iniciales={PASAJERA_DEMO.iniciales} />
        </View>

        <MapaSimulado altura={180} etiqueta="Mapa de ejemplo" />

        {/* La acción principal, imposible de confundir. */}
        <Superficie destacada>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <Txt nivel="encabezado">¿A dónde vas?</Txt>
            <View style={{
              minHeight: 48, justifyContent: 'center',
              paddingHorizontal: tema.ritmo.entreElementos,
              borderRadius: tema.radio.campo,
              backgroundColor: tema.color.superficieElevada
            }}>
              <Txt nivel="cuerpo" tono="tenue">Escribe tu destino</Txt>
            </View>
            <View style={estilos.fila}>
              <Icono nombre="destino" color={tema.color.acento} tamano={16} />
              <Txt nivel="pie" tono="secundario">{PASAJERA_DEMO.zona}</Txt>
            </View>
          </View>
        </Superficie>

        <View style={{ gap: tema.ritmo.entreElementos }}>
          <Txt nivel="encabezado">Servicios</Txt>
          {SERVICIOS_DEMO.map(item => (
            <TarjetaDeServicio
              key={item.clave}
              icono={item.icono}
              titulo={item.titulo}
              detalle={item.detalle}
              precio={item.precio}
              seleccionada={servicio === item.clave}
              onPress={() => setServicio(item.clave)}
            />
          ))}
        </View>

        <View style={{ gap: tema.ritmo.entreElementos }}>
          <Txt nivel="encabezado">Destinos recientes</Txt>
          <Superficie>
            <View style={{ gap: tema.ritmo.entreElementos }}>
              {DESTINOS_RECIENTES_DEMO.map((destino, indice) => (
                <View key={destino.clave}>
                  {indice > 0 && (
                    <View style={{
                      height: 1, backgroundColor: tema.color.borde,
                      marginBottom: tema.ritmo.entreElementos
                    }} />
                  )}
                  <View style={estilos.fila}>
                    <Icono nombre="reloj" color={tema.color.textoTenue} tamano={18} />
                    <View style={estilos.crece}>
                      <Txt nivel="cuerpo">{destino.titulo}</Txt>
                      <Txt nivel="pie" tono="tenue">{destino.detalle}</Txt>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </Superficie>
        </View>
      </ScrollView>

      <BarraInferior pestanas={PESTANAS_PASAJERA} activa="inicio" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 5 · Elegir destino
// ---------------------------------------------------------------------------

export function PreviewDestino() {
  const tema = useTema();

  return (
    <Lienzo>
      <View style={{ paddingTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreBloques, flex: 1 }}>
        <Txt nivel="titulo" accessibilityRole="header">¿A dónde vas?</Txt>

        <Superficie destacada>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <View style={estilos.fila}>
              <View style={{
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: tema.color.acento
              }} />
              <Txt nivel="cuerpo" tono="secundario">{PASAJERA_DEMO.zona}</Txt>
            </View>
            <View style={{ height: 1, backgroundColor: tema.color.borde }} />
            <View style={estilos.fila}>
              <View style={{
                width: 10, height: 10, borderRadius: 2,
                backgroundColor: tema.color.textoPrimario
              }} />
              <Txt nivel="cuerpo" tono="tenue">Escribe tu destino</Txt>
            </View>
          </View>
        </Superficie>

        <View style={{ gap: tema.ritmo.entreElementos, flex: 1 }}>
          <Txt nivel="encabezado">Sugerencias</Txt>
          {DESTINOS_RECIENTES_DEMO.map(destino => (
            <Superficie key={destino.clave}>
              <View style={estilos.fila}>
                <Icono nombre="destino" color={tema.color.textoSecundario} tamano={18} />
                <View style={estilos.crece}>
                  <Txt nivel="cuerpo">{destino.titulo}</Txt>
                  <Txt nivel="pie" tono="tenue">{destino.detalle}</Txt>
                </View>
              </View>
            </Superficie>
          ))}
        </View>

        <View style={{ paddingBottom: tema.ritmo.entreBloques }}>
          <Boton titulo="Confirmar destino" onPress={() => {}} />
        </View>
      </View>
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// 6 · Jornada del conductor
// ---------------------------------------------------------------------------

export function PreviewInicioConductor() {
  const tema = useTema();
  const [conectado, setConectado] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: tema.ritmo.entreBloques,
          paddingBottom: tema.ritmo.entreBloques,
          gap: tema.ritmo.entreBloques
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.filaEntre}>
          <View style={{ gap: 2 }}>
            <Txt nivel="pie" tono="tenue">Tu jornada</Txt>
            <Txt nivel="titulo">{CONDUCTOR_DEMO.nombre}</Txt>
          </View>
          <Avatar iniciales={CONDUCTOR_DEMO.iniciales} />
        </View>

        {/* La acción principal del conductor: conectarse. Grande, con estado
            visible de un vistazo y sin nada que compita a su lado. */}
        <Superficie destacada={conectado} elevada>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <View style={estilos.filaEntre}>
              <Txt nivel="encabezado">{conectado ? 'Estás conectado' : 'Estás desconectado'}</Txt>
              <Insignia
                texto={conectado ? 'Recibiendo' : 'En pausa'}
                tono={conectado ? 'exito' : 'neutro'}
              />
            </View>
            <Txt nivel="pie" tono="secundario">
              {conectado ? CONDUCTOR_DEMO.zona : 'No recibirás carreras mientras estés en pausa.'}
            </Txt>
            <Boton
              titulo={conectado ? 'Desconectarme' : 'Conectarme'}
              variante={conectado ? 'secundario' : 'principal'}
              onPress={() => setConectado(previo => !previo)}
              testID="preview-conmutador-disponibilidad"
            />
          </View>
        </Superficie>

        <View style={{ gap: tema.ritmo.entreElementos }}>
          <Txt nivel="encabezado">Hoy</Txt>
          <View style={estilos.fila}>
            <Superficie estilo={estilos.crece}>
              <Txt nivel="pie" tono="tenue">Carreras</Txt>
              <Txt nivel="titulo">{JORNADA_DEMO.viajes}</Txt>
            </Superficie>
            <Superficie estilo={estilos.crece}>
              <Txt nivel="pie" tono="tenue">En ruta</Txt>
              <Txt nivel="titulo">{JORNADA_DEMO.horas}</Txt>
            </Superficie>
          </View>

          {/* La cifra de saldo NO se inventa: la cartera está apagada en el
              backend, y enseñar un número como si fuera real sería mentir. */}
          <Superficie>
            <View style={{ gap: 6 }}>
              <View style={estilos.filaEntre}>
                <Txt nivel="cuerpo" tono="secundario">Saldo</Txt>
                <Txt nivel="encabezado" tono="tenue">{JORNADA_DEMO.resumen}</Txt>
              </View>
              <Txt nivel="pie" tono="tenue">{JORNADA_DEMO.nota}</Txt>
            </View>
          </Superficie>
        </View>

        <Superficie>
          <View style={estilos.fila}>
            <Icono nombre="moto" color={tema.color.textoSecundario} tamano={20} />
            <View style={estilos.crece}>
              <Txt nivel="cuerpo">{CONDUCTOR_DEMO.vehiculo}</Txt>
              <Txt nivel="pie" tono="tenue">Vehículo activo</Txt>
            </View>
          </View>
        </Superficie>
      </ScrollView>

      <BarraInferior pestanas={PESTANAS_CONDUCTOR} activa="inicio" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 7 · Viaje en curso
// ---------------------------------------------------------------------------

export function PreviewViaje() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{ padding: tema.ritmo.margenPantalla, paddingBottom: 0 }}>
        <MapaSimulado altura={260} etiqueta="Ruta de ejemplo" />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: tema.ritmo.entreBloques,
          paddingBottom: tema.ritmo.entreBloques,
          gap: tema.ritmo.entreElementos
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.filaEntre}>
          <Insignia texto={VIAJE_DEMO.estado} tono="acento" />
          <Txt nivel="encabezado" tono="acento">{VIAJE_DEMO.eta}</Txt>
        </View>

        <Superficie destacada elevada>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <View style={estilos.fila}>
              <Avatar iniciales={VIAJE_DEMO.iniciales} tamano={48} />
              <View style={estilos.crece}>
                <Txt nivel="encabezado">{VIAJE_DEMO.conductor}</Txt>
                <Txt nivel="pie" tono="secundario">{VIAJE_DEMO.vehiculo}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt nivel="cuerpo" tono="acento">★ {VIAJE_DEMO.valoracion}</Txt>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: tema.color.borde }} />

            <View style={{ gap: 10 }}>
              <View style={estilos.fila}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tema.color.acento }} />
                <Txt nivel="pie" tono="secundario">{VIAJE_DEMO.origen}</Txt>
              </View>
              <View style={estilos.fila}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tema.color.textoPrimario }} />
                <Txt nivel="pie" tono="secundario">{VIAJE_DEMO.destino}</Txt>
              </View>
            </View>
          </View>
        </Superficie>

        <View style={estilos.fila}>
          <Boton titulo="Llamar" variante="secundario" onPress={() => {}} estilo={estilos.crece} />
          <Boton titulo="Mensaje" variante="secundario" onPress={() => {}} estilo={estilos.crece} />
        </View>

        <Superficie>
          <View style={estilos.filaEntre}>
            <Txt nivel="cuerpo" tono="secundario">Total del viaje</Txt>
            <Txt nivel="encabezado">{VIAJE_DEMO.precio}</Txt>
          </View>
        </Superficie>

        <Boton titulo="Cancelar viaje" variante="silencioso" onPress={() => {}} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 8 · Perfil
// ---------------------------------------------------------------------------

export function PreviewPerfil() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: tema.ritmo.entreBloques,
          paddingBottom: tema.ritmo.entreBloques,
          gap: tema.ritmo.entreBloques
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: tema.ritmo.entreElementos }}>
          <Avatar iniciales={PASAJERA_DEMO.iniciales} tamano={76} />
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt nivel="titulo">{PASAJERA_DEMO.nombre}</Txt>
            <Txt nivel="pie" tono="tenue">demo@ejemplo.test</Txt>
          </View>
          <Insignia texto="Pasajera" tono="acento" />
        </View>

        <View style={{ gap: tema.ritmo.entreElementos }}>
          <Txt nivel="encabezado">Cuenta</Txt>
          {[
            { icono: 'perfil' as const, titulo: 'Datos personales' },
            { icono: 'escudo' as const, titulo: 'Seguridad' },
            { icono: 'viajes' as const, titulo: 'Historial de viajes' },
            { icono: 'moto' as const, titulo: 'Cambiar a modo conductor' }
          ].map(fila => (
            <Superficie key={fila.titulo}>
              <View style={estilos.fila}>
                <Icono nombre={fila.icono} color={tema.color.textoSecundario} tamano={20} />
                <Txt nivel="cuerpo" estilo={estilos.crece as never}>{fila.titulo}</Txt>
                <Txt nivel="cuerpo" tono="tenue">›</Txt>
              </View>
            </Superficie>
          ))}
        </View>

        <Boton titulo="Cerrar sesión" variante="secundario" onPress={() => {}} />
      </ScrollView>

      <BarraInferior pestanas={PESTANAS_PASAJERA} activa="perfil" />
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', gap: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filaEntre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  crece: { flex: 1, gap: 2 }
});
