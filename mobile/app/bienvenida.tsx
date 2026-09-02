/**
 * «¿Cómo quieres continuar?» — la primera pantalla REAL sin sesión.
 *
 * ESTO ES NAVEGACIÓN, NO AUTORIZACIÓN
 *
 * Pulsar «Conductor» no convierte a nadie en conductor. Se recuerda como
 * preferencia y se pasa al acceso como CONTEXTO; el backend no la ve nunca.
 * Quien entra va a donde su cuenta diga.
 *
 * CON SESIÓN, NO EXISTE
 *
 * Si hay una sesión confirmada, esta pantalla se quita de en medio y deja que
 * la raíz resuelva la casa. Restaurar sesión nunca pasa por aquí.
 *
 * AL VOLVER, LA MOTO VUELVE
 *
 * La moto se va al pulsar una tarjeta. Si la persona vuelve atrás desde el
 * acceso, la pantalla se vuelve a montar entera —cambia su `key`— y el
 * logotipo entra otra vez, en vez de encontrarse una placa vacía.
 */

import { useCallback, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';

import { Bienvenida } from '../ui/Bienvenida';
import { useSesion } from '../context/AuthContext';
import { guardarUltimoRol } from '../services/session';
import {
  DOCUMENTOS_LEGALES,
  type ClaveDeDocumentoLegal,
  type IntencionDeEntrada
} from '../domain/entrada';

export default function PantallaDeBienvenida() {
  const { sesion } = useSesion();
  const [visita, setVisita] = useState(0);
  const primeraVisita = useRef(true);

  useFocusEffect(useCallback(() => {
    // La primera vez ya está recién montada: remontarla sería animar dos veces.
    if (primeraVisita.current) {
      primeraVisita.current = false;
      return;
    }
    setVisita(anterior => anterior + 1);
  }, []));

  // Con sesión, la raíz decide la casa. Aquí no se enseña ninguna puerta.
  if (sesion.estado === 'AUTENTICADO') return <Redirect href="/" />;

  const elegir = (intencion: IntencionDeEntrada) => {
    // Se recuerda, pero la navegación NO espera al almacén: que el disco vaya
    // lento no debe dejar a nadie mirando una placa vacía.
    void guardarUltimoRol(intencion).catch(() => {
      // Si no se puede recordar, no pasa nada: aquí no se preselecciona nada.
    });
    // Al ACCESO, con la intención como contexto. Nunca directamente a una
    // casa: sin sesión no hay nada que enseñar.
    router.push({ pathname: '/acceso', params: { intencion } });
  };

  const abrir = (documento: ClaveDeDocumentoLegal) => {
    router.push(DOCUMENTOS_LEGALES[documento].ruta);
  };

  return <Bienvenida key={visita} onElegir={elegir} onAbrirDocumento={abrir} />;
}
