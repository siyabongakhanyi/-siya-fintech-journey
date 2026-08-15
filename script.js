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

// ---------- Roadmap state calculator ----------
function calculateRoadmapState(now, roadmap){
  // default bounds
  const state={pctComplete:0,daysLeft:null,currentPhase:'Preparation',currentPhaseId:null,currentWeekIndex:null,totalWeeks:0,phaseProgressPct:0,phase:null};
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

  // determine current phase
  if(roadmap && Array.isArray(roadmap.phases)){
    for(const phase of roadmap.phases){
      const ps=new Date(phase.start+'T00:00:00');
      const pe=new Date(phase.end+'T23:59:59');
      if(now >= ps && now <= pe){
        state.currentPhase=phase.label;state.currentPhaseId=phase.id;state.phase=phase;state.totalWeeks=phase.weeks||Math.max(1,Math.round((pe-ps)/(1000*60*60*24*7)));
        // compute week index
        const daysInto=Math.floor((now-ps)/(1000*60*60*24));
        const weekIndex=Math.min(state.totalWeeks, Math.floor(daysInto/7)+1);
        state.currentWeekIndex=weekIndex; // 1-based
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
  const stats={total:0,learning:0,portfolio:0,flagship:0,shipped:0,published:0,diagrams:0,prototypes:0,models:0,caseStudies:0,planned:0,completed:0};
  if(!Array.isArray(evidence)) return stats;
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
    if(st!=='planned') stats.completed++;
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
  document.getElementById('counter-total')?.textContent = stats.total || '—';
  document.getElementById('counter-learning')?.textContent = stats.learning || '—';
  document.getElementById('counter-portfolio')?.textContent = stats.portfolio || '—';
  document.getElementById('counter-flagship')?.textContent = stats.flagship || '—';
  document.getElementById('counter-shipped')?.textContent = stats.shipped || '—';
  document.getElementById('counter-published')?.textContent = stats.published || '—';
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
  // focus: derive topic from roadmap phase items and week index
  let focus='';
  if(state.phase && Array.isArray(state.phase.items)){
    const items=state.phase.items; const idx=(state.currentWeekIndex?state.currentWeekIndex-1:0);
    focus = items[Math.min(idx, items.length-1)] || items[0] || '';
  } else if(roadmap && Array.isArray(roadmap.phases) && state.currentPhaseId){
    const p=roadmap.phases.find(x=>x.id===state.currentPhaseId); if(p && Array.isArray(p.items)) focus=p.items[0];
  }
  if(!focus){ if(state.currentPhase==='Preparation'){ focus='Roadmap begins 1 September 2026'; } else if(state.currentPhase==='Roadmap Complete'){ focus='Roadmap complete'; } }
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
