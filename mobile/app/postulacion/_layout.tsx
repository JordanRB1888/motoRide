/**
 * El flujo de postulación a conductor: un cubo de estado y una pila de pasos.
 *
 * Las pantallas de aquí son FUNCIONALES: cablean el dominio y los servicios
 * de la postulación contra el backend real, con los componentes que ya
 * existen. El aspecto definitivo es del trabajo de diseño en `ui/`; cuando
 * llegue, sustituye lo visual sin tocar el cableado.
 */

import { Stack } from 'expo-router';

import { ProveedorDePostulacion } from '../../context/PostulacionContext';

export default function DisposicionDePostulacion() {
  return (
    <ProveedorDePostulacion>
      <Stack screenOptions={{ headerShown: false }} />
    </ProveedorDePostulacion>
  );
}
