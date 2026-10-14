(function(root){
function settle(players,buyin){
 const balances=players.map(p=>({id:p.id,name:p.name,balance:p.cash-buyin-p.rebuys.reduce((a,b)=>a+b,0)}));
 if(balances.reduce((a,p)=>a+p.balance,0)!==0)throw new Error('Unbalanced game');
 const debt=balances.filter(p=>p.balance<0).map(p=>({...p,amount:-p.balance})).sort((a,b)=>b.amount-a.amount);
 const credit=balances.filter(p=>p.balance>0).map(p=>({...p,amount:p.balance})).sort((a,b)=>b.amount-a.amount);
 // Start with a valid plan, then search direct debtor-to-creditor payments.
 // Every step clears at least one balance. An optimal plan can be chosen
 // without cycles, so exploring all such pairs includes a minimum-edge plan.
 const remainingDebt=debt.map(p=>p.amount),remainingCredit=credit.map(p=>p.amount);
 const payments=debt.map(()=>0),plan=[],seen=new Map();
 let best=[],bestSplits=0,i=0,j=0;
 const d=remainingDebt.slice(),c=remainingCredit.slice(),counts=payments.slice();
 while(i<d.length&&j<c.length){const amount=Math.min(d[i],c[j]);best.push({from:debt[i].name,to:credit[j].name,amount});counts[i]++;d[i]-=amount;c[j]-=amount;if(!d[i])i++;if(!c[j])j++;}
 bestSplits=counts.filter(n=>n>1).length;
 // Bound synchronous work for unusually large tables; keep the best valid
 // plan found, and report whether optimality was established to the UI.
 let visits=0,limited=false;
 function search(splits){
  if(++visits>100000){limited=true;return;}
  const activeDebt=remainingDebt.filter(n=>n>0).length,activeCredit=remainingCredit.filter(n=>n>0).length;
  if(!activeDebt){if(plan.length<best.length||(plan.length===best.length&&splits<bestSplits)){best=plan.slice();bestSplits=splits;}return;}
  const lowerBound=plan.length+Math.max(activeDebt,activeCredit);
  if(lowerBound>best.length||(lowerBound===best.length&&splits>=bestSplits))return;
  const key=remainingDebt.join(',')+'|'+remainingCredit.join(',')+'|'+payments.map(n=>Math.min(n,2)).join(',');
  if(seen.has(key)&&seen.get(key)<=plan.length)return;
  seen.set(key,plan.length);
  const pairs=[];
  for(let a=0;a<debt.length;a++)if(remainingDebt[a])for(let b=0;b<credit.length;b++)if(remainingCredit[b])pairs.push([a,b]);
  pairs.sort((x,y)=>Number(remainingDebt[y[0]]===remainingCredit[y[1]])-Number(remainingDebt[x[0]]===remainingCredit[x[1]]));
  for(const [a,b] of pairs){
   if(limited)return;
   const amount=Math.min(remainingDebt[a],remainingCredit[b]),extraSplit=payments[a]===1?1:0;
   remainingDebt[a]-=amount;remainingCredit[b]-=amount;payments[a]++;
   plan.push({from:debt[a].name,to:credit[b].name,amount});
   search(splits+extraSplit);
   plan.pop();payments[a]--;remainingDebt[a]+=amount;remainingCredit[b]+=amount;
  }
 }
 search(0);
 return {balances,transfers:best,optimal:!limited,splitPayers:bestSplits};
}
if(typeof module!=='undefined')module.exports={settle};else root.PokerMath={settle};
})(typeof window!=='undefined'?window:globalThis);
