const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {createStore,validateGame}=require('../lib/store.cjs');
const {createHandler}=require('../lib/games-api.cjs');
const http=require('node:http');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');

const game=(id='game-a')=>({version:1,id,host:'מתן',createdAt:'2026-10-19T12:00:00.000Z',completedAt:null,buyin:10000,phase:'live',demo:false,players:[{id:'a',name:'אורי',rebuys:[],cash:null},{id:'b',name:'דנה',rebuys:[],cash:null}]});
test('separate store instances share games and stale edits cannot overwrite a newer revision',async()=>{
 const db=new PGlite(),a=createStore(db),b=createStore(db);
 try{
  const first=await a.save(game(),0);assert.equal(first.revision,1);
  assert.equal((await b.list())[0].game.host,'מתן');
  const changed=game();changed.players[0].rebuys=[5000];
  const next=await b.save(changed,1);assert.equal(next.revision,2);
  await assert.rejects(a.save({...game(),host:'ישן'},1),e=>e.code==='CONFLICT'&&e.record.revision===2);
  assert.deepEqual((await a.list())[0].game.players[0].rebuys,[5000]);
 }finally{await db.close();}
});
test('completed games are immutable, retries are idempotent, and multiple games are retained',async()=>{
 const db=new PGlite(),store=createStore(db);
 try{
  const done=game();done.phase='settle';done.completedAt='2026-10-19T13:00:00.000Z';done.players[0].cash=15000;done.players[1].cash=5000;
  assert.equal((await store.save(done,0)).revision,1);
  assert.equal((await store.save(done,0)).revision,1);
  await assert.rejects(store.save({...done,host:'שינוי'},1),e=>e.code==='CONFLICT');
  await store.save(game('second-game'),0);assert.equal((await store.list()).length,2);
 }finally{await db.close();}
});
test('games survive closing the database and starting a new server instance',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pokersplit-store-'));
 let db;
 try{
  db=new PGlite(dir);await createStore(db).save(game(),0);await db.close();
  db=new PGlite(dir);assert.equal((await createStore(db).list())[0].game.id,'game-a');
 }finally{if(db&&!db.closed)await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('server validates money, balanced completion, dates, duplicate player ids and demos',()=>{
 assert.equal(validateGame(game()).host,'מתן');
 for(const invalid of [null,{...game(),demo:true},{...game(),host:'x'.repeat(41)},{...game(),buyin:-1},{...game(),createdAt:'invalid'},{...game(),completedAt:'2026-10-19T13:00:00Z'},{...game(),players:[game().players[0],game().players[0]]}])assert.throws(()=>validateGame(invalid));
 const invalid=game();invalid.players[0].rebuys=[0];assert.throws(()=>validateGame(invalid));
});
test('HTTP API shares saved data, rejects cross-origin writes and returns safe errors',async()=>{
 const db=new PGlite(),store=createStore(db),handler=createHandler(()=>Promise.resolve(store));
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/games';
 try{
  const post=body=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await post({game:game(),revision:0});assert.equal(response.status,200);
  response=await fetch(url);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).records.length,1);
  response=await post({game:{...game(),host:'שינוי'},revision:0});assert.equal(response.status,409);
  response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:JSON.stringify({game:game('other'),revision:0})});assert.equal(response.status,403);
  response=await post({game:{...game(),buyin:-1},revision:0});assert.equal(response.status,400);
  response=await fetch(url,{method:'DELETE'});assert.equal(response.status,405);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});
test('an unconfigured database reports unavailable instead of pretending data was saved',async()=>{
 const handler=createHandler(async()=>{throw new Error('secret-connection-string');});
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/games');
  assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret-connection-string'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
