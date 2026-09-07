/**
 * Permite HTTP sin cifrar únicamente en compilaciones internas de desarrollo.
 *
 * Android bloquea cleartext por omisión en aplicaciones modernas. El backend
 * usado para pruebas físicas vive en la LAN y usa HTTP, así que el APK interno
 * necesita habilitarlo. En cualquier otro entorno se escribe `false` de forma
 * explícita para conservar la política HTTPS de producción.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function httpLanSoloEnDevelopment(config) {
  return withAndroidManifest(config, (conf) => {
    const application = conf.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('no encuentro <application> en AndroidManifest.xml');
    }

    application.$ ??= {};
    application.$['android:usesCleartextTraffic'] =
      process.env.EXPO_PUBLIC_ENV === 'development' ? 'true' : 'false';

    return conf;
  });
};
