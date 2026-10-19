'use strict';
const {getStore,validateGame}=require('./store.cjs');
const MAX_BODY=256*1024;
function createHandler(storeProvider=getStore){
 return async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'METHOD_NOT_ALLOWED'});}
  if(req.method==='POST'){
   const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;
   if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'ORIGIN_NOT_ALLOWED'});
   if(origin){try{if(new URL(origin).host!==host)return send(403,{error:'ORIGIN_NOT_ALLOWED'});}catch{return send(403,{error:'ORIGIN_NOT_ALLOWED'});}}
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'JSON_REQUIRED'});
   let body;
   try{
    if(req.body!==undefined){body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(Buffer.byteLength(JSON.stringify(body))>MAX_BODY)return send(413,{error:'TOO_LARGE'});}
    else{const chunks=[];let bytes=0;for await(const chunk of req){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>MAX_BODY)return send(413,{error:'TOO_LARGE'});chunks.push(buffer);}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    validateGame(body?.game);
    if(!Number.isSafeInteger(body.revision)||body.revision<0)throw new Error('INVALID_REVISION');
   }catch{return send(400,{error:'INVALID_GAME'});}
   try{return send(200,{record:await(await storeProvider()).save(body.game,body.revision)});}
   catch(error){if(error.code==='CONFLICT')return send(409,{error:'CONFLICT',record:error.record});return send(503,{error:'STORAGE_UNAVAILABLE'});}
  }
  try{return send(200,{records:await(await storeProvider()).list()});}
  catch{return send(503,{error:'STORAGE_UNAVAILABLE'});}
 };
}
module.exports={createHandler};
