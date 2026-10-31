import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import sharp from 'sharp';
import { asyncDatabase } from '../server/async-db.js';
import { initializeTurso, productionSettings } from '../server/turso.js';
import { databaseRateLimit } from '../server/rate-limits.js';
import { createApp } from '../server/app.js';
import { campaignOpen } from '../server/validation.js';
import { pageMetadata } from '../src/metadata.ts';

const origin='https://lcc-ntb.com', password='ProductionTestPassword2026!';
async function fixture() {
  const url='file::memory:';
  const source=createClient({url}), db=asyncDatabase(source,{remote:true});
  await initializeTurso(db,'admin@example.com',password);
  const files=new Map(), storage={async write(key,body){files.set(key,body);},async read(key){return files.get(key);},async remove(key){files.delete(key);}};
  const config={database:db,files:storage,origin,secret:'production-test-'.repeat(8),adminEmail:'admin@example.com',adminPassword:password,now:()=>Date.parse('2026-11-05T00:00:00Z'),mailMode:'local'};
  const servers=[];
  async function instance(options={}) {
    const server=createApp({...config,...options}).app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve)); servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }
  function browser(base) {
    const cookies=new Map(); let csrf='';
    return async (path,body,method=body?'POST':'GET')=>{
      const response=await fetch(`${base}/api${path}`,{method,headers:{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),origin,'content-type':'application/json','x-csrf-token':csrf},body:body?JSON.stringify(body):undefined});
      for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
      const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;
      return {status:response.status,data};
    };
  }
  return {db,files,config,instance,browser,async close(){await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));db.close();}};
}

test('production database starts empty with 12 categories and exact WITA campaign boundaries; initialization is idempotent',async()=>{
  const f=await fixture();try{
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM creators').get()).n,0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM categories').get()).n,12);
    assert.ok(await f.db.prepare("SELECT id FROM categories WHERE name='Olahraga'").get());
    assert.deepEqual(JSON.parse((await f.db.prepare('SELECT payload FROM settings').get()).payload),productionSettings);
    for(const kind of ['registration','voting']) {
      const start=Date.parse(productionSettings[`${kind}StartsAt`]),end=Date.parse(productionSettings[`${kind}EndsAt`]);
      assert.equal(campaignOpen(productionSettings,kind,start-1),false);
      assert.equal(campaignOpen(productionSettings,kind,start),true);
      assert.equal(campaignOpen(productionSettings,kind,end-1),true);
      assert.equal(campaignOpen(productionSettings,kind,end),false);
    }
    await f.db.prepare("UPDATE settings SET payload=json_set(payload,'$.location','Lokasi resmi')").run();
    await initializeTurso(f.db,'admin@example.com',password);
    assert.equal(JSON.parse((await f.db.prepare('SELECT payload FROM settings').get()).payload).location,'Lokasi resmi');
  }finally{await f.close();}
});

test('shared database rate limit is atomic under concurrent requests and survives another app instance',async()=>{
  const f=await fixture();try{
    const allowed=await Promise.all(Array.from({length:20},()=>databaseRateLimit(f.db,'shared-ip',5,60000,1000)));
    assert.equal(allowed.filter(Boolean).length,5);
    assert.equal(await databaseRateLimit(f.db,'shared-ip',5,60000,60999),false);
    assert.equal(await databaseRateLimit(f.db,'shared-ip',5,60000,61000),true);
    const a=f.browser(await f.instance()),b=f.browser(await f.instance());
    await a('/bootstrap');await b('/bootstrap');
    const requests=await Promise.all(Array.from({length:16},(_,i)=>(i%2?a:b)('/votes',{creatorId:1})));
    assert.equal(requests.filter(result=>result.status===429).length,4);
  }finally{await f.close();}
});

test('async libSQL registration, one-use OTP, approval, single vote, and one-use check-in remain atomic',async()=>{
  const f=await fixture();try{
    const request=f.browser(await f.instance());await request('/bootstrap');
    const image=`data:image/png;base64,${(await sharp({create:{width:20,height:30,channels:3,background:'#d2b06b'}}).png().toBuffer()).toString('base64')}`;
    const category=await f.db.prepare("SELECT id FROM categories WHERE name='Olahraga'").get();
    const body={name:'Peserta QA',email:'qa@example.com',phone:'081234567890',gender:'Perempuan',address:'Jalan QA Mataram',socialAccounts:{instagram:'@peserta.qa'},categoryId:category.id,consent:true,answers:{domisili:'Mataram'},paymentProofData:image,photoData:image};
    const registered=await Promise.all(Array.from({length:3},()=>request('/register',body)));
    assert.ok(registered.every(result=>result.status===202));
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM creators').get()).n,1);
    assert.equal(f.files.size,2,'duplicate uploads must be removed');
    const mail=await f.db.prepare('SELECT text FROM mail_outbox ORDER BY id DESC LIMIT 1').get();
    const code=/Kode OTP Anda: (\d{6})/.exec(mail.text)[1];
    const verified=await Promise.all(Array.from({length:5},()=>request('/participant/otp/verify',{email:body.email,code})));
    assert.equal(verified.filter(result=>result.status===200).length,1);
    assert.equal(verified.filter(result=>result.status===401).length,4);
    const admin=f.browser(await f.instance());await admin('/bootstrap');assert.equal((await admin('/admin/login',{email:'admin@example.com',password})).status,200);
    const creator=await f.db.prepare('SELECT * FROM creators').get();
    assert.equal((await admin(`/admin/creators/${creator.id}`,{status:'approved',paymentStatus:'verified',visible:true},'PATCH')).status,200);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM tickets').get()).n,1);
    await f.db.prepare("UPDATE settings SET payload=json_set(payload,'$.votingStartsAt','2026-11-01T00:00:00.000Z')").run();
    const votes=await Promise.all(Array.from({length:5},()=>admin('/votes',{creatorId:creator.id})));
    assert.equal(votes.filter(result=>result.status===201).length,1);
    assert.equal(votes.filter(result=>result.status===409).length,4);
    const ticket=await f.db.prepare('SELECT token FROM tickets').get();
    const checked=await Promise.all(Array.from({length:5},()=>admin('/admin/tickets/check-in',{token:ticket.token})));
    assert.equal(checked.filter(result=>result.status===200).length,1);
    assert.equal(checked.filter(result=>result.status===409).length,4);
    const bootstrap=(await admin('/bootstrap')).data;
    assert.ok(bootstrap.creators.every(creator=>!('votes' in creator)));
    assert.equal((await admin('/admin/dashboard')).data.stats.totalVotes,1);
  }finally{await f.close();}
});

test('production without email delivery never accepts payment registration or exposes OTP outbox',async()=>{
  const f=await fixture();try{
    const request=f.browser(await f.instance({production:true,mailMode:'unconfigured'}));await request('/bootstrap');
    assert.equal((await request('/register',{})).status,503);
    assert.equal((await request('/participant/otp/request',{email:'unknown@example.com'})).status,503);
    assert.equal((await request('/admin/login',{email:'admin@example.com',password})).status,200);
    assert.equal((await request('/admin/mail-outbox')).status,404);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM creators').get()).n,0);
  }finally{await f.close();}
});

test('all public and private routes get descriptive titles, metadata and a real share cover',()=>{
  for(const path of ['/','/vote','/register','/peserta','/admin','/tiket/verifikasi/token']) {
    const meta=pageMetadata(path);assert.match(meta.title,/ - LCC Awards 2026$/);
    assert.ok(meta.title.split(' - ')[0].split(' ').length>=3);
    assert.equal(meta.robots.startsWith('noindex'),['/peserta','/admin','/tiket/verifikasi/token'].includes(path));
  }
  assert.ok(readFileSync('public/og-cover.jpg').length>1000);
});
