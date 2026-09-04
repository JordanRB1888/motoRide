/**
 * Seguridad de la cuenta: con qué entras, y cómo te vas.
 *
 * POR QUÉ EXISTE
 *
 * El perfil llevaba tiempo con la fila «Seguridad de la cuenta · Contraseña y
 * sesiones abiertas» y no llevaba a ninguna parte. Ahora enseña lo que de
 * verdad hay: los métodos con los que se entra y la puerta de salida.
 *
 * LO QUE NO SE ENSEÑA
 *
 * Ningún identificador interno. El servidor devuelve qué proveedores están
 * vinculados, no sus `providerSubject`, y aquí no se pinta nada que no venga
 * de ahí.
 *
 * BORRAR NO ES UN TOQUE
 *
 * Tres pasos, y ninguno engañoso: se dice qué se pierde y qué se conserva, se
 * pide la contraseña —una sesión de siete días no basta para algo
 * irreversible— y sólo entonces se borra. El botón de borrar no es el más
 * llamativo de la pantalla, y el de cancelar está siempre a mano.
 */

import { useCallback, useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { Pantalla } from '../components/Pantalla';
import { Boton } from '../components/Boton';
import { Txt } from '../ui/componentes';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { consultarMetodos, desvincular, eliminarCuenta } from '../services/seguridad';
import {
  CONSECUENCIAS_DEL_BORRADO,
  MOTIVO_ULTIMO_METODO,
  TEXTO_DEL_ESTADO,
  estadoDelMetodo,
  sePuedeDesvincular,
  type EstadoDeSeguridad,
  type MetodosDeEntrada,
  type ProveedorSocial
} from '../domain/seguridadDeCuenta';

const NOMBRE: Record<ProveedorSocial, string> = { GOOGLE: 'Google', APPLE: 'Apple' };

export default function Seguridad() {
  const tema = useTema();
  const { sesion, salir } = useSesion();

  const [estado, setEstado] = useState<EstadoDeSeguridad>('CARGANDO');
  const [metodos, setMetodos] = useState<MetodosDeEntrada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // El borrado, en tres pasos. `null` es «ni empezado».
  const [borrando, setBorrando] = useState<'AVISO' | 'CONTRASENA' | 'EN_CURSO' | null>(null);
  const [contrasena, setContrasena] = useState('');

  const cargar = useCallback(async () => {
    setEstado('CARGANDO');
    const resultado = await consultarMetodos();
    setEstado(resultado.estado);
    setMetodos(resultado.metodos ?? null);
    setAviso(resultado.mensaje ?? null);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const quitar = useCallback(async (proveedor: ProveedorSocial) => {
    setAviso(null);
    const resultado = await desvincular(proveedor);
    if (!resultado.ok) {
      setAviso(resultado.mensaje ?? null);
      return;
    }
    // Tras una mutación se vuelve a preguntar: la lista no se cachea como
    // autoridad de nada.
    await cargar();
  }, [cargar]);

  const borrar = useCallback(async () => {
    setBorrando('EN_CURSO');
    setAviso(null);
    const resultado = await eliminarCuenta(contrasena);
    setContrasena('');
    if (!resultado.ok) {
      setBorrando('CONTRASENA');
      setAviso(resultado.mensaje ?? null);
      return;
    }
    // La cuenta ya no existe: se cierra la sesión local y se vuelve al
    // principio. El token tampoco valdría, pero dejarlo guardado sería dejar
    // basura en el teléfono.
    await salir();
    router.replace('/');
  }, [contrasena, salir]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return (
      <Pantalla>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={tema.color.acento} size="large" />
        </View>
      </Pantalla>
    );
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  return (
    <Pantalla testID="pantalla-seguridad">
      <View style={{ flex: 1, gap: 18, paddingTop: 8 }}>
        <Txt nivel="titulo" accessibilityRole="header">Seguridad de la cuenta</Txt>

        {estado === 'CARGANDO' ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }} testID="seguridad-cargando">
            <ActivityIndicator color={tema.color.acento} />
          </View>
        ) : null}

        {estado === 'SIN_CONEXION' || estado === 'ERROR' ? (
          <View style={{ gap: 12 }} testID="seguridad-error" accessibilityRole="alert">
            <Txt nivel="cuerpo" tono="secundario">{aviso}</Txt>
            <Boton titulo="Reintentar" onPress={() => { void cargar(); }} />
          </View>
        ) : null}

        {estado === 'LISTO' && metodos !== null ? (
          <>
            <View style={{ gap: 10 }} testID="metodos-de-entrada">
              <Txt nivel="pie" tono="tenue">CÓMO ENTRAS</Txt>

              <Fila
                titulo="Contraseña"
                detalle={metodos.password ? 'Activa' : 'Sin contraseña'}
              />

              {metodos.providers.map(metodo => {
                const suEstado = estadoDelMetodo(metodo);
                const puedeQuitar = sePuedeDesvincular(metodos, metodo.provider);
                return (
                  <Fila
                    key={metodo.provider}
                    titulo={NOMBRE[metodo.provider]}
                    detalle={TEXTO_DEL_ESTADO[suEstado]}
                    accion={
                      suEstado === 'VINCULADO'
                        ? {
                            texto: 'Quitar',
                            onPress: () => { void quitar(metodo.provider); },
                            deshabilitado: !puedeQuitar,
                            pista: puedeQuitar ? undefined : MOTIVO_ULTIMO_METODO
                          }
                        : undefined
                    }
                  />
                );
              })}

              {metodos.providers.every(p => !p.linked) ? (
                <View testID="sin-metodos-sociales">
                  <Txt nivel="pie" tono="tenue">No tienes métodos sociales vinculados.</Txt>
                </View>
              ) : null}
            </View>

            {aviso !== null && borrando === null ? (
              <Txt nivel="pie" tono="secundario" accessibilityRole="text">{aviso}</Txt>
            ) : null}

            {/* --------------------------------------------------------- */}
            {/* Eliminar la cuenta                                        */}
            {/* --------------------------------------------------------- */}
            <View style={{ gap: 10, marginTop: 8 }} testID="eliminar-cuenta">
              <Txt nivel="pie" tono="tenue">TU CUENTA</Txt>

              {borrando === null ? (
                <Pressable
                  onPress={() => setBorrando('AVISO')}
                  accessibilityRole="button"
                  testID="empezar-borrado"
                  style={{ paddingVertical: 12 }}
                >
                  <Txt nivel="cuerpo" tono="peligro">Eliminar mi cuenta</Txt>
                </Pressable>
              ) : null}

              {borrando === 'AVISO' ? (
                <View style={{ gap: 10 }} testID="consecuencias-del-borrado">
                  {CONSECUENCIAS_DEL_BORRADO.map(linea => (
                    <Txt key={linea} nivel="cuerpo" tono="secundario">· {linea}</Txt>
                  ))}
                  <Boton titulo="Continuar" onPress={() => setBorrando('CONTRASENA')} />
                  <Pressable onPress={() => setBorrando(null)} accessibilityRole="button" testID="cancelar-borrado">
                    <Txt nivel="cuerpo" centrado>Cancelar</Txt>
                  </Pressable>
                </View>
              ) : null}

              {borrando === 'CONTRASENA' || borrando === 'EN_CURSO' ? (
                <View style={{ gap: 10 }} testID="confirmar-borrado">
                  <Txt nivel="cuerpo" tono="secundario">
                    Escribe tu contraseña para confirmar que eres tú.
                  </Txt>
                  <TextInput
                    value={contrasena}
                    onChangeText={setContrasena}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Contraseña"
                    placeholderTextColor={tema.color.textoTenue}
                    testID="contrasena-borrado"
                    style={{
                      borderWidth: 1,
                      borderColor: tema.color.borde,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: tema.color.textoPrimario
                    }}
                  />
                  {aviso !== null ? (
                    <Txt nivel="pie" tono="peligro" accessibilityRole="text">{aviso}</Txt>
                  ) : null}
                  <Boton
                    titulo="Eliminar mi cuenta"
                    onPress={() => { void borrar(); }}
                    cargando={borrando === 'EN_CURSO'}
                    deshabilitado={contrasena === '' || borrando === 'EN_CURSO'}
                  />
                  <Pressable
                    onPress={() => { setBorrando(null); setContrasena(''); setAviso(null); }}
                    accessibilityRole="button"
                    testID="cancelar-confirmacion"
                  >
                    <Txt nivel="cuerpo" centrado>Cancelar</Txt>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    </Pantalla>
  );
}

/** Una fila de método, con su acción si la tiene. */
function Fila({ titulo, detalle, accion }: {
  readonly titulo: string;
  readonly detalle: string;
  readonly accion?: {
    readonly texto: string;
    readonly onPress: () => void;
    readonly deshabilitado: boolean;
    readonly pista?: string;
  };
}) {
  const tema = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: tema.color.borde
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo">{titulo}</Txt>
        <Txt nivel="pie" tono="tenue">{detalle}</Txt>
        {accion?.pista !== undefined ? (
          <Txt nivel="pie" tono="tenue">{accion.pista}</Txt>
        ) : null}
      </View>
      {accion !== undefined ? (
        <Pressable
          onPress={accion.onPress}
          disabled={accion.deshabilitado}
          accessibilityRole="button"
          accessibilityState={{ disabled: accion.deshabilitado }}
          testID={`quitar-${titulo.toLowerCase()}`}
          hitSlop={8}
        >
          <Txt nivel="cuerpo" tono={accion.deshabilitado ? 'tenue' : 'acento'}>{accion.texto}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
