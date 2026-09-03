import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios, ficherosDelLaboratorio } from './ayudas.mjs';
import { ESTADOS_DEL_CONDUCTOR, enServicio } from '../domain/disponibilidad.ts';
import { DISTANCIA_MINIMA_M, INTERVALO_MINIMO_MS } from '../domain/envioDeUbicacion.ts';
import { leerUbicacionDelConductor } from '../domain/ubicacionDelConductor.ts';
import {
  AGRUPAR_HASTA_METROS,
  AGRUPAR_HASTA_MS,
  CADA_METROS_EN_SEGUNDO_PLANO,
  CADA_MS_EN_SEGUNDO_PLANO,
  debeSeguirEnSegundoPlano,
  ESPERA_TRAS_EXCESO_MS,
  puertaParaEntrarEnServicio,
  reaccionarAlFallo,
  reconciliarSinPermiso,
  TAREA_DE_UBICACION,
  tocaEnviar
} from '../domain/seguimientoEnSegundoPlano.ts';

/**
 * DRIVER-LOCATION-RESILIENCE-1 — el teléfono guardado en el bolsillo.
 *
 * QUÉ SE PROTEGE
 *
 * Seguir a alguien con la aplicación cerrada es lo más invasivo que hace esta
 * aplicación. Lo que estas pruebas defienden no es que funcione —eso se ve
 * corriendo— sino que NO ocurra fuera de su único motivo: estar en servicio,
 * confirmado por el servidor.
 *
 * Que no exista una segunda copia de nada. Un segundo criterio de calidad, un
 * segundo sitio donde arrancar la tarea, un segundo token: cada duplicado es
 * una versión de la verdad que puede discrepar de la otra, y nadie sabría cuál
 * manda con la pantalla apagada, que es justo cuando no hay quien mire.
 *
 * Y que del recorrido de una persona no quede rastro: ni en disco, ni en los
 * registros, ni en una cola de reintentos. La última posición gana; el pasado
 * no se guarda.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const TAREA = 'ubicacion/tareaDeUbicacion.ts';
const MANDO = 'ubicacion/SeguimientoDelConductor.tsx';
const PERMISO = 'ubicacion/PermisoDeSegundoPlano.tsx';

/** Todo el código de la aplicación, con su ruta relativa. */
function codigoDeLaAplicacion() {
  const carpetas = ['app', 'ubicacion', 'realtime', 'domain', 'services', 'context', 'ui', 'preview', 'mapa'];
  const ficheros = [];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      ficheros.push({
        relativa: path.relative(raizMovil, completa).replace(/\\/g, '/'),
        codigo: fs.readFileSync(completa, 'utf8')
      });
    }
  }
  return ficheros;
}

// ---------------------------------------------------------------------------
// La dependencia
// ---------------------------------------------------------------------------

test('expo-task-manager está declarado y es el que pide Expo', () => {
  const paquete = JSON.parse(leer('package.json'));
  const declarada = paquete.dependencies['expo-task-manager'];
  assert.ok(declarada, 'expo-task-manager no está declarado');

  // Compatibilidad, no identidad: la matriz pide un rango y `expo install`
  // trae el parche más nuevo que ese rango permite. Exigir el número exacto
  // haría fallar esto cada vez que Expo publica una corrección.
  const matriz = JSON.parse(leer('node_modules/expo/bundledNativeModules.json'));
  const pedido = matriz['expo-task-manager'];
  assert.ok(pedido, 'la matriz de Expo ya no lista expo-task-manager');

  const partes = texto => texto.replace(/^[~^]/, '').split('.').map(Number);
  const [mayorPedido, menorPedido, parchePedido] = partes(pedido);
  const instalada = JSON.parse(leer('node_modules/expo-task-manager/package.json')).version;
  const [mayor, menor, parche] = partes(instalada);

  assert.equal(mayor, mayorPedido, `línea mayor distinta: ${instalada} frente a ${pedido}`);
  assert.equal(menor, menorPedido, `línea menor distinta: ${instalada} frente a ${pedido}`);
  assert.ok(parche >= parchePedido, `${instalada} es anterior a la que pide Expo (${pedido})`);
});

// ---------------------------------------------------------------------------
// La condición única: cuándo existe el seguimiento
// ---------------------------------------------------------------------------

test('sin sesión no se sigue a nadie', () => {
  assert.equal(debeSeguirEnSegundoPlano({
    haySesion: false, esConductor: true, estado: 'AVAILABLE', permisoDeSegundoPlano: true
  }), false);
});

test('una pasajera no se sigue, aunque diera todos los permisos', () => {
  assert.equal(debeSeguirEnSegundoPlano({
    haySesion: true, esConductor: false, estado: 'AVAILABLE', permisoDeSegundoPlano: true
  }), false);
});

test('sin permiso de segundo plano no se arranca nada', () => {
  // El permiso es del sistema. Que la aplicación lo quiera no basta, y creerse
  // que lo tiene sin preguntarlo acabaría en una tarea que el sistema mata.
  assert.equal(debeSeguirEnSegundoPlano({
    haySesion: true, esConductor: true, estado: 'AVAILABLE', permisoDeSegundoPlano: false
  }), false);
});

test('fuera de servicio NO se sigue: es la regla que gobierna todo', () => {
  for (const estado of ['OFFLINE', null]) {
    assert.equal(debeSeguirEnSegundoPlano({
      haySesion: true, esConductor: true, estado, permisoDeSegundoPlano: true
    }), false, `se sigue estando ${estado}`);
  }

  // Y los estados de administración tampoco: un conductor suspendido o sin
  // aprobar no está trabajando, y seguirlo no serviría para nada salvo para
  // saber dónde está.
  for (const estado of ['SUSPENDED', 'PENDING_APPROVAL', 'CUALQUIER_COSA']) {
    assert.equal(debeSeguirEnSegundoPlano({
      haySesion: true, esConductor: true, estado, permisoDeSegundoPlano: true
    }), false, `se sigue estando ${estado}`);
  }
});

test('trabajando SÍ se sigue, en los tres estados que son trabajar', () => {
  for (const estado of ['AVAILABLE', 'BUSY', 'IN_TRIP']) {
    assert.equal(debeSeguirEnSegundoPlano({
      haySesion: true, esConductor: true, estado, permisoDeSegundoPlano: true
    }), true, `no se sigue estando ${estado}`);
  }
});

test('el seguimiento nunca es más laxo que «estar en servicio»', () => {
  // Las dos ideas tienen que moverse juntas. Si alguien añade mañana un estado
  // nuevo al conductor y lo mete en `enServicio` sin pensar en el segundo
  // plano, o al revés, esto lo cuenta antes que un usuario.
  for (const estado of [...ESTADOS_DEL_CONDUCTOR, null]) {
    const sigue = debeSeguirEnSegundoPlano({
      haySesion: true, esConductor: true, estado, permisoDeSegundoPlano: true
    });
    assert.equal(sigue, enServicio(estado), `discrepan para ${estado}`);
  }
});

// ---------------------------------------------------------------------------
// Dónde vive la tarea
// ---------------------------------------------------------------------------

test('la tarea se define UNA vez, y fuera de React', () => {
  // Definirla dentro de un componente significaría que no existe justo cuando
  // hace falta: con el teléfono bloqueado no hay React montado, el sistema
  // despierta el proceso, busca la tarea por su nombre y no la encuentra.
  const definiciones = codigoDeLaAplicacion()
    .filter(({ codigo }) => /defineTask\s*\(/.test(despojarComentarios(codigo)));

  assert.deepEqual(definiciones.map(f => f.relativa), [TAREA],
    'la tarea se define en más de un sitio, o en el sitio equivocado');

  // Y a nivel de módulo: si estuviera indentada estaría dentro de algo.
  const codigo = sinComentarios(TAREA);
  assert.match(codigo, /^TaskManager\.defineTask\(/m,
    'la definición no está en el nivel superior del módulo');

  // El nombre sale de la constante compartida. Un literal repetido acaba
  // divergiendo entre quien define y quien arranca, y entonces se arranca una
  // tarea que nadie definió.
  assert.match(codigo, /defineTask\(TAREA_DE_UBICACION/);
  assert.equal(codigo.includes(`'${TAREA_DE_UBICACION}'`), false,
    'el nombre de la tarea aparece como literal donde debería ir la constante');
});

test('sólo un fichero manda arrancar y parar', () => {
  const arrancan = codigoDeLaAplicacion()
    .filter(({ relativa, codigo }) => relativa !== TAREA
      && /startLocationUpdatesAsync|stopLocationUpdatesAsync/.test(despojarComentarios(codigo)));
  assert.deepEqual(arrancan.map(f => f.relativa), [],
    'alguien más arranca o para la tarea por su cuenta');

  // Y quien decide lo hace con la condición única, no con una copia suya.
  const mando = sinComentarios(MANDO);
  assert.match(mando, /debeSeguirEnSegundoPlano\(/);
  assert.match(mando, /arrancarSeguimiento\(\)/);
  assert.match(mando, /pararSeguimiento\(\)/);
});

test('el permiso vive solo, y el seguimiento sólo lo lee', () => {
  // El permiso es una propiedad del TELÉFONO: existe antes de que nadie entre y
  // sobrevive a cerrar la aplicación. Separarlo de quien decide arrancar la
  // tarea es lo que permite exigirlo antes de entrar en servicio.
  const permisos = sinComentarios(PERMISO);
  assert.match(permisos, /requestBackgroundPermissionsAsync\(\)/);
  assert.match(permisos, /requestForegroundPermissionsAsync\(\)/);

  // Quien enciende y apaga la tarea NO pide permisos: sólo mira el que hay.
  const mando = sinComentarios(MANDO);
  assert.equal(/requestBackgroundPermissionsAsync|requestForegroundPermissionsAsync/.test(mando), false,
    'el seguimiento vuelve a pedir permisos por su cuenta');
  assert.match(mando, /usePermisoDeSegundoPlano\(\)/);
});

test('ninguno de los tres se importa en círculo', () => {
  // Un ciclo deja valores sin inicializar según quién cargue primero, y el que
  // hubo aquí producía justo eso: una función que no hacía nada. El orden de
  // dependencias es una línea recta y tiene que seguir siéndolo.
  //
  //   PermisoDeSegundoPlano  ←  Disponibilidad  ←  SeguimientoDelConductor
  const permisos = sinComentarios(PERMISO);
  const disponibilidad = sinComentarios('realtime/Disponibilidad.tsx');
  const seguimiento = sinComentarios(MANDO);

  // El permiso no depende de nadie de los otros dos.
  assert.equal(/Disponibilidad|SeguimientoDelConductor/.test(permisos), false,
    'el permiso mira hacia abajo y cierra un ciclo');

  // La disponibilidad usa el permiso, y NO el seguimiento.
  assert.match(disponibilidad, /usePermisoDeSegundoPlano/);
  assert.equal(/useSeguimiento|SeguimientoDelConductor/.test(disponibilidad), false,
    'la disponibilidad depende del seguimiento y cierra un ciclo');

  // Y el seguimiento, el último, puede usar los dos.
  assert.match(seguimiento, /from '\.\.\/realtime\/Disponibilidad'/);
});

// ---------------------------------------------------------------------------
// Opción B: el permiso va ANTES de entrar en servicio
// ---------------------------------------------------------------------------

test('sin permiso no se entra en servicio, y con él sí', () => {
  assert.equal(puertaParaEntrarEnServicio('CONCEDIDO'), 'ADELANTE');
  assert.equal(puertaParaEntrarEnServicio('DESCONOCIDO'), 'PEDIR');
  // De un «no» se sale volviendo a preguntar; de un «no» definitivo, sólo desde
  // los ajustes. Confundirlos es o insistir con un diálogo que ya no aparece, o
  // mandar a los ajustes a quien sólo hacía falta preguntar.
  assert.equal(puertaParaEntrarEnServicio('DENEGADO'), 'PEDIR');
  assert.equal(puertaParaEntrarEnServicio('BLOQUEADO'), 'AJUSTES');
  // Desde el navegador no se conduce. La plataforma operativa del conductor es
  // la aplicación móvil nativa, y sólo ésa.
  assert.equal(puertaParaEntrarEnServicio('NO_DISPONIBLE'), 'SOLO_DESDE_LA_APP');
});

test('DESDE EL NAVEGADOR NO SE ENTRA EN SERVICIO', () => {
  // Decisión del dueño. El navegador no tiene ubicación en segundo plano: en
  // cuanto la pestaña deja de estar activa suspende los temporizadores y deja
  // de haber posiciones, sin avisar. La pantalla diría «En línea» mientras el
  // despacho ve una posición rancia y lo descarta.
  assert.notEqual(puertaParaEntrarEnServicio('NO_DISPONIBLE'), 'ADELANTE');

  const codigo = sinComentarios('realtime/Disponibilidad.tsx');
  const alternar = codigo.slice(codigo.indexOf('const alternar'));
  const cuerpo = alternar.slice(0, alternar.indexOf('const valor'));

  // Se sigue SÓLO con la puerta abierta, en vez de con una lista de casos que
  // rechazan: así un motivo nuevo de bloqueo nace bloqueando, y olvidarse de
  // añadirlo no deja entrar en servicio a quien no debe.
  assert.match(cuerpo, /if \(puerta !== 'ADELANTE'\) \{/);
  assert.match(cuerpo, /rechazada\(previa, 'SOLO_DESDE_LA_APP'\)/);

  // Y ni siquiera se molesta al servidor.
  const bloqueo = cuerpo.indexOf("'SOLO_DESDE_LA_APP'");
  const peticion = cuerpo.indexOf('pedirEstadoDeConductor(pedido)');
  assert.ok(bloqueo < peticion, 'se pide el estado pese al bloqueo de plataforma');
});

test('el conductor nativo SIGUE pudiendo ponerse en servicio', () => {
  // La otra mitad de la regla, y la que más importa no romper: bloquear la web
  // no puede costar la jornada de nadie en el teléfono.
  assert.equal(puertaParaEntrarEnServicio('CONCEDIDO'), 'ADELANTE');
  assert.equal(debeSeguirEnSegundoPlano({
    haySesion: true, esConductor: true, estado: 'AVAILABLE', permisoDeSegundoPlano: true
  }), true);
});

test('la web NO saca de servicio a quien trabaja con el móvil', () => {
  // Negarse a ponerlo en línea y quitarle lo que ya tiene son cosas distintas.
  // Si está trabajando con su teléfono y abre la web para mirar sus ganancias,
  // sacarlo desde la pestaña le rompería la jornada que SÍ sostiene el móvil.
  for (const estado of ['AVAILABLE', 'BUSY', 'IN_TRIP']) {
    assert.equal(reconciliarSinPermiso({
      estado, permiso: 'NO_DISPONIBLE', hayViajeActivo: false
    }), 'NADA', `la web tumba una jornada estando ${estado}`);
  }
});

test('el ORDEN es permiso primero, servidor después', () => {
  // Es la mitad del encargo. Pedir el estado primero dejaría una ventana en la
  // que el despacho ya cuenta con un conductor del que todavía no se sabe si
  // podrá decir dónde está, y habría que deshacer algo ya anunciado.
  const codigo = sinComentarios('realtime/Disponibilidad.tsx');
  const alternar = codigo.slice(codigo.indexOf('const alternar'));
  const cuerpo = alternar.slice(0, alternar.indexOf('const valor'));

  const puerta = cuerpo.indexOf('puertaParaEntrarEnServicio');
  const peticion = cuerpo.indexOf('pedirEstadoDeConductor(pedido)');
  assert.ok(puerta !== -1, 'el interruptor ya no comprueba el permiso');
  assert.ok(peticion !== -1, 'el interruptor ya no pide el estado');
  assert.ok(puerta < peticion,
    'se pide el estado al servidor ANTES de asegurar el permiso');

  // Y todos los caminos del «no» salen sin llegar a pedir nada. Cada rama que
  // no acaba en `ADELANTE` tiene su `return` antes de la petición.
  const bloqueo = cuerpo.slice(cuerpo.indexOf("if (puerta !== 'ADELANTE') {"), peticion);
  for (const motivo of ['SIN_PERMISO_DE_FONDO', 'PERMISO_EN_AJUSTES', 'SOLO_DESDE_LA_APP']) {
    const donde = bloqueo.indexOf(motivo);
    assert.ok(donde !== -1, `falta el camino de salida para ${motivo}`);
    assert.match(bloqueo.slice(donde), /^[^\n]*\n\s*return;/,
      `${motivo} no sale: sigue hasta pedir el estado`);
  }
});

test('salir de servicio no pide ningún permiso', () => {
  // Quitarse de en medio siempre se puede. Exigir algo para dejar de trabajar
  // dejaría a alguien atrapado en línea.
  const codigo = sinComentarios('realtime/Disponibilidad.tsx');
  assert.match(codigo, /if \(pedido === 'AVAILABLE'\) \{/);
});

test('un «no» no se convierte en insistir', () => {
  // Una vez denegado, el sistema deja de preguntar. Reintentar solo gastaría el
  // único intento y dejaría al conductor sin camino de vuelta.
  const codigo = sinComentarios('realtime/Disponibilidad.tsx');
  const alternar = codigo.slice(codigo.indexOf('const alternar'));
  const cuerpo = alternar.slice(0, alternar.indexOf('const valor'));

  // Se pide como mucho una vez por pulsación: dos llamadas y serían dos
  // diálogos seguidos.
  assert.equal((cuerpo.match(/await pedirPermiso\(\)/g) ?? []).length, 2,
    'el interruptor pide el permiso un número de veces inesperado');
  // Y las dos son excluyentes: una en el camino de PEDIR y otra en el de AJUSTES.
  assert.match(cuerpo, /puerta === 'PEDIR'/);
  assert.match(cuerpo, /puerta === 'AJUSTES'/);

  // El permiso no se pide desde ningún efecto: sólo desde el interruptor, que
  // es una acción explícita del conductor.
  const proveedor = sinComentarios(PERMISO);
  const efectos = proveedor.split('useEffect(').slice(1);
  for (const efecto of efectos) {
    assert.equal(/requestBackgroundPermissionsAsync|requestForegroundPermissionsAsync/.test(efecto.slice(0, 600)), false,
      'un efecto pide el permiso solo: eso es un bucle de diálogos esperando');
  }
});

test('cuando el sistema ya no pregunta, se ofrecen los ajustes', () => {
  const proveedor = sinComentarios(PERMISO);
  assert.match(proveedor, /Linking\.openSettings\(\)/);
  // Y no se abre por sorpresa: primero se cuenta por qué.
  assert.match(proveedor, /ofrecerLosAjustes/);
  assert.match(leer(PERMISO), /Abrir ajustes/);
});

test('se explica antes de que salga el diálogo del sistema', () => {
  // A la pregunta del sistema, sin contexto, casi todo el mundo dice que no. Y
  // una vez dicho que no, el sistema deja de preguntar.
  const codigo = sinComentarios(PERMISO);
  const explicacion = codigo.indexOf('explicarYPreguntar()');
  const peticion = codigo.indexOf('requestBackgroundPermissionsAsync');
  assert.ok(explicacion !== -1, 'ya no se explica nada antes de pedir');
  assert.ok(explicacion < peticion, 'se pide el permiso antes de explicar para qué');

  // Y el primer plano va antes que el segundo: los dos sistemas rechazan el
  // segundo sin el primero, y pedirlos al revés gasta el único intento.
  assert.ok(codigo.indexOf('requestForegroundPermissionsAsync') < peticion);
});

// ---------------------------------------------------------------------------
// Opción B: el servidor dice que trabaja y el teléfono ya no puede
// ---------------------------------------------------------------------------

test('sin permiso y sin viaje, se sale de servicio', () => {
  assert.equal(reconciliarSinPermiso({
    estado: 'AVAILABLE', permiso: 'DENEGADO', hayViajeActivo: false
  }), 'SACAR_DE_SERVICIO');
  assert.equal(reconciliarSinPermiso({
    estado: 'AVAILABLE', permiso: 'BLOQUEADO', hayViajeActivo: false
  }), 'SACAR_DE_SERVICIO');
});

test('UN VIAJE EN MARCHA NO SE ROMPE POR UN PERMISO', () => {
  // Es la excepción protegida. Sacar de servicio a alguien con una persona
  // subida a la moto es mucho peor que la falta de permiso.
  for (const caso of [
    { estado: 'BUSY', hayViajeActivo: false },
    { estado: 'IN_TRIP', hayViajeActivo: false },
    // Y basta con que haya viaje, aunque el estado diga otra cosa: cualquiera
    // de las dos señales es motivo suficiente para no tocar nada.
    { estado: 'AVAILABLE', hayViajeActivo: true }
  ]) {
    assert.equal(
      reconciliarSinPermiso({ ...caso, permiso: 'DENEGADO' }),
      'AVISAR_SIN_TOCAR_EL_VIAJE',
      `se rompe el viaje con ${JSON.stringify(caso)}`
    );
  }
});

test('no se saca de servicio a quien no toca', () => {
  // Con permiso, nada que arreglar.
  assert.equal(reconciliarSinPermiso({
    estado: 'AVAILABLE', permiso: 'CONCEDIDO', hayViajeActivo: false
  }), 'NADA');

  // Fuera de servicio, nada que arreglar.
  assert.equal(reconciliarSinPermiso({
    estado: 'OFFLINE', permiso: 'DENEGADO', hayViajeActivo: false
  }), 'NADA');

  // Y durante el arranque, ANTES de haber mirado qué dice el sistema, no se
  // decide: hacerlo sacaría de servicio a todo el mundo al abrir la aplicación.
  assert.equal(reconciliarSinPermiso({
    estado: 'AVAILABLE', permiso: 'DESCONOCIDO', hayViajeActivo: false
  }), 'NADA');

  // En el navegador tampoco: no se echa a nadie por no tener algo que la
  // plataforma no ofrece.
  assert.equal(reconciliarSinPermiso({
    estado: 'AVAILABLE', permiso: 'NO_DISPONIBLE', hayViajeActivo: false
  }), 'NADA');
});

test('la salida forzada la ejecuta el SERVIDOR, no la pantalla', () => {
  // Apagar el disco por nuestra cuenta contaría una verdad que el despacho no
  // comparte: él seguiría ofreciéndole viajes.
  const codigo = sinComentarios('realtime/Disponibilidad.tsx');
  assert.match(codigo, /reconciliarSinPermiso\(/);
  assert.match(codigo, /pedirEstadoDeConductor\('OFFLINE'\)/);
  // Y una sola vez: el efecto se dispara con cada cambio, y pedirlo en bucle
  // inundaría al servidor.
  assert.match(codigo, /if \(reconciliando\.current\) return;/);

  // El estado NO se fabrica localmente: `confirmada` sólo se llama desde lo que
  // llega del servidor, nunca desde la reconciliación.
  const reconciliacion = codigo.slice(codigo.indexOf('quePasa !== '));
  assert.equal(/confirmada\(/.test(reconciliacion.slice(0, 500)), false,
    'la reconciliación se inventa el estado en vez de esperar al servidor');
});

test('nadie sale de servicio sin enterarse', () => {
  // Creería que sigue trabajando y esperaría viajes que no van a llegar.
  const codigo = sinComentarios('realtime/Disponibilidad.tsx');
  assert.match(codigo, /setSacadoPorElPermiso\(true\)/);

  const pantalla = leer('app/conductor.tsx');
  assert.match(pantalla, /sacadoDeServicioPorElPermiso/);
  assert.match(pantalla, /faltaElPermisoDeFondo/);
  assert.match(pantalla, /Alert\.alert\(/);
  // Con salida a los ajustes en los dos avisos, que es el camino oficial.
  assert.equal((pantalla.match(/abrirAjustesDeUbicacion\(\)/g) ?? []).length, 2);
});

test('la pantalla del conductor no se rediseñó', () => {
  // El encargo lo pide explícitamente. Lo único que se añadió son avisos del
  // sistema: ni un componente nuevo, ni un estilo nuevo, ni una vista más.
  const pantalla = sinComentarios('app/conductor.tsx');
  assert.match(pantalla, /<C2InicioConductor enLinea=\{enLinea\} onAlternar=\{alternar\} \/>/);
  assert.equal(/StyleSheet\.create\(\{[\s\S]*permiso/i.test(pantalla), false,
    'se añadieron estilos para el aviso en vez de usar el del sistema');
});

test('lo último que se pide no se pierde por estar ocupado', () => {
  // Fallo real, visto quitando el permiso desde los ajustes: el efecto se
  // disparó mientras otra pasada seguía en marcha, se descartó, y el servicio
  // quedó anunciando en la barra que usaba una ubicación que ya no podía leer.
  const mando = sinComentarios(MANDO);

  // La intención que llega mientras se trabaja se GUARDA, no se tira.
  assert.match(mando, /pendiente\.current = debe;/);
  // Y se aplica al terminar, hasta que no quede nada nuevo.
  assert.match(mando, /pendiente\.current === null\) break;/);
});

test('si el sistema se niega, no queda una promesa colgando', () => {
  // Encender o apagar puede fallar cuando acaban de quitarle el permiso. Un
  // rechazo sin capturar deja el estado a medias y sólo se ve en el depurador.
  const mando = sinComentarios(MANDO);
  assert.match(mando, /\} catch \{/);
  // Y lo que se muestra es lo que el sistema diga de verdad, pase lo que pase.
  assert.match(mando, /finally \{[\s\S]{0,200}setSiguiendo\(await estaSiguiendo\(\)/);

  // Lo recordado por la tarea se olvida aunque parar falle: heredar el ritmo
  // viejo al volver a arrancar saltaría el primer envío.
  assert.match(sinComentarios(TAREA), /finally \{\s*olvidarLoDeLaTarea\(\);/);
});

test('quien decide pregunta al SISTEMA, no a una variable suya', () => {
  // La tarea sobrevive a que se cierre la aplicación. Un booleano de React no
  // sabe si quedó viva de la sesión anterior, y creerse que no lo está deja a
  // alguien siendo seguido sin que la aplicación lo sepa.
  assert.match(sinComentarios(TAREA), /hasStartedLocationUpdatesAsync\(TAREA_DE_UBICACION\)/);
  assert.match(sinComentarios(MANDO), /await estaSiguiendo\(\)/);
});

// ---------------------------------------------------------------------------
// El contrato del servidor: no se inventa nada
// ---------------------------------------------------------------------------

test('el sitio donde se manda la posición existe y exige conductor aprobado', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(
    servidor,
    /app\.patch\('\/api\/drivers\/location', requireAuth, requireApprovedDriver, limitadores\.telemetria/,
    'la ruta de ubicación del conductor cambió de forma'
  );
  // Y difunde por el mismo camino que el socket: la pasajera recibe su
  // `driverLocationUpdated` sin enterarse de por dónde vino la posición.
  assert.match(servidor, /emitDriverLocation\(driverId/);

  assert.match(sinComentarios(TAREA), /llamar\('\/api\/drivers\/location', \{\s*metodo: 'PATCH'/);
});

test('el ritmo cabe de sobra en el limitador del servidor', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const regla = servidor.match(/telemetria: createIdentityLimiter\(\{ name: 'telemetria', limit: (\d+), windowMs: (\w+) \}\)/);
  assert.ok(regla, 'el limitador de telemetría cambió de forma');
  assert.equal(regla[2], 'MINUTO');

  const nuestrosPorMinuto = 60_000 / CADA_MS_EN_SEGUNDO_PLANO;
  assert.ok(nuestrosPorMinuto * 4 < Number(regla[1]),
    `el ritmo (${nuestrosPorMinuto}/min) se acerca al límite (${regla[1]}/min)`);
});

test('la cadencia deja la posición muy lejos de caducar', () => {
  // El despacho descarta a un conductor cuya posición pase de esta edad. Toda
  // la fase existe por esto: sin segundo plano, un conductor con el teléfono
  // guardado envejece hasta desaparecer del sistema estando disponible.
  const elegibilidad = fs.readFileSync(
    path.join(raizProyecto, 'server/domain/dispatchEligibility.js'), 'utf8');
  const encontrado = elegibilidad.match(/maxLocationAgeMs = ([\d_]+)/);
  assert.ok(encontrado, 'el despacho ya no declara maxLocationAgeMs');
  const edadMaxima = Number(encontrado[1].replace(/_/g, ''));

  // Ocho veces de margen: aunque se pierdan varias lecturas seguidas por un
  // túnel o un edificio, la posición sigue estando lejos del límite.
  assert.ok(CADA_MS_EN_SEGUNDO_PLANO * 8 <= edadMaxima,
    `${CADA_MS_EN_SEGUNDO_PLANO} ms deja menos de ocho ciclos antes de ${edadMaxima} ms`);

  // Y lo que el sistema puede agrupar antes de despertarnos, también.
  assert.ok(AGRUPAR_HASTA_MS * 2 <= edadMaxima,
    'agrupar tanto tiempo puede dejar caducar la posición');
});

test('el segundo plano gasta menos que el primer plano', () => {
  // Cada lectura en segundo plano cuesta una petición HTTP, no un mensaje por
  // un socket ya abierto, y quien lo paga es el conductor: sus datos y su
  // batería durante una jornada de ocho horas.
  assert.ok(CADA_MS_EN_SEGUNDO_PLANO > INTERVALO_MINIMO_MS, 'el fondo mide más a menudo que la pantalla');
  assert.ok(CADA_METROS_EN_SEGUNDO_PLANO > DISTANCIA_MINIMA_M, 'el fondo es más fino que la pantalla');
  assert.ok(AGRUPAR_HASTA_METROS >= CADA_METROS_EN_SEGUNDO_PLANO);

  // Y el GPS no va a plena potencia con la pantalla apagada: es lo que vacía
  // una batería en media jornada.
  assert.match(sinComentarios(TAREA), /accuracy: Location\.Accuracy\.Balanced/);
  assert.equal(/Accuracy\.(High|Highest|BestForNavigation)/.test(sinComentarios(TAREA)), false);
});

// ---------------------------------------------------------------------------
// Sesión: sin ella no sale nada
// ---------------------------------------------------------------------------

test('sin token no se manda una sola coordenada', () => {
  const codigo = sinComentarios(TAREA);

  // La comprobación va ANTES de la llamada. Al revés sería mandar la posición
  // de alguien con una sesión que ya no existe.
  const puerta = codigo.indexOf('leerToken()');
  const envio = codigo.indexOf("llamar('/api/drivers/location'");
  assert.ok(puerta !== -1, 'la tarea no comprueba la sesión');
  assert.ok(puerta < envio, 'se manda la posición antes de comprobar la sesión');
  assert.match(codigo, /if \(\(await leerToken\(\)\) === null\) return;/);
});

test('el token no se copia ni se enseña', () => {
  // Hay UNA autoridad de sesión, en el almacén seguro. Una segunda copia para
  // que la tarea la tenga a mano sería una llave más que robar, y un registro
  // con el token dentro es la llave impresa.
  for (const relativa of [TAREA, MANDO, 'domain/seguimientoEnSegundoPlano.ts']) {
    const codigo = sinComentarios(relativa);
    assert.equal(/AsyncStorage|SecureStore|localStorage/.test(codigo), false,
      `${relativa} guarda algo por su cuenta`);
    assert.equal(/console\./.test(codigo), false, `${relativa} escribe en el registro`);
  }
});

// ---------------------------------------------------------------------------
// Calidad antes que transporte
// ---------------------------------------------------------------------------

test('la calidad la juzga la MISMA autoridad que en primer plano', () => {
  const codigo = sinComentarios(TAREA);
  assert.match(codigo, /from '\.\.\/domain\/calidadDeUbicacion'/);
  assert.match(codigo, /evaluarUbicacion\(muestra/);
  assert.match(codigo, /normalizarUbicacion\(/);

  // Y no trae umbrales propios: dos criterios de calidad harían que la moto se
  // comportara distinto según dónde esté la pantalla.
  assert.equal(/PRECISION_|VELOCIDAD_|GRACIA_|FACTOR_/.test(codigo), false,
    'la tarea define sus propios umbrales de calidad');
});

test('primero se juzga, después se manda', () => {
  const codigo = sinComentarios(TAREA);
  const juicio = codigo.indexOf('evaluarUbicacion(');
  const envio = codigo.indexOf("llamar('/api/drivers/location'");
  assert.ok(juicio !== -1 && envio !== -1);
  assert.ok(juicio < envio, 'se manda antes de comprobar si la lectura vale');
  assert.match(codigo, /if \(!veredicto\.aceptar[^)]*\) return;/);
});

test('de un lote agrupado sólo cuenta la última lectura', () => {
  // El sistema entrega varias juntas cuando las agrupó. Mandarlas todas sería
  // reconstruir el recorrido; las anteriores ya son pasado.
  const codigo = sinComentarios(TAREA);
  assert.match(codigo, /lecturas\[lecturas\.length - 1\]/);
  assert.equal(/lecturas\.map\(|lecturas\.forEach\(|for \(const .* of lecturas\)/.test(codigo), false,
    'se recorre el lote entero en vez de quedarse con la última');
});

// ---------------------------------------------------------------------------
// El ritmo
// ---------------------------------------------------------------------------

test('la primera lectura de un arranque siempre viaja', () => {
  assert.equal(tocaEnviar(null, 1_000, null), true);
});

test('no se manda más rápido que la cadencia', () => {
  const ahora = 1_700_000_000_000;
  assert.equal(tocaEnviar(ahora, ahora + CADA_MS_EN_SEGUNDO_PLANO - 1, null), false);
  assert.equal(tocaEnviar(ahora, ahora + CADA_MS_EN_SEGUNDO_PLANO, null), true);
});

test('cuando el servidor pide calma, se calla —y luego vuelve—', () => {
  const ahora = 1_700_000_000_000;
  const hasta = ahora + ESPERA_TRAS_EXCESO_MS;

  // Ni siquiera la primera de un arranque nuevo se salta la espera.
  assert.equal(tocaEnviar(null, ahora + 1, hasta), false);
  assert.equal(tocaEnviar(ahora - CADA_MS_EN_SEGUNDO_PLANO, ahora + 1, hasta), false);

  // Y la espera cabe entera dentro de lo que el despacho tolera: callarse más
  // tiempo del que la posición aguanta sería desaparecer del sistema.
  assert.equal(tocaEnviar(null, hasta, hasta), true);
  assert.ok(ESPERA_TRAS_EXCESO_MS < 120_000);
});

// ---------------------------------------------------------------------------
// Qué se hace cuando el servidor dice que no
// ---------------------------------------------------------------------------

test('una sesión caducada PARA el seguimiento', () => {
  // Un teléfono mandando posiciones que el servidor rechaza cada quince
  // segundos durante horas es el bucle exacto que hay que evitar: gasta la
  // batería de alguien para nada y llena el servidor de rechazos.
  assert.equal(reaccionarAlFallo(401), 'PARAR');
  assert.equal(reaccionarAlFallo(403), 'PARAR');
  assert.match(sinComentarios(TAREA), /case 'PARAR':[\s\S]{0,300}await pararSeguimiento\(\);/);
});

test('«demasiadas» se responde esperando, no insistiendo', () => {
  assert.equal(reaccionarAlFallo(429), 'ESPERAR');
  assert.match(sinComentarios(TAREA), /esperandoHasta = ahora \+ ESPERA_TRAS_EXCESO_MS/);
});

test('lo transitorio no para nada: la siguiente lectura lo arregla', () => {
  // Un 400 es una coordenada que no gustó, un 5xx es el servidor teniendo un
  // mal momento, y sin red no hay código ninguno. Ninguno de los tres es
  // motivo para dejar de saber dónde está un conductor en servicio.
  for (const codigo of [400, 404, 500, 502, 503, 504, null]) {
    assert.equal(reaccionarAlFallo(codigo), 'SEGUIR', `${codigo} hace algo raro`);
  }
});

test('el código de la respuesta llega de verdad hasta aquí', () => {
  // Sin esto, todos los fallos parecerían iguales y una sesión revocada se
  // trataría como un corte de red.
  assert.match(leer('domain/apiResult.ts'), /estadoHttp\?: number \| null/);
  assert.match(sinComentarios('services/api.ts'), /estadoHttp: number \| null = null/);
  assert.match(sinComentarios(TAREA), /reaccionarAlFallo\(respuesta\.estadoHttp \?\? null\)/);
});

// ---------------------------------------------------------------------------
// La última posición gana: ni cola, ni reintento, ni historial
// ---------------------------------------------------------------------------

test('no hay cola de posiciones pendientes', () => {
  // Reintentar sería gastar los datos del conductor en contar el pasado. Lo
  // que hace falta saber es dónde está AHORA, y eso lo dirá la siguiente
  // lectura en quince segundos.
  const codigo = sinComentarios(TAREA);
  assert.equal(/reintent|cola|pendientes|historial|buffer|queue|retry/i.test(codigo), false,
    'la tarea guarda posiciones para después');
  assert.equal(/setTimeout|setInterval/.test(codigo), false,
    'la tarea programa envíos por su cuenta');
});

test('del recorrido de nadie queda rastro en el teléfono', () => {
  const codigo = sinComentarios(TAREA);
  assert.equal(/FileSystem|writeAsString|AsyncStorage|SecureStore/.test(codigo), false,
    'la tarea escribe en disco');

  // Lo poco que recuerda vive en memoria del proceso y se olvida al parar. Si
  // el sistema mata la aplicación se pierde, y está bien: lo único que se
  // olvida es cuándo fue el último envío.
  assert.match(codigo, /export function olvidarLoDeLaTarea/);
  assert.match(codigo, /pararSeguimiento[\s\S]*olvidarLoDeLaTarea\(\)/);
});

test('ninguna coordenada acaba en el registro', () => {
  for (const { relativa, codigo } of codigoDeLaAplicacion()) {
    const limpio = despojarComentarios(codigo);
    const registros = limpio.match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const registro of registros) {
      assert.equal(/lat|lng|latitude|longitude|coords|posicion|muestra/i.test(registro), false,
        `${relativa} escribe una coordenada en el registro: ${registro}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Los dos transportes no se pisan
// ---------------------------------------------------------------------------

test('con la pantalla encendida calla la tarea; apagada, calla el socket', () => {
  // Si los dos mandaran a la vez sería el doble de datos del conductor y el
  // doble de escrituras en el servidor para decir exactamente lo mismo.
  const enVivo = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.match(enVivo, /AppState\.currentState === 'active'/);
  assert.match(enVivo, /if \(!enPantalla\) return;/);

  // Y la tarea no toca el socket: con la aplicación al fondo el sistema
  // suspende el hilo de JavaScript y puede cerrar la conexión sin avisar.
  const tarea = sinComentarios(TAREA);
  assert.equal(/socket|emitir|escuchar|realtime\//.test(tarea), false,
    'la tarea usa el socket');
});

test('la tubería del socket no arranca tareas ni la tarea abre pantallas', () => {
  const enVivo = sinComentarios('realtime/UbicacionEnVivo.tsx');
  assert.equal(/tareaDeUbicacion|TaskManager/.test(enVivo), false);

  // Y el proveedor de primer plano sigue siendo el único que observa el GPS
  // con la pantalla encendida.
  const primerPlano = sinComentarios('ubicacion/UbicacionDelDispositivo.tsx');
  assert.equal(/TaskManager|startLocationUpdatesAsync/.test(primerPlano), false);
});

// ---------------------------------------------------------------------------
// El rumbo: cero no es «mirando al norte»
// ---------------------------------------------------------------------------

test('un rumbo que el sistema no dio no se inventa', () => {
  const codigo = sinComentarios(TAREA);
  // `expo-location` usa −1 —y a veces 0— cuando no lo sabe. El servidor
  // rellena cero cuando falta, así que un cero inventado desde aquí sería
  // indistinguible de un rumbo real hacia el norte.
  assert.match(codigo, /rumbo < 0 \|\| rumbo === 0/);

  // Y el campo sólo viaja si hay rumbo de verdad: no se manda `heading: null`.
  assert.match(codigo, /rumboDe\([^)]*\) === null\s*\?\s*\{\}/);

  // Y es la MISMA regla que aplica la posición que llega por el socket: el cero
  // no se convierte en rumbo por ninguno de los dos caminos.
  const conCero = leerUbicacionDelConductor(
    { lat: 10.64, lng: -71.61, heading: 0, driverId: 'd1', updatedAt: 1 });
  assert.equal(conCero.rumbo, null, 'un cero llegado por el socket pasa por rumbo real');
  const conRumbo = leerUbicacionDelConductor(
    { lat: 10.64, lng: -71.61, heading: 90, driverId: 'd1', updatedAt: 1 });
  assert.equal(conRumbo.rumbo, 90);
});

// ---------------------------------------------------------------------------
// La configuración nativa, y lo que se le promete a quien da el permiso
// ---------------------------------------------------------------------------

test('el segundo plano está declarado donde tiene que estarlo', () => {
  const app = JSON.parse(leer('app.json'));
  const entrada = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-location');
  assert.ok(entrada, 'expo-location no está declarado como complemento');

  assert.equal(entrada[1].isAndroidBackgroundLocationEnabled, true);
  assert.equal(entrada[1].isIosBackgroundLocationEnabled, true);
  // Android exige un servicio en primer plano con notificación visible para
  // seguir midiendo con la aplicación cerrada. No es esquivable, y tampoco se
  // querría: quien está siendo seguido tiene que poder verlo.
  assert.equal(entrada[1].isAndroidForegroundServiceEnabled, true);
});

test('la notificación dice qué pasa y por qué', () => {
  // Es lo único que ve el conductor mientras se le sigue. Un texto vago —«la
  // aplicación está activa»— sería técnicamente cierto y prácticamente una
  // forma de que no se entere.
  const codigo = leer(TAREA);
  const titulo = codigo.match(/notificationTitle: '([^']+)'/);
  const cuerpo = codigo.match(/notificationBody:\s*\n?\s*'([^']+)'/);
  assert.ok(titulo, 'la notificación no tiene título');
  assert.ok(cuerpo, 'la notificación no tiene cuerpo');

  assert.match(titulo[1], /ubicación/i);
  assert.match(cuerpo[1], /en servicio/i);
  assert.match(cuerpo[1], /viajes/i);

  // Y el servicio se va con la aplicación: dejarlo vivo sería seguir a alguien
  // cuya aplicación ya no existe.
  assert.match(sinComentarios(TAREA), /killServiceOnDestroy: true/);
  // En iOS, el indicador de la barra es obligatorio y correcto.
  assert.match(sinComentarios(TAREA), /showsBackgroundLocationIndicator: true/);
  // Y el sistema no pausa solo al detectar quietud: dejaría de mandar sin
  // avisar y el despacho daría al conductor por rancio.
  assert.match(sinComentarios(TAREA), /pausesUpdatesAutomatically: false/);
});

test('el manifiesto pide lo del segundo plano y NADA ajeno', () => {
  // `android/` se regenera con `expo prebuild` y no vive en el repositorio.
  // Cuando existe —que es cuando se está compilando de verdad— se comprueba.
  const manifiesto = path.join(raizMovil, 'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(manifiesto)) return;

  const xml = fs.readFileSync(manifiesto, 'utf8');
  for (const permiso of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION'
  ]) {
    assert.ok(xml.includes(permiso), `el manifiesto no declara ${permiso}`);
  }

  // Un permiso que la aplicación no usa es una pregunta que no hay que
  // hacerle a nadie, y en la ficha de la tienda queda escrito.
  //
  // `CAMERA` sale de la lista en DRIVER-APPLICATION-D1: la postulación de
  // conductor fotografía documentos (la declara el módulo de expo-image-picker
  // y se fusiona al compilar). Y una línea con `tools:node="remove"` es lo
  // contrario de pedir un permiso: así deja fuera el complemento al
  // micrófono y al almacenamiento antiguo. Esas líneas no cuentan.
  const pedidos = xml.split('\n').filter(linea => !linea.includes('tools:node="remove"')).join('\n');
  for (const ajeno of [
    'android.permission.READ_CONTACTS',
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_SMS',
    'android.permission.READ_CALL_LOG',
    'android.permission.BODY_SENSORS'
  ]) {
    assert.equal(pedidos.includes(ajeno), false, `el manifiesto pide ${ajeno}, que no se usa`);
  }
});

// ---------------------------------------------------------------------------
// El laboratorio visual sigue sin tocar nada real
// ---------------------------------------------------------------------------

test('el laboratorio visual no arrastra el segundo plano', () => {
  // `/diseno` existe para mirar pantallas. Que abrirlo encendiera el GPS de
  // alguien sería una consecuencia que nadie espera de una pantalla de diseño.
  for (const relativa of ficherosDelLaboratorio(raizMovil)) {
    const codigo = despojarComentarios(fs.readFileSync(path.join(raizMovil, relativa), 'utf8'));
    assert.equal(
      /tareaDeUbicacion|SeguimientoDelConductor|TaskManager|seguimientoEnSegundoPlano/.test(codigo),
      false,
      `${relativa} toca el seguimiento en segundo plano`
    );
  }
});

test('el seguimiento está montado una vez, y por debajo de la disponibilidad', () => {
  // Necesita saber qué dice el servidor del conductor antes de decidir nada:
  // montado por encima, arrancaría con un estado que todavía no existe.
  const disposicion = sinComentarios('app/_layout.tsx');
  const proveedores = [...disposicion.matchAll(/<Proveedor(\w+)/g)].map(m => m[1]);
  assert.equal(proveedores.filter(p => p === 'DeSeguimiento').length, 1,
    'el proveedor de seguimiento no está exactamente una vez');
  assert.ok(
    proveedores.indexOf('DeDisponibilidad') < proveedores.indexOf('DeSeguimiento'),
    'el seguimiento se monta antes de saber si el conductor está en servicio'
  );
});
