/** Los Términos y Condiciones. La ruta enlazada desde la bienvenida. */

import { router } from 'expo-router';

import { DocumentoLegal } from '../../ui/DocumentoLegal';

export default function Pantalla() {
  return <DocumentoLegal clave="terminos" onVolver={() => { router.back(); }} />;
}
