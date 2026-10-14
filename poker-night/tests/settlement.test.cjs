const {test}=require('node:test'),assert=require('node:assert/strict'),{settle}=require('../dist/settlement.js');
test('rebuys and zero cash produce exact transfers',()=>{const r=settle([{id:1,name:'A',rebuys:[5000],cash:0},{id:2,name:'B',rebuys:[],cash:25000}],10000);assert.deepEqual(r.transfers,[{from:'A',to:'B',amount:15000}]);});
test('rejects mismatched totals',()=>assert.throws(()=>settle([{id:1,name:'A',rebuys:[],cash:9999}],10000)));
test('all even requires no transfers',()=>assert.deepEqual(settle([{id:1,name:'A',rebuys:[],cash:10000}],10000).transfers,[]));
test('transfers settle every participant including fractional shekels',()=>{const ps=[{id:1,name:'A',rebuys:[],cash:21001},{id:2,name:'B',rebuys:[5000],cash:4999},{id:3,name:'C',rebuys:[],cash:9000}];const r=settle(ps,10000);const b=Object.fromEntries(r.balances.map(p=>[p.name,p.balance]));for(const t of r.transfers){b[t.from]+=t.amount;b[t.to]-=t.amount;}assert.ok(Object.values(b).every(x=>x===0));});
