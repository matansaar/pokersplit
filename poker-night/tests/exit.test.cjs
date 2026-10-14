const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const PokerMath=require('../dist/settlement.js');

// Run the actual app handlers with lightweight DOM/storage adapters.
function app(saved){
 const elements=new Map(),storage=new Map(saved?[['pokersplit-v1',JSON.stringify(saved)]]:[]);
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,dataset:{},classList:{add(){},remove(){},toggle(){}},removeAttribute(){},setCustomValidity(){},addEventListener(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){}});
  return elements.get(id);
 };
 const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[],body:{dataset:{}}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},PokerMath,Intl,crypto:{randomUUID:()=>String(Math.random())},window:{scrollTo(){}},setTimeout:()=>1,clearTimeout(){}});
 vm.runInContext(fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),context);
 return {element,storage,run:code=>vm.runInContext(code,context),state:()=>JSON.parse(storage.get('pokersplit-v1'))};
}
const game=()=>({version:1,buyin:10000,phase:'live',players:[{id:'a',name:'A',rebuys:[5000],cash:null},{id:'b',name:'B',rebuys:[],cash:null},{id:'c',name:'C',rebuys:[],cash:null}]});
function exit(a,id,value){a.run(`openModal('exit',${JSON.stringify(id)})`);a.element('modal-input').value=value;a.element('modal-form').onsubmit({preventDefault(){}});}

test('early exit keeps investment, blocks rebuys, survives reload, and settles with remaining players',()=>{
 const a=app(game());exit(a,'a','75.25');
 assert.equal(a.state().players[0].cash,7525);
 assert.equal(a.state().players[0].exited,true);
 assert.equal(a.state().players.length,3);
 assert.ok(!a.element('players').innerHTML.includes('data-rebuy="a"'));
 assert.ok(a.element('players').innerHTML.includes('data-rebuy="b"'));
 a.run("selectedId='a';applyRebuy(10000)");assert.deepEqual(a.state().players[0].rebuys,[5000]);
 const reloaded=app(a.state());assert.equal(reloaded.state().players[0].cash,7525);
 reloaded.run("phase('settle')");
 assert.ok(reloaded.element('players').innerHTML.includes('value="75.25"'));
 reloaded.run("state.players[1].cash=20000;state.players[2].cash=7475;save();renderSummary()");
 assert.equal(reloaded.element('next-step').disabled,false);
 assert.deepEqual(JSON.parse(reloaded.run('JSON.stringify(results.transfers)')),[{from:'A',to:'B',amount:7475},{from:'C',to:'B',amount:2525}]);
});
test('exit supports zero, corrections and rejects invalid or excessive withdrawals',()=>{
 const a=app(game());
 for(const value of ['', '-1','1.234','350.01']){exit(a,'a',value);assert.equal(a.state().players[0].cash,null);assert.equal(a.element('modal').open,true);}
 exit(a,'a','0');assert.equal(a.state().players[0].cash,0);
 exit(a,'a','100');assert.equal(a.state().players[0].cash,10000);
 exit(a,'b','250.01');assert.equal(a.state().players[1].cash,null);
 exit(a,'b','250');assert.equal(a.state().players[1].cash,25000);
 exit(a,'a','101');assert.equal(a.state().players[0].cash,10000);
 exit(a,'c','0');a.run("phase('settle')");assert.equal(a.element('next-step').disabled,false);
});
test('temporarily blank exit correction reloads without losing the game and blocks settlement',()=>{
 const a=app(game());exit(a,'a','100');a.run("phase('settle')");
 a.element('players').oninput({target:{matches:()=>true,dataset:{cash:'a'},value:'',setCustomValidity(){}}});
 const reloaded=app(a.state());assert.equal(reloaded.state().players.length,3);assert.equal(reloaded.state().players[0].exited,true);assert.equal(reloaded.element('next-step').disabled,true);
});
