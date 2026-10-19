'use strict';
const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:c%100?2:0}).format(c/100);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>({version:1,id:crypto.randomUUID(),host:'',createdAt:new Date().toISOString(),completedAt:null,buyin:10000,phase:'setup',demo:false,players:[]});
const sample=()=>({...fresh(),host:'החברים',phase:'live',demo:true,players:[{id:'demo1',name:'אורי',rebuys:[10000],cash:null},{id:'demo2',name:'דנה',rebuys:[],cash:null},{id:'demo3',name:'נועם',rebuys:[5000],cash:null},{id:'demo4',name:'מיכל',rebuys:[],cash:null}]});
const validGame=g=>g&&g.version===1&&Number.isSafeInteger(g.buyin)&&g.buyin>0&&['setup','live','settle'].includes(g.phase)&&Array.isArray(g.players)&&g.players.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.rebuys)&&p.rebuys.every(n=>Number.isSafeInteger(n)&&n>0)&&(p.cash===null||(Number.isSafeInteger(p.cash)&&p.cash>=0))&&(p.exited===undefined||typeof p.exited==='boolean'));
const validDate=d=>typeof d==='string'&&Number.isFinite(Date.parse(d));
const validArchive=g=>validGame(g)&&g.phase==='settle'&&!g.demo&&typeof g.id==='string'&&typeof g.host==='string'&&g.host.trim()&&validDate(g.createdAt)&&validDate(g.completedAt)&&g.players.length>=2&&g.players.every(p=>p.cash!==null)&&g.players.reduce((n,p)=>n+p.cash-g.buyin-p.rebuys.reduce((a,b)=>a+b,0),0)===0;
const gameDate=g=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(g.createdAt)).replaceAll('/','.');
const gameName=g=>(g.host?'אצל '+g.host:'המשחק שלנו')+' · '+gameDate(g);
let state=fresh(),modalMode=null,selectedId=null,toastTimer,results=null;
let shared=null,activeGames=[],syncConflict=null,historyViewId=null;
try{
 const saved=JSON.parse(localStorage.getItem('pokersplit-v1'));
 if(validGame(saved))state={...saved,id:typeof saved.id==='string'?saved.id:state.id,host:typeof saved.host==='string'?saved.host.slice(0,40):'',createdAt:validDate(saved.createdAt)?saved.createdAt:state.createdAt,completedAt:null};
}catch{}
let gameHistory=[],historyAvailable=true;
try{
 const saved=JSON.parse(localStorage.getItem('pokersplit-history-v1')||'[]');
 if(!Array.isArray(saved))throw new Error('Invalid history');
 gameHistory=saved.filter(validArchive);
 const completed=gameHistory.find(g=>g.id===state.id);
 if(completed)state=JSON.parse(JSON.stringify(completed));
}catch{historyAvailable=false;}
const invested=p=>state.buyin+p.rebuys.reduce((a,b)=>a+b,0);
const pot=()=>state.players.reduce((a,p)=>a+invested(p),0);
function amount(value,zero=false){const v=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(v))return null;const n=Math.round(Number(v)*100);return Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=100000000?n:null;}
function save(){try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));if(!shared)$('save-status').textContent='✓ נשמר במכשיר';}catch{$('save-status').textContent='השאירו את העמוד פתוח — השמירה במכשיר לא זמינה';}if(shared)shared.queue(state);}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function addName(value){
 if(state.completedAt)return 'המשחק הסתיים. פתחו משחק חדש.';
 const name=value.trim();
 if(!name||name.length>24)return 'מה השם? עד 24 תווים.';
 if(state.players.some(p=>p.name===name))return 'השם כבר בשולחן. הוסיפו כינוי.';
 state.players.push({id:crypto.randomUUID(),name,rebuys:[],cash:null});state.demo=false;save();render();return null;
}
function render(){
 const setup=state.phase==='setup',closing=state.phase==='settle';
 document.body.dataset.phase=state.phase;
 document.querySelectorAll('[data-step]').forEach(el=>{el.classList.toggle('active',el.dataset.step===state.phase);el.classList.toggle('done',['setup','live','settle'].indexOf(el.dataset.step)<['setup','live','settle'].indexOf(state.phase));});
 $('screen-title').textContent=setup?'משחק חדש ♠':closing?'כמה נשאר?':'השולחן שלנו ♠';
 if(state.completedAt)$('screen-title').textContent=shared&&shared.hasPending(state.id)?'ממתין לשמירה באתר':'המשחק נשמר ✓';
 $('game-name').textContent=gameName(state);$('game-name').hidden=!state.host;
 $('host-input').value=state.host;
 $('history-count').textContent=gameHistory.length;
 $('setup-controls').hidden=!setup;$('table-stage').hidden=setup;
 $('add-player').hidden=setup||closing;$('back-to-game').hidden=!closing||!!state.completedAt;$('demo').hidden=!setup;
 $('players-title').textContent=closing?'הכסף בסיום':'השחקנים';
 $('player-count').textContent=state.players.length;
 $('buyin').value=state.buyin/100;
 document.querySelectorAll('[data-buyin]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.buyin)*100===state.buyin));
 $('players').innerHTML=state.players.length?state.players.map((p,i)=>{
 const rebuys=p.rebuys.length;
 return '<article class="player-card color-'+i%4+'"><div class="player-main"><span class="avatar">'+esc(p.name.slice(0,1))+'</span><div class="player-info"><strong>'+esc(p.name)+'</strong><small>נכנס '+money(invested(p))+'</small>'+(p.exited?'<small class="exit-status">יצא'+(!closing?(p.cash===null?' · סכום חסר':' עם '+money(p.cash)):' · סכום היציאה')+'</small>':'')+'</div>'+
 (setup?'<button class="remove-player" data-remove="'+esc(p.id)+'" aria-label="הסרת '+esc(p.name)+'">×</button>':closing?'<div class="cash-field"><span>₪</span><input type="number" inputmode="decimal" min="0" max="1000000" step="0.01" placeholder="0" '+(state.completedAt?'disabled ':'')+'aria-label="'+(p.exited?'סכום יציאה של ':'כסף בסיום של ')+esc(p.name)+'" data-cash="'+esc(p.id)+'" value="'+(p.cash===null?'':p.cash/100)+'"></div>':p.exited?'<button class="exit-button" data-exit="'+esc(p.id)+'" aria-label="תיקון סכום יציאה של '+esc(p.name)+'">תיקון יציאה</button>':'<button class="rebuy-button" data-rebuy="'+esc(p.id)+'" aria-label="ריבאי עבור '+esc(p.name)+'"><span>＋</span> ריבאי</button>')+'</div>'+
 (!setup&&!closing?'<div class="player-actions">'+(!p.exited?'<button class="exit-button" data-exit="'+esc(p.id)+'" aria-label="יציאה של '+esc(p.name)+'">יציאה</button>':'')+(rebuys&&!p.exited?'<button class="rebuy-history" data-history="'+esc(p.id)+'" aria-label="צפייה וביטול ריבאיים של '+esc(p.name)+'">ריבאי ×'+rebuys+' <span>↶</span></button>':'')+'</div>':'')+'</article>';
 }).join(''):'<div class="empty-table"><span aria-hidden="true">♠ ♥ ♣ ♦</span></div>';
 renderSummary();
}
function renderSummary(){
 const setup=state.phase==='setup',closing=state.phase==='settle';
 const exited=state.players.filter(p=>p.exited),withdrawn=exited.reduce((a,p)=>a+(p.cash??0),0);
 $('total-pot').textContent=money(pot()-withdrawn);$('pot-details').textContent=exited.length?state.players.filter(p=>!p.exited).length+' במשחק · '+exited.length+' יצאו':state.players.length+' שחקנים';
 const missing=state.players.filter(p=>p.cash===null).length,diff=state.players.reduce((a,p)=>a+(p.cash??0),0)-pot(),ready=closing&&state.players.length>=2&&!missing&&!diff;
 $('next-step').innerHTML=state.completedAt?'משחק חדש <span>＋</span>':setup?'התחל משחק <span>▶</span>':closing?ready?(state.demo?'מי משלם למי? <span>↓</span>':'סיום ושמירה <span>✓</span>'):'כמה נשאר לכל אחד?':'סיום משחק <span>🏁</span>';
 $('next-step').disabled=!state.completedAt&&(state.players.length<2||(closing&&!ready)||amount($('buyin').value)===null||(setup&&!state.host.trim()));
 $('action-hint').textContent=setup&&!state.host.trim()?'קודם רושמים אצל מי המשחק':setup&&state.players.length<2?'צריך לפחות 2 שחקנים':closing&&ready&&!state.completedAt?(state.demo?'משחק לדוגמה לא יישמר בהיסטוריה':'בדקו את הסכומים ואז לחצו לסיום ושמירה'):'';
 $('action-hint').hidden=!$('action-hint').textContent;
 $('reconciliation').hidden=!closing;
 $('reconciliation').className='reconcile '+(ready?'ok':!missing&&diff?'warn':'');
 $('reconciliation').textContent=missing?'עוד '+missing+' סכומים':diff?(diff>0?'עודף ':'חסרים ')+money(Math.abs(diff))+' · בדקו שוב':'✓ הכול מאוזן';
 if(ready){results=PokerMath.settle(state.players,state.buyin);renderResults();}
 else{results=null;$('results').hidden=true;}
}
function phase(next){if(state.completedAt)return;state.phase=next;save();render();window.scrollTo({top:0,behavior:'smooth'});}
function openModal(mode,id=null){
 modalMode=mode;selectedId=id;const p=state.players.find(p=>p.id===id),input=$('modal-input');
 $('modal-error').textContent='';$('modal-description').textContent='';
 $('modal-label').hidden=false;input.hidden=false;input.required=true;input.type='text';input.inputMode='text';input.removeAttribute('min');input.removeAttribute('step');input.removeAttribute('max');input.maxLength=24;input.value='';$('rebuy-presets').hidden=true;$('modal-submit').hidden=false;
 if(mode==='add'){$('modal-title').textContent='עוד חבר לשולחן';$('modal-label').textContent='שם השחקן';$('modal-submit').textContent='הוסף שחקן';}
 if(mode==='finish-host'){$('modal-title').textContent='אצל מי המשחק?';$('modal-description').textContent='נוסיף את השם והתאריך להיסטוריה.';$('modal-label').textContent='שם המארח';input.maxLength=40;$('modal-submit').textContent='סיום ושמירה';}
 if(mode==='rebuy'){
  $('modal-title').textContent='ריבאי ל'+p.name;$('modal-label').textContent='סכום אחר';
  input.type='number';input.inputMode='decimal';input.min='0.01';input.max='1000000';input.step='0.01';input.value=state.buyin/100;
  $('rebuy-presets').hidden=false;$('rebuy-presets').innerHTML=[.5,1,2].map(n=>'<button type="button" data-preset="'+Math.round(state.buyin*n)+'">'+money(Math.round(state.buyin*n))+'</button>').join('');
  $('modal-submit').textContent='הוסף ריבאי';
 }
 if(mode==='exit'){
  $('modal-title').textContent=(p.exited?'תיקון יציאה של ':'יציאה של ')+p.name;
  $('modal-description').textContent='סכום היציאה נשמר ונכלל בחישוב בסוף המשחק.';
  $('modal-label').textContent='עם כמה כסף יצא?';
  input.type='number';input.inputMode='decimal';input.min='0';input.max='1000000';input.step='0.01';input.value=p.exited&&p.cash!==null?p.cash/100:'';
  $('modal-submit').textContent='שמור יציאה';
 }
 if(['new','demo','remove','history'].includes(mode)){
  input.hidden=true;input.required=false;$('modal-label').hidden=true;
  $('modal-title').textContent=mode==='new'?'משחק חדש?':mode==='demo'?'לפתוח דוגמה?':mode==='remove'?'להסיר את '+p.name+'?':'הריבאיים של '+p.name;
  $('modal-description').textContent=mode==='new'||mode==='demo'?'המשחק הנוכחי טרם הסתיים ולא יישמר בהיסטוריה. להחליף אותו?':mode==='remove'?'השחקן והסכומים שלו יוסרו.':'';
  $('modal-submit').textContent=mode==='new'?'כן, משחק חדש':mode==='demo'?'פתח דוגמה':'הסר שחקן';
  if(mode==='history'){
   $('modal-submit').hidden=true;$('rebuy-presets').hidden=false;
   $('rebuy-presets').innerHTML=p.rebuys.map((n,i)=>'<button type="button" data-undo="'+i+'" aria-label="ביטול ריבאי של '+money(n)+'">'+money(n)+' <span>ביטול ×</span></button>').join('');
  }
 }
 $('modal').showModal();if(mode==='add'||mode==='finish-host')input.focus();
}
function applyRebuy(n){
 if(n===null){$('modal-error').textContent='צריך סכום חיובי, עם עד שתי ספרות אחרי הנקודה.';return;}
 const p=state.players.find(p=>p.id===selectedId);if(!p||p.exited||state.phase!=='live')return;p.rebuys.push(n);save();render();$('modal').close();toast('+'+money(n)+' לקופה 🎉');
}
$('add-form').onsubmit=e=>{e.preventDefault();const value=$('player-input').value,error=addName(value);$('add-error').textContent=error||'';if(!error){$('player-input').value='';$('player-input').focus();}};
$('player-input').oninput=()=>$('add-error').textContent='';
$('host-input').oninput=()=>{if(state.phase!=='setup')return;state.host=$('host-input').value.trim().slice(0,40);$('game-name').textContent=gameName(state);$('game-name').hidden=!state.host;save();renderSummary();};
 $('buyin').oninput=()=>{const n=amount($('buyin').value);$('buyin').setCustomValidity(n===null?'הזינו סכום חיובי.':'');if(n!==null){state.buyin=n;save();document.querySelectorAll('[data-buyin]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.buyin)*100===n));document.querySelectorAll('.player-card').forEach((row,i)=>row.querySelector('small').textContent='נכנס '+money(invested(state.players[i])));}renderSummary();};
document.querySelectorAll('[data-buyin]').forEach(b=>b.onclick=()=>{state.buyin=Number(b.dataset.buyin)*100;$('buyin').setCustomValidity('');save();render();});
$('add-player').onclick=()=>openModal('add');
$('new-game').onclick=()=>state.players.length&&!state.completedAt?openModal('new'):startNewGame();
$('demo').onclick=()=>state.players.length?openModal('demo'):(state=sample(),save(),render());
$('players').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.rebuy)openModal('rebuy',b.dataset.rebuy);if(b.dataset.remove)openModal('remove',b.dataset.remove);if(b.dataset.history)openModal('history',b.dataset.history);if(b.dataset.exit)openModal('exit',b.dataset.exit);};
$('players').oninput=e=>{if(state.completedAt||!e.target.matches('[data-cash]'))return;const p=state.players.find(p=>p.id===e.target.dataset.cash),n=amount(e.target.value,true);p.cash=n;e.target.setCustomValidity(n===null&&e.target.value!==''?'הזינו סכום תקין, כולל 0.':'');save();renderSummary();};
$('modal-form').onsubmit=e=>{
 e.preventDefault();
 if(modalMode==='finish-host'){
  const host=$('modal-input').value.trim();
  if(!host||host.length>40){$('modal-error').textContent='רושמים שם, עד 40 תווים.';return;}
  state.host=host;save();$('modal').close();finishGame();return;
 }
 if(modalMode==='rebuy'){applyRebuy(amount($('modal-input').value));return;}
 if(modalMode==='exit'){
  const p=state.players.find(p=>p.id===selectedId),n=amount($('modal-input').value,true);
  if(!p||state.phase!=='live')return;
  if(n===null){$('modal-error').textContent='הזינו סכום תקין, כולל 0, עם עד שתי ספרות אחרי הנקודה.';return;}
  const available=pot()-state.players.filter(other=>other.exited&&other.id!==p.id).reduce((a,other)=>a+other.cash,0);
  if(n>available){$('modal-error').textContent='סכום היציאה גדול מהכסף שנותר בקופה ('+money(available)+').';return;}
  p.cash=n;p.exited=true;save();render();$('modal').close();toast('סכום היציאה של '+p.name+' נשמר');return;
 }
 if(modalMode==='add'){const error=addName($('modal-input').value);if(error){$('modal-error').textContent=error;return;}}
 if(modalMode==='new')state=fresh();
 if(modalMode==='demo')state=sample();
 if(modalMode==='remove')state.players=state.players.filter(p=>p.id!==selectedId);
 save();render();$('modal').close();
};
$('rebuy-presets').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preset)applyRebuy(Number(b.dataset.preset));if(b.dataset.undo!==undefined){const p=state.players.find(p=>p.id===selectedId);p.rebuys.splice(Number(b.dataset.undo),1);save();render();$('modal').close();toast('הריבאי בוטל');}};
$('close-modal').onclick=()=>$('modal').close();
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
$('next-step').onclick=()=>{if($('next-step').disabled)return;if(state.completedAt)startNewGame();else if(state.phase==='setup')phase('live');else if(state.phase==='live')phase('settle');else if(state.demo)$('results').scrollIntoView({behavior:'smooth',block:'center'});else finishGame();};
$('back-to-game').onclick=()=>phase('live');
function renderResults(){
 const r=$('results');r.hidden=false;
 r.innerHTML='<div class="result-celebration" aria-hidden="true">'+(state.completedAt?'✓':'🎉')+'</div><h2>'+(state.completedAt?(shared&&shared.hasPending(state.id)?'ממתין לשמירה באתר':'נשמר בהיסטוריה!'):'זהו, מסודרים!')+'</h2>'+
 (results.transfers.length?'<p class="transfer-summary">'+results.transfers.length+' העברות'+(results.optimal?' · מינימום העברות':' · פתרון מצומצם, ללא הבטחת מינימום')+'</p>':'')+
 (results.transfers.length?results.transfers.map(t=>'<div class="transfer"><div><strong>'+esc(t.from)+'</strong><span> מעביר/ה ל־</span><strong>'+esc(t.to)+'</strong></div><b dir="ltr">'+money(t.amount)+'</b></div>').join(''):'<p>אף אחד לא צריך להעביר כסף ✓</p>')+
 '<button class="share-button" id="copy-results">העתק לחברים ⧉</button>';
 $('copy-results').onclick=async()=>{
  const text='♠ PokerSplit\n'+gameName(state)+'\n'+(results.transfers.length?results.transfers.map(t=>t.from+' מעביר/ה ל'+t.to+' '+money(t.amount)).join('\n'):'כולם מאוזנים. אין העברות.');
  try{await navigator.clipboard.writeText(text);toast('הועתק! אפשר להדביק בקבוצה');}
  catch{const box=document.createElement('textarea');box.value=text;box.style.cssText='position:fixed;top:0;opacity:0';document.body.append(box);box.select();try{if(!document.execCommand('copy'))throw new Error();toast('הסיכום הועתק');}catch{toast('לא ניתן להעתיק בדפדפן הזה');}box.remove();}
 };
}
function startNewGame(){state=fresh();results=null;save();render();window.scrollTo({top:0,behavior:'smooth'});$('host-input').focus();}
function finishGame(){
 if(state.completedAt||state.demo||state.phase!=='settle'||state.players.length<2||state.players.some(p=>p.cash===null)||state.players.reduce((n,p)=>n+p.cash,0)!==pot())return;
 if(!state.host.trim()){openModal('finish-host');return;}
 if(!historyAvailable&&!shared){toast('לא ניתן לשמור בהיסטוריה. השאירו את המשחק פתוח ונסו שוב.');return;}
 const completed=JSON.parse(JSON.stringify({...state,completedAt:new Date().toISOString()}));
 try{
  // Read again before writing so another tab's completed games are retained.
  const stored=JSON.parse(localStorage.getItem('pokersplit-history-v1')||'[]');
  if(!Array.isArray(stored))throw new Error('Invalid history');
  const existing=stored.find(g=>validArchive(g)&&g.id===completed.id);
  const next=existing?stored:[completed,...stored];
  localStorage.setItem('pokersplit-history-v1',JSON.stringify(next));
  gameHistory=next.filter(validArchive);
  state=existing?JSON.parse(JSON.stringify(existing)):completed;
 }catch{
  if(!shared){toast('המשחק לא נשמר בהיסטוריה. השאירו אותו פתוח ונסו שוב.');return;}
  gameHistory=[completed,...gameHistory.filter(g=>g.id!==completed.id)];state=completed;
 }
 save();render();if(shared)shared.flush();toast(shared?'המשחק הסתיים · שומר באתר…':'המשחק נשמר בהיסטוריה ✓');$('results').scrollIntoView({behavior:'smooth',block:'center'});
}
function showHistory(){
 historyViewId=null;
 $('history-title').textContent='היסטוריית משחקים';$('history-list').hidden=false;$('history-detail').hidden=true;$('history-back').hidden=true;
 $('history-list').innerHTML=(activeGames.length?'<h3>משחקים פעילים</h3>'+activeGames.map(g=>'<button class="history-card" type="button" data-resume="'+esc(g.id)+'"><strong>'+esc(gameName(g))+'</strong><span>'+g.players.length+' שחקנים · '+(g.phase==='settle'?'בסגירת חשבון':'משחק פעיל')+'</span><small>המשך משחק ←</small></button>').join('')+'<h3>משחקים שהסתיימו</h3>':'')+(gameHistory.length?gameHistory.map(g=>'<button class="history-card" type="button" data-game="'+esc(g.id)+'"><strong>'+esc(gameName(g))+'</strong><span>'+g.players.length+' שחקנים · סך כניסות '+money(g.players.reduce((n,p)=>n+g.buyin+p.rebuys.reduce((a,b)=>a+b,0),0))+'</span><small>'+(shared&&shared.hasPending(g.id)?'ממתין לשמירה באתר · ':'')+'לסיכום המשחק ←</small></button>').join(''):'<p class="history-empty">'+(historyAvailable?'עוד אין משחקים שמורים.<br>בסוף משחק לחצו על ״סיום ושמירה״, והוא יופיע כאן.':'לא ניתן לקרוא את ההיסטוריה בדפדפן הזה.')+'</p>');
 $('history-dialog').showModal();
}
function showHistoryGame(id){
 const g=gameHistory.find(g=>g.id===id);if(!g)return;
 historyViewId=id;
 const settlement=PokerMath.settle(g.players,g.buyin);
 const ranked=g.players.map(p=>{
  const investment=g.buyin+p.rebuys.reduce((a,b)=>a+b,0);
  return {player:p,investment,balance:p.cash-investment};
 }).sort((a,b)=>b.balance-a.balance);
 const topProfit=ranked[0].balance,sharedLead=ranked.filter(p=>p.balance===topProfit).length>1;
 $('history-title').textContent=gameName(g);$('history-list').hidden=true;$('history-detail').hidden=false;$('history-back').hidden=false;
 $('history-detail').innerHTML='<h3>השחקנים והסכומים</h3><p class="ranking-hint">מהרווח הגבוה להפסד הגדול</p>'+ranked.map(({player:p,investment,balance})=>{
  const winner=balance>0&&balance===topProfit;
  const outcome=balance>0?'profit':balance<0?'loss':'even';
  return '<article class="player-card history-player'+(winner?' history-winner':'')+'"><div class="history-player-top"><strong>'+esc(p.name)+'</strong>'+(winner?'<span class="winner-badge"><span aria-hidden="true">👑</span> '+(sharedLead?'מובילים':'המוביל')+'</span>':'')+'</div><div class="history-balance '+outcome+'"><span>'+(balance>0?'רווח':balance<0?'הפסד':'ברייק־איבן')+'</span><b dir="ltr">'+(balance>0?'+':balance<0?'−':'')+money(Math.abs(balance))+'</b></div><div class="history-amounts"><div><span>סך כניסות</span><b>'+money(investment)+'</b></div><div><span>סכום יציאה</span><b>'+money(p.cash)+'</b></div></div>'+(p.rebuys.length?'<small class="history-rebuys">כולל '+p.rebuys.length+' ריבאיים</small>':'')+'</article>';
 }).join('')+'<h3>מי מעביר למי?</h3>'+(settlement.transfers.length?settlement.transfers.map(t=>'<div class="transfer"><div><strong>'+esc(t.from)+'</strong><span> מעביר/ה ל־</span><strong>'+esc(t.to)+'</strong></div><b dir="ltr">'+money(t.amount)+'</b></div>').join(''):'<p>כולם מאוזנים. אין העברות ✓</p>');
 $('history-dialog').scrollTop=0;
}
$('game-history').onclick=showHistory;
$('close-history').onclick=()=>$('history-dialog').close();
$('history-back').onclick=()=>{ $('history-dialog').close();showHistory(); };
$('history-list').onclick=e=>{
 const button=e.target.closest('[data-game], [data-resume]');if(!button)return;
 if(button.dataset.game){showHistoryGame(button.dataset.game);return;}
 const game=activeGames.find(g=>g.id===button.dataset.resume);if(!game)return;
 if(syncConflict){toast('קודם בחרו איך לשמור את השינויים במכשיר הזה.');return;}
 state=JSON.parse(JSON.stringify(game));results=null;
 try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));}catch{}
 $('history-dialog').close();render();window.scrollTo({top:0,behavior:'smooth'});
};
function mergeShared(records){
 const valid=records.map(r=>r.game).filter(g=>validGame(g)&&validDate(g.createdAt)&&typeof g.host==='string');
 const finished=valid.filter(validArchive);
 const combined=new Map(gameHistory.map(g=>[g.id,g]));
 for(const g of finished)if(!shared.hasPending(g.id))combined.set(g.id,g);
 gameHistory=[...combined.values()].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
 activeGames=valid.filter(g=>!g.completedAt);
 for(const g of activeGames)if(g.id===state.id&&!shared.hasPending(g.id)&&!PokerSync.sameGame(state,g)){
  state=JSON.parse(JSON.stringify(g));try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));}catch{}render();
 }
 const completed=finished.find(g=>g.id===state.id);
 if(completed&&!shared.hasPending(state.id)&&!PokerSync.sameGame(state,completed)){state=JSON.parse(JSON.stringify(completed));try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));}catch{}render();}
 try{localStorage.setItem('pokersplit-history-v1',JSON.stringify(gameHistory));}catch{}
 $('history-count').textContent=gameHistory.length;
 $('shared-notice').textContent=activeGames.length?'באתר יש '+activeGames.length+' משחקים פעילים · אפשר להמשיך דרך ההיסטוריה':'';
 $('shared-notice').hidden=!activeGames.length;
 if($('history-dialog').open&&!historyViewId){$('history-dialog').close();showHistory();}
}
function syncStatus(status){
 if(status.conflicts){syncConflict=shared.conflicts()[0];$('sync-conflict').hidden=false;}
 const el=$('save-status');
 el.textContent=status.conflicts?'יש שינוי ממכשיר אחר · צריך לבחור גרסה':!status.online?(status.localAvailable?'אין חיבור לשמירה באתר · השינויים נשמרים במכשיר':'השמירה לא זמינה · השאירו את העמוד פתוח'):status.pending?'שומר באתר…':'✓ מסונכרן עם האתר';
 el.dataset.state=status.conflicts||!status.online?'warning':status.pending?'pending':'saved';
 if(state.completedAt){$('screen-title').textContent=shared.hasPending(state.id)?'ממתין לשמירה באתר':'המשחק נשמר ✓';if(results)renderResults();}
}
if(typeof PokerSync!=='undefined'){
 shared=new PokerSync.SharedGames({fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(12000)}),storage:localStorage,onChange:mergeShared,onStatus:syncStatus,onConflict:conflict=>{
  syncConflict=conflict;$('sync-conflict').hidden=false;
 }});
 $('sync-load-remote').onclick=()=>{
  if(!syncConflict)return;const game=shared.acceptRemote(syncConflict.local.id);
  if(!game){toast('לא ניתן לטעון כרגע. השינויים שלך עדיין במכשיר.');return;}
  if(state.id===game.id){state=game;results=null;try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));}catch{}}
  syncConflict=null;$('sync-conflict').hidden=true;render();
 };
 $('sync-keep-separate').onclick=()=>{
  if(!syncConflict)return;const originalId=syncConflict.local.id,game=shared.keepSeparate(originalId,crypto.randomUUID());if(!game)return;
  if(state.id===originalId)state=game;
  gameHistory=gameHistory.filter(g=>g.id!==originalId);if(validArchive(game))gameHistory.unshift(game);
  syncConflict=null;$('sync-conflict').hidden=true;save();render();shared.flush();
 };
 $('sync-retry').onclick=async()=>{await shared.refresh();await shared.flush();};
}
render();
if(!shared)save();else try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));}catch{}
if(shared){
 const initial=[...gameHistory,...(!state.demo&&(state.host||state.players.length)?[state]:[])];
 shared.start(initial);
 window.addEventListener('online',()=>{shared.refresh().then(()=>shared.flush());});
 window.addEventListener('focus',()=>{shared.refresh().then(()=>shared.flush());});
 setInterval(()=>{if(!document.hidden)shared.refresh().then(()=>shared.flush());},15000);
}
