(function(root){
function settle(players,buyin){
 const balances=players.map(p=>({id:p.id,name:p.name,balance:p.cash-buyin-p.rebuys.reduce((a,b)=>a+b,0)}));
 if(balances.reduce((a,p)=>a+p.balance,0)!==0)throw new Error('Unbalanced game');
 const debt=balances.filter(p=>p.balance<0).map(p=>({...p,amount:-p.balance})).sort((a,b)=>b.amount-a.amount);
 const credit=balances.filter(p=>p.balance>0).map(p=>({...p,amount:p.balance})).sort((a,b)=>b.amount-a.amount);
 const transfers=[];let i=0,j=0;
 while(i<debt.length&&j<credit.length){const amount=Math.min(debt[i].amount,credit[j].amount);transfers.push({from:debt[i].name,to:credit[j].name,amount});debt[i].amount-=amount;credit[j].amount-=amount;if(!debt[i].amount)i++;if(!credit[j].amount)j++;}
 return {balances,transfers};
}
if(typeof module!=='undefined')module.exports={settle};else root.PokerMath={settle};
})(typeof window!=='undefined'?window:globalThis);
