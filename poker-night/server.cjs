'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const api=require('./lib/games-api.cjs').createHandler();
const root=path.join(__dirname,'dist');
const server=http.createServer((req,res)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Bad request');}
 if(pathname==='/api/games')return api(req,res);
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript'})[file.split('.').pop()]||'application/octet-stream');
  res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
  res.end(req.method==='HEAD'?undefined:data);
 });
});
const port=Number(process.env.PORT)||5173;
server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
