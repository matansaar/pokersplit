'use strict';
function createSupabaseStore({url,key,fetch:request=fetch}){
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password)throw new Error('INVALID_SUPABASE_URL');
 const headers={apikey:key,'Content-Type':'application/json'};
 // Legacy service-role JWTs need the Authorization header. New secret keys do not.
 if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const call=async(route,options={})=>{
  const response=await request(new URL('/rest/v1/'+route,base),{...options,headers,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('STORAGE_UNAVAILABLE');
  return response.json();
 };
 return {
  async list(){
   const rows=await call('pokersplit_games?select=game,revision,updated_at&order=updated_at.desc,id');
   if(!Array.isArray(rows))throw new Error('INVALID_STORAGE_RESPONSE');
   return rows.map(row=>({game:row.game,revision:row.revision,updatedAt:new Date(row.updated_at).toISOString()}));
  },
  async save(input,revision){
   const {validateGame}=require('./store.cjs');
   const game=validateGame(input);
   if(!Number.isSafeInteger(revision)||revision<0)throw new Error('INVALID_REVISION');
   const result=await call('rpc/pokersplit_save_game',{method:'POST',body:JSON.stringify({payload:game,expected_revision:revision})});
   if(result.conflict){const error=new Error('CONFLICT');error.code='CONFLICT';error.record=result.record||null;throw error;}
   if(!result.record||result.record.game?.id!==game.id||!Number.isSafeInteger(result.record.revision))throw new Error('INVALID_STORAGE_RESPONSE');
   return result.record;
  }
 };
}
module.exports={createSupabaseStore};
