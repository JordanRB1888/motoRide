/**
 * «Tus datos»: editar el perfil.
 *
 * QUÉ SE PUEDE EDITAR Y POR QUÉ SÓLO ESO
 *
 * Exactamente los campos que `PATCH /api/auth/me` acepta, ni uno más. El correo
 * no está en esa lista, así que aquí se enseña y NO se puede tocar: un campo
 * editable cuyo cambio se pierde al recargar es peor que un campo bloqueado.
 *
 * LO QUE ESCRIBISTE NO SE PIERDE
 *
 * Si el servidor rechaza el cambio, el formulario se queda como estaba, con lo
 * escrito y el error donde toca. Vaciarlo obligaría a teclearlo todo otra vez
 * justo cuando ya salió algo mal.
 *
 * Y NO SE MANDA DOS VECES
 *
 * Mientras hay una petición en marcha el botón está en «guardando» y no
 * responde. Sin eso, dos toques seguidos crean dos peticiones y la segunda
 * puede llegar antes que la primera.
 *
 * LA VALIDACIÓN DE AQUÍ ES COMODIDAD
 *
 * Avisa antes de la ida y vuelta, con las MISMAS reglas del servidor y ni una
 * más. Quien decide es él: su respuesta pisa lo que esta pantalla creyera.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Boton, Txt } from '../ui/componentes';
import { IconoAnimado } from '../ui/IconoAnimado';
import { Campo } from '../ui/Campo';
import { useTema } from '../theme/ThemeContext';
import { CabeceraAmarilla } from './pantallasSaldo';
import {
  borradorDe,
  cambiosDePerfil,
  camposEditables,
  hayCambios,
  validarBorrador,
  type BorradorDePerfil,
  type CampoDePerfil,
  type ErroresDeCampo,
  type PerfilDeUsuario
} from '../domain/perfil';

/** Cómo se llama cada campo en pantalla, y qué teclado le toca. */
const ETIQUETAS: Record<CampoDePerfil, { readonly etiqueta: string; readonly ayuda?: string }> = {
  firstName: { etiqueta: 'Nombre' },
  lastName: { etiqueta: 'Apellido' },
  phone: { etiqueta: 'Teléfono', ayuda: 'Con el código del país, sin espacios.' },
  cedula: { etiqueta: 'Cédula' },
  vehicleBrand: { etiqueta: 'Marca del vehículo' },
  vehicleModel: { etiqueta: 'Modelo' },
  vehiclePlate: { etiqueta: 'Placa' },
  vehicleColor: { etiqueta: 'Color' }
};

export function C2TusDatos({ perfil, onVolver, onGuardar }: {
  readonly perfil: PerfilDeUsuario;
  readonly onVolver?: () => void;
  /** Devuelve los errores por campo, o `null` si se guardó bien. */
  readonly onGuardar?: (cambios: BorradorDePerfil) => Promise<ErroresDeCampo | null>;
}) {
  const tema = useTema();
  const [borrador, setBorrador] = useState<BorradorDePerfil>(() => borradorDe(perfil));
  const [errores, setErrores] = useState<ErroresDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fotoPulsada, setFotoPulsada] = useState(false);

  const campos = camposEditables(perfil.role);
  const modificado = hayCambios(perfil, borrador);

  async function guardar() {
    if (guardando) return;

    const problemas = validarBorrador(borrador);
    if (Object.keys(problemas).length > 0) {
      setErrores(problemas);
      setAviso(null);
      return;
    }

    setGuardando(true);
    setErrores({});
    setAviso(null);
    try {
      const resultado = await onGuardar?.(cambiosDePerfil(perfil, borrador));
      if (resultado === null || resultado === undefined) {
        setAviso('Guardado.');
        return;
      }
      setErrores(resultado);
      // Un error sin campo concreto —sin red, servidor caído— no puede quedar
      // mudo: sin esto la pantalla parecería no haber hecho nada.
      if (Object.keys(resultado).length === 0) {
        setAviso('No se pudo guardar. Vuelve a intentarlo.');
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tema.ritmo.entreBloques * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <CabeceraAmarilla>
          <Txt nivel="titulo" tono="sobreAcento" accessibilityRole="header">Tus datos</Txt>
          <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
            Lo que ve quien te lleva
          </Txt>
        </CabeceraAmarilla>

        <View style={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: tema.ritmo.entreBloques,
          gap: tema.ritmo.entreElementos
        }}>
          {/* Foto de perfil y botón para cambiarla */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              borderWidth: 2.5,
              borderColor: tema.color.acento,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tema.color.superficieElevada,
              shadowColor: tema.color.acento,
              shadowOpacity: 0.2,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4
            }}>
              <Txt nivel="titulo" estilo={{ fontSize: 28, fontWeight: '800' }}>
                {(perfil.firstName.slice(0, 1) + perfil.lastName.slice(0, 1)).toUpperCase()}
              </Txt>

              <View style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: tema.color.acento,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: tema.color.fondo
              }}>
                <IconoAnimado
                  nombre="imagen"
                  color="#111827"
                  tamano={15}
                  reaccionando={fotoPulsada}
                  variante="pulso"
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cambiar foto de perfil"
              onPressIn={() => setFotoPulsada(true)}
              onPressOut={() => setFotoPulsada(false)}
              onPress={() => undefined}
              style={({ pressed }) => ({
                marginTop: 10,
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: pressed ? `${tema.color.acento}18` : 'transparent'
              })}
            >
              <Txt nivel="pie" tono="acento" estilo={{ fontWeight: '700' }}>
                Cambiar foto de perfil
              </Txt>
            </Pressable>
          </View>

          {campos.map(campo => (
            <Campo
              key={campo}
              etiqueta={ETIQUETAS[campo].etiqueta}
              ayuda={ETIQUETAS[campo].ayuda}
              error={errores[campo] ?? null}
              value={borrador[campo] ?? ''}
              editable={!guardando}
              autoCapitalize={campo === 'vehiclePlate' ? 'characters' : 'words'}
              keyboardType={campo === 'phone' ? 'phone-pad' : 'default'}
              onChangeText={texto => setBorrador(actual => ({ ...actual, [campo]: texto }))}
            />
          ))}

          {/* El correo se enseña y no se toca: `PATCH /api/auth/me` no lo
              acepta, y un campo que parece editable y no guarda es una
              promesa rota cada vez que alguien lo intenta. */}
          <Campo
            etiqueta="Correo"
            value={perfil.email}
            editable={false}
            ayuda="Para cambiarlo, escríbenos desde Ayuda."
          />

          {aviso !== null ? (
            <View accessibilityLiveRegion="polite">
              <Txt nivel="pie" tono={aviso === 'Guardado.' ? 'exito' : 'peligro'}>{aviso}</Txt>
            </View>
          ) : null}

          <View style={{ gap: tema.ritmo.entreElementos, marginTop: tema.ritmo.entreElementos }}>
            <Boton
              titulo="Guardar cambios"
              cargando={guardando}
              deshabilitado={!modificado}
              onPress={() => { void guardar(); }}
            />
            <Boton titulo="Volver" variante="secundario" onPress={onVolver ?? (() => undefined)} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
