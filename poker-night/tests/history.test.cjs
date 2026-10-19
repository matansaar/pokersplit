const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const PokerMath=require('../dist/settlement.js');

function app(storage=new Map(),failHistory=false){
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,dataset:{},classList:{add(){},remove(){},toggle(){}},removeAttribute(){},setCustomValidity(){},addEventListener(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){}});
  return elements.get(id);
 };
 const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[],body:{dataset:{}}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>{if(failHistory&&key==='pokersplit-history-v1')throw new Error('Storage full');storage.set(key,value);}},PokerMath,Intl,crypto:require('node:crypto').webcrypto,window:{scrollTo(){}},setTimeout:()=>1,clearTimeout(){}});
 vm.runInContext(fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),context);
 return {element,storage,run:code=>vm.runInContext(code,context),state:()=>JSON.parse(storage.get('pokersplit-v1')),history:()=>JSON.parse(storage.get('pokersplit-history-v1')||'[]')};
}
function host(a,name='מתן'){
 a.element('host-input').value=name;
 a.element('host-input').oninput();
}
function ready(a){
 host(a);a.run("addName('אורי');addName('דנה')");
 a.element('next-step').onclick();
 a.element('next-step').onclick();
 a.run('state.players[0].cash=15000;state.players[1].cash=5000;save();renderSummary()');
}

test('new game requires a host and keeps its name, id and date through reload',()=>{
 const a=app();a.run("addName('אורי');addName('דנה')");
 assert.equal(a.element('next-step').disabled,true);
 a.element('next-step').onclick();assert.equal(a.state().phase,'setup');
 host(a,'  מתן  ');assert.equal(a.element('next-step').disabled,false);
 a.element('next-step').onclick();
 assert.equal(a.state().host,'מתן');assert.ok(a.state().id);assert.ok(a.state().createdAt);
 const b=app(a.storage);assert.equal(b.state().id,a.state().id);assert.equal(b.state().createdAt,a.state().createdAt);
 assert.match(b.element('game-name').textContent,/מתן/);assert.match(b.element('game-name').textContent,/\d{2}\.\d{2}\.\d{4}/);
});

test('finish archives an immutable full game once and history survives a new game and reload',()=>{
 const a=app();ready(a);assert.equal(a.history().length,0);
 a.element('next-step').onclick();
 assert.equal(a.history().length,1);assert.ok(a.state().completedAt);
 const archived=a.history()[0];assert.equal(archived.host,'מתן');assert.equal(archived.players[0].cash,15000);
 a.run('finishGame()');assert.equal(a.history().length,1);
 assert.equal(a.element('back-to-game').hidden,true);
 a.element('next-step').onclick();assert.equal(a.state().phase,'setup');assert.equal(a.state().host,'');
 host(a,'דנה');assert.equal(a.history()[0].host,'מתן');
 const b=app(a.storage);b.element('game-history').onclick();
 assert.match(b.element('history-list').innerHTML,/מתן/);
 b.run('showHistoryGame('+JSON.stringify(archived.id)+')');
 assert.match(b.element('history-detail').innerHTML,/אורי/);assert.match(b.element('history-detail').innerHTML,/דנה/);
 assert.match(b.element('history-detail').innerHTML,/מעביר\/ה/);
 assert.equal(b.state().host,'דנה');
});

test('incomplete games and demos are not archived',()=>{
 const a=app();a.run('finishGame()');assert.equal(a.history().length,0);
 ready(a);a.run('state.players[0].cash=null;renderSummary();finishGame()');assert.equal(a.history().length,0);
 a.run('state=sample();state.phase="settle";state.players.forEach(p=>p.cash=invested(p));save();render();finishGame()');
 assert.equal(a.history().length,0);
});

test('storage failure keeps the game editable and does not claim it was saved',()=>{
 const a=app(new Map(),true);ready(a);a.element('next-step').onclick();
 assert.equal(a.history().length,0);assert.ok(!a.state().completedAt);
 assert.match(a.element('toast').textContent,/לא.*נשמר|לא ניתן לשמור/);
 assert.equal(a.element('back-to-game').hidden,false);
});

test('existing active games retain players and request a host when finishing',()=>{
 const legacy={version:1,buyin:10000,phase:'settle',players:[{id:'a',name:'A',rebuys:[],cash:12000},{id:'b',name:'B',rebuys:[],cash:8000}]};
 const a=app(new Map([['pokersplit-v1',JSON.stringify(legacy)]]));
 assert.equal(a.state().players.length,2);a.element('next-step').onclick();
 assert.equal(a.element('modal').open,true);assert.equal(a.history().length,0);
 a.element('modal-input').value='מתן';a.element('modal-form').onsubmit({preventDefault(){}});
 assert.equal(a.history().length,1);assert.equal(a.history()[0].host,'מתן');
});

test('history escapes names and ignores malformed stored records',()=>{
 const a=app();ready(a);a.run('state.host="<img src=x>";finishGame()');
 a.element('game-history').onclick();assert.ok(!a.element('history-list').innerHTML.includes('<img'));
 const storage=new Map(a.storage);storage.set('pokersplit-history-v1',JSON.stringify([null,{id:'bad'},...a.history()]));
 const b=app(storage);b.element('game-history').onclick();
 assert.match(b.element('history-list').innerHTML,/&lt;img/);
 assert.ok(!b.element('history-list').innerHTML.includes('data-game="bad"'));
});

test('two games at the same host on the same day stay separate, including rebuys and early exits',()=>{
 const a=app();ready(a);a.element('next-step').onclick();
 const first=a.history()[0];a.element('next-step').onclick();
 host(a);a.run("addName('אורי');addName('דנה')");a.element('next-step').onclick();
 a.run("selectedId=state.players[0].id;applyRebuy(5000);openModal('exit',state.players[0].id)");
 a.element('modal-input').value='75';a.element('modal-form').onsubmit({preventDefault(){}});
 a.element('next-step').onclick();a.run('state.players[1].cash=17500;save();renderSummary()');
 a.element('next-step').onclick();
 assert.equal(a.history().length,2);assert.notEqual(a.history()[0].id,first.id);
 assert.equal(a.history()[0].players[0].exited,true);assert.deepEqual(a.history()[0].players[0].rebuys,[5000]);
 const b=app(a.storage);assert.ok(b.state().completedAt);assert.equal(b.history().length,2);
 b.run("phase('live')");assert.equal(b.state().phase,'settle');
 b.element('players').oninput({target:{matches:()=>true,dataset:{cash:b.state().players[0].id},value:'0',setCustomValidity(){}}});
 assert.equal(b.state().players[0].cash,7500);assert.deepEqual(b.history()[1],first);
});

test('finishing retains games completed in another tab',()=>{
 const storage=new Map(),a=app(storage);ready(a);
 const b=app(storage);b.run('state=fresh();save();render()');ready(b);b.element('next-step').onclick();
 a.element('next-step').onclick();assert.equal(a.history().length,2);
 assert.notEqual(a.history()[0].id,a.history()[1].id);
});

function rankedHistory(players){
 const game={version:1,id:'ranking',host:'מתן',createdAt:'2026-10-19T18:00:00Z',completedAt:'2026-10-19T21:00:00Z',phase:'settle',buyin:10000,players:players.map((p,i)=>({id:String(i),rebuys:[],...p}))};
 const a=app(new Map([['pokersplit-history-v1',JSON.stringify([game])]]));
 a.run("showHistoryGame('ranking')");
 return {a,html:a.element('history-detail').innerHTML.split('<h3>מי מעביר למי?</h3>')[0]};
}

test('history ranks by net profit including rebuys and highlights the top earner without reordering saved players',()=>{
 const players=[{name:'HighCash',rebuys:[20000],cash:25000},{name:'BigLoss',cash:0},{name:'SmallWin',cash:15000},{name:'TopWin',cash:20000},{name:'Even',cash:10000}];
 const {a,html}=rankedHistory(players);
 assert.deepEqual([...html.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>m[1]),['TopWin','SmallWin','Even','HighCash','BigLoss']);
 const winners=html.match(/<article[^>]*history-winner[^>]*>.*?<\/article>/g)||[];
 assert.equal(winners.length,1);assert.match(winners[0],/<strong>TopWin<\/strong>/);assert.match(winners[0],/winner-badge/);
 assert.deepEqual(a.history()[0].players.map(p=>p.name),players.map(p=>p.name));
});

test('history highlights tied positive leaders and keeps equal profits in their original order',()=>{
 const {html}=rankedHistory([{name:'LossA',cash:0},{name:'WinA',cash:20000},{name:'LossB',cash:0},{name:'WinB',cash:20000}]);
 assert.deepEqual([...html.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>m[1]),['WinA','WinB','LossA','LossB']);
 assert.equal((html.match(/winner-badge/g)||[]).length,2);
 const even=rankedHistory([{name:'EvenA',cash:10000},{name:'EvenB',cash:10000}]);
 assert.ok(!even.html.includes('winner-badge'));
});
