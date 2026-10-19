const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createSupabaseStore}=require('../lib/supabase-store.cjs');
const fixture=()=>({version:1,id:'supabase-game',host:'מתן',createdAt:'2026-10-19T12:00:00.000Z',completedAt:null,buyin:10000,phase:'live',demo:false,players:[{id:'a',name:'אורי',rebuys:[],cash:null},{id:'b',name:'דנה',rebuys:[],cash:null}]});

test('Supabase RPC preserves revisions, idempotency and immutable completed games with browser access denied',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync(require.resolve('../supabase/schema.sql'),'utf8'));
  const rpc=async(game,revision)=>(await db.query('SELECT public.pokersplit_save_game($1::jsonb,$2) AS result',[JSON.stringify(game),revision])).rows[0].result;
  const first=await rpc(fixture(),0);assert.equal(first.record.revision,1);assert.equal(first.conflict,false);
  assert.equal((await rpc(fixture(),0)).conflict,false);
  const changed={...fixture(),host:'עודכן'};
  assert.equal((await rpc(changed,1)).record.revision,2);
  assert.equal((await rpc(fixture(),1)).conflict,true);
  const done={...changed,phase:'settle',completedAt:'2026-10-19T14:00:00.000Z'};done.players[0].cash=15000;done.players[1].cash=5000;
  assert.equal((await rpc(done,2)).record.revision,3);
  assert.equal((await rpc(done,0)).conflict,false);
  assert.equal((await rpc({...done,host:'דריסה'},3)).conflict,true);
  const privileges=(await db.query("SELECT has_table_privilege('anon','public.pokersplit_games','SELECT') AS can_read, has_function_privilege('anon','public.pokersplit_save_game(jsonb,integer)','EXECUTE') AS can_save, has_function_privilege('service_role','public.pokersplit_save_game(jsonb,integer)','EXECUTE') AS server_can_save")).rows[0];
  assert.equal(privileges.can_read,false);assert.equal(privileges.can_save,false);assert.equal(privileges.server_can_save,true);
 }finally{await db.close();}
});

test('Supabase HTTP adapter uses the server key correctly and preserves conflict responses',async()=>{
 let captured;
 const record={game:fixture(),revision:1,updatedAt:'2026-10-19T12:00:00.000Z'};
 let conflict=false;
 const store=createSupabaseStore({url:'https://example.supabase.co',key:'sb_secret_test',fetch:async(url,options)=>{
  captured={url:String(url),...options};return {ok:true,json:async()=>String(url).includes('/rpc/')?{record,conflict}:[{game:record.game,revision:1,updated_at:record.updatedAt}]};
 }});
 assert.equal((await store.list())[0].game.host,'מתן');
 assert.equal((await store.save(fixture(),0)).revision,1);
 assert.equal(captured.headers.apikey,'sb_secret_test');assert.ok(!captured.headers.Authorization);
 assert.equal(JSON.parse(captured.body).expected_revision,0);
 conflict=true;await assert.rejects(store.save({...fixture(),host:'עודכן'},0),e=>e.code==='CONFLICT'&&e.record.revision===1);
 await assert.rejects(store.save({...fixture(),buyin:-1},0));
});
