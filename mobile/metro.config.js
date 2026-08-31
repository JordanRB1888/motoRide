// Metro tiene que poder salir de `mobile/` para leer `shared/contracts/`.
//
// Por defecto sólo vigila la carpeta del proyecto y resuelve módulos desde su
// propio `node_modules`. Los contratos viven un nivel más arriba, compartidos
// con la web y el backend, y se importan con rutas relativas
// (`../../shared/contracts/domain`). Sin esta configuración, Metro los
// encuentra al empaquetar pero no los vigila: al editarlos, la recarga en
// caliente no se entera.
//
// La alternativa habría sido duplicar los contratos dentro de `mobile/`. Eso
// garantiza que un día se desincronicen — que es exactamente lo que
// `shared/contracts/` existe para evitar.

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const raizDelProyecto = __dirname;
const raizDelRepositorio = path.resolve(raizDelProyecto, '..');

const config = getDefaultConfig(raizDelProyecto);

// Sólo `shared/`, no el repositorio entero: vigilar la raíz metería `src/`,
// `server/` y `node_modules` del web en el vigilante de ficheros, que en
// Windows es lento y ruidoso.
config.watchFolders = [path.resolve(raizDelRepositorio, 'shared')];

// Dónde buscar dependencias. El orden importa: primero las del móvil.
config.resolver.nodeModulesPaths = [
  path.resolve(raizDelProyecto, 'node_modules')
];

// Con `watchFolders` apuntando fuera del proyecto, Metro podría encontrar dos
// copias de React —la del móvil y la del web— y montar las dos. Eso rompe los
// hooks con el error «Invalid hook call». Se fija cuál es la buena.
config.resolver.extraNodeModules = {
  react: path.resolve(raizDelProyecto, 'node_modules/react'),
  'react-native': path.resolve(raizDelProyecto, 'node_modules/react-native')
};

module.exports = config;
