/**
 * Windows corta las rutas de compilación a 260 caracteres.
 *
 * Los objetos del codegen de C++ llevan la ruta del fichero fuente dentro del
 * propio nombre. El peor caso hoy es este:
 *
 *   .cxx/Debug/<hash>/x86_64/rngesturehandler_codegen_autolinked_build/
 *   CMakeFiles/react_codegen_rngesturehandler_codegen.dir/<ruta del proyecto>/
 *   node_modules/react-native-gesture-handler/shared/shadowNodes/react/renderer/
 *   components/rngesturehandler_codegen/RNGestureHandlerDetectorShadowNode.cpp.o
 *
 * Con el proyecto en una carpeta de nombre largo eso pasa de 260 y ninja falla
 * con «Filename longer than 260 characters». Da igual que Windows tenga
 * `LongPathsEnabled` a 1 —en esta máquina lo está—: ninja no usa las rutas
 * largas de todos modos.
 *
 * POR QUÉ AQUÍ Y NO EN android/
 *
 * `android/` se genera y se tira en cada prebuild. Arreglarlo allí dura hasta
 * el siguiente. La configuración vive en la configuración de Expo, y esto es
 * un complemento de configuración: se aplica cada vez que se genera.
 *
 * POR QUÉ HACE FALTA UNA VARIABLE
 *
 * La ruta corta depende de la máquina, así que no puede estar escrita aquí: en
 * un equipo con el proyecto en `C:\algo` no hace falta nada, y en el de otra
 * persona `C:/rncxx` podría no existir o no ser suya. Sin la variable el
 * complemento no toca nada, que es lo correcto en cualquier sitio donde el
 * problema no exista —Linux y macOS incluidos—.
 *
 *   EXPO_ANDROID_CXX_DIR=C:/rncxx
 */

const VARIABLE = 'EXPO_ANDROID_CXX_DIR';

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function rutaCortaDeCmake(config) {
  const destino = process.env[VARIABLE];
  if (!destino) return config;

  const { withAppBuildGradle } = require('@expo/config-plugins');

  return withAppBuildGradle(config, (conf) => {
    const gradle = conf.modResults.contents;

    // Si ya está puesto, no duplicar: el prebuild puede pasar dos veces.
    if (gradle.includes('buildStagingDirectory')) return conf;

    const bloque = 'android {\n';
    if (!gradle.includes(bloque)) {
      throw new Error('no encuentro el bloque android en build.gradle');
    }

    // Las barras invertidas de Windows romperían la cadena de Groovy.
    const ruta = destino.replace(/\\/g, '/');

    conf.modResults.contents = gradle.replace(
      bloque,
      `${bloque}    // Puesto por plugins/rutaCortaDeCmake.js — ver ${VARIABLE}\n` +
      '    externalNativeBuild {\n' +
      '        cmake {\n' +
      `            buildStagingDirectory = file("${ruta}")\n` +
      '        }\n' +
      '    }\n'
    );
    return conf;
  });
};
