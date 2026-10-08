import { api } from './api.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const ic = {
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  layout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  pulse:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
  bad:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>'
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT; function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3200)}

document.documentElement.classList.add('js');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
ic.home='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8M5 10v10h14V10"/></svg>';
ic.clip='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>';

/* shell + roles */
const NAV = {
  student:[['exams','My exams','list'],['results','Results','ok']],
  teacher:[
    ['tdash','Dashboard','home'],
    ['texams','Exams','clip'],
    ['bank','Question bank','db'],
    ['create-exam', 'Create exam', 'layout'],
    ['blueprint','Question paper','clip'],
    ['perf','Performance','pulse']
  ]
};
let role='student', view='exams', user=null;
function renderNav(){
  $('#nav').innerHTML = NAV[role].map(([id,l,i])=>`<button class="navitem" data-view="${id}" aria-current="${id===view}">${ic[i]}<span>${l}</span></button>`).join('');
}
function go(v){
  view=v; $$('.view').forEach(s=>s.hidden = s.id!=='view-'+v); renderNav(); $('.main').scrollTop=0;
  v==='perf' ? perfStart() : perfStop();
  if(v==='tdash') renderTDash(); if(v==='texams') renderTExams(); if(v==='results') renderResults(); if(v==='bank') renderBank(); if(v==='exams') renderExams();
}
function setRole(r){ role=r; go(NAV[r][0][0]); }
$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]'); if(b) go(b.dataset.view)});

/* site routing */
const ROLE_LABEL={student:'Student',teacher:'Teacher',admin:'Admin'};
function enterApp(r,name){
  user={role:r,name}; $('#landing').hidden=true; $('#login').hidden=true; $('#appShell').hidden=false;
  $('#uName').textContent=name; $('#uRole').textContent=ROLE_LABEL[r]; $('#uAv').textContent=r==='student'?'S':name.charAt(0).toUpperCase();
  setRole(r);
}

async function boot() {
  try {
    const me = await api.me();
    enterApp(me.role, me.username || (me.role === 'student' ? 'Student' : 'Teacher'));
  } catch(e) {
    if (location.hash === '#login') {
      showLogin('student', false);
    } else {
      showLanding(false);
    }
  }
}

async function logout(){
  closeExam(); perfStop(); user=null; 
  try { await api.logout(); } catch(e){}
  $('#appShell').hidden=true; $('#login').hidden=true; $('#landing').hidden=false; $('#landing').scrollTop=0; toast('You have been signed out.');
}
function showLanding(push = true){
  $('#login').hidden = true;
  $('#landing').hidden = false;
  if (push && location.hash === '#login') {
    history.pushState(null, '', location.pathname + location.search);
  }
}

function showLogin(r, push = true){
  $('#landing').hidden = true;
  $('#login').hidden = false;
  setLTab(r || 'student');
  $('#lid').focus();
  if (push && location.hash !== '#login') {
    history.pushState({ page: 'login' }, '', '#login');
  }
}

window.addEventListener('popstate', () => {
  if (!$('#appShell').hidden) return;
  if (location.hash === '#login') {
    $('#landing').hidden = true;
    $('#login').hidden = false;
    setLTab('student');
  } else {
    $('#login').hidden = true;
    $('#landing').hidden = false;
  }
});
$('#signout').onclick=logout;
document.addEventListener('click',e=>{
  if(e.target.closest('[data-login]')) return showLogin('student');
  if(e.target.closest('[data-home]')||e.target.closest('[data-top]')){ showLanding(); return $('#landing').scrollTo({top:0}); }
  const s=e.target.closest('[data-scroll]'); if(s){ const t=$(s.dataset.scroll); if(t) t.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'}); }
});

/* landing: reveals, count-up, story */
function stepVis(i){
  const rows=[
   ['MCQ','Easy','Which UNIX command lists the files in a directory?'],
   ['Subjective','Hard','Explain dual-mode operation and how the hardware switches modes.'],
   ['MCQ','Medium','What is the main drawback of a monolithic kernel structure?']];
  if(i===0) return `<div class="vcard"><div class="vh"><b>questions.csv</b><span class="badge ok">500 of 500 rows valid</span></div>${rows.map(r=>`<div class="vr"><span class="badge">${r[0]}</span><span class="badge ${r[1]==='Easy'?'ok':r[1]==='Hard'?'bad':'warn'}">${r[1]}</span><span>${r[2]}</span></div>`).join('')}<div class="vf">Subject, topic and unit are checked before anything is saved.</div></div>`;
  if(i===1) return `<div class="vcard"><div class="vh"><b>Operating Systems mid-sem paper</b><span class="badge brand">Fixed paper</span></div><div class="vm"><span class="hd">Section</span><span class="hd">Offered</span><span class="hd">Attempt</span><span class="hd">Marks each</span>
   <span>A: MCQ, Easy</span><span class="num">2</span><span class="num">1</span><span class="num">1</span><span>B: MCQ, Medium</span><span class="num">2</span><span class="num">1</span><span class="num">1</span><span>C: Subjective, Medium</span><span class="num">2</span><span class="num">1</span><span class="num">5</span><span>D: Subjective, Hard</span><span class="num">2</span><span class="num">1</span><span class="num">5</span>
   <span class="rule"></span><span class="tot">Total marks</span><span></span><span></span><span class="tot num">12</span></div><div class="vf">8 questions drawn from the bank, 4 answered by each student.</div></div>`;
  if(i===2) return `<div class="vcard"><div class="vh"><span class="sub num">Question 6 of 8</span><span class="timer num">03:18</span></div><div class="vq">A foreign key constraint enforces:</div><div class="vo"><span class="key">A</span>Entity integrity</div><div class="vo"><span class="key">B</span>Domain integrity</div><div class="vo sel"><span class="key">C</span>Referential integrity</div><div class="vo"><span class="key">D</span>Key uniqueness only</div><div class="vf">No score, no hints and no difficulty shown while the exam runs.</div></div>`;
  return `<div class="vcard"><div class="vh"><b>DBMS unit 2 quiz</b><span class="badge ok">Ready to release</span></div><div class="vo"><span class="key">1</span>Score only</div><div class="vo sel"><span class="key">2</span>Score and right or wrong</div><div class="vo"><span class="key">3</span>Full review with correct answers</div><div class="vf">Students see only what you choose, and only after the exam closes.</div></div>`;
}
(function initLanding(){
  $('#stage').innerHTML=[0,1,2,3].map(i=>`<div class="vis" data-v="${i}">${stepVis(i)}</div>`).join('');
  $$('.step-vis').forEach(el=>el.innerHTML=stepVis(+el.dataset.v));
  const setStep=i=>{ $$('.step').forEach(s=>s.classList.toggle('on',+s.dataset.i===i)); $$('.vis').forEach(v=>v.classList.toggle('on',+v.dataset.v===i)); };
  setStep(0);
  if(!('IntersectionObserver' in window)){ $$('.rv').forEach(el=>el.classList.add('in')); $('#bars').classList.add('in'); return; }
  const rv=new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('in'); rv.unobserve(en.target); if(en.target.querySelector&&en.target.querySelector('[data-count]')) countUp(en.target); } }),{threshold:.15});
  $$('.rv').forEach(el=>reduce?(el.classList.add('in'),countUp(el,true)):rv.observe(el));
  const st=new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting) setStep(+en.target.dataset.i); }),{rootMargin:'-45% 0px -45% 0px'});
  $$('.step').forEach(el=>st.observe(el));
})();
function countUp(root,instant){
  root.querySelectorAll('[data-count]').forEach(el=>{
    const end=+el.dataset.count, suf=el.dataset.suffix||''; if(instant||reduce){ el.textContent=end+suf; return; }
    const t0=performance.now(), dur=900; el.textContent='0'+suf;
    const tick=t=>{ const p=Math.min((t-t0)/dur,1); el.textContent=Math.round(end*(1-Math.pow(1-p,3)))+suf; if(p<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

/* login */
let lrole='student';
const LCFG={student:{label:'Enrollment number',ph:'e.g. STU12345',title:'Sign in',sub:'Choose how you use APEX.'},teacher:{label:'Staff email',ph:'name@geu.ac.in',title:'Sign in',sub:'Choose how you use APEX.'}};
function setLTab(r){
  lrole=r; const c=LCFG[r];
  $$('#lTabs [data-lr]').forEach(b=>b.setAttribute('aria-selected',b.dataset.lr===r));
  $('#lTitle').textContent=c.title; $('#lSub').textContent=c.sub;
  $('#lidLabel').textContent=c.label; $('#lid').placeholder=c.ph;
  ['lid','lpw'].forEach(k=>{$('#'+k+'Err').hidden=true}); $('#lAlert').hidden=true; $('#lHelp').hidden=true;
}
$('#lTabs').addEventListener('click',e=>{const b=e.target.closest('[data-lr]'); if(b) setLTab(b.dataset.lr)});
$('#lForgot').onclick=()=>{$('#lHelp').hidden=false};
$('#lShow').onclick=()=>{const p=$('#lpw'),s=p.type==='password'; p.type=s?'text':'password'; $('#lShow').textContent=s?'Hide':'Show'; $('#lShow').setAttribute('aria-label',s?'Hide password':'Show password')};
function fieldErr(k,m){ const e=$('#'+k+'Err'); e.textContent=m; e.hidden=!m; }
function niceName(email){ const w=email.split('@')[0].split(/[._-]+/).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1)); return w.join(' ')||'Teacher'; }

$('#lForm').addEventListener('submit', async e=>{
  e.preventDefault(); const id=$('#lid').value.trim(), pw=$('#lpw').value; $('#lAlert').hidden=true; fieldErr('lid',''); fieldErr('lpw','');
  let bad=false;
  if(!id){ fieldErr('lid','Enter your '+LCFG[lrole].label.toLowerCase()+'.'); bad=true; }
  if(!pw){ fieldErr('lpw','Enter your password.'); bad=true; }
  if(bad) return;
  
  const go1=$('#lGo'); go1.disabled=true; go1.textContent='Signing in...';
  try {
    await api.login(id, pw);
    const me = await api.me();
    if (lrole === 'student' && me.role !== 'student') {
      try { await api.logout(); } catch(_) {}
      throw new Error('Invalid enrollment number or password.');
    }
    if (lrole === 'teacher' && me.role !== 'teacher') {
      try { await api.logout(); } catch(_) {}
      throw new Error('Invalid staff email or password.');
    }
    go1.disabled=false; go1.textContent='Sign in'; $('#lpw').value='';
    enterApp(me.role, me.username || (me.role === 'student' ? 'Student' : 'Teacher'));
  } catch(err) {
    go1.disabled=false; go1.textContent='Sign in';
    $('#lAlert').textContent = err.message || 'Login failed';
    $('#lAlert').hidden=false;
  }
});

const EXAMS = [
  {id:1,title:'Mixed practice quiz',sub:'Operating Systems and DBMS',mode:'Adaptive',q:8,min:10,when:'Open until 5 Oct, 6:00 pm',status:'open'},
  {id:2,title:'DBMS unit 3 test',sub:'Database Management Systems',mode:'Fixed paper',q:15,min:45,when:'Opens 3 Oct, 10:00 am',status:'upcoming'},
  {id:3,title:'OS unit 1 practice',sub:'Operating Systems',mode:'Adaptive',q:5,min:10,when:'Taken on 24 Sep',status:'done',level:'score_and_correctness'},
  {id:4,title:'DBMS unit 2 quiz',sub:'Database Management Systems',mode:'Adaptive',q:5,min:10,when:'Taken on 17 Sep',status:'pending',level:'score_and_correctness'}

];
function renderExams(){
  $('#examList').innerHTML = EXAMS.map(e=>{
    let a='';
    if(e.status==='open') a=`<button class="btn primary" data-start="${e.id}">Start exam</button>`;
    else if(e.status==='upcoming') a=`<span class="badge">Not open yet</span>`;
    else if(e.status==='done') a=`<span class="score num">${score(e.title)}</span><button class="btn" data-review="${e.id}">View review</button>`;
    else a=`<span class="badge warn">Submitted</span><span class="sub">Result not released yet</span>`;
    return `<div class="exam-row"><div><h3>${esc(e.title)}</h3><div class="meta"><span class="badge ${e.mode==='Adaptive'?'brand':''}">${e.mode}</span><span>${esc(e.sub)}</span><span>${e.q} questions</span><span>${e.min} minutes</span></div><div class="meta" style="margin-top:4px"><span>${e.when}</span></div></div><div class="act">${a}</div></div>`;
  }).join('');
}
$('#examList').addEventListener('click',e=>{
  const r=e.target.closest('[data-review]'); if(r) return openReview(r.dataset.review); const b=e.target.closest('[data-start]'); if(!b) return;
  const ex=EXAMS.find(x=>x.id==b.dataset.start);
  $('#startSub').textContent = `${ex.title}: ${ex.q} questions in ${ex.min} minutes.`;
  $('#startDlg').showModal();
});
$('#startCancel').onclick=()=>$('#startDlg').close();
$('#startGo').onclick=()=>{$('#startDlg').close(); openExam(1)};

function runChecks(){
  const items=[
    ['Browser', ()=> (CSS.supports('display','grid') && 'fetch' in window) ? ['ok','Your browser supports everything APEX needs.'] : ['bad','Use an up-to-date Chrome, Edge, Firefox or Safari.']],
    ['Connection', ()=> navigator.onLine ? ['ok','You are online.'] : ['bad','You appear to be offline. Reconnect before you start.']],
    ['Screen size', ()=> innerWidth>=1024 ? ['ok','Screen is large enough.'] : ['warn','Use a laptop or desktop screen at least 1024 px wide.']]
  ];
  const box=$('#checks'); box.innerHTML = items.map(i=>`<div class="check"><span class="dot"></span><div><b>${i[0]}</b><div class="sub">Not checked yet</div></div></div>`).join('');
  items.forEach((it,i)=>setTimeout(()=>{
    const [s,m]=it[1](); const row=box.children[i]; row.querySelector('.dot').className='dot '+s; row.querySelector('.sub').textContent=m;
  },350*(i+1)));
}
$('#runCheck').onclick=runChecks;

const QS = [
  {t:'Which scheduling algorithm is non-preemptive and serves processes strictly in order of arrival?', o:['Round Robin','First-Come First-Served (FCFS)','Shortest Remaining Time First','Preemptive priority']},
  {t:'A page fault occurs when:', o:['The CPU is idle','The disk is full','The referenced page is not in main memory','The page is present in the cache']},
  {t:'Which SQL clause filters individual rows before grouping?', o:['HAVING','ORDER BY','WHERE','GROUP BY']},
  {t:'Logical data independence means the ability to change:', o:['The conceptual schema without changing external schemas or application programs','The disk hardware','The indexes only','The operating system']},
  {t:'Which of the following is NOT a necessary condition for deadlock?', o:['Mutual exclusion','Hold and wait','Circular wait','Preemption']},
  {t:'A foreign key constraint enforces:', o:['Entity integrity','Domain integrity','Referential integrity','Key uniqueness only']},
  {t:'In demand paging, a valid-invalid bit set to invalid means the page is:', o:['Legal and in memory','Dirty','Locked in memory','Not in memory or not a legal page of the process']},
  {t:'A schedule is conflict serializable if its precedence graph:', o:['Contains a cycle','Has no cycle','Is empty only','Is a complete graph']}

];
let ex=null;
const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
function openExam(){
  ex={i:0,sel:null,left:600,done:false}; $('#exam').hidden=false; $('#exFoot').hidden=false; renderQ();
  clearInterval(ex.t); ex.t=setInterval(()=>{ ex.left--; paintTimer(); if(ex.left<=0) finish(true); },1000);
}
function paintTimer(){const t=$('#exTimer'); t.textContent=fmt(Math.max(ex.left,0)); t.classList.toggle('low',ex.left<=120)}
function renderQ(){
  const q=QS[ex.i]; ex.sel=null; paintTimer();
  $('#exCount').textContent=`Question ${ex.i+1} of ${QS.length}`; $('#exBar').style.width=(ex.i/QS.length*100)+'%'; $('#exSave').textContent='';
  $('#exBody').innerHTML=`<div class="sub">Multiple choice. Choose one answer.</div><h2 class="qtext">${esc(q.t)}</h2><div class="opts" role="radiogroup" aria-label="Answer options">${q.o.map((o,k)=>`<label class="opt"><input type="radio" name="o" value="${k}"><span class="key">${'ABCD'[k]}</span><span>${esc(o)}</span></label>`).join('')}</div>`;
  $('#exNext').disabled=true; $('#exNext').textContent = ex.i===QS.length-1?'Submit exam':'Save and continue';
}
function pick(k){
  const labels=$$('#exBody .opt'); if(!labels[k]) return;
  labels.forEach((l,i)=>{l.classList.toggle('sel',i===k); l.querySelector('input').checked=i===k});
  ex.sel=k; $('#exNext').disabled=false; $('#exSave').textContent='Saving...'; setTimeout(()=>{ if(ex&&!ex.done) $('#exSave').textContent='Saved' },500);
}
$('#exBody').addEventListener('change',e=>{ if(e.target.name==='o') pick(+e.target.value) });
$('#exNext').onclick=()=>{ if(ex.sel===null) return; ex.i++; ex.i>=QS.length ? finish(false) : renderQ(); };
function finish(timeUp){
  clearInterval(ex.t); ex.done=true; $('#exBar').style.width='100%'; $('#exFoot').hidden=true;
  $('#exCount').textContent='Finished'; EXAMS[0].status='pending'; EXAMS[0].when='Submitted just now'; renderExams();
  $('#exBody').innerHTML=`<div class="done"><div class="ring">${ic.ok.replace('<svg','<svg width="28" height="28"')}</div><h2 style="font-size:24px;letter-spacing:-.01em">${timeUp?'Time is up. Your answers were submitted.':'Exam submitted'}</h2><p class="sub" style="margin:8px 0 20px">Your answers are saved. Your teacher decides when results are released, so no score is shown yet.</p><button class="btn primary" id="backExams">Back to my exams</button></div>`;
}
function closeExam(){ if(ex) clearInterval(ex.t); $('#exam').hidden=true; ex=null; }
$('#exExit').onclick=closeExam;
$('#exBody').addEventListener('click',e=>{ if(e.target.id==='backExams') closeExam() });
document.addEventListener('keydown',e=>{
  if($('#exam').hidden||!ex||ex.done) return;
  const k={a:0,b:1,c:2,d:3,'1':0,'2':1,'3':2,'4':3}[e.key.toLowerCase()];
  if(k!==undefined && document.activeElement.tagName!=='INPUT'||k!==undefined&&document.activeElement.type==='radio') pick(k);
  else if(e.key==='Enter' && ex.sel!==null && document.activeElement.tagName!=='BUTTON') $('#exNext').click();
});

const dcls={Easy:'ok',Medium:'warn',Hard:'bad'};
let BANK = [];
async function renderBank(){
  const q=$('#fq').value.trim(), s=$('#fs').value, d=$('#fd').value, t=$('#ft').value;
  try {
    const res = await api.questions({ subject: s, topic: '', difficulty: d, qtype: t, limit: 500 });
    const qlow = q.toLowerCase();
    BANK = res.questions.filter(r => (!q || r.question_text.toLowerCase().includes(qlow)));
    
    $('#bankRows').innerHTML = BANK.length ? BANK.map(r=>`<tr><td><div class="clamp">${esc(r.question_text)}</div></td><td><span class="badge">${r.question_type==='MCQ'?'MCQ':'Subjective'}</span></td><td><span class="badge ${dcls[r.diff_level]}">${r.diff_level}</span></td><td class="num">${r.marks}</td><td class="sub">${esc(r.topic_name||'')}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty">No questions match these filters. Clear a filter to see more.</div></td></tr>`;
    $('#bankCount').textContent = `${BANK.length} matching questions found`;
  } catch(e) {
    $('#bankRows').innerHTML = `<tr><td colspan="5"><div class="empty bad">Failed to load questions.</div></td></tr>`;
  }
}
['#fq','#fs','#fd','#ft'].forEach(id=>$(id).addEventListener('change',renderBank));
$('#fq').addEventListener('keyup', (e) => { if(e.key === 'Enter') renderBank() });

/* CSV import check (client side) */
function parseCSV(text){
  const rows=[]; let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++} else q=false } else f+=c }
    else if(c==='"') q=true; else if(c===','){row.push(f);f=''}
    else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''} else if(c!=='\r') f+=c;
  }
  if(f.length||row.length){row.push(f);rows.push(row)} return rows;
}
function checkCSV(text){
  const rows=parseCSV(text).filter(r=>r.some(c=>c.trim()!==''));
  const need=['question_text','marks','diff_level','is_pyq','question_type','opt_a','opt_b','opt_c','opt_d','correct_opt','subject_name','topic_name','unit_number'];
  const h=(rows[0]||[]).map(x=>x.trim()); const miss=need.filter(c=>!h.includes(c));
  if(miss.length) return {fatal:`Missing columns: ${miss.join(', ')}.`};
  const ix=Object.fromEntries(h.map((c,i)=>[c,i])), issues=[]; let ok=0;
  rows.slice(1).forEach((r,n)=>{
    const g=c=>(r[ix[c]]||'').trim(), line=n+2, e=[];
    if(!g('question_text')) e.push('question text is empty');
    if(!['1','2','3','5'].includes(g('marks'))) e.push('marks must be 1, 2, 3 or 5');
    if(!['Easy','Medium','Hard'].includes(g('diff_level'))) e.push('difficulty must be Easy, Medium or Hard');
    if(!['0','1'].includes(g('is_pyq'))) e.push('is_pyq must be 0 or 1');
    if(!['1','2','3','4','5'].includes(g('unit_number'))) e.push('unit_number must be 1 to 5');
    if(!g('subject_name')||!g('topic_name')) e.push('subject and topic are required');
    const ty=g('question_type');
    if(!['MCQ','SUBJECTIVE'].includes(ty)) e.push('question_type must be MCQ or SUBJECTIVE');
    else if(ty==='MCQ'){
      if(!['opt_a','opt_b','opt_c','opt_d'].every(c=>g(c))) e.push('MCQ needs all four options');
      if(!['A','B','C','D'].includes(g('correct_opt'))) e.push('correct_opt must be A, B, C or D');
    }
    e.length ? issues.push(`Row ${line}: ${e.join('; ')}.`) : ok++;
  });
  return {total:rows.length-1, ok, issues};
}
$('#openImport').onclick=()=>{$('#csvOut').innerHTML='';$('#csvFile').value='';$('#importDlg').showModal()};
$('#importClose').onclick=()=>$('#importDlg').close();
$('#csvFile').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=checkCSV(await f.text()), out=$('#csvOut');
  if(r.fatal){ out.innerHTML=`<div class="msg bad">${ic.bad}<span>${esc(r.fatal)} Fix the header row and try again.</span></div>`; return; }
  const bad=r.issues.length;
  out.innerHTML=`
    <div class="msg ${bad?'bad':'ok'}">${bad?ic.bad:ic.ok}<span><b>${r.ok} of ${r.total} rows</b> are valid${bad?`, ${bad} need fixing before import.`:'. Ready to import.'}</span></div>
    ${bad?`<ul class="issues">${r.issues.slice(0,50).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
    ${!bad?`<button class="btn primary" id="doImport" style="width:100%;margin-top:12px">Import ${r.ok} questions to database</button>`:''}
  `;
  if(!bad){
    $('#doImport').onclick=async()=>{
      const btn=$('#doImport'); btn.disabled=true; btn.textContent='Importing...';
      try {
        const result = await api.uploadCsv(f, false);
        out.innerHTML=`<div class="msg ok">${ic.ok}<span><b>${result.imported} questions imported</b> successfully.</span></div>${result.errors.length?`<ul class="issues">${result.errors.slice(0,10).map(e=>`<li>Row ${e.row}: ${esc(e.error)}</li>`).join('')}</ul>`:''}`;
        await renderBank();
        toast(`${result.imported} questions added to the bank.`);
      } catch(err) {
        out.innerHTML+=`<div class="msg bad">${ic.bad}<span>Import failed: ${esc(err.message)}</span></div>`;
      }
    };
  }
});

let bpSubjects = [];
let bpTopics = {};

async function initBlueprint() {
  try {
    bpSubjects = await api.subjects();
    const allTopics = await api.topics();
    bpTopics = {};
    allTopics.forEach(t => {
      if(!bpTopics[t.subject_id]) bpTopics[t.subject_id] = [];
      bpTopics[t.subject_id].push(t);
    });
    
    const subHTML = bpSubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_name)}${s.is_private ? ' (Private)' : ''}</option>`).join('');
    $('#bpSubject').innerHTML = subHTML;
    $('#oaSubject').innerHTML = subHTML;
    
    if(bpSubjects.length) {
      $('#bpSubject').value = bpSubjects[0].subject_id;
      $('#oaSubject').value = bpSubjects[0].subject_id;
      await onBpSubjectChange();
      await onOaSubjectChange();
    }
  } catch(e) { console.error('Failed to load blueprint data', e); }
}


let paper = { secs: [] };

async function onBpSubjectChange() {
  paper.secs = [];
  renderPaper();
}
$('#bpSubject').addEventListener('change', onBpSubjectChange);

function renderPaper() {
  const sId = $('#bpSubject').value;
  const topics = bpTopics[sId] || [];
  
  let html = '';
  paper.secs.forEach((q, i) => {
    html += `<div class="sec">
      <div class="sec-h" style="justify-content:space-between"><b>Question ${i+1}</b> <button class="btn quiet" data-del-q="${i}">Remove</button></div>
      <div class="grid g2">
        <label class="field"><span>Unit</span>
          <select class="select" data-q="${i}" data-f="unit">
            ${[1,2,3,4,5].map(u => `<option value="${u}" ${q.unit==u?'selected':''}>Unit ${u}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Offered parts (n)</span><input class="input" type="number" data-q="${i}" data-f="n" value="${q.n}" min="1" max="6"></label>
        <label class="field"><span>Student attempts (k)</span><input class="input" type="number" data-q="${i}" data-f="k" value="${q.k}" min="1" max="6"></label>
        <label class="field"><span>Marks per part</span><input class="input" type="number" data-q="${i}" data-f="m" value="${q.m}" min="1"></label>
      </div>
      <div class="sub" style="margin-top:8px">Question marks = ${q.k * q.m} (Attempt ${q.k} out of ${q.n})</div>
      
      <div style="margin-top:16px; border-left:2px solid var(--line); padding-left:12px; display:flex; flex-direction:column; gap:8px">`;
      
      const unitTopics = topics.filter(t => t.unit_number == q.unit);
      
      q.parts.forEach((p, j) => {
        let diffMismatch = '';
        if (j > 0 && p.diff !== q.parts[0].diff) {
           diffMismatch = `<span class="badge warn" style="margin-left:8px" title="Difficulty mismatch within question">Mismatch</span>`;
        }
        
        html += `<div style="display:flex; gap:8px; align-items:center">
          <span style="font-weight:600; width:20px">${String.fromCharCode(97+j)})</span>
          <select class="select" data-q="${i}" data-p="${j}" data-f="topic" style="flex:1">
            <option value="any">Any topic in this unit</option>
            ${unitTopics.map(t => `<option value="${t.topic_id}" ${p.topic==t.topic_id?'selected':''}>${esc(t.topic_name)}</option>`).join('')}
          </select>
          <select class="select" data-q="${i}" data-p="${j}" data-f="diff" style="width:110px">
            ${['Easy','Medium','Hard'].map(d => `<option ${p.diff===d?'selected':''}>${d}</option>`).join('')}
          </select>
          ${diffMismatch}
        </div>`;
      });
      
    html += `
        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="btn quiet" data-add-p="${i}">Add part</button>
          <button class="btn quiet" data-del-p="${i}" ${q.parts.length<2?'disabled':''}>Remove part</button>
        </div>
      </div>
    </div>`;
  });
  $('#sections').innerHTML = html;
  updatePaperSum();
}

$('#addSec').onclick = () => {
  paper.secs.push({ unit: 1, n: 2, k: 1, m: 5, parts: [ {topic:'any', diff:'Medium'}, {topic:'any', diff:'Medium'} ] });
  renderPaper();
};

$('#sections').addEventListener('input', e => {
  const t = e.target;
  if(t.dataset.q !== undefined && t.dataset.p === undefined) {
    const qi = +t.dataset.q;
    let val = parseInt(t.value)||1;
    if(t.dataset.f === 'unit') {
      paper.secs[qi].unit = val;
    } else if(t.dataset.f === 'n') {
      val = Math.max(1, Math.min(6, val));
      paper.secs[qi].n = val;
      const sec = paper.secs[qi];
      while(sec.parts.length < val) {
        sec.parts.push({topic:'any', diff:'Medium', label:String.fromCharCode(97+sec.parts.length)});
      }
      while(sec.parts.length > val) sec.parts.pop();
      if(sec.k > val) sec.k = val;
    } else if(t.dataset.f === 'k') {
      const maxK = paper.secs[qi].n;
      val = Math.max(1, Math.min(maxK, val));
      paper.secs[qi].k = val;
    } else {
      paper.secs[qi][t.dataset.f] = val;
    }
    paperValidResult = null; // reset validation on change
    renderPaper();
  }
});

$('#sections').addEventListener('change', e => {
  const t = e.target;
  if(t.dataset.p !== undefined) {
    paper.secs[t.dataset.q].parts[t.dataset.p][t.dataset.f] = t.value;
    renderPaper();
  }
});

$('#sections').addEventListener('click', e => {
  const b = e.target.closest('button');
  if(!b) return;
  const q = b.dataset.delQ;
  if(q !== undefined) { paper.secs.splice(q,1); return renderPaper(); }
  const addP = b.dataset.addP;
  if(addP !== undefined) {
    if(paper.secs[addP].parts.length < 6) { const _n=paper.secs[addP].parts.length; paper.secs[addP].parts.push({topic:'any', diff:'Medium', label:String.fromCharCode(97+_n)}); }
    return renderPaper();
  }
  const delP = b.dataset.delP;
  if(delP !== undefined) {
    if(paper.secs[delP].parts.length > 1) paper.secs[delP].parts.pop();
    return renderPaper();
  }
});

$('#presets').addEventListener('click', e => {
  const p = e.target.closest('[data-preset]');
  if(!p) return;
  paper.secs = [];
  if(p.dataset.preset==='mid') {
    $('#bpTargetMarks').value = 50;
    for(let i=0;i<5;i++) paper.secs.push({ unit: i+1, n:2, k:1, m:10, parts:[{topic:'any',diff:'Medium',label:'a'},{topic:'any',diff:'Medium',label:'b'}] });
  } else {
    $('#bpTargetMarks').value = 100;
    for(let i=0;i<5;i++) paper.secs.push({ unit: i+1, n:3, k:2, m:10, parts:[{topic:'any',diff:'Medium',label:'a'},{topic:'any',diff:'Medium',label:'b'},{topic:'any',diff:'Medium',label:'c'}] });
  }
  renderPaper();
});

let paperValidResult = null;

function updatePaperSum() {
  let marks = 0, ans = 0, draw = 0;
  let errors = [];
  paper.secs.forEach((q, i) => {
    marks += q.k * q.m;
    ans += q.k;
    draw += q.parts.length;
    if(q.k > q.n) errors.push(`Q${i+1}: Cannot attempt (${q.k}) more parts than offered (${q.n}).`);
    if(q.parts.length !== q.n) errors.push(`Q${i+1}: Offered parts (${q.n}) does not match defined parts (${q.parts.length}).`);
  });
  $('#sumMarks').textContent = marks;
  $('#sumAns').textContent = ans;
  $('#sumDraw').textContent = draw;
  
  const target = parseInt($('#bpTargetMarks').value);
  $('#targetCompare').textContent = target ? (marks === target ? '(Matches target)' : `(Target: ${target})`) : '';
  $('#targetCompare').style.color = (target && marks !== target) ? 'var(--bad)' : 'var(--muted)';
  
  let msgHTML = '';
  if(errors.length) {
    msgHTML = errors.map(e => `<div class="msg bad">${ic.bad}<span>${e}</span></div>`).join('');
    $('#gen').disabled = true;
    $('#btnValidate').disabled = true;
  } else if(!paper.secs.length) {
    msgHTML = '<div class="msg">Add questions to build the paper.</div>';
    $('#gen').disabled = true;
    $('#btnValidate').disabled = true;
  } else {
    $('#btnValidate').disabled = false;
    if(paperValidResult && !paperValidResult.has_errors && !paperValidResult.errors) {
       msgHTML = `<div class="msg ok">${ic.ok}<span>Paper is valid.</span></div>`;
       if(paperValidResult.issues) {
           msgHTML += paperValidResult.issues.map(e => `<div class="msg ${e.level==='error'?'bad':'warn'}">${e.level==='error'?ic.bad:ic.warn}<span>${e.location}: ${e.message}</span></div>`).join('');
       }
       $('#gen').disabled = false;
    } else {
       $('#gen').disabled = true;
       if(paperValidResult) {
          if(paperValidResult.issues) {
             msgHTML = paperValidResult.issues.map(e => `<div class="msg ${e.level==='error'?'bad':'warn'}">${e.level==='error'?ic.bad:ic.warn}<span>${e.location}: ${e.message}</span></div>`).join('');
          } else if(paperValidResult.errors) {
             msgHTML = paperValidResult.errors.map(e => `<div class="msg bad">${ic.bad}<span>${e}</span></div>`).join('');
          }
       }
    }
  }
  $('#checksBp').innerHTML = msgHTML;
}

$('#bpTargetMarks').addEventListener('input', updatePaperSum);

$('#btnValidate').onclick = async () => {
  const btn = $('#btnValidate'); btn.disabled = true; btn.textContent = 'Validating...';
  try {
    const payload = {
      title: $('#bpTitle').value.trim() || 'Draft',
      subject_id: parseInt($('#bpSubject').value),
      target_marks: parseInt($('#bpTargetMarks').value) || null,
      questions: paper.secs.map((q,i) => ({
        q_no: i+1,
        unit_number: q.unit,
        offered_n: q.n,
        attempt_k: q.k,
        marks_per_part: q.m,
        parts: q.parts.map((p,j) => ({
          part_label: p.label||String.fromCharCode(97+j),
          topic_id: (!p.topic || p.topic==='any') ? null : +p.topic,
          difficulty: p.diff||'Medium'
        }))
      }))
    };
    const bp = await api.createBlueprint(payload);
    paperValidResult = await api.validateBlueprint(bp.blueprint_id);
    paperValidResult.bpId = bp.blueprint_id;
    updatePaperSum();
  } catch(e) { toast(e.message); paperValidResult = {errors:[e.message]}; updatePaperSum(); }
  finally { btn.disabled = false; btn.textContent = 'Validate'; }
};

$('#gen').onclick = async () => {
  const btn = $('#gen'); btn.disabled = true; btn.textContent = 'Generating...';
  try {
    if(!paperValidResult || !paperValidResult.bpId) throw new Error("Validate first.");
    const paperRes = await api.generateFromBlueprint(paperValidResult.bpId);
    
    const win = window.open('','_blank','width=900,height=700');
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Generated Paper</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:14px/1.6 "Instrument Sans",system-ui,sans-serif;padding:32px 48px;color:#14213D;max-width:860px;margin:0 auto}
  h1{font-size:22px;font-weight:700;letter-spacing:-.02em;text-align:center} 
  .meta{display:flex;justify-content:space-between;border-bottom:2px solid #14213D;padding-bottom:10px;margin-bottom:20px}
  .q{margin:24px 0}
  .q-head{display:flex;justify-content:space-between;font-weight:600;margin-bottom:8px}
  .part{margin-bottom:16px;display:flex;gap:12px}
  .part-l{font-weight:600}
  .part-r{flex:1}
  .part-m{font-weight:600;white-space:nowrap}
  .blank{border-bottom:1px solid #C6CFDB;margin-top:24px;min-height:30px}
  
  .editable { transition: background 0.2s; border-radius: 4px; outline: none; }
  .editable:hover { background: #f1f5f9; cursor: text; box-shadow: 0 0 0 4px #f1f5f9; }
  .editable:focus { background: #fff; box-shadow: 0 0 0 4px #e2e8f0; }
  .no-print { color: #64748b; font-size: 13px; font-weight: 400; margin-left: 8px; }
  
  @media print {
    body { padding:16px 24px }
    button, .no-print, .help-txt { display:none!important }
    .editable:hover { background: none; box-shadow: none; cursor: default; }
  }
</style></head><body>
<div style="display:flex;align-items:center;margin:20px 0;gap:16px">
  <button onclick="window.print()" style="padding:8px 16px;background:#1F3A68;color:#fff;border:0;border-radius:8px;font:600 14px 'Instrument Sans',sans-serif;cursor:pointer">Print Final Paper</button>
  <span class="help-txt" style="color:#64748b;font-size:13px">Click any text to edit it. Unit tags will automatically hide when printing.</span>
</div>

<h1 class="editable" contenteditable="true">Graphic Era Deemed to be University</h1>
<div class="meta">
  <span>Exam: <span class="editable" contenteditable="true" style="display:inline-block;min-width:100px">${esc($('#bpTitle').value || 'Mid-Term Examination')}</span></span>
  <span>Subject: <span class="editable" contenteditable="true">${esc($('#bpSubject').options[$('#bpSubject').selectedIndex].text)}</span></span>
  <span>Marks: <span class="editable" contenteditable="true">${$('#sumMarks').textContent}</span></span>
</div>
<p style="margin-bottom:24px;font-weight:600">Instructions: <span class="editable" contenteditable="true">Answer questions as directed in each section.</span></p>
`;
    
    const paperQs = paperRes.paper || paperRes.questions || [];
    paperQs.forEach((q, i) => {
      html += `<div class="q">
        <div class="q-head">
          <span>Q${i+1}. <span class="no-print">(Unit ${q.unit_number||q.unit||"?"})</span></span>
          <span class="editable" contenteditable="true">[Attempt ${q.attempt_k||q.k} &times; ${q.marks_per_part||q.m} = ${(q.attempt_k||q.k)*(q.marks_per_part||q.m)} Marks]</span>
        </div>`;
      q.parts.forEach((p, j) => {
        html += `<div class="part">
          <span class="part-l">(${String.fromCharCode(97+j)})</span>
          <div class="part-r editable" contenteditable="true">${esc(p.question_text)}</div>
          <span class="part-m editable" contenteditable="true">[${q.marks_per_part||q.m} marks]</span>
        </div><div class="blank"></div><div class="blank"></div>`;
      });
      html += `</div>`;
    });
    html += `</body></html>`;
    win.document.write(html); win.document.close();
    toast('Paper generated and opened for printing.');
  } catch(e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = 'Generate paper'; }
};

async function onOaSubjectChange() {
  const sId = $('#oaSubject').value;
  const topics = bpTopics[sId] || [];
  $('#oaTopics').innerHTML = topics.map(t => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;padding:4px 8px;background:var(--bg);border-radius:4px;border:1px solid var(--line)"><input type="checkbox" name="oaTopic" value="${t.topic_id}" checked> ${esc(t.topic_name)}</label>`).join('');
  await doPoolCheck();
}
$('#oaSubject').addEventListener('change', onOaSubjectChange);
$('#oaTopics').addEventListener('change', doPoolCheck);
$('#oaNumQ').addEventListener('input', doPoolCheck);

async function doPoolCheck() {
  const sId = $('#oaSubject').value;
  const tIds = [...$$('input[name="oaTopic"]:checked')].map(el => el.value);
  const numQ = parseInt($('#oaNumQ').value) || 20;
  
  if(!tIds.length) {
    $('#pcTotal').textContent = '0';
    $('#pcEasy').textContent = 'Easy: 0';
    $('#pcMed').textContent = 'Medium: 0';
    $('#pcHard').textContent = 'Hard: 0';
    $('#pcAlerts').innerHTML = `<div class="msg bad">${ic.bad}<span>Select at least one topic.</span></div>`;
    $('#oaCreate').disabled = true;
    return;
  }
  
  try {
    const res = await api.poolCheck({ subject_id: sId, topic_ids: tIds.join(',') });
    $('#pcTotal').textContent = res.total;
    $('#pcEasy').textContent = `Easy: ${(res.by_difficulty||{}).Easy||0}`;
    $('#pcMed').textContent = `Medium: ${(res.by_difficulty||{}).Medium||0}`;
    $('#pcHard').textContent = `Hard: ${(res.by_difficulty||{}).Hard||0}`;
    
    let errs = [], warns = [];
    if (res.total < numQ) errs.push(`Not enough questions. Need ${numQ}, have ${res.total}.`);
    else if (res.total < numQ * 2) warns.push(`Pool is small (${res.total}). Recommended at least ${numQ * 2}.`);
    
    const _bd=res.by_difficulty||{}; if ((_bd.Hard||0) < numQ) warns.push(`Few hard questions (${res.hard}).`);
    if ((_bd.Easy||0) < numQ) warns.push(`Few easy questions (${_bd.Easy||0}).`);
    
    let aHtml = '';
    errs.forEach(e => aHtml += `<div class="msg bad">${ic.bad}<span>${e}</span></div>`);
    if(!errs.length) warns.forEach(w => aHtml += `<div class="msg warn" style="color:var(--warn)">${ic.bad}<span>${w}</span></div>`);
    if(!errs.length && !warns.length) aHtml = `<div class="msg ok">${ic.ok}<span>Pool is healthy.</span></div>`;
    
    $('#pcAlerts').innerHTML = aHtml;
    $('#oaCreate').disabled = errs.length > 0;
    
    $('#pcTotal').style.color = errs.length ? 'var(--bad)' : (warns.length ? 'var(--warn)' : 'var(--ok)');
  } catch(e) {}
}

$('#oaCreate').onclick = async () => {
  const btn = $('#oaCreate'); btn.disabled = true; btn.textContent = 'Creating...';
  try {
    const exam = await api.createExam({
      title: $('#oaTitle').value || 'Online Test',
      topic_ids: [...$$('input[name="oaTopic"]:checked')].map(el => el.value).join(','),
      num_questions: parseInt($('#oaNumQ').value) || 20,
      duration_secs: (parseInt($('#oaDur').value)||30)*60,
      mode: 'adaptive',
      start_difficulty: $('#oaStart').value,
      review_level: $('#oaRev').value,
    });
    toast(`Exam "${exam.title}" created successfully!`);
    await loadTExams();
    go('texams');
  } catch(e) { toast('Error: '+e.message); }
  finally { btn.disabled = false; btn.textContent = 'Create exam'; }
};

const _oldSetRole = setRole;
setRole = async (r) => {
  _oldSetRole(r);
  if (r === 'teacher') await initBlueprint();
};


const LVL={
  hidden:['Hidden','Students see nothing until you change this.'],
  score_only:['Score only','Students see their total marks.'],
  score_and_correctness:['Score and right or wrong','Students see marks and which questions they got right or wrong, but not the correct answers.'],
  full_review:['Full review','Students see their marks, their answers, the correct answers and explanations.']
};
const SBADGE={open:['Open','brand'],marking:['Marking pending','warn'],ready:['Ready to release','ok'],released:['Released',''],scheduled:['Scheduled','']};

let _texams = []; // live cache of teacher exams from API

async function loadTExams(){
  try {
    _texams = await api.listExams();
  } catch(e) {
    _texams = [];
    toast('Could not load exams: '+e.message);
  }
}




async function renderTDash(){
  await loadTExams();
  const h=new Date().getHours(), g=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  $('#tdGreet').textContent=`${g}, ${user?user.name:'teacher'}`;
  const src = _texams.length ? _texams : [];
  const open = src.filter(e=>e.computed_status==='open');
  const mark = src.filter(e=>e.computed_status==='marking');
  const ready = src.filter(e=>e.computed_status==='ready');
  $('#tdOpen').textContent=open.length;
  $('#tdMark').textContent=mark.reduce((a,e)=>a+(e.pending_marking||0),0);
  $('#tdReady').textContent=ready.length;
  const rows=[
    ...mark.map(e=>`<div class="attn-row"><div><b>${esc(e.title)}</b><div class="sub">${e.pending_marking} subjective answers need marking before results can be released.</div></div><button class="btn" data-act="mark">Mark answers</button></div>`),
    ...ready.map(e=>`<div class="attn-row"><div><b>${esc(e.title)}</b><div class="sub">All answers marked. You can release results now.</div></div><button class="btn primary" data-act="rel" data-id="${e.exam_id}">Release results</button></div>`),
    ...open.map(e=>`<div class="attn-row"><div><b>${esc(e.title)}</b><div class="sub">${e.submissions_count} of ${e.enrolled_count||'—'} students submitted so far.</div></div><button class="btn" data-act="exams">View exams</button></div>`)
  ];
  $('#tdAttn').innerHTML=rows.length?rows.join(''):'<div class="empty">Nothing needs your attention right now.</div>';
  const qs = await api.questions({limit:1}).catch(()=>({total:0}));
  $('#view-tdash .kpi:first-child .v').textContent = qs.total || '—';
}

async function renderTExams(){
  await loadTExams();
  const src = _texams;
  if(!src.length){ $('#texRows').innerHTML='<tr><td colspan="6"><div class="empty">No exams yet. Create one from the Blueprint builder.</div></td></tr>'; return; }
  $('#texRows').innerHTML=src.map(e=>{
    const st = (e.computed_status||'open').toLowerCase();
    const [bl,bc]=SBADGE[st]||['Unknown',''];
    const lvl = e.review_level||'score_and_correctness';
    const mode = e.mode==='adaptive'?'Adaptive':'Fixed paper';
    const sub = e.submission_count || e.submissions_count || 0;
    
    let act='';
    if(st==='open') act='<button class="btn" disabled title="Exam is still open.">Release results</button>';
    else if(st==='marking') act='<button class="btn" data-act="mark">Mark answers</button>';
    else if(st==='ready' || st==='unreleased') act=`<button class="btn primary" data-act="rel" data-id="${e.exam_id}">Release results</button>`;
    else if(st==='released') act=`<button class="btn" data-act="rel" data-id="${e.exam_id}">Change visibility</button>`;
    
    act += ` <button class="btn" onclick="alert('Preview mode will launch the student test player here.')">Preview</button> <button class="btn danger" data-act="del" data-id="${e.exam_id}" style="color:var(--bad)">Delete</button>`;
    
    if (sub > 0) {
      act += ` <a class="btn" href="/exams/${e.exam_id}/export" target="_blank" title="Export to CSV">CSV</a>`;
    }
    
    return `<tr>
      <td>
        <b>${esc(e.title)}</b> <span class="badge">${e.category || 'Formal'}</span>
        <br><span style="font-size:12px;color:var(--brand);font-weight:bold">Passkey: ${e.passkey || 'None'}</span>
        ${st==='released'?`<div class="sub">Students see: ${LVL[lvl]?LVL[lvl][0].toLowerCase():lvl}</div>`:''}
      </td>
      <td><span class="badge ${mode==='Adaptive'?'brand':''}">${mode}</span></td>
      <td class="sub">${e.window_open||e.created_at||'—'}</td>
      <td class="num">${sub} submitted</td>
      <td><span class="badge ${bc}">${bl}</span></td>
      <td style="text-align:right">${act}</td>
    </tr>`;
  }).join('');
}

$('#texRows')?.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if(!b) return;
  if(b.dataset.act === 'del') {
    if(confirm('Are you sure you want to delete this exam? All student sessions will be lost.')) {
      b.disabled = true;
      try {
        await api.deleteExam(b.dataset.id);
        toast('Exam deleted successfully.');
        await renderTExams();
        await renderTDash();
      } catch(err) {
        toast('Error: ' + err.message);
        b.disabled = false;
      }
    }
  }
});

function teacherAct(e){
  const b=e.target.closest('[data-act]'); if(!b) return; const a=b.dataset.act;
  if(a==='mark') toast('Select responses to mark from the exam submissions view (coming soon).');
  else if(a==='exams') go('texams');
  else if(a==='rel') openRelease(+b.dataset.id);
}
$('#tdAttn').addEventListener('click',teacherAct); $('#texRows').addEventListener('click',teacherAct);
$('#qaImport').onclick=()=>{go('bank'); $('#openImport').click()};

function openCreateExamDlg(){
  $('#ceTitle').value=''; $('#ceSubject').value=''; $('#ceMode').value='adaptive';
  $('#ceNumQ').value='10'; $('#ceDuration').value='30'; $('#ceStartDiff').value='Medium';
  $('#ceReview').value='score_and_correctness'; $('#ceErr').style.display='none';
  $('#ceSave').disabled=false; $('#ceSave').textContent='Create exam';
  $('#createExamDlg').showModal(); $('#ceTitle').focus();
}
$('#qaCreate').onclick = () => go('create-exam');
$('#newExam').onclick = () => go('create-exam');
$('#ceCancel').onclick=()=>$('#createExamDlg').close();

$('#ceSave').onclick=async()=>{
  const title=$('#ceTitle').value.trim();
  const subject=$('#ceSubject').value;
  const err=$('#ceErr');
  err.style.display='none';
  if(!title){ err.textContent='Please enter an exam title.'; err.style.display='flex'; $('#ceTitle').focus(); return; }
  if(!subject){ err.textContent='Please choose a subject.'; err.style.display='flex'; $('#ceSubject').focus(); return; }

  const btn=$('#ceSave'); btn.disabled=true; btn.textContent='Creating...';
  try {
    const topicsRes = await api.topics();
    const topicIds = topicsRes.filter(t=>t.subject_name===subject||!t.subject_name).map(t=>t.topic_id);
    if(!topicIds.length) throw new Error(`No topics found for "${subject}" in the database. Import questions first via Question bank → Import CSV.`);

    const exam = await api.createExam({
      title,
      topic_ids: topicIds.join(','),
      num_questions: Math.max(1, +$('#ceNumQ').value||10),
      duration_secs: Math.max(300, (+$('#ceDuration').value||30)*60),
      mode: $('#ceMode').value,
      start_difficulty: $('#ceStartDiff').value,
      review_level: $('#ceReview').value
    });
    $('#createExamDlg').close();
    toast(`"${exam.title}" created. Students can now see it.`);
    await renderTExams();
    go('texams');
  } catch(e){
    err.textContent = e.message;
    err.style.display='flex';
    btn.disabled=false; btn.textContent='Create exam';
  }
};

let relId=null, relLvl='score_and_correctness';
function openRelease(id){
  const e=_texams.find(x=>x.exam_id===id);
  if(!e){ toast('Exam not found.'); return; }
  relId=id; relLvl=(e.review_level&&e.review_level!=='hidden')?e.review_level:'score_and_correctness';
  const changing=e.computed_status==='released';
  $('#relTitle').textContent=(changing?'Change visibility: ':'Release results: ')+e.title;
  $('#relSub').textContent=changing?'Choose how much students see. You can hide results again if needed.':'Students see only what you choose here. Marks are based on each question\'s mark value.';
  $('#relGo').textContent=changing?'Save visibility':'Release results';
  paintLevels(e, changing); $('#relDlg').showModal();
}
function paintLevels(e, changing){
  const keys=['score_only','score_and_correctness','full_review'].concat(changing?['hidden']:[]);
  $('#relLevels').innerHTML=keys.map(k=>`<label class="lvl ${k===relLvl?'sel':''}"><input type="radio" name="lvl" value="${k}" ${k===relLvl?'checked':''}><div><b>${LVL[k][0]}</b><span>${LVL[k][1]}</span></div></label>`).join('');
  const n=$('#relNote'), msgs=[];
  if(relLvl==='full_review') msgs.push('Full review shows correct answers. Avoid if questions are reused in later exams.');
  if(e&&e.mode==='adaptive') msgs.push('Adaptive exam: students saw different questions, so scores are not directly comparable.');
  n.hidden=!msgs.length; n.textContent=msgs.join(' ');
}
$('#relLevels').addEventListener('change',e=>{
  if(e.target.name==='lvl'){
    relLvl=e.target.value;
    const exam=_texams.find(x=>x.exam_id===relId);
    paintLevels(exam, $('#relGo').textContent==='Save visibility');
  }
});
$('#relCancel').onclick=()=>$('#relDlg').close();
$('#relGo').onclick=async ()=>{
  const btn=$('#relGo'); btn.disabled=true; btn.textContent='Saving...';
  try {
    const releasing = relLvl !== 'hidden';
    await api.releaseResults(relId, releasing, relLvl);
    $('#relDlg').close();
    toast(releasing ? 'Results released.' : 'Results hidden.');
    await renderTExams();
    await renderTDash();
  } catch(err) {
    toast('Error: '+err.message);
  } finally {
    btn.disabled=false; btn.textContent=$('#relDlg').open?'Release results':'Save visibility';
  }
};

const REV={
 'OS unit 1 practice':[
  {q:'Which UNIX command lists the files in a directory?',o:['cd','ls','pwd','rm'],you:1,right:1,why:'ls lists directory contents; cd changes directory and pwd prints the current one.'},
  {q:'The pwd command displays:',o:['The user password','Process work details','The present working directory','The previous working directory'],you:2,right:2,why:'pwd stands for print working directory.'},
  {q:'Which filter command is used to search for a pattern in a file?',o:['sort','head','wc','grep'],you:0,right:3,why:'grep searches for patterns; sort only orders lines.'},
  {q:'In vi, which command saves the file and quits the editor?',o:[':q!',':w!',':wq','dd'],you:2,right:2,why:':wq writes the file and quits; :q! quits without saving.'},
  {q:'The command wc -l file.txt prints the number of:',o:['Words','Characters','Lines','Files'],you:2,right:2,why:'The -l option counts lines.'}],
 'DBMS unit 2 quiz':[
  {q:'A weak entity type is one that:',o:['Has no attributes','Cannot be uniquely identified by its own attributes alone','Has no relationships','Is always optional'],you:1,right:1,why:'It depends on an owner entity for identification.'},
  {q:'A weak entity type is drawn as a:',o:['Single rectangle','Diamond','Double rectangle','Ellipse'],you:0,right:2,why:'Weak entity types use a double rectangle.'},
  {q:'The degree of a relationship type is:',o:['The number of attributes','The number of participating entity types','The number of tuples','The cardinality ratio'],you:1,right:1,why:'Degree counts the entity types that participate.'},
  {q:'Total participation of an entity type in a relationship is shown by a:',o:['Single line','Dashed line','Arrow','Double line'],you:1,right:3,why:'Total participation is drawn as a double line.'},
  {q:'A relationship among three entity types is called:',o:['Ternary','Binary','Unary','Recursive'],you:0,right:0,why:'Three participants make it ternary.'}]
};
const score=t=>REV[t].filter(x=>x.you===x.right).length+' / '+REV[t].length;
function renderResults(){
  const done=EXAMS.filter(x=>x.status==='done');
  $('#resList').innerHTML=done.length?done.map(e=>`<div class="exam-row"><div><h3>${esc(e.title)}</h3><div class="meta"><span>${esc(e.sub)}</span><span>${e.when}</span></div><div class="meta" style="margin-top:4px"><span class="badge">${LVL[e.level][0]}</span></div></div><div class="act"><span class="score num">${score(e.title)}</span><button class="btn" data-review="${e.id}">View review</button></div></div>`).join(''):'<div class="empty">No released results yet. When a teacher releases one, it appears here.</div>';
}
function openReview(id){
  const e=EXAMS.find(x=>x.id==id), lvl=e.level||'score_and_correctness', items=REV[e.title];
  $('#revTitle').textContent=e.title; $('#revSub').textContent=`Your score: ${score(e.title)}. ${LVL[lvl][1]}`;
  $('#revBody').innerHTML = lvl==='score_only' ? '<div class="empty">Your teacher chose to show scores only for this exam.</div>' :
   items.map((it,n)=>{ const ok=it.you===it.right;
     return `<div class="qrev"><div style="display:flex;justify-content:space-between;gap:12px"><b>${n+1}. ${esc(it.q)}</b><span class="badge ${ok?'ok':'bad'}">${ok?'Correct':'Incorrect'}</span></div>
      ${it.o.map((o,k)=>{ let c='',t=''; if(k===it.you){ c=ok?'ok':'bad'; t='Your answer'; } if(lvl==='full_review'&&k===it.right&&!ok){ c='ok'; t='Correct answer'; }
        return `<div class="ropt ${c}"><span class="key">${'ABCD'[k]}</span><span>${esc(o)}</span><span class="tag">${t}</span></div>`; }).join('')}
      ${lvl==='full_review'?`<p class="sub" style="margin-top:8px">${esc(it.why)}</p>`:''}</div>`; }).join('');
  $('#revDlg').showModal();
}
$('#resList').addEventListener('click',e=>{const b=e.target.closest('[data-review]'); if(b) openReview(b.dataset.review)});
$('#revClose').onclick=()=>$('#revDlg').close();

function Sim(cfg){
  const cache=new Map(), studs=[]; let evicted=[];
  const nx=(id,k)=>k?((id*13+5)%500)+1:((id*7+3)%500)+1;
  const evictOne=()=>{const o=cache.keys().next().value; cache.delete(o); evicted.unshift(o); evicted=evicted.slice(0,8)};
  const put=id=>{ if(cache.has(id)) cache.delete(id); else if(cache.size>=cfg.cap) evictOne(); cache.set(id,1) };
  return {cache, get evicted(){return evicted}, cfg,
    step(){
      while(studs.length<cfg.students) studs.push({next:1+Math.floor(Math.pow(Math.random(),2)*500)});
      studs.length=cfg.students; while(cache.size>cfg.cap) evictOne();
      const res=[];
      for(const s of studs){ if(Math.random()>=0.15) continue;
        const id=s.next; let hit=false;
        if(cfg.cache){ if(cache.has(id)){cache.delete(id);cache.set(id,1);hit=true} else put(id); if(cfg.prefetch){put(nx(id,0));put(nx(id,1))} }
        res.push(hit); s.next=nx(id,Math.random()<0.5?1:0);
      }
      const miss=res.filter(h=>!h).length;
      return {n:res.length,hits:res.length-miss,lat:res.map(h=>h?1.2+Math.random()*1.6:12+Math.random()*8+miss*0.55)};
    }};
}
const P={cfg:{cache:true,prefetch:true,students:40,cap:100},sim:null,ticks:[],series:[],timer:null};
const p95=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(.95*(s.length-1))]};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
function perfReset(){P.sim=Sim(P.cfg);P.ticks=[];P.series=[];for(let i=0;i<30;i++)perfTick(true);perfPaint()}
function perfTick(quiet){
  const r=P.sim.step(); P.ticks.push(r); if(P.ticks.length>20)P.ticks.shift();
  const w=P.ticks.slice(-5).flatMap(t=>t.lat); P.series.push({avg:mean(w),p95:p95(w)}); if(P.series.length>60)P.series.shift();
  if(!quiet) perfPaint();
}
function perfPaint(){
  const l10=P.ticks.slice(-10).flatMap(t=>t.lat), n=P.ticks.reduce((a,t)=>a+t.n,0), h=P.ticks.reduce((a,t)=>a+t.hits,0);
  $('#kStud').textContent=P.cfg.students; $('#kAvg').textContent=mean(l10).toFixed(1); $('#kP95').textContent=p95(l10).toFixed(1); $('#kHit').textContent=n?Math.round(h/n*100):0;
  drawChart();
  const keys=[...P.sim.cache.keys()].reverse(), cap=P.cfg.cap;
  $('#slotUse').textContent=keys.length; $('#slotCap').textContent=cap;
  $('#slots').innerHTML=Array.from({length:cap},(_,i)=>{const k=keys[i]; if(k===undefined) return '<span class="slot"></span>'; const a=.25+.75*(1-i/Math.max(cap,1)); return `<span class="slot" style="background:var(--c1);opacity:${a.toFixed(2)}" title="Question ${k}"></span>`}).join('');
  $('#evicted').innerHTML=P.sim.evicted.length?P.sim.evicted.map(k=>`<span class="chip">Q${k}</span>`).join(''):'<span class="sub">Nothing evicted yet.</span>';
}
function drawChart(){
  const s=P.series; if(!s.length) return; const W=720,H=240,m={l:44,r:12,t:12,b:26};
  const mx=Math.max(30,Math.ceil(Math.max(...s.map(p=>p.p95),1)/10)*10), off=60-s.length;
  const x=i=>m.l+(W-m.l-m.r)*(i+off)/59, y=v=>H-m.b-(H-m.t-m.b)*v/mx;
  const path=k=>s.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[k]).toFixed(1)).join(' ');
  let g=''; for(let i=0;i<=4;i++){const v=mx*i/4,yy=y(v); g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${m.l-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(v)}</text>`}
  const last=s[s.length-1];
  $('#chart').setAttribute('aria-label',`Latency over the last 60 seconds. Latest average ${last.avg.toFixed(1)} milliseconds, 95th percentile ${last.p95.toFixed(1)} milliseconds.`);
  $('#chart').innerHTML=`${g}<text x="${m.l}" y="${H-6}" font-size="11" fill="var(--muted)">60 s ago</text><text x="${W-m.r}" y="${H-6}" text-anchor="end" font-size="11" fill="var(--muted)">now</text><text x="12" y="10" font-size="11" fill="var(--muted)">ms</text>
  <path d="${path('p95')}" fill="none" stroke="var(--c1)" stroke-width="2" stroke-linejoin="round"/><path d="${path('avg')}" fill="none" stroke="var(--c2)" stroke-width="2" stroke-linejoin="round"/>`;
}
function perfStart(){ if(!P.sim) perfReset(); else perfPaint(); clearInterval(P.timer); P.timer=setInterval(()=>perfTick(false),1000) }
function perfStop(){ clearInterval(P.timer) }
function sw(id,on){const b=$(id); b.setAttribute('aria-checked',on)}
$('#swCache').onclick=()=>{P.cfg.cache=!P.cfg.cache; sw('#swCache',P.cfg.cache); $('#swPre').disabled=!P.cfg.cache; perfReset()};
$('#swPre').onclick=()=>{P.cfg.prefetch=!P.cfg.prefetch; sw('#swPre',P.cfg.prefetch); perfReset()};
$('#rgStud').oninput=e=>{P.cfg.students=+e.target.value; $('#rgStudV').textContent=e.target.value; perfReset()};
$('#selCap').onchange=e=>{P.cfg.cap=+e.target.value; perfReset()};
$('#runCmp').onclick=()=>{
  const setups=[['No cache',{cache:false,prefetch:false}],['Cache only',{cache:true,prefetch:false}],['Cache with prefetch',{cache:true,prefetch:true}]];
  $('#cmpRows').innerHTML=setups.map(([name,o])=>{
    const sim=Sim({...P.cfg,...o}), lat=[]; let n=0,h=0;
    for(let i=0;i<150;i++){const r=sim.step(); if(i>=50){lat.push(...r.lat);n+=r.n;h+=r.hits}}
    return `<tr><td><b>${name}</b></td><td class="num">${mean(lat).toFixed(1)} ms</td><td class="num">${p95(lat).toFixed(1)} ms</td><td class="num">${n?Math.round(h/n*100):0}%</td></tr>`;
  }).join('');
};

/* init */
renderExams(); runChecks(); renderBank(); setLTab('student');
boot();

$('#btnAddSubject')?.addEventListener('click', async e => {
  e.preventDefault();
  const name = prompt("Enter a name for your private subject/pool (e.g. 'CN Mid-Sem Private'):");
  if(!name) return;
  try {
    await api.createSubject({subject_name: name, is_private: true});
    await initBlueprint(); // Reload subjects
    alert('Private pool created! You can now import questions into it.');
  } catch(err) {
    alert(err.message);
  }
});
