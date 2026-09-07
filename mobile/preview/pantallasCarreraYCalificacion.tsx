/**
 * Pantallas de laboratorio para Carrera Activa y Calificación Bidireccional.
 */

import { View } from 'react-native';

import { LienzoDeMapa, type VehiculoEnMapa } from '../ui/Mapa';
import { HojaInferior } from '../ui/HojaInferior';
import { HITOS_DE_VIAJE } from './pantallasC2';
import { SuperficieDeCarrera } from '../conductor/SuperficieDeCarrera';
import { PantallaDeCalificacion } from '../ui/PantallaDeCalificacion';
import { C2Viaje } from './pantallasC2';

const MOTO_CONDUCTOR: VehiculoEnMapa = {
  clave: 'conductor',
  tipo: 'MOTO',
  en: { x: 46, y: 30 },
  rumbo: 38,
  destacado: true
};

// 1. Conductor: Vas a recoger (Llegué al punto)
export function PreviewDriverCarreraRecoger() {
  return (
    <View style={{ flex: 1 }}>
      <LienzoDeMapa vehiculos={[MOTO_CONDUCTOR]} hitos={HITOS_DE_VIAJE} conRuta>
        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <SuperficieDeCarrera
            titular="Vas a recoger a la pasajera"
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            tarifa="$3.50"
            tarifaBs="Bs. 210,00"
            metodoPago="Efectivo"
            accion={{
              estadoQuePide: 'ARRIVED',
              texto: 'Llegué al punto',
              textoEnviando: 'Avisando…',
              testID: 'boton-llegue'
            }}
            fase="IDLE"
            fallo={null}
            sePuede={true}
            pasajero={{
              nombre: 'Ana Rondón',
              iniciales: 'AR',
              calificacion: '4.98',
              viajes: 42
            }}
            mensajesSinLeer={1}
            onPulsar={() => undefined}
            onMensaje={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// 2. Conductor: Esperando a la pasajera (Iniciar viaje)
export function PreviewDriverCarreraEsperando() {
  return (
    <View style={{ flex: 1 }}>
      <LienzoDeMapa vehiculos={[MOTO_CONDUCTOR]} hitos={HITOS_DE_VIAJE} conRuta>
        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <SuperficieDeCarrera
            titular="Esperando a la pasajera"
            tiempoEspera="Tiempo de espera: 03:12"
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            tarifa="$3.50"
            tarifaBs="Bs. 210,00"
            metodoPago="Efectivo"
            accion={{
              estadoQuePide: 'IN_PROGRESS',
              texto: 'Iniciar viaje',
              textoEnviando: 'Iniciando…',
              testID: 'boton-iniciar-viaje'
            }}
            fase="IDLE"
            fallo={null}
            sePuede={true}
            pasajero={{
              nombre: 'Ana Rondón',
              iniciales: 'AR',
              calificacion: '4.98',
              viajes: 42
            }}
            mensajesSinLeer={0}
            onPulsar={() => undefined}
            onMensaje={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// 3. Conductor: Viaje en curso (Finalizar viaje)
export function PreviewDriverCarreraEnCurso() {
  return (
    <View style={{ flex: 1 }}>
      <LienzoDeMapa vehiculos={[MOTO_CONDUCTOR]} hitos={HITOS_DE_VIAJE} conRuta>
        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <SuperficieDeCarrera
            titular="Viaje en curso a destino"
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            tarifa="$3.50"
            tarifaBs="Bs. 210,00"
            metodoPago="Efectivo"
            accion={{
              estadoQuePide: 'COMPLETED',
              texto: 'Finalizar viaje',
              textoEnviando: 'Finalizando…',
              testID: 'boton-finalizar-viaje'
            }}
            fase="IDLE"
            fallo={null}
            sePuede={true}
            pasajero={{
              nombre: 'Ana Rondón',
              iniciales: 'AR',
              calificacion: '4.98',
              viajes: 42
            }}
            mensajesSinLeer={0}
            onPulsar={() => undefined}
            onMensaje={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// 4. Pasajera: Conductor en camino
export function PreviewPasajeraCarreraCamino() {
  return (
    <C2Viaje
      datos={{
        estado: 'En camino',
        aclaracion: 'Llega en 4 min',
        conductor: 'Carlos Mendoza',
        iniciales: 'CM',
        vehiculo: 'Bera SBR 150 · AB123PR',
        valoracion: '5.0',
        origen: 'Av. 4 Bella Vista, Calle 72',
        destino: 'C.C. Sambil Maracaibo'
      }}
    />
  );
}

// 5. Pasajera: Viaje en curso
export function PreviewPasajeraCarreraEnCurso() {
  return (
    <C2Viaje
      datos={{
        estado: 'Viaje en curso',
        aclaracion: 'Destino en 10 min',
        conductor: 'Carlos Mendoza',
        iniciales: 'CM',
        vehiculo: 'Bera SBR 150 · AB123PR',
        valoracion: '5.0',
        origen: 'Av. 4 Bella Vista, Calle 72',
        destino: 'C.C. Sambil Maracaibo'
      }}
    />
  );
}

// 6. Pasajera califica al conductor (con propina)
export function PreviewCalificacionPasajera() {
  return (
    <PantallaDeCalificacion
      rol="pasajera"
      datos={{
        nombre: 'Carlos Mendoza',
        iniciales: 'CM',
        vehiculo: 'Bera SBR 150 Azul',
        placa: 'AB123PR',
        tarifa: '$3.50',
        tarifaBs: 'Bs. 210,00',
        duracion: '14 min',
        origen: 'Av. 4 Bella Vista, Calle 72',
        destino: 'C.C. Sambil Maracaibo'
      }}
      onEnviar={() => undefined}
      onOmitir={() => undefined}
    />
  );
}

// 7. Conductor califica a la pasajera
export function PreviewCalificacionConductor() {
  return (
    <PantallaDeCalificacion
      rol="conductor"
      datos={{
        nombre: 'Ana Rondón',
        iniciales: 'AR',
        tarifa: '$3.50',
        tarifaBs: 'Bs. 210,00',
        duracion: '14 min',
        origen: 'Av. 4 Bella Vista, Calle 72',
        destino: 'C.C. Sambil Maracaibo'
      }}
      onEnviar={() => undefined}
      onOmitir={() => undefined}
    />
  );
}
