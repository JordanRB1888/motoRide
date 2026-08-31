/**
 * Arranque.
 *
 * Decide la primera pantalla y no hace nada más. Lee si hay un rol recordado y
 * redirige; si no lo hay, al selector.
 *
 * LO QUE ESTA PANTALLA NO HACE
 *
 * · No pide permisos. Ni ubicación, ni notificaciones, ni cámara. Un permiso
 *   pedido nada más abrir, sin contexto, se deniega — y una vez denegado
 *   volverlo a pedir cuesta mucho más. Cada permiso se pedirá cuando la función
 *   que lo necesita esté a la vista.
 * · No llama al backend. Todavía no hay sesión que validar.
 * · No concede nada. El rol recordado es una preferencia de navegación.
 */

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Pantalla } from '../components/Pantalla';
import { colores } from '../theme/tokens';
import { leerUltimoRol, type RolMovil } from '../services/session';

type Destino = { readonly listo: false } | { readonly listo: true; readonly rol: RolMovil | null };

export default function Arranque() {
  const [destino, setDestino] = useState<Destino>({ listo: false });

  useEffect(() => {
    let vigente = true;
    // El almacén seguro es asíncrono; si la pantalla se desmonta antes de que
    // responda, no se toca el estado.
    leerUltimoRol()
      .then(rol => { if (vigente) setDestino({ listo: true, rol }); })
      .catch(() => { if (vigente) setDestino({ listo: true, rol: null }); });
    return () => { vigente = false; };
  }, []);

  if (!destino.listo) {
    return (
      <Pantalla testID="arranque">
        <View style={estilos.centro}>
          <ActivityIndicator color={colores.acento} size="large" />
        </View>
      </Pantalla>
    );
  }

  if (destino.rol === 'passenger') return <Redirect href="/pasajero" />;
  if (destino.rol === 'driver') return <Redirect href="/conductor" />;
  return <Redirect href="/rol" />;
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
