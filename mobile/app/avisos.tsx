/**
 * La bandeja de avisos REAL.
 *
 * EL ORDEN DE LAS COSAS AL TOCAR UN AVISO
 *
 * Primero se marca leído, después se refleja en pantalla, y sólo entonces se
 * navegaría —si hubiera a dónde—. Al revés, quien toca un aviso saldría de la
 * lista sin saber si quedó marcado, y volvería a encontrárselo sin leer.
 *
 * Hoy no se navega a ninguna parte: el servidor no manda destino con las
 * notificaciones. Está explicado en `domain/avisos.ts`.
 *
 * EL SERVIDOR MANDA, PERO LA PANTALLA NO ESPERA
 *
 * Marcar leído se pinta en cuanto se toca, sin esperar la respuesta: en una red
 * lenta, ver el punto amarillo durante dos segundos después de tocar se lee
 * como que no funcionó. Si el servidor lo rechaza, se deshace y se avisa.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';

import { C2Avisos, type AvisoEnPantalla } from '../preview/pantallasC2Secciones';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useSesion } from '../context/AuthContext';
import { useAvisosEnVivo } from '../realtime/avisosEnVivo';
import { marcarLeido, marcarTodosLeidos, pedirAvisos } from '../services/avisos';
import { shellDelRol } from '../domain/shellDeRol';
import {
  conAvisoLeido,
  conTodosLeidos,
  cuandoFue,
  destinoDeAviso,
  type Aviso
} from '../domain/avisos';

export default function PantallaDeAvisos() {
  const { sesion } = useSesion();
  const barraDelRol = shellDelRol(sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null) === 'conductor' ? 'conductor' : 'pasajera';

  const [avisos, setAvisos] = useState<readonly Aviso[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  // Los que ya tienen una petición en vuelo. Sin esto, tocar dos veces el mismo
  // aviso manda dos PATCH idénticos.
  const enVuelo = useRef(new Set<string>());
  const leyendoTodos = useRef(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const respuesta = await pedirAvisos();
    if (!respuesta.ok) {
      // Un fallo de red no cierra la sesión: sólo se pinta el estado de error.
      setEstado('error');
      return;
    }
    setAvisos(respuesta.datos);
    setEstado('listo');
  }, []);

  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO') void cargar();
  }, [sesion.estado, cargar]);

  // En vivo. El evento no se pinta: dispara la MISMA carga por HTTP, que es la
  // autoridad. Así no hay dos caminos para los datos ni forma de duplicar un
  // aviso, y la reconexión usa exactamente el mismo camino.
  useAvisosEnVivo(() => { void cargar(); });

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <C2Avisos estado="cargando" barra={barraDelRol} />;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  async function tocar(id: string) {
    const aviso = avisos.find(item => item.id === id);
    if (aviso === undefined) return;

    // 1. Marcar leído, si hace falta y no hay ya una petición para éste.
    if (aviso.sinLeer && !enVuelo.current.has(id)) {
      enVuelo.current.add(id);
      const antes = avisos;
      setAvisos(actual => conAvisoLeido(actual, id));

      const respuesta = await marcarLeido(id);
      enVuelo.current.delete(id);

      if (!respuesta.ok) {
        // Se deshace: enseñar como leído algo que el servidor no marcó haría
        // que el aviso reapareciera solo al recargar, y eso desconcierta más
        // que el punto amarillo.
        setAvisos(antes);
        return;
      }
    }

    // 2. Navegar SÓLO a un destino de la lista blanca. Hoy no hay ninguno.
    const destino = destinoDeAviso(aviso);
    if (destino !== null) router.push(`/${destino}` as never);
  }

  async function leerTodos() {
    if (leyendoTodos.current) return;
    leyendoTodos.current = true;
    const antes = avisos;
    // `conTodosLeidos` no depende del estado anterior, así que da igual si
    // llega antes o después de un «marcar uno» que siga en vuelo.
    setAvisos(actual => conTodosLeidos(actual));

    const respuesta = await marcarTodosLeidos();
    leyendoTodos.current = false;
    if (!respuesta.ok) setAvisos(antes);
  }

  const enPantalla: readonly AvisoEnPantalla[] = avisos.map(aviso => ({
    clave: aviso.id,
    titulo: aviso.titulo,
    detalle: aviso.mensaje,
    cuando: cuandoFue(aviso.cuando),
    sinLeer: aviso.sinLeer,
    // El galón sólo donde hay destino de verdad.
    navegable: destinoDeAviso(aviso) !== null
  }));

  function irA(clave: string) {
    if (clave === 'inicio') router.replace(barraDelRol === 'conductor' ? '/conductor' : '/pasajero');
    if (clave === 'historial') router.replace('/historial');
    if (clave === 'saldo') router.replace(barraDelRol === 'conductor' ? '/conductor-saldo' : '/saldo');
    if (clave === 'perfil') router.replace('/perfil');
  }

  return (
    <ProveedorDeNavegacion ir={irA}>
      <C2Avisos
        barra={barraDelRol}
        avisos={enPantalla}
        estado={estado}
        // El pie del diseño promete que cada aviso lleva a donde pasó. Con
        // datos reales eso todavía no es cierto, y prometerlo se nota al primer
        // toque que no hace nada.
        pie="Aquí queda lo que te hemos avisado."
        onAviso={clave => { void tocar(clave); }}
        onLeerTodos={() => { void leerTodos(); }}
        onReintentar={() => { void cargar(); }}
      />
    </ProveedorDeNavegacion>
  );
}
