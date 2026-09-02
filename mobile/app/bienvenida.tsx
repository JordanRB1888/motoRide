/**
 * «¿Cómo quieres continuar?» — la primera pantalla REAL sin sesión.
 *
 * ESTO ES NAVEGACIÓN, NO AUTORIZACIÓN
 *
 * Elegir «Conductor» aquí no convierte a nadie en conductor. Se recuerda como
 * preferencia de navegación y se pasa al acceso como CONTEXTO; el backend no
 * la ve nunca. Quien entra va a donde su cuenta diga.
 *
 * CON SESIÓN, NO EXISTE
 *
 * Si hay una sesión confirmada, esta pantalla se quita de en medio y deja que
 * la raíz resuelva la casa. Restaurar sesión nunca pasa por aquí.
 *
 * AL VOLVER, LA MOTO VUELVE
 *
 * La moto se va al continuar. Si la persona vuelve atrás desde el acceso, la
 * pantalla se vuelve a montar entera —cambia su `key`— y el logotipo entra
 * otra vez, en vez de encontrarse una placa vacía.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';

import { Bienvenida } from '../ui/Bienvenida';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { guardarUltimoRol, leerUltimoRol } from '../services/session';
import {
  DOCUMENTOS_LEGALES,
  INTENCION_POR_DEFECTO,
  esIntencionDeEntrada,
  type ClaveDeDocumentoLegal,
  type IntencionDeEntrada
} from '../domain/entrada';

export default function PantallaDeBienvenida() {
  const tema = useTema();
  const { sesion } = useSesion();

  // `undefined` mientras se lee; `null` si no hay nada recordado.
  const [recordada, setRecordada] = useState<IntencionDeEntrada | null | undefined>(undefined);
  const [visita, setVisita] = useState(0);
  const primeraVisita = useRef(true);

  useEffect(() => {
    let vigente = true;
    leerUltimoRol()
      .then(rol => { if (vigente) setRecordada(esIntencionDeEntrada(rol) ? rol : null); })
      .catch(() => { if (vigente) setRecordada(null); });
    return () => { vigente = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    // La primera vez ya está recién montada: remontarla sería animar dos veces.
    if (primeraVisita.current) {
      primeraVisita.current = false;
      return;
    }
    setVisita(anterior => anterior + 1);
  }, []));

  // Con sesión, la raíz decide la casa. Aquí no se enseña ningún selector.
  if (sesion.estado === 'AUTENTICADO') return <Redirect href="/" />;

  if (recordada === undefined) {
    return <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID="bienvenida-cargando" />;
  }

  const continuar = (intencion: IntencionDeEntrada) => {
    // Se recuerda, pero la navegación NO espera al almacén: que el disco vaya
    // lento no debe dejar a nadie mirando una placa vacía.
    void guardarUltimoRol(intencion).catch(() => {
      // Si no se puede recordar, la próxima vez se vuelve a preguntar.
    });
    // Al ACCESO, con la intención como contexto. Nunca directamente a una
    // casa: sin sesión no hay nada que enseñar.
    router.push({ pathname: '/acceso', params: { intencion } });
  };

  const abrir = (documento: ClaveDeDocumentoLegal) => {
    router.push(DOCUMENTOS_LEGALES[documento].ruta);
  };

  return (
    <Bienvenida
      key={visita}
      intencionInicial={recordada ?? INTENCION_POR_DEFECTO}
      onContinuarConCorreo={continuar}
      onAbrirDocumento={abrir}
    />
  );
}
