/* script.js — data-driven dashboard for Fintech Journey OS
   Responsibilities split into functions for readability and testability
*/

// navigation toggle (unchanged)
const toggle=document.querySelector('.nav-toggle');const nav=document.querySelector('.nav');toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));

// reveal observer (retain subtle reveal behaviour)
const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

// ---------- Data loader ----------
async function loadData(){
  const opts={cache:'no-store'};
  async function fetchJson(path){
    try{const res=await fetch(path,opts);if(!res.ok)throw new Error('HTTP '+res.status);return await res.json();}catch(err){console.warn('loadData:',path,err);return null}
  }
  const [roadmap,evidence,glossary]=await Promise.all([fetchJson('data/roadmap.json'),fetchJson('data/evidence.json'),fetchJson('data/glossary.json')]);
  return {roadmap,evidence,glossary};
}

// ---------- findActiveWeek helper ----------
function findActiveWeek(now, roadmap){
  // Return the active phase and week object if found by scanning all phase.weeks.
  // A week is active when now is between week.start (00:00) and week.end (23:59:59) inclusive.
  // Returns: { phase, phaseIndex, week, weekIndex, weekStart, weekEnd } or object with nulls when not found.
  const result = {phase:null, phaseIndex:-1, week:null, weekIndex:-1, weekStart:null, weekEnd:null};
  if(!roadmap || !Array.isArray(roadmap.phases)) return result;
  const nowTime = now.getTime();
  for(let pIndex=0; pIndex<roadmap.phases.length; pIndex++){
    const phase = roadmap.phases[pIndex];
    if(!phase || !Array.isArray(phase.weeks)) continue;
    for(let wIndex=0; wIndex<phase.weeks.length; wIndex++){
      const wk = phase.weeks[wIndex];
      if(!wk || !wk.start || !wk.end) continue;
      const wStart = new Date(wk.start + 'T00:00:00').getTime();
      const wEnd = new Date(wk.end + 'T23:59:59').getTime();
      if(nowTime >= wStart && nowTime <= wEnd){
        result.phase = phase; result.phaseIndex = pIndex; result.week = wk; result.weekIndex = wIndex; result.weekStart = wStart; result.weekEnd = wEnd; return result;
      }
    }
  }
  return result;
}

// ---------- Roadmap state calculator ----------
function calculateRoadmapState(now, roadmap){
  // default bounds
  const state={pctComplete:0,daysLeft:null,currentPhase:'Preparation',currentPhaseId:null,currentWeekIndex:null,totalWeeks:0,phaseProgressPct:0,phase:null,currentFocus:undefined};
  const roadmapStart = roadmap && roadmap.start ? new Date(roadmap.start+'T00:00:00') : new Date('2026-09-01T00:00:00');
  const roadmapEnd = roadmap && roadmap.end ? new Date(roadmap.end+'T23:59:59') : new Date('2026-12-31T23:59:59');

  // days left
  const daysLeft=Math.max(0,Math.ceil((roadmapEnd-now)/(1000*60*60*24)));
  state.daysLeft= now>roadmapEnd?0:daysLeft;

  // overall pct
  if(now < roadmapStart){state.pctComplete=0; state.currentPhase='Preparation';}
  else if(now > roadmapEnd){state.pctComplete=100; state.currentPhase='Roadmap Complete';}
  else{
    const pct=Math.round(((now - roadmapStart)/(roadmapEnd - roadmapStart))*100);
    state.pctComplete=Math.max(0,Math.min(100,pct));
  }

  // determine current phase and week
  // FIRST: attempt to find an explicit week match across all phases (scans phase.weeks)
  const explicit = findActiveWeek(now, roadmap);
  if(explicit && explicit.week){
    const phase = explicit.phase; const wk = explicit.week;
    state.currentPhase = phase.label || phase.id || state.currentPhase;
    state.currentPhaseId = phase.id || null;
    state.phase = phase;
    state.totalWeeks = Array.isArray(phase.weeks) ? phase.weeks.length : (phase.weeks || 0);
    state.currentWeekIndex = wk.week_number || (explicit.weekIndex + 1);
    state.currentFocus = wk.focus || (Array.isArray(wk.topic) ? wk.topic[0] : undefined);
    // compute phase progress based on phase.start/end if available
    if(phase.start && phase.end){
      const ps = new Date(phase.start+'T00:00:00');
      const pe = new Date(phase.end+'T23:59:59');
      const phasePct = Math.round(((now - ps)/(pe - ps))*100);
      state.phaseProgressPct = Math.max(0,Math.min(100,phasePct));
    }
  } else if(roadmap && Array.isArray(roadmap.phases)){
    // fallback: original behaviour — find phase by its start/end and approximate week
    for(const phase of roadmap.phases){
      const ps=new Date(phase.start+'T00:00:00');
      const pe=new Date(phase.end+'T23:59:59');
      if(now >= ps && now <= pe){
        state.currentPhase=phase.label;state.currentPhaseId=phase.id;state.phase=phase;state.totalWeeks=(Array.isArray(phase.weeks)?phase.weeks.length:(phase.weeks||Math.max(1,Math.round((pe-ps)/(1000*60*60*24*7)))));
        // compute week index — prefer explicit weeks mapping if available
        if(Array.isArray(phase.weeks) && phase.weeks.length){
          // find a week within this phase
          let found=null;const nowTime=now.getTime();
          for(let wIndex=0; wIndex<phase.weeks.length; wIndex++){
            const wk = phase.weeks[wIndex]; if(!wk || !wk.start || !wk.end) continue;
            const wStart = new Date(wk.start+'T00:00:00').getTime(); const wEnd = new Date(wk.end+'T23:59:59').getTime();
            if(nowTime >= wStart && nowTime <= wEnd){ found = wk; state.currentWeekIndex = wk.week_number || (wIndex+1); state.currentFocus = wk.focus || (Array.isArray(wk.topic)?wk.topic[0]:undefined); break; }
          }
          if(!found){ // approximate
            const daysInto=Math.floor((now-ps)/(1000*60*60*24));
            const weekIndex=Math.min(state.totalWeeks, Math.floor(daysInto/7)+1);
            state.currentWeekIndex=weekIndex;
          }
        } else {
          // fallback by days into phase
          const daysInto=Math.floor((now-ps)/(1000*60*60*24));
          const weekIndex=Math.min(state.totalWeeks, Math.floor(daysInto/7)+1);
          state.currentWeekIndex=weekIndex;
        }
        // phase progress
        const phasePct=Math.round(((now-ps)/(pe-ps))*100);
        state.phaseProgressPct=Math.max(0,Math.min(100,phasePct));
        break;
      }
    }
  }

  // if after roadmap end, ensure values
  if(now > roadmapEnd){ state.pctComplete=100; state.currentPhase='Roadmap Complete'; state.currentWeekIndex=null }
  return state;
}

// ---------- Evidence statistics ----------
function calculateEvidenceStats(evidence){
  // If evidence failed to load, return null-loaded stats so UI shows '—' placeholders
  const unloaded = { evidenceLoaded: false, total: null, learning: null, portfolio: null, flagship: null, shipped: null, published: null, diagrams: null, prototypes: null, models: null, caseStudies: null, planned: null, completed: null };
  if(!Array.isArray(evidence)) return unloaded;

  const stats = { evidenceLoaded: true, total: 0, learning: 0, portfolio: 0, flagship: 0, shipped: 0, published: 0, diagrams: 0, prototypes: 0, models: 0, caseStudies: 0, planned: 0, completed: 0 };
  stats.total = evidence.length;
  for(const it of evidence){
    const lvl=(it.evidence_level||'').toLowerCase();
    if(lvl==='learning') stats.learning++;
    if(lvl==='portfolio') stats.portfolio++;
    if(lvl==='flagship') stats.flagship++;
    const st=(it.status||'').toLowerCase();
    if(st==='shipped') stats.shipped++;
    if(st==='published') stats.published++;
    if(st==='planned') stats.planned++;
    // completed is strictly SHIPPED + PUBLISHED (per requirements)
    if(st==='shipped' || st==='published') stats.completed++;
    const at=(it.artifact_type||'').toLowerCase();
    if(at.includes('diagram')||at.includes('atlas')) stats.diagrams++;
    if(at.includes('prototype')) stats.prototypes++;
    if(at.includes('model')) stats.models++;
    if(at.includes('case')) stats.caseStudies++;
  }
  return stats;
}

// ---------- Latest evidence selection ----------
function getLatestEvidence(evidence, limit=5){
  if(!Array.isArray(evidence)) return [];
  // sort by status priority then date desc: PUBLISHED>SHIPPED>others, then date
  const statusScore = s=>{ if(!s) return 2; s=s.toLowerCase(); if(s==='published') return 0; if(s==='shipped') return 1; if(s==='planned') return 4; return 3 };
  const items = evidence.slice().sort((a,b)=>{
    const sa=statusScore(a.status); const sb=statusScore(b.status);
    if(sa!==sb) return sa - sb;
    const da = a.date ? new Date(a.date) : new Date(0); const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });
  return items.slice(0,limit);
}

// ---------- Render helpers ----------
function renderCounters(stats){
  // display numbers when evidence loaded; otherwise show placeholder '—'
  document.getElementById('counter-total')?.textContent = stats.evidenceLoaded ? String(stats.total) : '—';
  document.getElementById('counter-learning')?.textContent = stats.evidenceLoaded ? String(stats.learning) : '—';
  document.getElementById('counter-portfolio')?.textContent = stats.evidenceLoaded ? String(stats.portfolio) : '—';
  document.getElementById('counter-flagship')?.textContent = stats.evidenceLoaded ? String(stats.flagship) : '—';
  document.getElementById('counter-shipped')?.textContent = stats.evidenceLoaded ? String(stats.shipped) : '—';
  document.getElementById('counter-published')?.textContent = stats.evidenceLoaded ? String(stats.published) : '—';
}

function renderLatest(latest){
  const container=document.getElementById('dashboard-latest');
  if(!container) return;
  container.innerHTML='';
  if(!latest || latest.length===0){ container.innerHTML='<div class="latest-empty">No evidence available.</div>'; return }
  for(const it of latest){
    const div=document.createElement('div');div.className='latest-item';
    const h=document.createElement('h5');h.textContent=it.title;div.appendChild(h);
    const meta=document.createElement('div');meta.className='latest-meta';
    const d=document.createElement('span');d.textContent = it.date || '';meta.appendChild(d);
    const s=document.createElement('span');s.className='latest-status';s.textContent = (it.status||'PLANNED');meta.appendChild(s);
    const lvl=document.createElement('span');lvl.textContent = (it.evidence_level||'') ;meta.appendChild(lvl);
    const cat=document.createElement('span');cat.textContent = it.category || '';meta.appendChild(cat);
    div.appendChild(meta);
    const p=document.createElement('p');p.textContent = it.description || '';div.appendChild(p);
    container.appendChild(div);
  }
}

function renderDashboard(state, stats, latest, roadmap){
  // countdown
  document.getElementById('dashboard-days')?.textContent = (state.daysLeft!=null) ? String(state.daysLeft) : '—';
  // progress
  document.getElementById('dashboard-pct')?.textContent = (state.pctComplete!=null) ? state.pctComplete + '%' : '—';
  const fill = document.getElementById('dashboard-progressBar'); if(fill) fill.style.width = (state.pctComplete||0) + '%';
  // phase
  document.getElementById('dashboard-phase')?.textContent = state.currentPhase || '—';
  document.getElementById('dashboard-phaseShort')?.textContent = state.currentPhase || '—';
  // week
  document.getElementById('dashboard-week')?.textContent = state.currentWeekIndex ? String(state.currentWeekIndex) : '—';
  // focus: prefer explicit state.currentFocus if present, else fall back to phase.items mapping
  const focus = state.currentFocus || (state.phase && Array.isArray(state.phase.items) ? state.phase.items[Math.max(0,(state.currentWeekIndex||1)-1)] : '');
  document.getElementById('dashboard-focus')?.textContent = focus;

  // status (determine using evidence conditions)
  const statusEl=document.getElementById('dashboard-status');
  if(state.currentPhase==='Preparation'){ statusEl && (statusEl.textContent='PREPARING'); }
  else if(state.currentPhase==='Roadmap Complete'){ statusEl && (statusEl.textContent='COMPLETE'); }
  else {
    // during roadmap: status derived from evidence (passed as latest)
    // default to LEARNING
    let status='LEARNING';
    // if any latest item for current week has BUILDING/SHIPPED/PUBLISHED
    if(Array.isArray(latest) && latest.length>0){
      const weekStatuses = latest.map(x=> (x.status||'').toUpperCase());
      if(weekStatuses.includes('BUILDING')) status='BUILDING';
      else if(weekStatuses.includes('SHIPPED')) status='SHIPPED';
      else if(weekStatuses.includes('PUBLISHED')) status='PUBLISHED';
      else {
        // if most recent non-future evidence is PLANNED => LEARNING
        const recent = latest.find(x=> true);
        if(recent && (recent.status||'').toUpperCase()==='PLANNED') status='LEARNING';
      }
    }
    statusEl && (statusEl.textContent = status);
  }

  // counters and latest
  renderCounters(stats);
  renderLatest(latest);
}

// ---------- Main orchestrator ----------
async function initDashboard(){
  const {roadmap,evidence,glossary} = await loadData();
  const now = new Date();
  const state = calculateRoadmapState(now, roadmap);
  const stats = calculateEvidenceStats(evidence);
  const latest = getLatestEvidence(Array.isArray(evidence)?evidence:[],5);
  renderDashboard(state, stats, latest, roadmap);
}

// Kick off
initDashboard().catch(err=>{console.error('Dashboard init failed',err);});

// keep keyboard-accessible reveals observed
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
