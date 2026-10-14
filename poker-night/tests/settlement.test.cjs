const {test}=require('node:test'),assert=require('node:assert/strict'),{settle}=require('../dist/settlement.js');
test('rebuys and zero cash produce exact transfers',()=>{const r=settle([{id:1,name:'A',rebuys:[5000],cash:0},{id:2,name:'B',rebuys:[],cash:25000}],10000);assert.deepEqual(r.transfers,[{from:'A',to:'B',amount:15000}]);});
test('rejects mismatched totals',()=>assert.throws(()=>settle([{id:1,name:'A',rebuys:[],cash:9999}],10000)));
test('all even requires no transfers',()=>assert.deepEqual(settle([{id:1,name:'A',rebuys:[],cash:10000}],10000).transfers,[]));
test('transfers settle every participant including fractional shekels',()=>{const ps=[{id:1,name:'A',rebuys:[],cash:21001},{id:2,name:'B',rebuys:[5000],cash:4999},{id:3,name:'C',rebuys:[],cash:9000}];const r=settle(ps,10000);const b=Object.fromEntries(r.balances.map(p=>[p.name,p.balance]));for(const t of r.transfers){b[t.from]+=t.amount;b[t.to]-=t.amount;}assert.ok(Object.values(b).every(x=>x===0));});

function playersFor(debts,credits){return [...debts.map((n,i)=>({id:'d'+i,name:'D'+i,rebuys:[],cash:10000-n})),...credits.map((n,i)=>({id:'c'+i,name:'C'+i,rebuys:[],cash:10000+n}))];}
function verifyPlan(result){
 const balances=Object.fromEntries(result.balances.map(p=>[p.name,p.balance]));
 for(const t of result.transfers){assert.ok(Number.isSafeInteger(t.amount)&&t.amount>0);assert.ok(result.balances.find(p=>p.name===t.from).balance<0);assert.ok(result.balances.find(p=>p.name===t.to).balance>0);balances[t.from]+=t.amount;balances[t.to]-=t.amount;}
 assert.ok(Object.values(balances).every(n=>n===0));
}
test('avoids unnecessary splitting when each payer can pay one person',()=>{
 const r=settle(playersFor([800,700,600,500],[1300,1300]),10000);
 assert.equal(r.optimal,true);assert.equal(r.transfers.length,4);assert.equal(r.splitPayers,0);verifyPlan(r);
});
test('finds fewer transfers than largest-first matching',()=>{
 const r=settle(playersFor([600,400,400],[800,300,300]),10000);
 assert.equal(r.transfers.length,4);assert.equal(r.splitPayers,1);verifyPlan(r);
});
// Independent oracle enumerates complete integer payment matrices, including
// partial payments that do not clear either party, for small fixtures.
function oracle(debts,credits){
 let best=[Infinity,Infinity];const remaining=credits.slice();
 function row(index,edges,splits){
  if(index===debts.length){if(remaining.every(n=>!n)&&(edges<best[0]||(edges===best[0]&&splits<best[1])))best=[edges,splits];return;}
  function allocate(column,left,count){
   if(column===remaining.length){if(!left)row(index+1,edges+count,splits+Number(count>1));return;}
   for(let n=0;n<=Math.min(left,remaining[column]);n++){remaining[column]-=n;allocate(column+1,left-n,count+Number(n>0));remaining[column]+=n;}
  }
  allocate(0,debts[index],0);
 }
 row(0,0,0);return best;
}
function compositions(total,parts){if(parts===1)return [[total]];return Array.from({length:total-parts+1},(_,i)=>i+1).flatMap(n=>compositions(total-n,parts-1).map(rest=>[n,...rest]));}
test('minimizes transfers then split payers against an independent exhaustive oracle',()=>{
 for(let total=3;total<=8;total++)for(const debts of compositions(total,3))for(const credits of compositions(total,3)){
  const r=settle(playersFor(debts,credits),10000);
  assert.equal(r.optimal,true);assert.deepEqual([r.transfers.length,r.splitPayers],oracle(debts,credits),JSON.stringify({debts,credits}));verifyPlan(r);
 }
});
test('large tables return a valid plan within bounded search work',()=>{
 const debts=[231,419,587,613,797,823,941,1069],credits=[277,353,509,661,733,887,1013,1047];
 const r=settle(playersFor(debts,credits),10000);verifyPlan(r);assert.equal(typeof r.optimal,'boolean');
});
