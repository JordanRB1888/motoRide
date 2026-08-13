import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0]);
const requiredDocs=['identity_front','identity_back','driver_license','vehicle_registration','vehicle_photo','plate_photo','driver_selfie'];

async function start(t){const dir=await mkdtemp(path.join(tmpdir(),'plus58-driver-app-'));const port=4900+Math.floor(Math.random()*300);const child=spawn(process.execPath,['index.js'],{cwd:serverDir,env:{...process.env,PORT:String(port),DATA_FILE:path.join(dir,'db.sqlite'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'test-secret'},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server timeout')),5000);child.stdout.on('data',chunk=>{if(chunk.toString().includes('Running')){clearTimeout(timer);resolve();}});child.once('exit',code=>reject(new Error(`exit ${code}`)));});return `http://127.0.0.1:${port}/api`;}
async function login(api,identifier,password,role){const response=await fetch(`${api}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier,password,role})});assert.equal(response.status,200);return response.json();}
function applicationForm(email='+58driver@example.com',phone='+584120009999',overrides={}){const form=new FormData();Object.entries({firstName:'María',lastName:'Conductora',identityNumber:'V-24.680.135',birthDate:'1994-05-20',phone,email,password:'ClaveSegura123',address:'Avenida principal, Maracaibo',city:'Maracaibo',region:'Zulia',vehicleType:'MOTO',vehicleBrand:'Bera',vehicleModel:'BR200',vehicleYear:'2024',vehicleColor:'Amarillo',vehiclePlate:'APP58X',...overrides}).forEach(([key,value])=>form.append(key,value));requiredDocs.forEach(type=>form.append(type,new Blob([png],{type:'image/png'}),`${type}.png`));return form;}

test('solicitud real: documentos privados, correcciones, auditoría y aprobación',async t=>{const api=await start(t);const admin=await login(api,'admin@58express.com','admin','admin');
  const incomplete=await fetch(`${api}/driver-applications`,{method:'POST',body:new FormData()});assert.equal(incomplete.status,400);
  const createdResponse=await fetch(`${api}/driver-applications`,{method:'POST',body:applicationForm()});assert.equal(createdResponse.status,201);const created=await createdResponse.json();assert.equal(created.application.status,'pending');assert.equal(created.application.personal.identityNumber,'V-24680135');assert.equal(created.user.role,'passenger');assert.equal(created.application.documents.length,7);
  const wrongPassword=await fetch(`${api}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'+58driver@example.com',password:'incorrecta',role:'driver'})});assert.equal(wrongPassword.status,401);
  const pendingDriverLogin=await fetch(`${api}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'+58driver@example.com',password:'ClaveSegura123',role:'driver'})});assert.equal(pendingDriverLogin.status,403);assert.equal((await pendingDriverLogin.json()).applicationStatus,'pending');
  const forbiddenList=await fetch(`${api}/admin/driver-applications`,{headers:{authorization:`Bearer ${created.token}`}});assert.equal(forbiddenList.status,403);
  const privateDocument=created.application.documents[0];const ownerFile=await fetch(`${api}/driver-documents/${privateDocument.id}/content`,{headers:{authorization:`Bearer ${created.token}`}});assert.equal(ownerFile.status,200);assert.equal(ownerFile.headers.get('cache-control'),'private, no-store, max-age=0');
  const strangerResponse=await fetch(`${api}/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'stranger@example.com',phone:'+584120008888',password:'ClaveSegura123',role:'passenger',firstName:'Otra',lastName:'Persona'})});const stranger=await strangerResponse.json();const stolen=await fetch(`${api}/driver-documents/${privateDocument.id}/content`,{headers:{authorization:`Bearer ${stranger.token}`}});assert.equal(stolen.status,403);
  const adminFile=await fetch(`${api}/driver-documents/${privateDocument.id}/content`,{headers:{authorization:`Bearer ${admin.token}`}});assert.equal(adminFile.status,200);
  const needsChanges=await fetch(`${api}/admin/driver-applications/${created.application.id}/decision`,{method:'PATCH',headers:{'content-type':'application/json',authorization:`Bearer ${admin.token}`},body:JSON.stringify({action:'needs_changes',reason:'La licencia debe verse con mayor nitidez.',requestedChanges:['driver_license']})});assert.equal(needsChanges.status,200);assert.equal((await needsChanges.json()).application.status,'needs_changes');
  const replacement=new FormData();replacement.append('file',new Blob([png],{type:'image/png'}),'licencia-nueva.png');const replaced=await fetch(`${api}/driver-applications/me/documents/driver_license`,{method:'PUT',headers:{authorization:`Bearer ${created.token}`},body:replacement});assert.equal(replaced.status,200);
  const submitted=await fetch(`${api}/driver-applications/me/submit`,{method:'POST',headers:{authorization:`Bearer ${created.token}`}});assert.equal(submitted.status,200);assert.equal((await submitted.json()).status,'pending');
  const approval=await fetch(`${api}/admin/driver-applications/${created.application.id}/decision`,{method:'PATCH',headers:{'content-type':'application/json',authorization:`Bearer ${admin.token}`},body:JSON.stringify({action:'approve'})});assert.equal(approval.status,200);assert.equal((await approval.json()).user.role,'driver');
  const me=await fetch(`${api}/auth/me`,{headers:{authorization:`Bearer ${created.token}`}});const approvedUser=await me.json();assert.equal(approvedUser.role,'driver');assert.equal(approvedUser.isVerified,true);
  const approvedDriverLogin=await fetch(`${api}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'+58driver@example.com',password:'ClaveSegura123',role:'driver'})});assert.equal(approvedDriverLogin.status,200);
  const audit=await fetch(`${api}/admin/actions`,{headers:{authorization:`Bearer ${admin.token}`}});const actions=await audit.json();assert.deepEqual(actions.map(item=>item.action).sort(),['approve','needs_changes']);
});

test('un pasajero existente puede solicitar ser conductor con su misma cuenta',async t=>{const api=await start(t);
  const registration=await fetch(`${api}/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({firstName:'Pedro',lastName:'Pérez',email:'pedro@example.com',phone:'+584141112233',password:'ClaveSegura123',role:'passenger'})});
  assert.equal(registration.status,201);const passenger=await registration.json();
  const wrongPassword=await fetch(`${api}/driver-applications`,{method:'POST',body:applicationForm('pedro@example.com','+584141112233',{password:'OtraClave123'})});assert.equal(wrongPassword.status,401);assert.equal((await wrongPassword.json()).error,'EXISTING_ACCOUNT_AUTH_REQUIRED');
  const applicationResponse=await fetch(`${api}/driver-applications`,{method:'POST',body:applicationForm('pedro@example.com','+584141112233')});assert.equal(applicationResponse.status,201);const application=await applicationResponse.json();
  assert.equal(application.user.id,passenger.user.id);assert.equal(application.application.status,'pending');
  const duplicateApplication=await fetch(`${api}/driver-applications`,{method:'POST',body:applicationForm('pedro@example.com','+584141112233')});assert.equal(duplicateApplication.status,409);assert.equal((await duplicateApplication.json()).error,'DRIVER_APPLICATION_EXISTS');
});
