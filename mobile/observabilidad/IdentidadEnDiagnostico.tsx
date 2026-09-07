/**
 * Le dice al diagnóstico de quién son los errores, observando la sesión desde
 * fuera.
 *
 * POR QUÉ NO VA DENTRO DE `AuthContext`
 *
 * Porque ese fichero maneja contraseñas, y hay una prueba que le prohíbe
 * cualquier vía hacia un reportador de errores o una analítica
 * --`test/registro.test.mjs`--. La prueba tiene razón aunque la llamada
 * concreta fuera inocente: lo que protege es que nadie pueda, más adelante,
 * añadir «un poco de contexto» a un evento en el mismo sitio donde vive la
 * contraseña en claro. La separación vale más que la comodidad de una línea.
 *
 * Así que la sesión se OBSERVA desde aquí. Este componente no pinta nada; sólo
 * existe para tener un sitio con acceso a la sesión y ninguna relación con las
 * credenciales.
 *
 * QUÉ SE PUBLICA
 *
 * El identificador y el rol. Nada más. El id es opaco y sirve para ver que doce
 * eventos son de la misma persona, que es lo que hace falta para entender un
 * fallo; el correo no añade nada a eso y sí es un dato personal.
 */

import { useEffect } from 'react';

import { useSesion } from '../context/AuthContext';
import { identificarUsuario } from './sentry';

export function IdentidadEnDiagnostico(): null {
  const { sesion } = useSesion();
  const id = sesion.estado === 'AUTENTICADO' ? sesion.usuario.id : null;
  const rol = sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null;

  useEffect(() => {
    // Al salir se limpia. Sin esto, los errores de quien entre después en el
    // mismo teléfono se le atribuirían a quien estaba antes.
    identificarUsuario(id !== null && rol !== null ? { id, role: rol } : null);
  }, [id, rol]);

  return null;
}
