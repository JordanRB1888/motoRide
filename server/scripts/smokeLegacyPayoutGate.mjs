/**
 * Smoke test del gate de retiros ANTIGUOS contra un despliegue real.
 *
 * POR QUE ES SEGURO EJECUTARLO CONTRA PRODUCCION
 *
 * Ninguna peticion de este script puede crear un retiro, ni siquiera si el gate
 * NO estuviera desplegado. La clave esta en el importe:
 *
 *     amount: 0
 *
 *   · con el gate puesto  -> 403 LEGACY_PAYOUTS_DISABLED  (el gate corta antes)
 *   · sin el gate         -> 400 INVALID_PAYOUT           (el importe es invalido)
 *
 * Los dos desenlaces son inofensivos y se distinguen sin ambiguedad. Un smoke
 * test que mandara un importe valido SI crearia un PAYOUT en caso de que el
 * gate faltara, que es justo el escenario que se esta comprobando.
 *
 * La comprobacion administrativa va DESPUES y solo se ejecuta si la primera
 * confirmo que el gate esta desplegado: comparten modulo y bandera, asi que
 * llegados ahi ya sabemos que cortara antes de debitar.
 *
 * CREDENCIALES
 *
 * No se piden ni se guardan aqui. Se leen del entorno de quien ejecuta:
 *
 *     SMOKE_BASE_URL        https://<dominio del backend>
 *     SMOKE_DRIVER_TOKEN    token de un conductor APROBADO ya existente
 *     SMOKE_ADMIN_TOKEN     token de administracion (opcional)
 *     SMOKE_PAYOUT_ID       id de un PAYOUT en PENDING (opcional)
 *
 * No se imprime ningun token, ni cabeceras, ni cuerpos completos.
 *
 * NO CREA USUARIOS, NO CREA VIAJES, NO MIGRA NADA Y NO ESCRIBE EN LA BASE.
 */

const base = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');
const tokenConductor = process.env.SMOKE_DRIVER_TOKEN || '';
const tokenAdmin = process.env.SMOKE_ADMIN_TOKEN || '';
const idDeRetiro = process.env.SMOKE_PAYOUT_ID || '';

const ERROR_ESPERADO = 'LEGACY_PAYOUTS_DISABLED';

if (!base) {
  console.error('Falta SMOKE_BASE_URL.');
  process.exit(1);
}
if (!/^https:\/\//.test(base)) {
  console.error('SMOKE_BASE_URL debe ser HTTPS.');
  process.exit(1);
}

const resultados = [];
const anotar = (nombre, ok, detalle) => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? '  OK  ' : ' FALLA'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const pedir = (ruta, opciones = {}) => fetch(`${base}${ruta}`, opciones);

const conAutorizacion = (token, extra = {}) => ({
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  ...extra
});

console.log(`Smoke del gate de retiros antiguos\ndestino: ${base}\n`);

// ---------------------------------------------------------------------------
// 1. El servicio responde, y decimos QUE version
// ---------------------------------------------------------------------------

let saludOk = false;
try {
  const salud = await pedir('/api/health');
  const cuerpo = await salud.json();
  saludOk = salud.status === 200 && cuerpo.status === 'ok';
  anotar('el servicio responde', saludOk, `estado ${salud.status}`);
} catch (error) {
  anotar('el servicio responde', false, error instanceof Error ? error.message : 'sin respuesta');
}

if (!saludOk) {
  console.error('\nEl servicio no responde. Se detiene: sin servicio no hay nada que comprobar.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Sin token sigue siendo 401 — la autenticacion manda ANTES que el gate
// ---------------------------------------------------------------------------

try {
  const anonimo = await pedir('/api/wallet/payouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 0 })
  });
  const cuerpo = await anonimo.json().catch(() => ({}));
  const ok = anonimo.status === 401 && cuerpo.error !== ERROR_ESPERADO;
  anotar('sin token -> 401, y el gate no se adelanta a la autenticacion', ok,
    `estado ${anonimo.status}`);
} catch (error) {
  anotar('sin token -> 401', false, error instanceof Error ? error.message : 'sin respuesta');
}

// ---------------------------------------------------------------------------
// 3. LA COMPROBACION PRINCIPAL — y la que no puede crear nada
// ---------------------------------------------------------------------------

let gateDesplegado = false;

if (!tokenConductor) {
  anotar('POST /api/wallet/payouts bloqueado', false,
    'SIN COMPROBAR: falta SMOKE_DRIVER_TOKEN (conductor aprobado ya existente)');
} else {
  try {
    const respuesta = await pedir('/api/wallet/payouts', conAutorizacion(tokenConductor, {
      method: 'POST',
      body: JSON.stringify({ amount: 0 })
    }));
    const cuerpo = await respuesta.json().catch(() => ({}));

    if (respuesta.status === 403 && cuerpo.error === ERROR_ESPERADO) {
      gateDesplegado = true;
      anotar('POST /api/wallet/payouts BLOQUEADO por el gate', true, '403 LEGACY_PAYOUTS_DISABLED');
    } else if (respuesta.status === 400 && cuerpo.error === 'INVALID_PAYOUT') {
      anotar('POST /api/wallet/payouts BLOQUEADO por el gate', false,
        'EL GATE NO ESTA DESPLEGADO: llego a la validacion de importe (400 INVALID_PAYOUT)');
    } else {
      anotar('POST /api/wallet/payouts BLOQUEADO por el gate', false,
        `respuesta inesperada: ${respuesta.status} ${cuerpo.error ?? ''}`);
    }
  } catch (error) {
    anotar('POST /api/wallet/payouts BLOQUEADO por el gate', false,
      error instanceof Error ? error.message : 'sin respuesta');
  }

  // Y la cartera sigue accesible y sin retiros nuevos: la peticion anterior no
  // dejo rastro.
  try {
    const cartera = await pedir('/api/wallet/me', { headers: { authorization: `Bearer ${tokenConductor}` } });
    const cuerpo = await cartera.json();
    const pendientes = (cuerpo.transactions || []).filter(t => t.type === 'PAYOUT' && t.status === 'PENDING');
    anotar('la cartera responde y no aparecio ningun retiro nuevo', cartera.status === 200,
      `estado ${cartera.status} · retiros PENDING existentes: ${pendientes.length}`);
  } catch (error) {
    anotar('la cartera responde', false, error instanceof Error ? error.message : 'sin respuesta');
  }
}

// ---------------------------------------------------------------------------
// 4. La rama administrativa — SOLO si ya sabemos que el gate esta desplegado
// ---------------------------------------------------------------------------

if (!tokenAdmin) {
  anotar('rama admin PAYOUT+APPROVED bloqueada', false,
    'SIN COMPROBAR: falta SMOKE_ADMIN_TOKEN');
} else if (!idDeRetiro) {
  anotar('rama admin PAYOUT+APPROVED bloqueada', false,
    'SIN COMPROBAR: falta SMOKE_PAYOUT_ID (un PAYOUT en PENDING)');
} else if (!gateDesplegado) {
  // Se niega a intentarlo. Si el gate no estuviera, esta peticion DEBITARIA el
  // saldo de una persona real.
  anotar('rama admin PAYOUT+APPROVED bloqueada', false,
    'NO SE INTENTA: el gate no se confirmo en el paso anterior, y sin el esta peticion debitaria saldo real');
} else {
  try {
    const respuesta = await pedir(`/api/admin/transactions/${encodeURIComponent(idDeRetiro)}`,
      conAutorizacion(tokenAdmin, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED' }) }));
    const cuerpo = await respuesta.json().catch(() => ({}));
    const ok = respuesta.status === 403 && cuerpo.error === ERROR_ESPERADO;
    anotar('rama admin PAYOUT+APPROVED BLOQUEADA', ok,
      `estado ${respuesta.status} ${cuerpo.error ?? ''}`);
  } catch (error) {
    anotar('rama admin PAYOUT+APPROVED BLOQUEADA', false,
      error instanceof Error ? error.message : 'sin respuesta');
  }
}

// ---------------------------------------------------------------------------
// 5. No regresion: la ruta administrativa sigue viva para lo que NO es PAYOUT
// ---------------------------------------------------------------------------

if (tokenAdmin) {
  try {
    // Un identificador que no existe: la ruta debe contestar 404 como siempre.
    // Si contestara con el error del gate, estaria bloqueando de mas.
    const respuesta = await pedir('/api/admin/transactions/transaction_inexistente_smoke',
      conAutorizacion(tokenAdmin, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED' }) }));
    const cuerpo = await respuesta.json().catch(() => ({}));
    const ok = respuesta.status === 404 && cuerpo.error !== ERROR_ESPERADO;
    anotar('la ruta admin sigue viva para lo que no es PAYOUT', ok,
      `estado ${respuesta.status} ${cuerpo.error ?? ''}`);
  } catch (error) {
    anotar('la ruta admin sigue viva', false, error instanceof Error ? error.message : 'sin respuesta');
  }
}

// ---------------------------------------------------------------------------

const fallos = resultados.filter(r => !r.ok);
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones en verde.`);

if (fallos.length > 0) {
  console.log('\nSIN CONFIRMAR o EN FALLO:');
  for (const fallo of fallos) console.log(`  · ${fallo.nombre} — ${fallo.detalle}`);
  console.log('\nNo continuar con WALLET-PAYOUTS-1B.');
  process.exit(1);
}

console.log('El gate esta desplegado y bloqueando. Los flujos que no son PAYOUT siguen intactos.');
