/**
 * PASO 1 — Qué vas a hacer: vehículo, servicios y ciudad.
 *
 * Si ya hay sesión, antes de nada se pregunta al servidor si existe un
 * expediente: uno editable lleva directo a los documentos; uno en revisión o
 * decidido, a su estado. Nadie rellena dos veces lo que el servidor ya tiene.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../components/Boton';
import { Opcion } from '../../components/Opcion';
import { Pantalla } from '../../components/Pantalla';
import { useSesion } from '../../context/AuthContext';
import { usePostulacion } from '../../context/PostulacionContext';
import {
  CIUDADES,
  SERVICIOS,
  VEHICULOS_DESCRITOS,
  describirPaso,
  type ClaveDeServicio,
  type TipoDeVehiculo
} from '../../domain/postulacion';
import { leerMiPostulacion } from '../../services/postulacion';
import { colores, espaciado, tipografia } from '../../theme/tokens';

const EDITABLES = ['draft', 'needs_changes', 'rejected'];

export default function PasoDeServicio() {
  const { sesion } = useSesion();
  const { borrador, actualizar, fijarSolicitud } = usePostulacion();
  const [vehiculo, setVehiculo] = useState<TipoDeVehiculo | null>(borrador.vehiculo);
  const [servicios, setServicios] = useState<readonly ClaveDeServicio[]>(borrador.servicios);
  const [ciudad, setCiudad] = useState(borrador.personales.ciudad);
  const [aviso, setAviso] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(sesion.estado === 'AUTENTICADO');

  // Con sesión: el servidor dice si ya hay expediente y a dónde ir.
  useEffect(() => {
    if (sesion.estado !== 'AUTENTICADO') { setConsultando(false); return; }
    let vigente = true;
    void leerMiPostulacion().then(lectura => {
      if (!vigente) return;
      if (lectura.ok && lectura.solicitud) {
        fijarSolicitud(lectura.solicitud);
        router.replace(EDITABLES.includes(lectura.solicitud.status) ? '/postulacion/documentos' : '/postulacion/estado');
        return;
      }
      setConsultando(false);
    });
    return () => { vigente = false; };
  }, [sesion.estado, fijarSolicitud]);

  const alternarServicio = (clave: ClaveDeServicio) => {
    setServicios(actuales => (actuales.includes(clave) ? actuales.filter(item => item !== clave) : [...actuales, clave]));
  };

  const continuar = () => {
    if (vehiculo === null) { setAviso('Elige moto o carro.'); return; }
    if (servicios.length === 0) { setAviso('Elige al menos un servicio.'); return; }
    if (!ciudad) { setAviso('Elige tu ciudad.'); return; }
    setAviso(null);
    actualizar({
      vehiculo,
      servicios,
      personales: { ...borrador.personales, ciudad },
      datosDelVehiculo: { ...borrador.datosDelVehiculo, tipo: vehiculo },
      // Cambiar de vehículo invalida el grado de licencia que se hubiera escrito.
      licencia: borrador.datosDelVehiculo.tipo === vehiculo ? borrador.licencia : { ...borrador.licencia, grado: '' }
    });
    router.push('/postulacion/identidad');
  };

  if (consultando) {
    return (
      <Pantalla testID="postulacion-consultando">
        <View style={estilos.centro}><ActivityIndicator color={colores.acento} size="large" /></View>
      </Pantalla>
    );
  }

  const paso = describirPaso('servicio');
  return (
    <Pantalla desplazable testID="postulacion-servicio">
      <View style={estilos.contenido}>
        <Text style={estilos.paso}>Paso 1 de 5</Text>
        <Text style={estilos.titulo}>{paso.titulo}</Text>
        <Text style={estilos.detalle}>{paso.detalle}</Text>

        <Text style={estilos.seccion}>Tu vehículo</Text>
        {VEHICULOS_DESCRITOS.map(item => (
          <Opcion
            key={item.tipo}
            titulo={item.titulo}
            detalle={item.detalle}
            elegida={vehiculo === item.tipo}
            onElegir={() => setVehiculo(item.tipo)}
            testID={`vehiculo-${item.tipo}`}
          />
        ))}

        <Text style={estilos.seccion}>Qué quieres hacer (puedes elegir las dos)</Text>
        {SERVICIOS.map(item => (
          <Opcion
            key={item.clave}
            tipo="casilla"
            titulo={item.titulo}
            detalle={item.detalle}
            elegida={servicios.includes(item.clave)}
            onElegir={() => alternarServicio(item.clave)}
            testID={`servicio-${item.clave}`}
          />
        ))}

        <Text style={estilos.seccion}>Tu ciudad</Text>
        {CIUDADES.map(item => (
          <Opcion
            key={item.ciudad}
            titulo={item.ciudad}
            detalle={item.region}
            elegida={ciudad === item.ciudad}
            onElegir={() => setCiudad(item.ciudad)}
            testID={`ciudad-${item.ciudad}`}
          />
        ))}

        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
        <Boton titulo="Continuar" onPress={continuar} testID="postulacion-continuar" />
        <Boton titulo="Ahora no" variante="secundario" onPress={() => { router.back(); }} />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  paso: { color: colores.textoTenue, fontSize: tipografia.pie.tamano },
  titulo: { color: colores.textoPrimario, fontSize: tipografia.titulo.tamano, lineHeight: tipografia.titulo.alto, fontWeight: '700' },
  detalle: { color: colores.textoSecundario, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto },
  seccion: { color: colores.textoSecundario, fontSize: tipografia.pie.tamano, fontWeight: '600', marginTop: espaciado.md },
  aviso: { color: colores.peligro, fontSize: tipografia.pie.tamano }
});
