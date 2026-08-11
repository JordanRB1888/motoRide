import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  LIGHT_THEME_CLASS,
  THEME_STORAGE_KEY,
  applyTheme,
  hasStoredThemePreference,
  isModernExperienceEnabled,
  normalizeTheme,
  oppositeTheme,
  persistTheme,
  readAppliedTheme,
  readStoredTheme,
  resolveInitialTheme,
  resolveTheme
} from '../src/utils/themePreference.js';

/** localStorage mínimo en memoria, sin depender del navegador. */
function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    get size() { return data.size; },
    raw: data
  };
}

/** Doble del elemento raíz con la parte de classList que usa el helper. */
function createRoot(classes = []) {
  const set = new Set(classes);
  return {
    classList: {
      add: name => set.add(name),
      remove: name => set.delete(name),
      contains: name => set.has(name),
      toggle: (name, force) => {
        if (force === undefined) return set.has(name) ? (set.delete(name), false) : (set.add(name), true);
        if (force) set.add(name); else set.delete(name);
        return force;
      }
    },
    get className() { return [...set].join(' '); }
  };
}

test('sin preferencia guardada el tema es oscuro', () => {
  const storage = createStorage();
  assert.equal(readStoredTheme(storage), null);
  assert.equal(resolveTheme(readStoredTheme(storage)), 'dark');
  assert.equal(resolveInitialTheme({ storedValue: readStoredTheme(storage) }), 'dark');
  assert.equal(DEFAULT_THEME, 'dark');
  // Resolver el tema no debe escribir nada por su cuenta.
  assert.equal(storage.size, 0);
});

test('la preferencia light se respeta', () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'light' });
  assert.equal(readStoredTheme(storage), 'light');
  assert.equal(resolveTheme('light'), 'light');
  assert.equal(resolveInitialTheme({ storedValue: 'light' }), 'light');
});

test('la preferencia dark se respeta', () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'dark' });
  assert.equal(readStoredTheme(storage), 'dark');
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveInitialTheme({ storedValue: 'dark' }), 'dark');
});

test('un valor inválido vuelve al predeterminado oscuro', () => {
  const invalidos = ['neon', '', '   ', 'DARKNESS', null, undefined, 42, {}, [], true];
  for (const valor of invalidos) {
    assert.equal(resolveTheme(valor), 'dark', `debió caer en oscuro: ${String(valor)}`);
    assert.equal(hasStoredThemePreference(valor), false);
  }
  // Y las variantes escritas de otra forma sí se reconocen.
  assert.equal(resolveTheme('LIGHT'), 'light');
  assert.equal(resolveTheme('  Dark  '), 'dark');
  assert.equal(hasStoredThemePreference('light'), true);
  assert.equal(hasStoredThemePreference('dark'), true);
  assert.equal(normalizeTheme('sepia'), null);
});

test('classic=1 desactiva la experiencia moderna sin tocar el tema', () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'light' });

  assert.equal(isModernExperienceEnabled('?classic=1'), false);
  assert.equal(isModernExperienceEnabled('?classic=0'), true);
  assert.equal(isModernExperienceEnabled(''), true);
  assert.equal(isModernExperienceEnabled('?otro=1'), true);

  // La preferencia sobrevive intacta a la carga en modo clásico.
  assert.equal(resolveInitialTheme({ storedValue: readStoredTheme(storage), search: '?classic=1' }), 'light');
  assert.equal(readStoredTheme(storage), 'light');
  assert.equal(storage.size, 1);
});

test('el arranque no sobrescribe la preferencia guardada', () => {
  // Reproduce lo que hace main.js: resolver y aplicar, nunca escribir.
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'light' });
  const root = createRoot();

  const aplicado = applyTheme(
    resolveInitialTheme({ storedValue: readStoredTheme(storage), search: '' }),
    root
  );

  assert.equal(aplicado, 'light');
  assert.equal(root.classList.contains(LIGHT_THEME_CLASS), true);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'light', 'el arranque no debe pisar la preferencia');
});

test('cambiar de tema actualiza y conserva la preferencia', () => {
  const storage = createStorage();
  const root = createRoot();

  // Primera carga: oscuro por omisión, sin nada guardado todavía.
  let activo = applyTheme(resolveInitialTheme({ storedValue: readStoredTheme(storage) }), root);
  assert.equal(activo, 'dark');
  assert.equal(root.classList.contains(LIGHT_THEME_CLASS), false);
  assert.equal(storage.size, 0);

  // El usuario pulsa el botón: pasa a claro y se guarda.
  activo = applyTheme(oppositeTheme(readAppliedTheme(root)), root);
  persistTheme(activo, storage);
  assert.equal(activo, 'light');
  assert.equal(root.classList.contains(LIGHT_THEME_CLASS), true);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'light');

  // Recarga: la elección se mantiene.
  const rootTrasRecarga = createRoot();
  const trasRecarga = applyTheme(resolveInitialTheme({ storedValue: readStoredTheme(storage) }), rootTrasRecarga);
  assert.equal(trasRecarga, 'light');
  assert.equal(rootTrasRecarga.classList.contains(LIGHT_THEME_CLASS), true);

  // Vuelve a oscuro: también persiste.
  const vuelta = applyTheme(oppositeTheme(readAppliedTheme(rootTrasRecarga)), rootTrasRecarga);
  persistTheme(vuelta, storage);
  assert.equal(vuelta, 'dark');
  assert.equal(rootTrasRecarga.classList.contains(LIGHT_THEME_CLASS), false);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'dark');

  const rootFinal = createRoot();
  assert.equal(applyTheme(resolveInitialTheme({ storedValue: readStoredTheme(storage) }), rootFinal), 'dark');
});

test('el botón anuncia el tema que está realmente pintado', () => {
  const etiqueta = theme => (theme === 'light' ? 'Modo Día' : 'Modo Noche');

  const claro = createRoot([LIGHT_THEME_CLASS]);
  assert.equal(readAppliedTheme(claro), 'light');
  assert.equal(etiqueta(readAppliedTheme(claro)), 'Modo Día');

  const oscuro = createRoot();
  assert.equal(readAppliedTheme(oscuro), 'dark');
  assert.equal(etiqueta(readAppliedTheme(oscuro)), 'Modo Noche');

  // Aunque lo guardado y lo pintado difieran, manda lo pintado.
  const desincronizado = createRoot();
  assert.equal(readAppliedTheme(desincronizado), 'dark');
  assert.equal(oppositeTheme(readAppliedTheme(desincronizado)), 'light');
});

test('light=1 fuerza el modo claro solo para esa carga', () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'dark' });
  assert.equal(resolveInitialTheme({ storedValue: readStoredTheme(storage), search: '?light=1' }), 'light');
  // Sin persistir: la preferencia real sigue siendo oscura.
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'dark');
  assert.equal(resolveInitialTheme({ storedValue: readStoredTheme(storage), search: '' }), 'dark');
});

test('un almacenamiento inaccesible no rompe la resolución del tema', () => {
  const bloqueado = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  assert.equal(readStoredTheme(bloqueado), null);
  assert.equal(resolveTheme(readStoredTheme(bloqueado)), 'dark');
  // Persistir tampoco debe lanzar: el tema queda aplicado en memoria.
  assert.equal(persistTheme('light', bloqueado), 'light');
  assert.equal(readStoredTheme(undefined), null);
  assert.equal(persistTheme('light', undefined), 'light');
});

test('persistTheme normaliza antes de guardar', () => {
  const storage = createStorage();
  assert.equal(persistTheme('LIGHT', storage), 'light');
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(persistTheme('basura', storage), 'dark');
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'dark');
  assert.equal(oppositeTheme('light'), 'dark');
  assert.equal(oppositeTheme('dark'), 'light');
  assert.equal(oppositeTheme('basura'), 'light');
});
