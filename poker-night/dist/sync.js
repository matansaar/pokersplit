(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokerSync=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
 const validRecord=r=>r&&r.game&&typeof r.game.id==='string'&&Number.isSafeInteger(r.revision)&&r.revision>0;
 class SharedGames{
  constructor({fetch,storage,onChange=()=>{},onStatus=()=>{},onConflict=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=timer=>clearTimeout(timer)}){
   Object.assign(this,{fetch,storage,onChange,onStatus,onConflict,schedule,cancel});
   this.remote=new Map();this.pending=new Map();this.online=false;this.localAvailable=true;this.started=false;this.timer=null;this.inflight=null;
   try{
    const saved=JSON.parse(storage.getItem('pokersplit-sync-v1')||'null');
    if(saved&&Array.isArray(saved.records))for(const r of saved.records)if(validRecord(r))this.remote.set(r.game.id,r);
    if(saved&&Array.isArray(saved.pending))for(const p of saved.pending)if(p&&p.game&&typeof p.game.id==='string'&&Number.isSafeInteger(p.revision)&&p.revision>=0)this.pending.set(p.game.id,p);
   }catch{this.localAvailable=false;}
  }
  records(){return [...this.remote.values()].map(clone);}
  hasPending(id){return this.pending.has(id);}
  pendingCount(){return this.pending.size;}
  conflicts(){return [...this.pending.values()].filter(p=>p.blocked).map(p=>({local:clone(p.game),record:this.remote.get(p.game.id)||null}));}
  status(){this.onStatus({online:this.online,pending:this.pending.size,conflicts:[...this.pending.values()].some(p=>p.blocked),localAvailable:this.localAvailable});}
  persist(){try{this.storage.setItem('pokersplit-sync-v1',JSON.stringify({records:[...this.remote.values()],pending:[...this.pending.values()]}));this.localAvailable=true;}catch{this.localAvailable=false;}}
  async start(localGames=[]){
   const previousRecords=new Map(this.remote);
   await this.refresh();
   for(const game of localGames){
    if(!game||game.demo||this.pending.has(game.id))continue;
    const remote=this.remote.get(game.id),previous=previousRecords.get(game.id);
    if(previous&&canonical(previous.game)===canonical(game))continue;
    if(!remote||canonical(remote.game)!==canonical(game))this.enqueue(game,previous?.revision||0);
   }
   this.started=true;this.status();
   for(const p of this.pending.values())if(p.blocked)this.onConflict({local:clone(p.game),record:this.remote.get(p.game.id)||null});
   await this.flush();
  }
  queue(game){
   if(!game||game.demo||(!game.host&&!game.players?.length))return;
   const previous=this.pending.get(game.id);
   this.enqueue(game,previous?previous.revision:(this.remote.get(game.id)?.revision||0));
   if(this.started){this.cancel(this.timer);this.timer=this.schedule(()=>this.flush(),500);}
  }
  enqueue(game,revision){
   const old=this.pending.get(game.id);
   this.pending.set(game.id,{game:clone(game),revision,sequence:(old?.sequence||0)+1,blocked:old?.blocked||false});this.persist();this.status();
  }
  async refresh(){
   try{
    const response=await this.fetch('/api/games',{cache:'no-store'});
    if(!response.ok)throw new Error('Unavailable');
    const body=await response.json();if(!Array.isArray(body.records)||!body.records.every(validRecord))throw new Error('Invalid response');
    this.remote=new Map(body.records.map(r=>[r.game.id,r]));this.online=true;this.persist();this.onChange(this.records());
   }catch{this.online=false;}
   this.status();
  }
  async flush(){
   if(this.inflight)return this.inflight;
   this.cancel(this.timer);
   this.inflight=this.send().finally(()=>{this.inflight=null;});
   return this.inflight;
  }
  async send(){
   for(;;){
    const entry=[...this.pending.values()].find(p=>!p.blocked);if(!entry)break;
    const sent=clone(entry),id=sent.game.id;
    try{
     const response=await this.fetch('/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:sent.game,revision:sent.revision})});
     const body=await response.json();
     if(response.status===409){
      const latest=this.pending.get(id);if(latest)latest.blocked=true;
      if(validRecord(body.record))this.remote.set(id,body.record);
      this.online=true;this.persist();this.onConflict({local:clone(latest?.game||sent.game),record:body.record||null});this.onChange(this.records());continue;
     }
     if(!response.ok||!validRecord(body.record))throw new Error('Unavailable');
     this.online=true;this.remote.set(id,body.record);
     const latest=this.pending.get(id);
     if(latest?.sequence===sent.sequence)this.pending.delete(id);
     else if(latest)latest.revision=body.record.revision;
     this.persist();this.onChange(this.records());
    }catch{this.online=false;break;}
   }
   this.persist();this.status();
  }
  acceptRemote(id){
   const remote=this.remote.get(id);if(!remote)return null;
   const pending=this.pending.get(id);
   if(pending){try{this.storage.setItem('pokersplit-conflict-backup-'+id,JSON.stringify(pending.game));}catch{return null;}}
   this.pending.delete(id);this.persist();this.status();this.onChange(this.records());return clone(remote.game);
  }
  keepSeparate(id,newId){
   const pending=this.pending.get(id);if(!pending)return null;
   const game={...clone(pending.game),id:newId};this.pending.delete(id);this.enqueue(game,0);this.onChange(this.records());return game;
  }
 }
 return {SharedGames,sameGame:(a,b)=>canonical(a)===canonical(b)};
});
