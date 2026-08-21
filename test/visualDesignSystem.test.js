import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readStyles = () => fs.readdirSync(path.join(root, 'src/styles'))
  .filter(name => name.endsWith('.css'))
  .map(name => ({ name, css: read(`src/styles/${name}`) }));

const system = () => read('src/styles/design-system.css');

/* Estas pruebas fijan decisiones del sistema visual, no píxeles. Cada una
   protege algo que ya se rompió una vez o que costaría caro perder. */

test('el sistema define el conjunto de tokens canónicos', () => {
  const css = system();
  const obligatorios = [
    '--x58-yellow', '--x58-yellow-hover', '--x58-yellow-active',
    '--x58-surface-0', '--x58-surface-1', '--x58-surface-2', '--x58-surface-raised',
    '--x58-text-primary', '--x58-text-secondary', '--x58-text-muted',
    '--x58-border-subtle', '--x58-border-strong',
    '--x58-success', '--x58-warning', '--x58-danger', '--x58-info',
    '--x58-radius-small', '--x58-radius-control', '--x58-radius-card',
    '--x58-radius-sheet', '--x58-radius-pill',
    '--x58-shadow-subtle', '--x58-shadow-card', '--x58-shadow-floating', '--x58-shadow-modal',
    '--x58-motion-feedback', '--x58-motion-fast', '--x58-motion-standard',
    '--x58-motion-sheet', '--x58-motion-route',
    '--x58-font-display', '--x58-font-ui'
  ];
  for (const token of obligatorios) {
    assert.match(css, new RegExp(`${token}\\s*:`), `falta el token ${token}`);
  }
});

test('los tres namespaces históricos apuntan al sistema, no a valores sueltos', () => {
  const lab = read('src/styles/modern-yellow-lab.css');
  const um = read('src/styles/um-motion-preview.css');
  const base = read('src/styles/index.css');

  assert.match(lab, /--lab-yellow:\s*var\(--x58-yellow\)/);
  assert.match(lab, /--lab-bg:\s*var\(--x58-surface-0\)/);
  assert.match(um, /--um-yellow:\s*var\(--x58-yellow\)/);
  assert.match(base, /--accent-primary:\s*var\(--x58-yellow\)/);
  assert.match(base, /--surface-primary:\s*var\(--x58-surface-0\)/,
    'la capa base volvería al azul pizarra si deja de apuntar al sistema');
});

test('no reaparece un segundo amarillo de marca fuera del sistema', () => {
  // La rampa vive solo en design-system.css. Cualquier otro archivo que
  // declare uno de estos valores estaría abriendo un amarillo paralelo.
  const rampa = /#ffd21f|#ffc400/gi;
  for (const { name, css } of readStyles()) {
    if (name === 'design-system.css') continue;
    const encontrados = css.match(rampa) || [];
    assert.equal(encontrados.length, 0,
      `${name} declara el amarillo de marca a mano (${encontrados.length} veces); debe usar var(--x58-yellow)`);
  }
});

test('la tipografía es autohospedada: ninguna hoja depende de un CDN de fuentes', () => {
  for (const { name, css } of readStyles()) {
    assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/,
      `${name} volvería a pedir fuentes a un CDN`);
  }
  assert.doesNotMatch(read('index.html'), /fonts\.googleapis\.com|fonts\.gstatic\.com/);

  const css = system();
  assert.match(css, /@font-face[\s\S]*?url\('\/fonts\/manrope-latin-variable\.woff2'\)/);
  assert.match(css, /@font-face[\s\S]*?url\('\/fonts\/sora-latin-variable\.woff2'\)/);
  assert.match(css, /font-display:\s*swap/, 'sin font-display: swap el texto queda invisible al cargar');

  for (const archivo of ['public/fonts/manrope-latin-variable.woff2', 'public/fonts/sora-latin-variable.woff2']) {
    assert.ok(fs.existsSync(path.join(root, archivo)), `falta el asset ${archivo}`);
  }
  for (const licencia of ['public/fonts/OFL-Manrope.txt', 'public/fonts/OFL-Sora.txt']) {
    assert.ok(fs.existsSync(path.join(root, licencia)), `falta la licencia ${licencia}`);
  }
});

test('no quedan familias tipográficas que ya no se descargan', () => {
  // Outfit, Inter y JetBrains Mono dejaron de servirse: cualquier regla que
  // las nombre está cayendo silenciosamente al tipo del sistema.
  for (const { name, css } of readStyles()) {
    assert.doesNotMatch(css, /'(Outfit|Inter|JetBrains Mono)'/,
      `${name} nombra una fuente que ya no se carga`);
  }
});

test('los campos de texto usan 16px reales para que iOS no haga zoom', () => {
  const lab = read('src/styles/modern-yellow-lab.css');
  assert.match(lab, /\.liquid-input-box input\s*\{[\s\S]*?font-size:\s*1rem/,
    'por debajo de 16px Safari amplía la pantalla al enfocar el campo');
  assert.match(system(), /input,\s*\n\s*select,\s*\n\s*textarea\s*\{[\s\S]*?font-size:\s*1rem/);
});

test('los controles pequeños conservan un área tocable de 44px', () => {
  const css = system();
  assert.match(css, /\.liquid-eye-toggle::after[\s\S]*?min-width:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  for (const control of ['.liquid-eye-toggle', '.liquid-checkbox', '.liquid-forgot-link', '.role-tab', '.auth-tab']) {
    assert.ok(css.includes(`${control}::after`), `${control} perdió su ampliación de área tocable`);
  }
});

test('las lecturas de dinero y métricas usan cifras tabulares', () => {
  const css = system();
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  for (const selector of ['.earnings-amount', '.kpi-value', '.stat-value', '.topup-row-amount']) {
    assert.ok(css.includes(selector), `${selector} debe llevar cifras tabulares o la cifra baila al refrescarse`);
  }
});

test('el modo claro está diseñado, no invertido', () => {
  const css = system();
  const claro = css.slice(css.indexOf('.theme-light'));
  // Un tema meramente invertido reutilizaría los mismos colores de estado.
  assert.match(claro, /--x58-surface-0:\s*#f2f0ec/, 'el fondo claro debe ser cálido, no blanco puro ni gris azulado');
  assert.match(claro, /--x58-success:\s*#0f7350/, 'los estados necesitan su escalón profundo para contrastar sobre claro');
  assert.match(claro, /color-scheme:\s*light/);
});

test('el movimiento reducido conserva la respuesta de estado', () => {
  // El contrato cambió a proposito. Matar toda transicion a 0.01ms elimina
  // tambien la senal de que algo cambio: quien pide movimiento reducido
  // necesita menos desplazamiento, no quedarse sin informacion.
  const css = system();
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  const bloque = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(bloque, /animation-name:\s*none\s*!important/,
    'el movimiento continuo debe desaparecer por completo');
  assert.match(bloque, /transition-duration:\s*var\(--x58-motion-feedback\)\s*!important/,
    'los controles deben conservar una respuesta breve de color y opacidad');
  assert.match(bloque, /transition-property:\s*color, background-color, border-color, opacity/,
    'la respuesta conservada no debe incluir desplazamiento ni escala');
  assert.match(bloque, /\[class\*='pulse'\][\s\S]*?opacity:\s*1\s*!important/,
    'los indicadores en vivo dejan de latir pero deben seguir visibles');
  assert.match(bloque, /\.x58-grain::before\s*\{\s*display:\s*none/,
    'la textura no debe permanecer con movimiento reducido');
});

test('no vuelve un brillo decorativo permanente sobre los botones', () => {
  const um = read('src/styles/um-motion-preview.css');
  assert.doesNotMatch(um, /umButtonGlow/,
    'un glow infinito en el CTA consume GPU y no comunica ningún estado');
});

test('la animación de barrido se compone en GPU, no recalculando disposición', () => {
  const um = read('src/styles/um-motion-preview.css');
  const bloque = um.match(/@keyframes umEdgeScan\s*\{[\s\S]*?\n\}/);
  assert.ok(bloque, 'falta el keyframe umEdgeScan');
  assert.doesNotMatch(bloque[0], /\bleft:/, 'animar left obliga a recalcular la disposición en cada fotograma');
  assert.match(bloque[0], /transform:\s*translateX/);
});

test('los botones sociales siguen deshabilitados y sin OAuth', () => {
  const landing = read('src/pages/landing.js');
  for (const marca of ['Google', 'Facebook', 'Apple']) {
    assert.ok(landing.includes(marca), `falta el botón de ${marca}`);
  }
  assert.match(landing, /aria-disabled="true"/);
  assert.doesNotMatch(landing, /accounts\.google\.com|connect\.facebook\.net|appleid\.apple\.com|client_id/i,
    'este checkpoint es visual: no debe aparecer OAuth real');
});

test('el Passenger de Antigravity sigue descartado', () => {
  for (const { name, css } of readStyles()) {
    assert.doesNotMatch(css, /live-passenger-nav|luxury-nav-item|sculpted-navbar/,
      `${name} resucita el Passenger descartado`);
  }
});

test('los controles tienen respuesta de pulsación, no solo hover', () => {
  // La auditoria conto 78 reglas :hover frente a 17 :active. En un telefono
  // el hover no existe: sin :active el usuario pulsa y no ve nada.
  const css = system();
  assert.match(css, /button:active[\s\S]*?transform:\s*scale\(\.985\)/);
  assert.match(css, /transition-duration:\s*var\(--x58-motion-feedback\)/);
});

test('deshabilitado, ocupado, error y éxito tienen un contrato único', () => {
  const css = system();
  assert.match(css, /\[aria-disabled='true'\][\s\S]*?cursor:\s*not-allowed\s*!important/,
    'un control deshabilitado con cursor de pulsable miente al usuario');
  assert.match(css, /\[aria-busy='true'\][\s\S]*?cursor:\s*progress/);
  assert.match(css, /\[aria-invalid='true'\][\s\S]*?border-color:\s*var\(--x58-danger\)/);
  assert.match(css, /\.is-success[\s\S]*?border-color:\s*var\(--x58-success\)/);
  assert.match(css, /button:disabled:active[\s\S]*?transform:\s*none/,
    'un control deshabilitado no debe acusar la pulsación');
});

test('las superficies del navegador están tematizadas', () => {
  const css = system();
  assert.match(css, /::selection[\s\S]*?background:\s*var\(--x58-yellow-soft\)/);
  assert.match(css, /caret-color:\s*var\(--x58-yellow\)/);
  assert.match(css, /scrollbar-color:\s*var\(--x58-border-strong\)/);
});

test('la iconografía tiene una escala, no 21 tamaños sueltos', () => {
  const css = system();
  for (const t of ['--x58-icon-inline', '--x58-icon-small', '--x58-icon-default',
                   '--x58-icon-large', '--x58-icon-feature']) {
    assert.match(css, new RegExp(`${t}\s*:`), `falta ${t}`);
  }
  // Los tamanos pasados a icon() deben caer en la escala.
  const escala = new Set([14, 16, 20, 24, 32, 43, 48]);
  const fuera = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(/icon\(\s*'[a-zA-Z0-9_]+'\s*,\s*(\d+)/g)) {
        const n = Number(m[1]);
        if (!escala.has(n)) fuera.push(`${entry.name}:${n}`);
      }
    }
  };
  walk(path.join(root, 'src'));
  assert.deepEqual(fuera, [], `tamaños de icono fuera de escala: ${fuera.slice(0, 8).join(', ')}`);
});

test('no reaparece el rebote con sobreimpulso', () => {
  for (const { name, css } of readStyles()) {
    assert.doesNotMatch(css, /cubic-bezier\([^)]*1\.[0-9]/,
      `${name} usa una curva con sobreimpulso; el sistema usa ease-out exponencial`);
  }
});

test('las superficies principales usan grafito cálido, no pizarra azul', () => {
  // Passenger, Driver y Admin mantenian paletas privadas frias.
  for (const { name, css } of readStyles()) {
    assert.doesNotMatch(css, /rgba\(148\s*,\s*163\s*,\s*184/,
      `${name} vuelve a la linea de pizarra azul`);
    assert.doesNotMatch(css, /rgba\(7\s*,\s*14\s*,\s*23/,
      `${name} vuelve al panel azulado`);
  }
});

/* ---------------------------------------------------------------------------
   Regresiones de la certificación visual de Codex.
   --------------------------------------------------------------------------- */

test('ningún control con área táctil ampliada pierde su anclaje', () => {
  // HIGH 1. `all: unset !important` borraba el position:relative del sistema.
  // El ::after dejaba de anclarse al boton y se dimensionaba contra
  // .liquid-role-pills —bloque contenedor por su transform— pasando de 109px
  // a 344px: el pseudo del ultimo tab tapaba la fila y todos los clics caian
  // en Admin. Un control anclado es la unica garantia de que el pseudo no
  // escape de su boton.
  const sistema = system();

  // 1. Qué controles declaran un ::after de área táctil.
  const bloqueAfter = sistema.match(/([^{}]+)::after\s*\{[^}]*min-width:\s*44px[\s\S]*?\}/);
  assert.ok(bloqueAfter, 'no se encuentra el bloque de áreas táctiles');
  const conArea = bloqueAfter[1]
    .split(',')
    .map(s => s.trim().replace(/::after$/, ''))
    .filter(Boolean);
  assert.ok(conArea.length >= 5, `se esperaban al menos 5 controles, hay ${conArea.length}`);

  // 2. Ninguna regla puede dejarlos sin position tras un `all: unset`.
  for (const { name, css } of readStyles()) {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*all:\s*unset[^{}]*)\}/g)) {
      const selector = m[1];
      const cuerpo = m[2];
      const afectado = conArea.find(c => selector.includes(c));
      if (!afectado) continue;
      assert.match(cuerpo, /position:\s*relative\s*!important/,
        `${name}: la regla "${selector.trim().slice(0, 60)}" hace \`all: unset\` sobre ` +
        `${afectado}, que usa un ::after de área táctil, y no restituye ` +
        `position: relative !important. El pseudo escaparía del botón y ` +
        `capturaría los clics de sus vecinos.`);
    }
  }
});

test('el área táctil nunca se declara más ancha que su propio control', () => {
  // El ::after usa width:100% (del control) con un suelo de 44px. Si alguien
  // lo cambiara a un ancho fijo mayor volveria a invadir a los vecinos.
  const bloque = system().match(/::after\s*\{[^}]*min-width:\s*44px[^}]*\}/);
  assert.ok(bloque, 'falta el bloque de área táctil');
  assert.match(bloque[0], /width:\s*100%/, 'el ancho debe seguir al control, no ser fijo');
  assert.match(bloque[0], /height:\s*100%/);
  assert.doesNotMatch(bloque[0], /(?<!min-)width:\s*\d+px/,
    'un ancho fijo invadiría a los controles vecinos');
});

test('el perfil en tema claro no hereda texto ni superficie del tema oscuro', () => {
  // HIGH 2. `.real-profile-name { color:#fff !important }` no estaba acotado
  // por tema, asi que ganaba tambien en claro: blanco sobre tarjeta blanca.
  // `.real-profile-details` conservaba un slab oscuro dentro de esa tarjeta.
  const lab = read('src/styles/modern-yellow-lab.css');
  const prefijo = 'html.modern-yellow-lab.theme-light ';

  const requeridos = [
    ['.real-profile-name', '--x58-text-primary'],
    ['.real-profile-joined', '--x58-text-secondary'],
    ['.real-profile-details', '--x58-surface-1'],
    ['.real-profile-details label > span', '--x58-text-secondary'],
    ['.real-profile-details strong', '--x58-text-primary']
  ];

  for (const [selector, token] of requeridos) {
    const inicio = lab.indexOf(prefijo + selector + ' {');
    assert.notEqual(inicio, -1, `falta el override claro de ${selector}`);
    const bloque = lab.slice(inicio, lab.indexOf('}', inicio));
    assert.ok(bloque.includes(token),
      `${selector} en claro debe usar ${token}, no un valor suelto`);
  }

  // El override tiene que ir despues de la regla base para ganarle.
  assert.ok(
    lab.indexOf(prefijo + '.real-profile-name') > lab.indexOf('html.modern-yellow-lab .real-profile-name,'),
    'el override claro debe ir despues de la regla base'
  );
});

test('el tema oscuro del perfil no se toca', () => {
  // El oscuro ya estaba certificado: todos los overrides nuevos deben ir
  // acotados a .theme-light y ninguno puede quedar suelto.
  const lab = read('src/styles/modern-yellow-lab.css');
  const inicio = lab.indexOf('PERFIL EN TEMA CLARO');
  assert.notEqual(inicio, -1, 'falta el bloque de perfil claro');
  const bloque = lab.slice(inicio);

  // Cada linea que abre una regla en este bloque debe llevar .theme-light.
  const selectores = bloque
    .split(/\r?\n/)
    .map(linea => linea.trim())
    .filter(linea => linea.startsWith('html') && linea.endsWith('{'));

  assert.ok(selectores.length >= 5, `se esperaban al menos 5 overrides, hay ${selectores.length}`);
  for (const sel of selectores) {
    assert.ok(sel.includes('.theme-light'),
      `el override "${sel.slice(0, 60)}" no esta acotado al tema claro y afectaria al oscuro`);
  }
});
