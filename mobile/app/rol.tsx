/**
 * «¿Cómo quieres continuar?» — la primera pantalla real.
 *
 * ESTO ES NAVEGACIÓN, NO AUTORIZACIÓN
 *
 * Elegir «Conductor» aquí no convierte a nadie en conductor. No concede
 * permisos, no salta la aprobación y el backend no se entera de esta elección:
 * decide qué flujo de acceso se enseña, y nada más.
 *
 * Quien elija «Conductor» sin estar aprobado verá lo que le corresponda según su
 * estado real —sin solicitud, en revisión, rechazado— porque eso lo dice el
 * backend, no esta pantalla. La autoridad sigue donde estaba.
 */

import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AtajoAlLaboratorio } from '../components/AtajoAlLaboratorio';
import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { LogoQueEntra } from '../ui/Marca';
import { colores, espaciado, tipografia } from '../theme/tokens';
import { guardarUltimoRol, type RolMovil } from '../services/session';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

export default function SelectorDeRol() {
  const [guardando, setGuardando] = useState<RolMovil | null>(null);

  // SÓLO EN DESARROLLO, Y SÓLO A PROPÓSITO
  //
  // Esta pantalla era la raíz de la aplicación sin sesión. Ya no: el arranque
  // va al acceso real, y el rol lo decide el backend. Esto se queda como
  // herramienta del dueño para entrar al recorrido de diseño y al laboratorio,
  // alcanzable yendo a `/rol` expresamente. En release ni siquiera existe.
  if (!EN_DESARROLLO) return <Redirect href="/acceso" />;

  const elegir = (rol: RolMovil) => {
    setGuardando(rol);
    // Se recuerda la preferencia, pero la navegación NO espera al almacén: que
    // el disco vaya lento no debe dejar a nadie mirando un botón inerte.
    void guardarUltimoRol(rol).catch(() => {
      // Si no se puede recordar, la aplicación sigue funcionando: la próxima vez
      // se volverá a preguntar. No es motivo para bloquear la entrada.
    });
    // Al ACCESO, no directamente a la experiencia: sin sesión no hay nada que
    // enseñar, y entrar «como conductor» sin autenticarse no significa nada.
    router.push({ pathname: '/acceso', params: { rol } });
  };

  return (
    <Pantalla desplazable testID="selector-de-rol">
      {/* El logotipo oficial, con la moto. Aquí la marca estaba escrita como
          texto —«+58Express» en dos colores—, y existiendo el logotipo de
          verdad eso era quedarse corto justo en la pantalla que abre la
          aplicación. */}
      <View style={estilos.cabecera}>
        <LogoQueEntra ancho={214} />
        <Text style={estilos.lema}>Mototaxi en Maracaibo</Text>
      </View>

      <View style={estilos.cuerpo}>
        <Text style={estilos.pregunta} accessibilityRole="header">
          ¿Cómo quieres continuar?
        </Text>

        <View style={estilos.opciones}>
          <Boton
            testID="opcion-pasajero"
            titulo="Pasajero"
            descripcion="Pide una carrera y llega a donde vas"
            onPress={() => { elegir('passenger'); }}
            cargando={guardando === 'passenger'}
            deshabilitado={guardando !== null}
            etiquetaAccesible="Continuar como pasajero"
          />

          <Boton
            testID="opcion-conductor"
            titulo="Conductor"
            descripcion="Recibe carreras y gestiona tu jornada"
            variante="secundario"
            onPress={() => { elegir('driver'); }}
            cargando={guardando === 'driver'}
            deshabilitado={guardando !== null}
            etiquetaAccesible="Continuar como conductor"
          />
        </View>

        <Text style={estilos.nota}>
          Puedes cambiar de modo cuando quieras desde tu perfil.
        </Text>

        {/* Sólo en desarrollo: en release no dibuja nada. */}
        <AtajoAlLaboratorio />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { paddingTop: espaciado.xxxl, alignItems: 'center', gap: espaciado.md },
  lema: {
    color: colores.textoSecundario,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto
  },
  cuerpo: { flex: 1, justifyContent: 'center', gap: espaciado.xl, paddingVertical: espaciado.xxl },
  pregunta: {
    color: colores.textoPrimario,
    fontSize: tipografia.titulo.tamano,
    lineHeight: tipografia.titulo.alto,
    fontWeight: '700',
    textAlign: 'center'
  },
  opciones: { gap: espaciado.md },
  nota: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    textAlign: 'center'
  }
});
