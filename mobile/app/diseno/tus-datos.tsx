/**
 * «Tus datos», para poder MIRARLA sin sesión.
 *
 * La pantalla de verdad vive en `/perfil-datos`, detrás de la guarda, y sólo se
 * puede abrir con el backend levantado. Ésta es la misma pieza con un perfil de
 * ejemplo: sirve para revisar el diseño, no para editar nada.
 *
 * Guardar aquí no llama a ninguna API —no hay `onGuardar`— así que la pantalla
 * responde como si el servidor no hubiera contestado. Es deliberado: el
 * recorrido de diseño no habla con ningún servidor.
 */

import { C2TusDatos } from '../../preview/pantallaTusDatos';
import type { PerfilDeUsuario } from '../../domain/perfil';

const PERFIL_DE_EJEMPLO: PerfilDeUsuario = {
  id: 'demo',
  role: 'passenger',
  firstName: 'Demo',
  lastName: 'Pasajera',
  email: 'demo@ejemplo.com',
  phone: '+58 000 000 0000',
  cedula: '00000000',
  isVerified: true,
  accountStatus: 'ACTIVE',
  photoUrl: null,
  createdAt: '',
  vehicleBrand: '',
  vehicleModel: '',
  vehiclePlate: '',
  vehicleColor: ''
};

export default function Pantalla() {
  return <C2TusDatos perfil={PERFIL_DE_EJEMPLO} />;
}
