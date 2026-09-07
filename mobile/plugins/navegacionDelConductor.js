/**
 * Lo que el Navigation SDK de Google exige del proyecto Android.
 *
 * POR QUÉ ESTO ES UN COMPLEMENTO Y NO UNA EDICIÓN DE android/
 *
 * `android/` se genera y se tira en cada prebuild. Cualquier arreglo escrito
 * allí dura hasta el siguiente y desaparece sin avisar: la compilación
 * siguiente falla por algo que «ya estaba arreglado». La configuración vive en
 * la configuración de Expo, y esto es un complemento de configuración.
 *
 * TRES COSAS, Y LA PRIMERA ES LA QUE IMPORTA
 *
 * 1. EXCLUIR play-services-maps.
 *
 *    El Navigation SDK trae DENTRO su propia copia del SDK de Mapas, con los
 *    mismos nombres de clase: `com.google.android.gms.maps.GoogleMap`,
 *    `CameraUpdate`, `CameraUpdateFactory`... Y `react-native-maps` arrastra
 *    `com.google.android.gms:play-services-maps`, que publica exactamente esas
 *    mismas clases. Con los dos en el classpath, `checkReleaseDuplicateClasses`
 *    para la compilación en seco:
 *
 *      Duplicate class com.google.android.gms.maps.CameraUpdate found in
 *      modules navigation-7.6.1 and play-services-maps-19.1.0
 *
 *    Se excluye el de Google Play Services y NO el del Navigation SDK, porque
 *    el segundo es el único que trae además el motor de navegación. Quien
 *    quedaba compilando contra `play-services-maps` --`react-native-maps` y
 *    `android-maps-utils`-- pasa a compilar contra la copia que va dentro del
 *    Navigation SDK. Son la misma API.
 *
 *    ESTO NO ES UNA CONFIGURACIÓN BENDECIDA POR GOOGLE. Su documentación dice
 *    que el Navigation SDK «reemplaza» al SDK de Mapas y que no se soporta
 *    usar `react-native-maps` a la vez. Lo hacemos porque la pasajera tiene un
 *    mapa que no vamos a reescribir en esta fase; el informe
 *    `agent-reports/driver-navigation-sdk.md` lleva el riesgo escrito.
 *
 * 2. ACTIVAR EL DESAZUCARADO DE LA BIBLIOTECA ESTÁNDAR.
 *
 *    El Navigation SDK usa APIs de Java 8+ --`java.time`, `java.nio`-- que en
 *    Android 7 y 8 no existen. Sin `coreLibraryDesugaringEnabled` la
 *    compilación pasa y la aplicación revienta en el teléfono al abrir la
 *    navegación. Google lo exige explícitamente «sea cual sea tu minSdk», y
 *    desde el SDK 7.5.0 pide la variante `_nio`, no la normal.
 *
 * 3. JETIFIER.
 *
 *    El wrapper oficial lo pide para que las dependencias de `androidx.car.app`
 *    --Android Auto-- resuelvan. Es lo único que se toca de gradle.properties.
 *
 * LO QUE NO HACE ESTE COMPLEMENTO
 *
 * La versión de Kotlin. Va en `expo-build-properties`, que es el sitio que
 * Expo ofrece para eso y que además la aplica a TODOS los módulos, no sólo al
 * de la aplicación. Escribirla aquí dejaría dos fuentes para el mismo número.
 */

// La variante `_nio`: la pide el Navigation SDK desde la 7.5.0. La normal
// compila igual y luego falta `java.nio.file` en tiempo de ejecución.
const DESAZUCARADO = 'com.android.tools:desugar_jdk_libs_nio:2.1.5';

// La copia del SDK de Mapas que sobra. Ver el punto 1 de arriba.
const GRUPO_DUPLICADO = 'com.google.android.gms';
const MODULO_DUPLICADO = 'play-services-maps';

// El que la sustituye. La versión tiene que ser LA MISMA que trae el wrapper
// oficial (`@googlemaps/react-native-navigation-sdk`), o acabarían dos
// versiones del Navigation SDK en el classpath y volvemos al duplicado.
const ARTEFACTO_DE_NAVEGACION = 'com.google.android.libraries.navigation:navigation:7.6.1';

const MARCA = '// plugins/navegacionDelConductor.js';

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function navegacionDelConductor(config) {
  const {
    withAppBuildGradle,
    withProjectBuildGradle,
    withGradleProperties,
  } = require('@expo/config-plugins');

  // --- 1. Excluir la copia duplicada del SDK de Mapas, en todo el proyecto ---
  // Va en el build.gradle raíz y no en el de la aplicación porque quien
  // arrastra `play-services-maps` es `react-native-maps`, que es OTRO módulo:
  // excluirlo sólo en `:app` deja la dependencia entrando por la puerta de al
  // lado y el duplicado sigue ahí.
  config = withProjectBuildGradle(config, (conf) => {
    if (conf.modResults.language !== 'groovy') {
      throw new Error(
        'el build.gradle raíz no es Groovy; este complemento no sabe editarlo'
      );
    }
    const gradle = conf.modResults.contents;
    if (gradle.includes(MARCA)) return conf; // el prebuild puede pasar dos veces

    const ancla = 'allprojects {';
    if (!gradle.includes(ancla)) {
      throw new Error('no encuentro el bloque allprojects en el build.gradle raíz');
    }

    conf.modResults.contents = gradle.replace(
      ancla,
      `${ancla}\n` +
        `  ${MARCA} — el Navigation SDK ya trae el SDK de Mapas dentro.\n` +
        '  //\n' +
        '  // SUSTITUIR, NO EXCLUIR. Excluir a secas compila el módulo de\n' +
        '  // navegación y rompe `react-native-maps`: el classpath es POR MÓDULO,\n' +
        '  // así que quitarle `play-services-maps` lo deja sin\n' +
        '  // `com.google.android.gms.maps.*` --100 errores de «package does not\n' +
        '  // exist»-- porque el AAR de navegación no está en SU classpath, sólo\n' +
        '  // en el del módulo de navegación y en el de la aplicación.\n' +
        '  // Sustituyendo, todo el que pedía el SDK de Mapas recibe el artefacto\n' +
        '  // de navegación, que trae esas mismas clases dentro.\n' +
        '  configurations.configureEach {\n' +
        '    resolutionStrategy.dependencySubstitution {\n' +
        `      substitute module('${GRUPO_DUPLICADO}:${MODULO_DUPLICADO}') \\\n` +
        `        using module('${ARTEFACTO_DE_NAVEGACION}') \\\n` +
        "        because 'el Navigation SDK ya trae el SDK de Mapas dentro'\n" +
        '    }\n' +
        '  }\n'
    );
    return conf;
  });

  // --- 2. Desazucarado de la biblioteca estándar ---
  config = withAppBuildGradle(config, (conf) => {
    let gradle = conf.modResults.contents;
    if (gradle.includes(DESAZUCARADO)) return conf;

    // 2a. La opción de compilación.
    //
    // La plantilla de Expo 57 NO trae `compileOptions`: comprobado sobre el
    // fichero generado. Así que hay dos caminos, y se contemplan los dos
    // porque una plantilla futura podría traerlo y entonces crear un segundo
    // bloque sería un error de sintaxis de Groovy.
    const bloqueExistente = 'compileOptions {';
    if (gradle.includes(bloqueExistente)) {
      gradle = gradle.replace(
        bloqueExistente,
        `${bloqueExistente}\n        ${MARCA} — el Navigation SDK usa APIs de Java 8+\n` +
          '        coreLibraryDesugaringEnabled true'
      );
    } else {
      const anclaAndroid = 'android {\n';
      if (!gradle.includes(anclaAndroid)) {
        throw new Error('no encuentro el bloque android en el build.gradle de la aplicación');
      }
      gradle = gradle.replace(
        anclaAndroid,
        `${anclaAndroid}    ${MARCA} — el Navigation SDK usa APIs de Java 8+\n` +
          '    compileOptions {\n' +
          '        coreLibraryDesugaringEnabled true\n' +
          '    }\n'
      );
    }

    // 2b. La dependencia que lo implementa.
    const anclaDeps = 'dependencies {';
    if (!gradle.includes(anclaDeps)) {
      throw new Error('no encuentro dependencies en el build.gradle de la aplicación');
    }
    gradle = gradle.replace(
      anclaDeps,
      `${anclaDeps}\n    ${MARCA}\n    coreLibraryDesugaring '${DESAZUCARADO}'`
    );

    conf.modResults.contents = gradle;
    return conf;
  });

  // --- 3. Jetifier, que pide el wrapper oficial ---
  config = withGradleProperties(config, (conf) => {
    const yaEsta = conf.modResults.some(
      (linea) => linea.type === 'property' && linea.key === 'android.enableJetifier'
    );
    if (!yaEsta) {
      conf.modResults.push({
        type: 'comment',
        value: 'plugins/navegacionDelConductor.js — lo pide el wrapper del Navigation SDK',
      });
      conf.modResults.push({
        type: 'property',
        key: 'android.enableJetifier',
        value: 'true',
      });
    }
    return conf;
  });

  return config;
};
