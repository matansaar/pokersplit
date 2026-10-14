'use strict';
const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:c%100?2:0}).format(c/100);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>({version:1,buyin:10000,phase:'setup',demo:false,players:[]});
const sample=()=>({version:1,buyin:10000,phase:'live',demo:true,players:[{id:'demo1',name:'אורי',rebuys:[10000],cash:null},{id:'demo2',name:'דנה',rebuys:[],cash:null},{id:'demo3',name:'נועם',rebuys:[5000],cash:null},{id:'demo4',name:'מיכל',rebuys:[],cash:null}]});
let state=fresh(),modalMode=null,selectedId=null,toastTimer,results=null;
try{
 const saved=JSON.parse(localStorage.getItem('pokersplit-v1'));
 if(saved&&saved.version===1&&Number.isSafeInteger(saved.buyin)&&saved.buyin>0&&['setup','live','settle'].includes(saved.phase)&&Array.isArray(saved.players)&&saved.players.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.rebuys)&&p.rebuys.every(n=>Number.isSafeInteger(n)&&n>0)&&(p.cash===null||(Number.isSafeInteger(p.cash)&&p.cash>=0))))state=saved;
}catch{}
const invested=p=>state.buyin+p.rebuys.reduce((a,b)=>a+b,0);
const pot=()=>state.players.reduce((a,p)=>a+invested(p),0);
function amount(value,zero=false){const v=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(v))return null;const n=Math.round(Number(v)*100);return Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=100000000?n:null;}
function save(){try{localStorage.setItem('pokersplit-v1',JSON.stringify(state));$('save-status').textContent='✓ נשמר אוטומטית';}catch{$('save-status').textContent='השאירו את העמוד פתוח — השמירה לא זמינה';}}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function addName(value){
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
 $('setup-controls').hidden=!setup;$('table-stage').hidden=setup;
 $('add-player').hidden=setup||closing;$('back-to-game').hidden=!closing;$('demo').hidden=!setup;
 $('players-title').textContent=closing?'הכסף בסיום':'השחקנים';
 $('player-count').textContent=state.players.length;
 $('buyin').value=state.buyin/100;
 document.querySelectorAll('[data-buyin]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.buyin)*100===state.buyin));
 $('players').innerHTML=state.players.length?state.players.map((p,i)=>{
 const rebuys=p.rebuys.length;
 return '<article class="player-card color-'+i%4+'"><div class="player-main"><span class="avatar">'+esc(p.name.slice(0,1))+'</span><div class="player-info"><strong>'+esc(p.name)+'</strong><small>נכנס '+money(invested(p))+'</small></div>'+
 (setup?'<button class="remove-player" data-remove="'+esc(p.id)+'" aria-label="הסרת '+esc(p.name)+'">×</button>':closing?'<div class="cash-field"><span>₪</span><input type="number" inputmode="decimal" min="0" max="1000000" step="0.01" placeholder="0" aria-label="כסף בסיום של '+esc(p.name)+'" data-cash="'+esc(p.id)+'" value="'+(p.cash===null?'':p.cash/100)+'"></div>':'<button class="rebuy-button" data-rebuy="'+esc(p.id)+'" aria-label="ריבאי עבור '+esc(p.name)+'"><span>＋</span> ריבאי</button>')+'</div>'+
 (!setup&&!closing&&rebuys?'<button class="rebuy-history" data-history="'+esc(p.id)+'" aria-label="צפייה וביטול ריבאיים של '+esc(p.name)+'">ריבאי ×'+rebuys+' <span>↶</span></button>':'')+'</article>';
 }).join(''):'<div class="empty-table"><span aria-hidden="true">♠ ♥ ♣ ♦</span></div>';
 renderSummary();
}
function renderSummary(){
 const setup=state.phase==='setup',closing=state.phase==='settle';
 $('total-pot').textContent=money(pot());$('pot-details').textContent=state.players.length+' שחקנים';
 const missing=state.players.filter(p=>p.cash===null).length,diff=state.players.reduce((a,p)=>a+(p.cash??0),0)-pot(),ready=closing&&state.players.length>=2&&!missing&&!diff;
 $('next-step').innerHTML=setup?'התחל משחק <span>▶</span>':closing?ready?'מי משלם למי? <span>↓</span>':'כמה נשאר לכל אחד?':'סיום משחק <span>🏁</span>';
 $('next-step').disabled=state.players.length<2||(closing&&!ready)||amount($('buyin').value)===null;
 $('action-hint').textContent=setup&&state.players.length<2?'צריך לפחות 2 שחקנים':'';
 $('action-hint').hidden=!$('action-hint').textContent;
 $('reconciliation').hidden=!closing;
 $('reconciliation').className='reconcile '+(ready?'ok':!missing&&diff?'warn':'');
 $('reconciliation').textContent=missing?'עוד '+missing+' סכומים':diff?(diff>0?'עודף ':'חסרים ')+money(Math.abs(diff))+' · בדקו שוב':'✓ הכול מאוזן';
 if(ready){results=PokerMath.settle(state.players,state.buyin);renderResults();}
 else{results=null;$('results').hidden=true;}
}
function phase(next){state.phase=next;save();render();window.scrollTo({top:0,behavior:'smooth'});}
function openModal(mode,id=null){
 modalMode=mode;selectedId=id;const p=state.players.find(p=>p.id===id),input=$('modal-input');
 $('modal-error').textContent='';$('modal-description').textContent='';
 $('modal-label').hidden=false;input.hidden=false;input.required=true;input.type='text';input.inputMode='text';input.removeAttribute('min');input.removeAttribute('step');input.removeAttribute('max');input.maxLength=24;input.value='';$('rebuy-presets').hidden=true;$('modal-submit').hidden=false;
 if(mode==='add'){$('modal-title').textContent='עוד חבר לשולחן';$('modal-label').textContent='שם השחקן';$('modal-submit').textContent='הוסף שחקן';}
 if(mode==='rebuy'){
  $('modal-title').textContent='ריבאי ל'+p.name;$('modal-label').textContent='סכום אחר';
  input.type='number';input.inputMode='decimal';input.min='0.01';input.max='1000000';input.step='0.01';input.value=state.buyin/100;
  $('rebuy-presets').hidden=false;$('rebuy-presets').innerHTML=[.5,1,2].map(n=>'<button type="button" data-preset="'+Math.round(state.buyin*n)+'">'+money(Math.round(state.buyin*n))+'</button>').join('');
  $('modal-submit').textContent='הוסף ריבאי';
 }
 if(['new','demo','remove','history'].includes(mode)){
  input.hidden=true;input.required=false;$('modal-label').hidden=true;
  $('modal-title').textContent=mode==='new'?'משחק חדש?':mode==='demo'?'לפתוח דוגמה?':mode==='remove'?'להסיר את '+p.name+'?':'הריבאיים של '+p.name;
  $('modal-description').textContent=mode==='new'||mode==='demo'?'המשחק הנוכחי יוחלף.':mode==='remove'?'השחקן והסכומים שלו יוסרו.':'';
  $('modal-submit').textContent=mode==='new'?'כן, משחק חדש':mode==='demo'?'פתח דוגמה':'הסר שחקן';
  if(mode==='history'){
   $('modal-submit').hidden=true;$('rebuy-presets').hidden=false;
   $('rebuy-presets').innerHTML=p.rebuys.map((n,i)=>'<button type="button" data-undo="'+i+'" aria-label="ביטול ריבאי של '+money(n)+'">'+money(n)+' <span>ביטול ×</span></button>').join('');
  }
 }
 $('modal').showModal();if(mode==='add')input.focus();
}
function applyRebuy(n){
 if(n===null){$('modal-error').textContent='צריך סכום חיובי, עם עד שתי ספרות אחרי הנקודה.';return;}
 const p=state.players.find(p=>p.id===selectedId);p.rebuys.push(n);save();render();$('modal').close();toast('+'+money(n)+' לקופה 🎉');
}
$('add-form').onsubmit=e=>{e.preventDefault();const value=$('player-input').value,error=addName(value);$('add-error').textContent=error||'';if(!error){$('player-input').value='';$('player-input').focus();}};
$('player-input').oninput=()=>$('add-error').textContent='';
 $('buyin').oninput=()=>{const n=amount($('buyin').value);$('buyin').setCustomValidity(n===null?'הזינו סכום חיובי.':'');if(n!==null){state.buyin=n;save();document.querySelectorAll('[data-buyin]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.buyin)*100===n));document.querySelectorAll('.player-card').forEach((row,i)=>row.querySelector('small').textContent='נכנס '+money(invested(state.players[i])));}renderSummary();};
document.querySelectorAll('[data-buyin]').forEach(b=>b.onclick=()=>{state.buyin=Number(b.dataset.buyin)*100;$('buyin').setCustomValidity('');save();render();});
$('add-player').onclick=()=>openModal('add');
$('new-game').onclick=()=>state.players.length?openModal('new'):(state=fresh(),save(),render());
$('demo').onclick=()=>state.players.length?openModal('demo'):(state=sample(),save(),render());
$('players').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.rebuy)openModal('rebuy',b.dataset.rebuy);if(b.dataset.remove)openModal('remove',b.dataset.remove);if(b.dataset.history)openModal('history',b.dataset.history);};
$('players').oninput=e=>{if(!e.target.matches('[data-cash]'))return;const p=state.players.find(p=>p.id===e.target.dataset.cash),n=amount(e.target.value,true);p.cash=n;e.target.setCustomValidity(n===null&&e.target.value!==''?'הזינו סכום תקין, כולל 0.':'');save();renderSummary();};
$('modal-form').onsubmit=e=>{
 e.preventDefault();
 if(modalMode==='rebuy'){applyRebuy(amount($('modal-input').value));return;}
 if(modalMode==='add'){const error=addName($('modal-input').value);if(error){$('modal-error').textContent=error;return;}}
 if(modalMode==='new')state=fresh();
 if(modalMode==='demo')state=sample();
 if(modalMode==='remove')state.players=state.players.filter(p=>p.id!==selectedId);
 save();render();$('modal').close();
};
$('rebuy-presets').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preset)applyRebuy(Number(b.dataset.preset));if(b.dataset.undo!==undefined){const p=state.players.find(p=>p.id===selectedId);p.rebuys.splice(Number(b.dataset.undo),1);save();render();$('modal').close();toast('הריבאי בוטל');}};
$('close-modal').onclick=()=>$('modal').close();
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
$('next-step').onclick=()=>{if(state.phase==='setup')phase('live');else if(state.phase==='live')phase('settle');else if(results)$('results').scrollIntoView({behavior:'smooth',block:'center'});};
$('back-to-game').onclick=()=>phase('live');
function renderResults(){
 const r=$('results');r.hidden=false;
 r.innerHTML='<div class="result-celebration" aria-hidden="true">🎉</div><h2>זהו, מסודרים!</h2>'+
 (results.transfers.length?results.transfers.map(t=>'<div class="transfer"><div><strong>'+esc(t.from)+'</strong><span> מעביר/ה ל־</span><strong>'+esc(t.to)+'</strong></div><b dir="ltr">'+money(t.amount)+'</b></div>').join(''):'<p>אף אחד לא צריך להעביר כסף ✓</p>')+
 '<button class="share-button" id="copy-results">העתק לחברים ⧉</button>';
 $('copy-results').onclick=async()=>{
  const text='♠ PokerSplit\n'+(results.transfers.length?results.transfers.map(t=>t.from+' מעביר/ה ל'+t.to+' '+money(t.amount)).join('\n'):'כולם מאוזנים. אין העברות.');
  try{await navigator.clipboard.writeText(text);toast('הועתק! אפשר להדביק בקבוצה');}
  catch{const box=document.createElement('textarea');box.value=text;box.style.cssText='position:fixed;top:0;opacity:0';document.body.append(box);box.select();try{if(!document.execCommand('copy'))throw new Error();toast('הסיכום הועתק');}catch{toast('לא ניתן להעתיק בדפדפן הזה');}box.remove();}
 };
}
render();save();
