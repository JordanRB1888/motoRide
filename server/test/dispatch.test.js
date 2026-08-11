import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { DatabaseSync } from 'node:sqlite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pasajero, conductor y administración comparten el ciclo de una carrera', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-'));
  const dataFile = path.join(tempDir, 'database.json');
  const port = 4100 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 5000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });

  const url = `http://127.0.0.1:${port}`;
  const login = async (identifier, password, role) => {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password, role })
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };
  const adminToken = await login('admin@58express.com', 'admin', 'admin');
  const passengerRegistration = await fetch(`${url}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:'pasajero.real@58express.com',phone:'+584120003333',password:'password123',role:'passenger',firstName:'Ana',lastName:'Cliente'}) });
  assert.equal(passengerRegistration.status, 201);
  const passengerAccount = await passengerRegistration.json();
  const driverCreation = await fetch(`${url}/api/admin/drivers`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`}, body:JSON.stringify({email:'conductor.real@58express.com',phone:'+584140004444',firstName:'Carlos',lastName:'Conductor',vehicleBrand:'Bera',vehicleModel:'BR200',vehiclePlate:'TEST58'}) });
  assert.equal(driverCreation.status, 201);
  const driverAccount = await driverCreation.json();
  const passengerToken = passengerAccount.token;
  const driverToken = await login('conductor.real@58express.com', driverAccount.temporaryPassword, 'driver');
  const passengerId = passengerAccount.user.id;
  const driverId = driverAccount.user.id;
  const walletBefore = await fetch(`${url}/api/wallet/me`, { headers:{ authorization:`Bearer ${passengerToken}` } });
  assert.equal((await walletBefore.json()).balance, 0);
  const topupResponse = await fetch(`${url}/api/wallet/topups`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${passengerToken}`}, body:JSON.stringify({amount:10,reference:'12345678'}) });
  assert.equal(topupResponse.status, 201);
  const topup = await topupResponse.json();
  const walletPending = await fetch(`${url}/api/wallet/me`, { headers:{ authorization:`Bearer ${passengerToken}` } });
  assert.equal((await walletPending.json()).balance, 0);
  const unconfirmedTopup = await fetch(`${url}/api/admin/transactions/${topup.id}`, { method:'PATCH', headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`}, body:JSON.stringify({status:'APPROVED'}) });
  assert.equal(unconfirmedTopup.status, 400);
  const approveTopup = await fetch(`${url}/api/admin/transactions/${topup.id}`, { method:'PATCH', headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`}, body:JSON.stringify({status:'APPROVED',referenceConfirmed:true,reviewNote:'Referencia validada en banco'}) });
  assert.equal(approveTopup.status, 200);
  assert.equal((await approveTopup.json()).balance, 10);
  const duplicateApproval = await fetch(`${url}/api/admin/transactions/${topup.id}`, { method:'PATCH', headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`}, body:JSON.stringify({status:'APPROVED',referenceConfirmed:true}) });
  assert.equal(duplicateApproval.status, 409);
  const walletCredited = await fetch(`${url}/api/wallet/me`, { headers:{ authorization:`Bearer ${passengerToken}` } });
  assert.equal((await walletCredited.json()).balance, 10);
  const unaffordableRide = await fetch(`${url}/api/trips/create`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${passengerToken}`}, body:JSON.stringify({id:'too_expensive',pickup:{lat:10.6427,lng:-71.6125},destination:{lat:10.65,lng:-71.60},fareUSD:25,paymentMethod:'wallet'}) });
  assert.equal(unaffordableRide.status, 402);
  assert.equal((await unaffordableRide.json()).error, 'INSUFFICIENT_WALLET_BALANCE');
  const scheduledResponse = await fetch(`${url}/api/trips/scheduled`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${passengerToken}`}, body:JSON.stringify({pickup:{address:'Vereda del Lago'},destination:{address:'Sambil Maracaibo'},scheduledAt:new Date(Date.now()+60*60*1000).toISOString(),fareUSD:4.5,rideType:'MOTO'}) });
  assert.equal(scheduledResponse.status, 201);
  const scheduledTrip = await scheduledResponse.json();
  const claimScheduled = await fetch(`${url}/api/trips/scheduled/${scheduledTrip.id}/claim`, { method:'POST', headers:{authorization:`Bearer ${driverToken}`}});
  assert.equal(claimScheduled.status, 200);
  assert.equal((await claimScheduled.json()).driverId, driverId);
  const cancellableSchedule = await fetch(`${url}/api/trips/scheduled`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${passengerToken}`}, body:JSON.stringify({pickup:{address:'La Limpia'},destination:{address:'Vereda del Lago'},scheduledAt:new Date(Date.now()+2*60*60*1000).toISOString(),fareUSD:5,rideType:'MOTO'}) });
  const cancellableTrip = await cancellableSchedule.json();
  const cancelSchedule = await fetch(`${url}/api/trips/scheduled/${cancellableTrip.id}`, { method:'DELETE', headers:{authorization:`Bearer ${passengerToken}`} });
  assert.equal(cancelSchedule.status, 200);
  assert.equal((await cancelSchedule.json()).status, 'CANCELLED');
  const passenger = io(url, { auth: { token: passengerToken } });
  const driver = io(url, { auth: { token: driverToken } });
  const admin = io(url, { auth: { token: adminToken } });
  t.after(() => [passenger, driver, admin].forEach(socket => socket.close()));

  let adminSawRequest = false;
  admin.on('rideRequested', trip => {
    if (trip.id === 'test_trip') adminSawRequest = true;
  });
  driver.on('connect', () => driver.emit('driver:connect', { userId: driverId, status: 'AVAILABLE' }));
  driver.on('driver:connected', () => driver.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 }));
  driver.on('rideRequested', trip => {
    if (['test_trip', 'cash_trip'].includes(trip.id)) {
      driver.emit('rideAccepted', { tripId: trip.id, driver: { id: driverId, firstName: 'Carlos' } });
    }
  });

  await Promise.all([
    new Promise(resolve => passenger.on('connect', resolve)),
    new Promise(resolve => driver.on('driver:connected', resolve)),
    new Promise(resolve => admin.on('connect', resolve))
  ]);
  await new Promise(resolve => setTimeout(resolve, 100));

  const updatePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó la asignación')), 5000);
    passenger.on('tripStatusUpdated', update => {
      if (update.tripId === 'test_trip' && update.status === 'EN_ROUTE') {
        clearTimeout(timeout);
        resolve(update);
      }
    });
  });

  // El viaje se crea por REST: `rideRequested` entrante ya no crea viajes.
  const tripCreation = await fetch(`${url}/api/trips/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${passengerToken}` },
    body: JSON.stringify({
      id: 'test_trip',
      pickup: { lat: 10.6427, lng: -71.6125 },
      destination: { lat: 10.65, lng: -71.60 },
      fareEUR: 4.5,
      paymentMethod: 'wallet'
    })
  });
  assert.equal(tripCreation.status, 200);

  const update = await updatePromise;
  assert.equal(adminSawRequest, true);
  assert.equal(update.driver.id, driverId);

  const locationPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó el GPS del conductor')), 5000);
    passenger.on('driverLocationUpdated', location => {
      if (location.tripId === 'test_trip' && location.driverId === driverId) {
        clearTimeout(timeout);
        resolve(location);
      }
    });
  });
  driver.emit('driver:location_update', { latitude: 10.643, longitude: -71.613, heading: 45 });
  const location = await locationPromise;
  assert.equal(location.lat, 10.643);

  const passengerLocationPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó el GPS del pasajero')), 5000);
    driver.on('passengerLocationUpdated', location => {
      if (location.tripId === 'test_trip') {
        clearTimeout(timeout);
        resolve(location);
      }
    });
  });
  passenger.emit('passenger:location_update', { latitude: 10.644, longitude: -71.614 });
  const passengerLocation = await passengerLocationPromise;
  assert.equal(passengerLocation.passengerId, passengerId);

  const activeResponse = await fetch(`${url}/api/trips/active/me`, {
    headers: { authorization: `Bearer ${passengerToken}` }
  });
  assert.equal(activeResponse.status, 200);
  assert.equal((await activeResponse.json()).trip.id, 'test_trip');

  const chatPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó el mensaje al conductor')), 5000);
    driver.on('chat:message', message => {
      if (message.tripId === 'test_trip' && message.text === 'Voy saliendo') {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });
  passenger.emit('chat:send_message', { tripId: 'test_trip', text: 'Voy saliendo' });
  const message = await chatPromise;
  assert.equal(message.senderId, passengerId);

  const historyResponse = await fetch(`${url}/api/trips/test_trip/messages`, {
    headers: { authorization: `Bearer ${passengerToken}` }
  });
  assert.equal(historyResponse.status, 200);
  assert.equal((await historyResponse.json()).length, 1);

  const completedPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No llegó la finalización al pasajero')), 5000);
    passenger.on('tripStatusUpdated', update => {
      if (update.tripId === 'test_trip' && update.status === 'COMPLETED') {
        clearTimeout(timeout);
        resolve(update);
      }
    });
  });
  driver.emit('tripStatusUpdated', { tripId: 'test_trip', status: 'ARRIVED' });
  await new Promise(resolve => setTimeout(resolve, 80));
  driver.emit('tripStatusUpdated', { tripId: 'test_trip', status: 'IN_PROGRESS' });
  await new Promise(resolve => setTimeout(resolve, 80));
  driver.emit('tripStatusUpdated', { tripId: 'test_trip', status: 'COMPLETED' });
  await completedPromise;

  const passengerWalletResponse = await fetch(`${url}/api/wallet/me`, { headers:{authorization:`Bearer ${passengerToken}`} });
  const passengerWallet = await passengerWalletResponse.json();
  assert.equal(passengerWallet.balance, 5.5);
  const ridePayments = passengerWallet.transactions.filter(transaction => transaction.type === 'RIDE_PAYMENT' && transaction.tripId === 'test_trip');
  assert.equal(ridePayments.length, 1);
  assert.equal(ridePayments[0].amount, -4.5);
  driver.emit('tripStatusUpdated', { tripId: 'test_trip', status: 'COMPLETED' });
  await new Promise(resolve => setTimeout(resolve, 80));
  const walletAfterDuplicateCompletion = await fetch(`${url}/api/wallet/me`, { headers:{authorization:`Bearer ${passengerToken}`} });
  const walletAfterDuplicate = await walletAfterDuplicateCompletion.json();
  assert.equal(walletAfterDuplicate.balance, 5.5);
  assert.equal(walletAfterDuplicate.transactions.filter(transaction => transaction.type === 'RIDE_PAYMENT' && transaction.tripId === 'test_trip').length, 1);

  const driverWalletResponse = await fetch(`${url}/api/wallet/me`, { headers:{authorization:`Bearer ${driverToken}`} });
  const driverWallet = await driverWalletResponse.json();
  assert.ok(driverWallet.balance > 0);
  const payoutResponse = await fetch(`${url}/api/wallet/payouts`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${driverToken}`}, body:JSON.stringify({amount:driverWallet.balance}) });
  assert.equal(payoutResponse.status, 201);
  const payout = await payoutResponse.json();
  const approvePayout = await fetch(`${url}/api/admin/transactions/${payout.id}`, { method:'PATCH', headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`}, body:JSON.stringify({status:'APPROVED'}) });
  assert.equal(approvePayout.status, 200);
  assert.equal((await approvePayout.json()).balance, 0);

  const pendingReviewResponse = await fetch(`${url}/api/trips/pending-review/me`, {
    headers: { authorization: `Bearer ${passengerToken}` }
  });
  assert.equal(pendingReviewResponse.status, 200);
  assert.equal((await pendingReviewResponse.json()).trip.id, 'test_trip');

  const passengerHistoryResponse = await fetch(`${url}/api/trips/me/history`, { headers:{authorization:`Bearer ${passengerToken}`} });
  const passengerHistory = await passengerHistoryResponse.json();
  assert.equal(passengerHistoryResponse.status, 200);
  assert.ok(passengerHistory.some(trip => trip.id === 'test_trip'));
  const driverHistoryResponse = await fetch(`${url}/api/trips/me/history`, { headers:{authorization:`Bearer ${driverToken}`} });
  assert.ok((await driverHistoryResponse.json()).some(trip => trip.id === 'test_trip'));

  const ratingPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No se registró la calificación del pasajero')), 5000);
    passenger.on('tripRatingUpdated', update => {
      if (update.tripId === 'test_trip' && update.role === 'passenger') {
        clearTimeout(timeout);
        resolve(update);
      }
    });
  });
  passenger.emit('tripRated', { tripId: 'test_trip', rating: 5, tags: ['Manejo seguro'], tipEUR: 1, targetRole: 'driver' });
  await ratingPromise;
  const noPendingReviewResponse = await fetch(`${url}/api/trips/pending-review/me`, {
    headers: { authorization: `Bearer ${passengerToken}` }
  });
  assert.equal(noPendingReviewResponse.status, 204);

  const persistedDb = new DatabaseSync(dataFile, { readOnly: true });
  const persisted = JSON.parse(persistedDb.prepare('SELECT payload FROM trips WHERE id = ?').get('test_trip').payload);
  persistedDb.close();
  assert.equal(persisted.status, 'COMPLETED');
  assert.equal(persisted.driverReview.rating, 5);
  assert.equal(persisted.driverReview.tipEUR, 1);

  const cashAssigned = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No se asignó la carrera en efectivo')), 5000);
    passenger.on('tripStatusUpdated', update => {
      if (update.tripId === 'cash_trip' && update.status === 'EN_ROUTE') { clearTimeout(timeout); resolve(update); }
    });
  });
  const cashCreation = await fetch(`${url}/api/trips/create`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${passengerToken}`}, body:JSON.stringify({id:'cash_trip',pickup:{lat:10.6427,lng:-71.6125},destination:{lat:10.65,lng:-71.60},fareUSD:10,paymentMethod:'efectivo',rideType:'MOTO'}) });
  assert.equal(cashCreation.status,200);await cashAssigned;
  driver.emit('tripStatusUpdated',{tripId:'cash_trip',status:'ARRIVED'});await new Promise(resolve=>setTimeout(resolve,60));
  driver.emit('tripStatusUpdated',{tripId:'cash_trip',status:'IN_PROGRESS'});await new Promise(resolve=>setTimeout(resolve,60));
  const cashCompleted = new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('No finalizó la carrera en efectivo')),5000);passenger.on('tripStatusUpdated',update=>{if(update.tripId==='cash_trip'&&update.status==='COMPLETED'){clearTimeout(timeout);resolve(update);}});});
  driver.emit('tripStatusUpdated',{tripId:'cash_trip',status:'COMPLETED'});await cashCompleted;
  const driverDebtResponse=await fetch(`${url}/api/wallet/me`,{headers:{authorization:`Bearer ${driverToken}`}});const driverDebt=await driverDebtResponse.json();
  assert.equal(driverDebt.balance,-1.5);const commissionEntries=driverDebt.transactions.filter(transaction=>transaction.type==='PLATFORM_COMMISSION'&&transaction.tripId==='cash_trip');assert.equal(commissionEntries.length,1);assert.equal(commissionEntries[0].amount,-1.5);
  const passengerAfterCash=await fetch(`${url}/api/wallet/me`,{headers:{authorization:`Bearer ${passengerToken}`}});assert.equal((await passengerAfterCash.json()).balance,5.5);
  const debtTopupResponse=await fetch(`${url}/api/wallet/topups`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${driverToken}`},body:JSON.stringify({amount:5,reference:'87654321'})});
  assert.equal(debtTopupResponse.status,201);const debtTopup=await debtTopupResponse.json();
  const approveDebtTopup=await fetch(`${url}/api/admin/transactions/${debtTopup.id}`,{method:'PATCH',headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`},body:JSON.stringify({status:'APPROVED',referenceConfirmed:true})});
  assert.equal(approveDebtTopup.status,200);assert.equal((await approveDebtTopup.json()).balance,3.5);
});
