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

/* custom UI modals (replaces browser confirm/prompt) */
function uiConfirm({ title = "Confirm", message = "Are you sure?", okText = "Confirm", isDanger = false }) {
  return new Promise(resolve => {
    const dlg = $('#dlgConfirm');
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = message;
    const ok = $('#confirmOk');
    ok.textContent = okText;
    ok.className = isDanger ? 'btn danger' : 'btn primary';
    if (isDanger) ok.style.color = 'var(--bad)'; else ok.style.color = '';
    
    const onOk = () => { cleanup(); dlg.close(); resolve(true); };
    const onCancel = () => { cleanup(); dlg.close(); resolve(false); };
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      $('#confirmCancel').removeEventListener('click', onCancel);
    };
    
    ok.addEventListener('click', onOk);
    $('#confirmCancel').addEventListener('click', onCancel);
    dlg.showModal();
  });
}

function uiPrompt({ title = "Input", message = "Please enter:", placeholder = "", defaultValue = "", okText = "Save" }) {
  return new Promise(resolve => {
    const dlg = $('#dlgPrompt');
    $('#promptTitle').textContent = title;
    $('#promptMsg').textContent = message;
    const input = $('#promptInput');
    input.placeholder = placeholder;
    input.value = defaultValue;
    $('#promptErr').style.display = 'none';
    const ok = $('#promptOk');
    ok.textContent = okText;
    
    const onOk = () => {
      const val = input.value.trim();
      if (!val) {
        $('#promptErr').textContent = "This field cannot be empty.";
        $('#promptErr').style.display = "block";
        return;
      }
      cleanup();
      dlg.close();
      resolve(val);
    };
    const onCancel = () => { cleanup(); dlg.close(); resolve(null); };
    const onKey = (e) => { if (e.key === 'Enter') onOk(); };
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      $('#promptCancel').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    };
    
    ok.addEventListener('click', onOk);
    $('#promptCancel').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    dlg.showModal();
    setTimeout(() => input.focus(), 50);
  });
}


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
  if(v==='tdash') renderTDash(); if(v==='texams') renderTExams(); if(v==='results') renderResults(); if(v==='bank') { loadBankSubjects(); renderBank(); } if(v==='exams') renderExams();
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

let _studentExams = [];
let pendingStartExam = null;

async function loadStudentExams() {
  try {
    _studentExams = await api.listExams();
  } catch(e) {
    _studentExams = [];
  }
}

async function renderExams() {
  await loadStudentExams();
  const list = $('#examList');
  if (!_studentExams.length) {
    list.innerHTML = '<div class="empty">No exams assigned to you right now.</div>';
    return;
  }
  
  const now = new Date();
  list.innerHTML = _studentExams.map(e => {
    const isPasskeyOnly = e.target_batch === 'PasskeyOnly';
    if (isPasskeyOnly) return ''; // private room, joined via room code only

    let statusHtml = '';
    let isAllowedToStart = true;
    let lateMins = e.late_entry_mins != null ? e.late_entry_mins : 15;
    let openDate = e.window_open ? new Date(e.window_open) : null;
    let closeDate = e.window_close ? new Date(e.window_close) : null;

    if (e.has_submitted) {
      isAllowedToStart = false;
      const released = e.results_released || e.computed_status === 'released';
      statusHtml = `
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="badge ok">✓ Submitted</span>
          ${released ? `<button class="btn" data-act="view-my-result" data-session="${e.my_session?.session_id}">View result</button>` : `<span class="sub" style="font-size:12px">Results pending</span>`}
        </div>
      `;
    } else if (openDate && now < openDate) {
      isAllowedToStart = false;
      statusHtml = `<span class="badge" title="Opens at ${openDate.toLocaleTimeString()}">Opens ${openDate.toLocaleDateString()} ${openDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
    } else if (openDate && lateMins > 0 && now > new Date(openDate.getTime() + lateMins * 60000)) {
      isAllowedToStart = false;
      statusHtml = `<span class="badge bad" title="Late cutoff passed">Entry Closed (Late &gt; ${lateMins}m)</span>`;
    } else if (closeDate && now > closeDate) {
      isAllowedToStart = false;
      statusHtml = `<span class="badge bad">Exam Closed</span>`;
    } else {
      statusHtml = `<button class="btn primary" data-start="${e.exam_id}">Start exam</button>`;
    }

    const durMins = Math.round((e.duration_secs || 1800) / 60);
    const subTitle = (e.topics && e.topics.length) ? e.topics[0].subject_name : 'Adaptive Assessment';

    return `<div class="exam-row">
      <div>
        <h3>${esc(e.title)}</h3>
        <div class="meta">
          <span class="badge ${e.mode==='adaptive'?'brand':''}">${e.mode==='adaptive'?'Adaptive':'Fixed'}</span>
          <span>${esc(subTitle)}</span>
          <span>${e.num_questions} questions</span>
          <span>${durMins} minutes</span>
          ${lateMins ? `<span style="color:var(--muted)">• First ${lateMins}m entry</span>` : ''}
        </div>
        <div class="meta" style="margin-top:4px">
          <span style="font-size:12px;color:var(--muted)">
            Room #${e.exam_id} ${openDate ? `• Start: ${openDate.toLocaleDateString()} ${openDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : '• Open now'}
          </span>
        </div>
      </div>
      <div class="act">${statusHtml}</div>
    </div>`;
  }).join('');
}

$('#examList').addEventListener('click', async e => {
  const vr = e.target.closest('[data-act="view-my-result"]');
  if (vr) {
    const sId = +vr.dataset.session;
    openReview(sId);
    return;
  }
  const b = e.target.closest('[data-start]');
  if (!b) return;
  const examId = +b.dataset.start;
  const exam = _studentExams.find(x => x.exam_id === examId);
  if (!exam) return;
  if (exam.has_submitted) {
    toast('You have already submitted this exam. Re-attempts are not allowed.');
    return;
  }
  pendingStartExam = { exam_id: examId, is_preview: false, passkey: exam.passkey };
  $('#startSub').textContent = `${exam.title}: ${exam.num_questions} questions in ${Math.round((exam.duration_secs||1800)/60)} minutes.`;
  $('#startDlg').showModal();
});

function runChecks() {
  const items = [
    ['Browser', () => (CSS.supports('display','grid') && 'fetch' in window) ? ['ok','Your browser supports everything APEX needs.'] : ['bad','Use an up-to-date Chrome, Edge, Firefox or Safari.']],
    ['Connection', () => navigator.onLine ? ['ok','You are online with active network connectivity.'] : ['bad','You appear to be offline. Reconnect before you start.']],
    ['Screen size', () => innerWidth >= 1024 ? ['ok','Screen width is sufficient.'] : ['warn','Use a laptop or desktop screen at least 1024 px wide.']]
  ];
  const box = $('#checks');
  if (!box) return;
  box.innerHTML = items.map(i => `<div class="check"><span class="dot"></span><div><b>${i[0]}</b><div class="sub">Not checked yet</div></div></div>`).join('');
  items.forEach((it, i) => setTimeout(() => {
    if (!box.children[i]) return;
    const [s, m] = it[1]();
    const row = box.children[i];
    row.querySelector('.dot').className = 'dot ' + s;
    row.querySelector('.sub').textContent = m;
  }, 350 * (i + 1)));
}
$('#runCheck')?.addEventListener('click', runChecks);

// Join Room by Code & PIN
$('#btnJoinRoom')?.addEventListener('click', async () => {
  const rId = parseInt($('#joinRoomId')?.value);
  const pin = $('#joinPin')?.value.trim().toUpperCase();
  if (!rId) { toast('Please enter a valid Room ID number.'); return; }
  try {
    const sId = user ? user.name : 'student';
    const sess = await api.startSession(rId, sId, pin, false);
    toast(`Entered Room #${rId}! Starting exam...`);
    startLiveExamSession(sess, false);
  } catch(err) {
    toast('Cannot join room: ' + err.message);
  }
});

$('#startCancel').onclick = () => { $('#startDlg').close(); pendingStartExam = null; };
$('#startGo').onclick = async () => {
  $('#startDlg').close();
  if (!pendingStartExam) return;
  try {
    const sId = user ? user.name : 'student';
    const sess = await api.startSession(pendingStartExam.exam_id, sId, pendingStartExam.passkey, pendingStartExam.is_preview);
    startLiveExamSession(sess, pendingStartExam.is_preview);
  } catch(err) {
    toast('Error starting exam: ' + err.message);
  } finally {
    pendingStartExam = null;
  }
};

let ex = null;
const fmt = s => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');

function paintTimer() {
  const t = $('#exTimer');
  if (!t || !ex) return;
  t.textContent = fmt(Math.max(ex.left, 0));
  t.classList.toggle('low', ex.left <= 120);
}

async function startLiveExamSession(sess, isPreview = false) {
  ex = {
    sessionId: sess.session_id,
    examId: sess.exam_id,
    title: sess.exam_title,
    numQ: sess.num_questions,
    left: sess.duration_secs || 1800,
    currentQ: null,
    qIdx: 0,
    isPreview: isPreview,
    done: false
  };
  $('#exTitle').textContent = isPreview ? `[PREVIEW] ${sess.exam_title}` : sess.exam_title;
  $('#exExit').textContent = isPreview ? 'Exit Preview' : 'Exit Exam';
  $('#exam').hidden = false;
  $('#exFoot').hidden = false;
  paintTimer();

  clearInterval(ex.t);
  ex.t = setInterval(() => {
    ex.left--;
    paintTimer();
    if (ex.left <= 0) finishExamSession(true);
  }, 1000);

  await loadNextQuestion();
}

async function loadNextQuestion() {
  if (!ex || ex.done) return;
  try {
    $('#exSave').textContent = 'Fetching question...';
    const res = await api.nextQuestion(ex.sessionId);
    if (!res || res.finished || !res.question) {
      // No more questions -> finish exam
      await finishExamSession(false);
      return;
    }
    ex.currentQ = res.question;
    ex.qIdx = res.question_number || (ex.qIdx + 1);
    ex.numQ = res.total_questions || ex.numQ;
    renderCurrentQuestion();
  } catch(err) {
    toast('Error loading question: ' + err.message);
  }
}

function renderCurrentQuestion() {
  const q = ex.currentQ;
  ex.sel = null;
  paintTimer();
  $('#exCount').textContent = `Question ${ex.qIdx} of ${ex.numQ}`;
  $('#exBar').style.width = ((ex.qIdx - 1) / ex.numQ * 100) + '%';
  $('#exSave').textContent = '';

  const opts = [
    { key: 'A', text: q.opt_a },
    { key: 'B', text: q.opt_b },
    { key: 'C', text: q.opt_c },
    { key: 'D', text: q.opt_d }
  ].filter(o => Boolean(o.text));

  $('#exBody').innerHTML = `
    <div class="sub">Multiple choice. Choose one answer.</div>
    <h2 class="qtext">${esc(q.question_text)}</h2>
    <div class="opts" role="radiogroup" aria-label="Answer options">
      ${opts.map(o => `
        <label class="opt">
          <input type="radio" name="o" value="${o.key}">
          <span class="key">${o.key}</span>
          <span>${esc(o.text)}</span>
        </label>
      `).join('')}
    </div>
  `;
  $('#exNext').disabled = true;
  $('#exNext').textContent = ex.qIdx >= ex.numQ ? 'Submit exam' : 'Save and continue';
}

function pick(k) {
  const labels = $$('#exBody .opt');
  if (!labels[k]) return;
  labels.forEach((l, i) => {
    l.classList.toggle('sel', i === k);
    l.querySelector('input').checked = (i === k);
  });
  const optKeys = ['A', 'B', 'C', 'D'];
  ex.sel = optKeys[k];
  $('#exNext').disabled = false;
  $('#exSave').textContent = 'Option selected';
}

$('#exBody').addEventListener('change', e => {
  if (e.target.name === 'o') {
    ex.sel = e.target.value;
    $('#exNext').disabled = false;
    $$('#exBody .opt').forEach(l => l.classList.toggle('sel', l.querySelector('input').checked));
  }
});

$('#exNext').onclick = async () => {
  if (!ex || !ex.sel) return;
  const btn = $('#exNext');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    $('#exSave').textContent = 'Saving answer...';
    await api.submitAnswer(ex.sessionId, ex.currentQ.q_id, ex.sel);
    $('#exSave').textContent = 'Saved';
    if (ex.qIdx >= ex.numQ) {
      await finishExamSession(false);
    } else {
      await loadNextQuestion();
    }
  } catch(err) {
    toast('Error submitting answer: ' + err.message);
    btn.disabled = false;
    btn.textContent = ex.qIdx >= ex.numQ ? 'Submit exam' : 'Save and continue';
  }
};

async function finishExamSession(timeUp) {
  if (!ex) return;
  clearInterval(ex.t);
  ex.done = true;
  try {
    await api.forceSubmit(ex.sessionId);
  } catch(e) {}
  $('#exBar').style.width = '100%';
  $('#exFoot').hidden = true;
  $('#exCount').textContent = 'Finished';
  renderExams();
  $('#exBody').innerHTML = `
    <div class="done">
      <div class="ring">${ic.ok.replace('<svg','<svg width="28" height="28"')}</div>
      <h2 style="font-size:24px;letter-spacing:-.01em">${timeUp ? 'Time is up. Your answers were submitted.' : 'Exam submitted successfully!'}</h2>
      <p class="sub" style="margin:8px 0 20px">${ex.isPreview ? 'Preview session complete. No student score recorded.' : 'Your answers are saved. Your teacher decides when results are released.'}</p>
      <button class="btn primary" id="backExams">Back to my exams</button>
    </div>
  `;
}

async function closeExam() {
  if (ex && !ex.done && !ex.isPreview) {
    const ok = await uiConfirm({
      title: "Exit & Submit Exam?",
      message: "Are you sure you want to exit? Your exam will be submitted immediately with all currently saved answers.",
      okText: "Submit & Exit",
      isDanger: true
    });
    if (!ok) return;
    try {
      await api.forceSubmit(ex.sessionId);
      toast('Exam submitted.');
    } catch(e) {}
  }
  if (ex) clearInterval(ex.t);
  $('#exam').hidden = true;
  ex = null;
  renderExams();
}
$('#exExit').onclick = closeExam;
$('#exBody').addEventListener('click', e => {
  if (e.target.id === 'backExams') closeExam();
});
document.addEventListener('keydown',e=>{
  if($('#exam').hidden||!ex||ex.done) return;
  const k={a:0,b:1,c:2,d:3,'1':0,'2':1,'3':2,'4':3}[e.key.toLowerCase()];
  if(k!==undefined && document.activeElement.tagName!=='INPUT'||k!==undefined&&document.activeElement.type==='radio') pick(k);
  else if(e.key==='Enter' && ex.sel!==null && document.activeElement.tagName!=='BUTTON') $('#exNext').click();
});

const dcls={Easy:'ok',Medium:'warn',Hard:'bad'};
let BANK = [];
let currentSubjects = [];

async function loadBankSubjects() {
  try {
    currentSubjects = await api.subjects();
    const prev = $('#fs')?.value;
    if ($('#fs')) {
      $('#fs').innerHTML = '<option value="">All subjects</option>' + 
        currentSubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_name)}${s.is_private ? ' (Private)' : ''}</option>`).join('');
      if (prev) $('#fs').value = prev;
    }
    if ($('#qSub')) {
      $('#qSub').innerHTML = currentSubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_name)}${s.is_private ? ' (Private)' : ''}</option>`).join('');
    }
  } catch (err) {
    console.error("Failed to load subjects:", err);
  }
}

async function renderBank(){
  const q=$('#fq').value.trim(), s=$('#fs').value, d=$('#fd').value, t=$('#ft').value;
  const params = { page_size: 500 };
  if (s) params.subject_id = +s;
  if (d) params.diff_level = d;
  if (t) params.question_type = t;
  if (q) params.search = q;

  try {
    const res = await api.questions(params);
    BANK = res.questions || [];
    
    $('#bankRows').innerHTML = BANK.length ? BANK.map(r=>`<tr>
      <td><div class="clamp">${esc(r.question_text)}</div></td>
      <td><span class="badge">${r.question_type==='MCQ'?'MCQ':'Subjective'}</span></td>
      <td><span class="badge ${dcls[r.diff_level] || ''}">${r.diff_level}</span></td>
      <td class="num">${r.marks}</td>
      <td class="sub">${esc(r.topic_name||'')}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn" style="padding:4px 8px;font-size:12px;margin-right:4px" data-qact="edit" data-id="${r.q_id}">Edit</button>
        <button class="btn danger" style="padding:4px 8px;font-size:12px;color:var(--bad)" data-qact="del" data-id="${r.q_id}">Delete</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">No questions match these filters. Clear a filter or click "+ Add question".</div></td></tr>`;
    $('#bankCount').textContent = `${BANK.length} matching questions found (out of ${res.total || BANK.length} total in database)`;
  } catch(e) {
    $('#bankRows').innerHTML = `<tr><td colspan="6"><div class="empty bad">Failed to load questions: ${esc(e.message)}</div></td></tr>`;
  }
}
['#fq','#fs','#fd','#ft'].forEach(id=>$(id)?.addEventListener('change',renderBank));
$('#fq')?.addEventListener('keyup', (e) => { if(e.key === 'Enter') renderBank() });

$('#bankRows')?.addEventListener('click', async e => {
  const b = e.target.closest('[data-qact]');
  if (!b) return;
  const id = +b.dataset.id;
  const act = b.dataset.qact;
  if (act === 'del') {
    const ok = await uiConfirm({
      title: "Delete Question?",
      message: "Are you sure you want to remove this question from the question bank? This cannot be undone.",
      okText: "Delete Question",
      isDanger: true
    });
    if (!ok) return;
    try {
      await api.deleteQuestion(id);
      toast("Question deleted successfully.");
      renderBank();
    } catch (err) {
      toast("Error: " + err.message);
    }
  } else if (act === 'edit') {
    openEditQuestion(id);
  }
});

async function openAddQuestion() {
  await loadBankSubjects();
  $('#dlgQTitle').textContent = "Add Question";
  $('#dlgQSub').textContent = "Add a question directly to the question bank or a private pool.";
  $('#qEditId').value = "";
  $('#qTopic').value = "";
  $('#qText').value = "";
  $('#qMarks').value = "1";
  $('#qDiff').value = "Medium";
  $('#qType').value = "MCQ";
  $('#qPyq').checked = false;
  $('#qOptA').value = "";
  $('#qOptB').value = "";
  $('#qOptC').value = "";
  $('#qOptD').value = "";
  $('#qCorrectOpt').value = "A";
  $('#mcqFields').style.display = "block";
  $('#qErr').style.display = "none";
  if ($('#fs').value) $('#qSub').value = $('#fs').value;
  $('#dlgQuestion').showModal();
}

async function openEditQuestion(id) {
  try {
    await loadBankSubjects();
    const q = await api.questionById(id);
    $('#dlgQTitle').textContent = "Edit Question";
    $('#dlgQSub').textContent = "Update question text, difficulty, marks, or options.";
    $('#qEditId').value = q.q_id;
    $('#qSub').value = q.subject_id || (currentSubjects[0]?.subject_id || "");
    $('#qUnit').value = q.unit_number || 1;
    $('#qTopic').value = q.topic_name || "";
    $('#qType').value = q.question_type || "MCQ";
    $('#qMarks').value = q.marks || 1;
    $('#qDiff').value = q.diff_level || "Medium";
    $('#qPyq').checked = Boolean(q.is_pyq);
    $('#qText').value = q.question_text || "";
    $('#qOptA').value = q.opt_a || "";
    $('#qOptB').value = q.opt_b || "";
    $('#qOptC').value = q.opt_c || "";
    $('#qOptD').value = q.opt_d || "";
    $('#qCorrectOpt').value = q.correct_opt || "A";
    $('#mcqFields').style.display = q.question_type === "MCQ" ? "block" : "none";
    $('#qErr').style.display = "none";
    $('#dlgQuestion').showModal();
  } catch (err) {
    toast("Failed to load question: " + err.message);
  }
}

$('#openAddQ')?.addEventListener('click', openAddQuestion);
$('#qCancel')?.addEventListener('click', () => $('#dlgQuestion').close());
$('#qType')?.addEventListener('change', () => {
  $('#mcqFields').style.display = $('#qType').value === 'MCQ' ? 'block' : 'none';
});

$('#qSaveBtn')?.addEventListener('click', async () => {
  const text = $('#qText').value.trim();
  const topic = $('#qTopic').value.trim();
  const subId = +$('#qSub').value;
  const unit = +$('#qUnit').value || 1;
  const marks = +$('#qMarks').value || 1;
  const diff = $('#qDiff').value;
  const qtype = $('#qType').value;
  const isPyq = $('#qPyq').checked ? 1 : 0;
  const err = $('#qErr');

  if (!text) {
    err.textContent = "Please enter question text.";
    err.style.display = "block";
    return;
  }
  if (!topic) {
    err.textContent = "Please enter a topic name.";
    err.style.display = "block";
    return;
  }

  const payload = {
    subject_id: subId,
    unit_number: unit,
    topic_name: topic,
    question_text: text,
    question_type: qtype,
    marks: marks,
    diff_level: diff,
    is_pyq: isPyq
  };

  if (qtype === "MCQ") {
    const a = $('#qOptA').value.trim();
    const b = $('#qOptB').value.trim();
    const c = $('#qOptC').value.trim();
    const d = $('#qOptD').value.trim();
    if (!a || !b || !c || !d) {
      err.textContent = "All 4 options (A, B, C, D) are required for MCQ.";
      err.style.display = "block";
      return;
    }
    payload.opt_a = a;
    payload.opt_b = b;
    payload.opt_c = c;
    payload.opt_d = d;
    payload.correct_opt = $('#qCorrectOpt').value;
  }

  const editId = $('#qEditId').value;
  $('#qSaveBtn').disabled = true;
  $('#qSaveBtn').textContent = "Saving...";
  try {
    if (editId) {
      await api.updateQuestion(editId, payload);
      toast("Question updated successfully.");
    } else {
      await api.createQuestion(payload);
      toast("Question created successfully.");
    }
    $('#dlgQuestion').close();
    renderBank();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";
  } finally {
    $('#qSaveBtn').disabled = false;
    $('#qSaveBtn').textContent = "Save question";
  }
});

/* Manage Private Pools logic */
$('#btnManagePools')?.addEventListener('click', async e => {
  e.preventDefault();
  try {
    const subs = await api.subjects();
    const priv = subs.filter(s => s.is_private);
    const list = $('#poolsList');
    if (!priv.length) {
      list.innerHTML = `<div class="empty">No private pools found. Click "+ Add private pool" to create one.</div>`;
    } else {
      list.innerHTML = priv.map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--sunken);border-radius:6px">
          <div>
            <b>${esc(p.subject_name)}</b>
            <div class="sub" style="font-size:12px">Private pool • ID #${p.subject_id}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn" style="padding:4px 8px;font-size:12px" data-pact="edit" data-id="${p.subject_id}" data-name="${esc(p.subject_name)}">Rename</button>
            <button class="btn danger" style="padding:4px 8px;font-size:12px;color:var(--bad)" data-pact="del" data-id="${p.subject_id}" data-name="${esc(p.subject_name)}">Delete</button>
          </div>
        </div>
      `).join('');
    }
    $('#dlgPools').showModal();
  } catch (err) {
    toast("Failed to load pools: " + err.message);
  }
});

$('#closePools')?.addEventListener('click', () => $('#dlgPools').close());

$('#poolsList')?.addEventListener('click', async e => {
  const b = e.target.closest('[data-pact]');
  if (!b) return;
  const id = +b.dataset.id;
  const act = b.dataset.pact;
  const name = b.dataset.name;
  if (act === 'del') {
    const ok = await uiConfirm({
      title: `Delete "${name}"?`,
      message: `All questions and topics inside this private pool will be permanently deleted.`,
      okText: "Delete Pool",
      isDanger: true
    });
    if (!ok) return;
    try {
      await api.deleteSubject(id);
      toast(`Pool "${name}" deleted.`);
      await loadBankSubjects();
      if (typeof initBlueprint === 'function') await initBlueprint();
      renderBank();
      $('#btnManagePools').click();
    } catch (err) {
      toast("Error: " + err.message);
    }
  } else if (act === 'edit') {
    const newName = await uiPrompt({
      title: "Rename Private Pool",
      message: "Enter the updated name for this private pool:",
      defaultValue: name,
      okText: "Update Name"
    });
    if (!newName || newName === name) return;
    try {
      await api.updateSubject(id, { subject_name: newName.trim() });
      toast("Pool renamed successfully.");
      await loadBankSubjects();
      if (typeof initBlueprint === 'function') await initBlueprint();
      renderBank();
      $('#btnManagePools').click();
    } catch (err) {
      toast("Error: " + err.message);
    }
  }
});

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
const CSV_ALIASES = {
  'question': 'question_text', 'q_text': 'question_text', 'problem': 'question_text',
  'difficulty': 'diff_level', 'diff': 'diff_level', 'level': 'diff_level',
  'type': 'question_type', 'q_type': 'question_type',
  'unit': 'unit_number', 'unit_no': 'unit_number',
  'topic': 'topic_name', 'subject': 'subject_name',
  'mark': 'marks', 'score': 'marks', 'points': 'marks',
  'pyq': 'is_pyq', 'past_paper': 'is_pyq',
  'option_a': 'opt_a', 'a': 'opt_a',
  'option_b': 'opt_b', 'b': 'opt_b',
  'option_c': 'opt_c', 'c': 'opt_c',
  'option_d': 'opt_d', 'd': 'opt_d',
  'answer': 'correct_opt', 'correct': 'correct_opt', 'correct_answer': 'correct_opt'
};

function checkCSV(text){
  const rows=parseCSV(text).filter(r=>r.some(c=>c.trim()!==''));
  const need=['question_text','marks','diff_level','question_type','subject_name','topic_name','unit_number'];
  const rawH=(rows[0]||[]).map(x=>x.trim());
  const h=rawH.map(c=>CSV_ALIASES[c.toLowerCase()] || c.toLowerCase());
  const miss=need.filter(c=>!h.includes(c));
  if(miss.length) return {fatal:`Missing required columns: ${miss.join(', ')}. Click 'Download sample CSV template' below for the exact format.`};
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

function generatePin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pin = '';
  for (let i = 0; i < 6; i++) pin += chars.charAt(Math.floor(Math.random() * chars.length));
  return pin;
}

$('#oaGenPin')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('#oaPasskey').value = generatePin();
});

$('#oaCreate').onclick = async () => {
  const btn = $('#oaCreate'); btn.disabled = true; btn.textContent = 'Creating...';
  try {
    const wOpen = $('#oaWinOpen').value || null;
    const wClose = $('#oaWinClose').value || null;
    const lMins = parseInt($('#oaLateMins').value) || 15;

    if (wOpen && wClose) {
      const oDate = new Date(wOpen);
      const cDate = new Date(wClose);
      if (cDate <= oDate) {
        toast('Exam End Time must be after Start Time.');
        btn.disabled = false; btn.textContent = 'Create exam';
        return;
      }
      const diffMins = Math.round((cDate - oDate) / 60000);
      if (lMins > diffMins) {
        toast(`Late entry cutoff (${lMins} mins) cannot exceed the total window duration (${diffMins} mins).`);
        btn.disabled = false; btn.textContent = 'Create exam';
        return;
      }
    }

    const payload = {
      title: $('#oaTitle').value || 'Online Test',
      topic_ids: [...$$('input[name="oaTopic"]:checked')].map(el => el.value).join(','),
      num_questions: parseInt($('#oaNumQ').value) || 20,
      duration_secs: (parseInt($('#oaDur').value)||30)*60,
      mode: 'adaptive',
      start_difficulty: $('#oaStart').value,
      review_level: $('#oaRev').value,
      window_open: wOpen,
      window_close: wClose,
      late_entry_mins: lMins,
      target_batch: $('#oaAudience').value || 'All',
      passkey: $('#oaPasskey').value.trim().toUpperCase() || null
    };
    const exam = await api.createExam(payload);
    toast(`Exam "${exam.title}" created successfully! Passkey: ${exam.passkey}`);
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
    
    act += ` <button class="btn" data-act="edit" data-id="${e.exam_id}">Edit</button> <button class="btn" data-act="preview" data-id="${e.exam_id}">Preview</button> <button class="btn danger" data-act="del" data-id="${e.exam_id}" style="color:var(--bad)">Delete</button>`;
    
    return `<tr>
      <td>
        <b>${esc(e.title)}</b> <span class="badge">${e.category || 'Formal'}</span>
        <div style="margin-top:4px;font-size:12px;display:flex;gap:10px;align-items:center">
          <span style="font-weight:700;color:var(--fg)">Room ID: <span style="font-family:monospace;color:var(--brand)">${e.exam_id}</span></span>
          <span style="font-weight:700;color:var(--fg)">Passkey: <span style="font-family:monospace;color:var(--brand)">${e.passkey || 'None'}</span></span>
        </div>
        ${st==='released'?`<div class="sub" style="margin-top:2px">Students see: ${LVL[lvl]?LVL[lvl][0].toLowerCase():lvl}</div>`:''}
      </td>
      <td><span class="badge ${mode==='Adaptive'?'brand':''}">${mode}</span></td>
      <td class="sub">${e.window_open ? (e.window_open + (e.window_close ? ' to ' + e.window_close : '')) : 'Open immediately (No deadline)'}</td>
      <td class="num">
        <a href="#" style="text-decoration:none;font-weight:600;color:var(--brand)" data-act="view-subm" data-id="${e.exam_id}">
          ${sub} submitted
        </a>
      </td>
      <td><span class="badge ${bc}">${bl}</span></td>
      <td style="text-align:right">${act}</td>
    </tr>`;
  }).join('');
}

$('#texRows')?.addEventListener('click', async e => {
  const b = e.target.closest('button, a[data-act]');
  if(!b) return;
  const examId = +b.dataset.id;
  
  if(b.dataset.act === 'rel') {
    openRelease(examId);
    return;
  }
  
  if(b.dataset.act === 'view-subm') {
    e.preventDefault();
    try {
      const res = await api.examSubmissions(examId);
      $('#submExamTitle').textContent = `Submissions: ${res.title}`;
      $('#submExamMeta').textContent = `Room ID #${examId} • Total ${res.submissions.length} student submission(s)`;
      $('#submExportCsv').href = `/exams/${examId}/export`;
      const rows = $('#submRows');
      if (!res.submissions.length) {
        rows.innerHTML = `<tr><td colspan="6"><div class="empty">No student submissions yet for this exam.</div></td></tr>`;
      } else {
        rows.innerHTML = res.submissions.map(s => `
          <tr>
            <td><b>${esc(s.student_id)}</b></td>
            <td class="num" style="font-weight:700;color:var(--brand)">${s.total_score} marks</td>
            <td class="num">${s.correct_answers} / ${s.total_answered}</td>
            <td class="sub">${s.started_at || '—'}</td>
            <td class="sub">${s.submitted_at ? `<span class="badge ok">Submitted: ${s.submitted_at}</span>` : '<span class="badge warn">In Progress</span>'}</td>
            <td style="text-align:right">
              <button class="btn" style="padding:4px 8px;font-size:12px" data-act="inspect-answers" data-session="${s.session_id}">Inspect answers</button>
            </td>
          </tr>
        `).join('');
      }
      $('#dlgSubmissions').showModal();
    } catch(err) {
      toast('Error loading submissions: ' + err.message);
    }
    return;
  }

  if(b.dataset.act === 'edit') {
    const ex = _texams.find(x => x.exam_id === examId);
    if (!ex) return;
    $('#eeExamId').value = ex.exam_id;
    $('#eeTitle').value = ex.title || '';
    $('#eeWinOpen').value = ex.window_open || '';
    $('#eeWinClose').value = ex.window_close || '';
    $('#eeLateMins').value = ex.late_entry_mins != null ? ex.late_entry_mins : 15;
    $('#eePasskey').value = ex.passkey || '';
    $('#eeErr').style.display = 'none';
    $('#dlgEditExam').showModal();
    return;
  }

  if(b.dataset.act === 'preview') {
    try {
      b.disabled = true;
      const sess = await api.startSession(examId, 'teacher_preview', null, true);
      toast('Launching Exam Preview mode...');
      startLiveExamSession(sess, true);
    } catch(err) {
      toast('Preview error: ' + err.message);
    } finally {
      b.disabled = false;
    }
    return;
  }
  if(b.dataset.act === 'del') {
    const ok = await uiConfirm({
      title: "Delete Exam?",
      message: "Are you sure you want to delete this exam? All student sessions and scores will be permanently deleted.",
      okText: "Delete Exam",
      isDanger: true
    });
    if (!ok) return;
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
});

// Submissions Modal Handlers
$('#submClose')?.addEventListener('click', () => $('#dlgSubmissions').close());
$('#submRows')?.addEventListener('click', async e => {
  const b = e.target.closest('[data-act="inspect-answers"]');
  if (!b) return;
  const sessId = +b.dataset.session;
  try {
    b.disabled = true;
    const rev = await api.teacherSessionReview(sessId);
    $('#revTitle').textContent = `Answer Sheet: ${rev.student_id}`;
    $('#revSub').textContent = `${rev.exam_title} • Score: ${rev.total_marks} / ${rev.max_marks} marks • Submitted: ${rev.submitted_at || 'In progress'}`;
    
    if (!rev.responses || !rev.responses.length) {
      $('#revBody').innerHTML = `<div class="empty">No questions recorded for this session.</div>`;
    } else {
      $('#revBody').innerHTML = rev.responses.map((it, n) => {
        const ok = Boolean(it.is_correct);
        const opts = [
          { key: 'A', text: it.opt_a },
          { key: 'B', text: it.opt_b },
          { key: 'C', text: it.opt_c },
          { key: 'D', text: it.opt_d }
        ].filter(o => Boolean(o.text));

        return `
          <div class="qrev" style="margin-bottom:16px;padding:12px;border:1px solid var(--line);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
              <b>${n + 1}. ${esc(it.question_text)}</b>
              <div style="display:flex;gap:6px;align-items:center">
                <span class="badge ${it.diff_level==='Easy'?'ok':it.diff_level==='Hard'?'bad':'warn'}">${it.diff_level || 'Medium'}</span>
                <span class="badge ${ok ? 'ok' : 'bad'}">${ok ? '✓ Correct (' + it.marks_awarded + 'm)' : '✗ Incorrect (0m)'}</span>
              </div>
            </div>
            ${opts.map(o => {
              let c = '', tag = '';
              const isStudentPick = (it.chosen_opt || '').toUpperCase() === o.key;
              const isCorrectOpt = (it.correct_opt || '').toUpperCase() === o.key;

              if (isStudentPick) {
                c = ok ? 'ok' : 'bad';
                tag = 'Student Answer';
              }
              if (isCorrectOpt && !ok) {
                c = 'ok';
                tag = tag ? tag + ' (Correct)' : 'Correct Answer';
              }
              return `
                <div class="ropt ${c}">
                  <span class="key">${o.key}</span>
                  <span>${esc(o.text)}</span>
                  ${tag ? `<span class="tag">${tag}</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('');
    }
    $('#revDlg').showModal();
  } catch(err) {
    toast('Error: ' + err.message);
  } finally {
    b.disabled = false;
  }
});

// Edit Exam Modal Handlers
$('#eeCancel')?.addEventListener('click', () => $('#dlgEditExam').close());
$('#eeSave')?.addEventListener('click', async () => {
  const examId = +$('#eeExamId').value;
  const title = $('#eeTitle').value.trim();
  const err = $('#eeErr');
  err.style.display = 'none';
  if (!title) {
    err.textContent = 'Exam title cannot be empty.';
    err.style.display = 'block';
    return;
  }

  const winOpen = $('#eeWinOpen').value || null;
  const winClose = $('#eeWinClose').value || null;
  const lateMins = parseInt($('#eeLateMins').value);

  if (winOpen && winClose) {
    const oDate = new Date(winOpen);
    const cDate = new Date(winClose);
    if (cDate <= oDate) {
      err.textContent = 'End Time (Window Close) must be after Start Time (Window Open).';
      err.style.display = 'block';
      return;
    }
    const diffMins = Math.round((cDate - oDate) / 60000);
    if (!isNaN(lateMins) && lateMins > diffMins) {
      err.textContent = `Late entry cutoff (${lateMins} mins) cannot exceed the total window duration (${diffMins} mins).`;
      err.style.display = 'block';
      return;
    }
  }

  const btn = $('#eeSave');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await api.updateExam(examId, {
      title,
      window_open: $('#eeWinOpen').value || null,
      window_close: $('#eeWinClose').value || null,
      late_entry_mins: parseInt($('#eeLateMins').value) || 15,
      passkey: $('#eePasskey').value.trim().toUpperCase() || null
    });
    $('#dlgEditExam').close();
    toast('Exam updated successfully!');
    await renderTExams();
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

function teacherAct(e){
  const b=e.target.closest('[data-act]'); if(!b) return; const a=b.dataset.act;
  if(a==='mark') toast('Select responses to mark from the exam submissions view.');
  else if(a==='exams') go('texams');
  else if(a==='rel') openRelease(+b.dataset.id);
}
$('#tdAttn').addEventListener('click',teacherAct);
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

async function renderResults() {
  await loadStudentExams();
  const box = $('#resList');
  if (!box) return;
  const submittedExams = _studentExams.filter(e => e.has_submitted);
  if (!submittedExams.length) {
    box.innerHTML = '<div class="empty">No completed exams yet. Take an exam from the "My exams" tab.</div>';
    return;
  }

  box.innerHTML = submittedExams.map(e => {
    const released = e.results_released || e.computed_status === 'released';
    const subTitle = (e.topics && e.topics.length) ? e.topics[0].subject_name : 'Assessment';
    const sessionId = e.my_session?.session_id;

    return `
      <div class="exam-row">
        <div>
          <h3>${esc(e.title)}</h3>
          <div class="meta">
            <span>${esc(subTitle)}</span>
            <span>${e.num_questions} questions</span>
            <span class="badge ${released ? 'ok' : 'warn'}">${released ? 'Results Released' : 'Awaiting Release'}</span>
          </div>
        </div>
        <div class="act">
          ${released && sessionId ? `<button class="btn primary" data-review-session="${sessionId}">View review</button>` : `<span class="sub" style="font-size:12px">Pending teacher release</span>`}
        </div>
      </div>
    `;
  }).join('');
}

async function openReview(resOrSessionId) {
  let res = resOrSessionId;
  if (typeof resOrSessionId === 'number' || typeof resOrSessionId === 'string') {
    try {
      const sId = +resOrSessionId;
      const uname = user ? user.name : 'student';
      res = await api.results(sId, uname);
    } catch (err) {
      toast('Error fetching result: ' + err.message);
      return;
    }
  }

  if (!res) return;
  if (res.status === 'submitted') {
    toast('Results have not been released by your teacher yet.');
    return;
  }
  if (res.status === 'pending_marking') {
    toast(res.message || 'Subjective questions are pending marking by instructor.');
    return;
  }

  const lvl = res.review_level || 'score_and_correctness';
  const totalScore = res.total_score != null ? res.total_score : 0;
  const maxScore = res.max_score != null ? res.max_score : 0;
  const lvlDesc = (LVL && LVL[lvl]) ? LVL[lvl][1] : '';

  $('#revTitle').textContent = res.exam_title || 'Exam Result';
  $('#revSub').textContent = `Your score: ${totalScore} / ${maxScore} marks • ${lvlDesc}`;

  if (lvl === 'score_only') {
    $('#revBody').innerHTML = `
      <div style="padding:24px;text-align:center">
        <h3 style="font-size:20px;margin-bottom:8px">Score: ${totalScore} / ${maxScore} marks</h3>
        <p class="sub">Your teacher has configured results to show score only for this exam.</p>
      </div>`;
  } else if (!res.responses || !res.responses.length) {
    $('#revBody').innerHTML = '<div class="empty">No response details available for this session.</div>';
  } else {
    $('#revBody').innerHTML = res.responses.map((it, n) => {
      const ok = Boolean(it.is_correct);
      const isFull = lvl === 'full_review';
      const chosen = (it.chosen_opt || '').toUpperCase();
      const correct = (it.correct_opt || '').toUpperCase();

      const opts = [
        { key: 'A', text: it.opt_a },
        { key: 'B', text: it.opt_b },
        { key: 'C', text: it.opt_c },
        { key: 'D', text: it.opt_d }
      ].filter(o => Boolean(o.text));

      return `
        <div class="qrev" style="margin-bottom:16px;padding:12px;border:1px solid var(--line);border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
            <b>${n + 1}. ${esc(it.question_text)}</b>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="badge ${chosen ? (ok ? 'ok' : 'bad') : 'warn'}">
                ${!chosen ? 'Unanswered' : (ok ? `✓ Correct (+${it.marks_awarded != null ? it.marks_awarded : it.marks}m)` : `✗ Incorrect (0m)`)}
              </span>
            </div>
          </div>
          ${opts.map(o => {
            let c = '', tag = '';
            if (o.key === chosen) {
              c = ok ? 'ok' : 'bad';
              tag = ok ? 'Your answer (Correct)' : 'Your answer (Incorrect)';
            }
            if (isFull && o.key === correct && (!ok || !chosen)) {
              c = 'ok';
              tag = tag ? tag + ' (Correct)' : 'Correct answer';
            }
            return `
              <div class="ropt ${c}">
                <span class="key">${o.key}</span>
                <span>${esc(o.text)}</span>
                ${tag ? `<span class="tag">${tag}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  $('#revDlg').showModal();
}
$('#resList')?.addEventListener('click', e => {
  const b = e.target.closest('[data-review-session]');
  if (b) openReview(+b.dataset.reviewSession);
});
$('#revClose').onclick = () => $('#revDlg').close();

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
renderExams(); runChecks(); loadBankSubjects().then(() => renderBank()); setLTab('student');
boot();

$('#btnAddSubject')?.addEventListener('click', async e => {
  e.preventDefault();
  const name = await uiPrompt({
    title: "Create Private Question Pool",
    message: "Enter a name for your private subject/pool. Only you can view or use questions in this pool:",
    placeholder: "e.g. CN Mid-Sem Private Pool",
    okText: "Create Pool"
  });
  if (!name) return;
  try {
    await api.createSubject({subject_name: name.trim(), is_private: true});
    await loadBankSubjects();
    if (typeof initBlueprint === 'function') await initBlueprint();
    toast(`Private pool "${name.trim()}" created successfully!`);
    renderBank();
  } catch(err) {
    toast("Error: " + err.message);
  }
});


/* Subject-wise Restore Default Bank */
$('#btnResetBank')?.addEventListener('click', () => {
  $('#dlgRestoreBank')?.showModal();
});

$('#restoreCancel')?.addEventListener('click', () => {
  $('#dlgRestoreBank')?.close();
});

$('#restoreOk')?.addEventListener('click', async () => {
  const sel = $('#restoreSubjectSelect')?.value || 'all';
  const okBtn = $('#restoreOk');
  okBtn.disabled = true;
  okBtn.textContent = 'Restoring...';
  try {
    const res = await api.resetDefaultBank(sel);
    toast(res.message || "Default questions restored successfully!");
    $('#dlgRestoreBank')?.close();
    await loadBankSubjects();
    renderBank();
  } catch(err) {
    toast("Error: " + err.message);
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = 'Restore Subject';
  }
});

/* Download sample CSV template */
$('#btnDownloadTemplate')?.addEventListener('click', (e) => {
  e.preventDefault();
  const csvHeaders = "question_text,question_type,marks,diff_level,is_pyq,opt_a,opt_b,opt_c,opt_d,correct_opt,subject_name,topic_name,unit_number\n";
  const row1 = '"What is the primary role of an Operating System?",MCQ,1,Easy,1,"Resource management","Word processing","Graphics rendering","Browser hosting",A,"Operating Systems","OS Overview",1\n';
  const row2 = '"Explain the ACID properties in database management systems.",SUBJECTIVE,5,Medium,0,,,,,"Database Management Systems","Transactions",3\n';
  const content = csvHeaders + row1 + row2;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apex_sample_question_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Sample CSV template downloaded!");
});
