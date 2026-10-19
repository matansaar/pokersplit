const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SharedGames}=require('../dist/sync.js');
const {createStore}=require('../lib/store.cjs');
const {createHandler}=require('../lib/games-api.cjs');
const {PGlite}=require('@electric-sql/pglite');
const http=require('node:http');
const game=()=>({version:1,id:'sync-game',host:'מתן',createdAt:'2026-10-19T12:00:00.000Z',completedAt:null,buyin:10000,phase:'live',demo:false,players:[{id:'a',name:'אורי',rebuys:[],cash:null},{id:'b',name:'דנה',rebuys:[],cash:null}]});
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};
async function server(){const db=new PGlite(),store=createStore(db),s=http.createServer(createHandler(async()=>store));await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+s.address().port;return {fetch:(route,options)=>fetch(url+route,options),store,close:async()=>{await new Promise(resolve=>s.close(resolve));await db.close();}};}
const client=(fetch,extra={})=>new SharedGames({fetch,storage:storage(),schedule:()=>0,cancel(){},...extra});

test('independent browsers see the same active game and completed history',async()=>{
 const s=await server();
 try{
  const a=client(s.fetch),b=client(s.fetch);await a.start();await b.start();
  a.queue(game());await a.flush();await b.refresh();assert.equal(b.records()[0].game.host,'מתן');
  const done={...game(),phase:'settle',completedAt:'2026-10-19T13:00:00.000Z'};done.players[0].cash=15000;done.players[1].cash=5000;
  a.queue(done);await a.flush();await b.refresh();assert.ok(b.records()[0].game.completedAt);
 }finally{await s.close();}
});
test('offline changes survive a browser restart and are uploaded when connectivity returns',async()=>{
 const s=await server(),local=storage();
 try{
  const a=client(async()=>{throw new Error('offline');},{storage:local});await a.start();a.queue(game());await a.flush();assert.equal(a.pendingCount(),1);
  const b=client(s.fetch,{storage:local});await b.start();await b.flush();assert.equal(b.pendingCount(),0);assert.equal((await s.store.list()).length,1);
 }finally{await s.close();}
});
test('conflicting edits stop syncing and can be kept as a separate game without overwriting the shared version',async()=>{
 const s=await server();let conflict;
 try{
  const a=client(s.fetch),b=client(s.fetch,{onConflict:value=>{conflict=value;}});await a.start();a.queue(game());await a.flush();await b.start();
  a.queue({...game(),host:'עדכון ראשון'});await a.flush();
  b.queue({...game(),host:'עדכון שני'});await b.flush();assert.ok(conflict);assert.equal(b.pendingCount(),1);
  assert.equal((await s.store.list())[0].game.host,'עדכון ראשון');
  const separate=b.keepSeparate('sync-game','separate-game');assert.equal(separate.host,'עדכון שני');await b.flush();assert.equal((await s.store.list()).length,2);
 }finally{await s.close();}
});
test('startup imports old local games once and does not replace a newer server version',async()=>{
 const s=await server();let conflict;
 try{
  const a=client(s.fetch);await a.start([game()]);await a.flush();
  const changed={...game(),host:'חדש באתר'};a.queue(changed);await a.flush();
  const b=client(s.fetch,{onConflict:value=>{conflict=value;}});await b.start([game()]);await b.flush();
  assert.equal((await s.store.list())[0].game.host,'חדש באתר');assert.ok(conflict);
 }finally{await s.close();}
});

test('browser timer functions retain their required global receiver',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const context=vm.createContext({});
 vm.runInContext('function setTimeout(){if(this!==globalThis)throw new Error("Illegal invocation");return 1;} function clearTimeout(){if(this!==globalThis)throw new Error("Illegal invocation");}',context);
 vm.runInContext(fs.readFileSync(require.resolve('../dist/sync.js'),'utf8'),context);
 const Shared=context.PokerSync.SharedGames;
 const a=new Shared({fetch:async()=>({ok:true,json:async()=>({records:[]})}),storage:storage()});
 await a.start();assert.doesNotThrow(()=>a.queue(game()));
});

test('reopening a previously synced browser loads newer server data without manufacturing a conflict',async()=>{
 const s=await server(),local=storage();let conflict;
 try{
  const a=client(s.fetch,{storage:local});await a.start();a.queue(game());await a.flush();
  const b=client(s.fetch);await b.start();b.queue({...game(),host:'עודכן במכשיר אחר'});await b.flush();
  const reopened=client(s.fetch,{storage:local,onConflict:c=>{conflict=c;}});await reopened.start([game()]);
  assert.equal(reopened.records()[0].game.host,'עודכן במכשיר אחר');assert.equal(reopened.pendingCount(),0);assert.ok(!conflict);
 }finally{await s.close();}
});
