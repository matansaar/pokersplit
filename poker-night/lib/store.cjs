'use strict';
const {isDeepStrictEqual}=require('node:util');
const MAX_MONEY=100000000;
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX_MONEY;
const text=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f]/.test(s);
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(s);
const date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
function validateGame(input){
 if(!input||input.version!==1||!id(input.id)||!text(input.host,40)||!date(input.createdAt)||input.demo||!money(input.buyin)||input.buyin===0||!['setup','live','settle'].includes(input.phase)||!Array.isArray(input.players)||input.players.length>100)throw new Error('INVALID_GAME');
 const ids=new Set(),names=new Set();
 const players=input.players.map(p=>{
  if(!p||!id(p.id)||ids.has(p.id)||!text(p.name,24)||!p.name.trim()||names.has(p.name.trim())||!Array.isArray(p.rebuys)||p.rebuys.length>1000||!p.rebuys.every(n=>money(n)&&n>0)||(p.cash!==null&&!money(p.cash))||(p.exited!==undefined&&typeof p.exited!=='boolean'))throw new Error('INVALID_GAME');
  ids.add(p.id);names.add(p.name.trim());
  return {id:p.id,name:p.name.trim(),rebuys:[...p.rebuys],cash:p.cash,...(p.exited!==undefined?{exited:p.exited}:{})};
 });
 const completedAt=input.completedAt||null;
 if(completedAt&&(!date(completedAt)||input.phase!=='settle'||!input.host.trim()||players.length<2||players.some(p=>p.cash===null)||players.reduce((n,p)=>n+p.cash-input.buyin-p.rebuys.reduce((a,b)=>a+b,0),0)!==0))throw new Error('INVALID_GAME');
 return {version:1,id:input.id,host:input.host.trim(),createdAt:new Date(input.createdAt).toISOString(),completedAt:completedAt?new Date(completedAt).toISOString():null,buyin:input.buyin,phase:input.phase,demo:false,players};
}
function createStore(db){
 let ready;
 const initialize=()=>ready||(ready=db.query('CREATE TABLE IF NOT EXISTS pokersplit_games (id TEXT PRIMARY KEY, game JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)').catch(error=>{ready=null;throw error;}));
 const record=row=>({game:row.game,revision:row.revision,updatedAt:new Date(row.updated_at).toISOString()});
 return {
  async list(){await initialize();const result=await db.query('SELECT game, revision, updated_at FROM pokersplit_games ORDER BY updated_at DESC, id');return result.rows.map(record);},
  async save(input,revision){
   const game=validateGame(input);
   if(!Number.isSafeInteger(revision)||revision<0)throw new Error('INVALID_REVISION');
   await initialize();
   const result=await db.query(`WITH updated AS (
    UPDATE pokersplit_games SET game=$2::jsonb, revision=revision+1, updated_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND revision=$3 AND $3>0 AND (game->>'completedAt') IS NULL
    RETURNING game, revision, updated_at
   ), inserted AS (
    INSERT INTO pokersplit_games (id,game) SELECT $1,$2::jsonb WHERE $3=0
    ON CONFLICT (id) DO NOTHING RETURNING game, revision, updated_at
   ) SELECT * FROM updated UNION ALL SELECT * FROM inserted`,[game.id,JSON.stringify(game),revision]);
   if(result.rows.length)return record(result.rows[0]);
   const existing=(await db.query('SELECT game, revision, updated_at FROM pokersplit_games WHERE id=$1',[game.id])).rows[0];
   if(existing&&isDeepStrictEqual(existing.game,game))return record(existing);
   const error=new Error('CONFLICT');error.code='CONFLICT';error.record=existing?record(existing):null;throw error;
  }
 };
}
let defaultStore;
async function getStore(){
 if(!defaultStore)defaultStore=(async()=>{
  const connectionString=process.env.DATABASE_URL||process.env.POSTGRES_URL;
  if(connectionString){
   const {Pool}=require('pg');
   return createStore(new Pool({connectionString,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000}));
  }
  if(process.env.VERCEL)throw new Error('DATABASE_NOT_CONFIGURED');
  const {PGlite}=require('@electric-sql/pglite'),path=require('node:path');
  return createStore(new PGlite(process.env.POKERSPLIT_DATA_DIR||path.join(__dirname,'../data')));
 })().catch(error=>{defaultStore=null;throw error;});
 return defaultStore;
}
module.exports={createStore,getStore,validateGame};
