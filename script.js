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

// ---------- getNextSession helper ----------
function getNextSession(now, roadmapState, roadmap){
  // Returns the next scheduled session object in the form:
  // { date, day, type, topic, artifact, weekId }
  if(!roadmap || !Array.isArray(roadmap.phases)) return null;
  const nowTime = now.getTime();
  const roadmapStart = roadmap.start ? new Date(roadmap.start + 'T00:00:00').getTime() : null;
  const roadmapEnd = roadmap.end ? new Date(roadmap.end + 'T23:59:59').getTime() : null;

  if(roadmapStart && nowTime < roadmapStart){
    const firstPhase = roadmap.phases[0];
    if(!firstPhase || !Array.isArray(firstPhase.weeks) || firstPhase.weeks.length===0) return null;
    const firstWeek = firstPhase.weeks[0];
    const firstSession = Array.isArray(firstWeek.sessions) && firstWeek.sessions.length ? firstWeek.sessions[0] : null;
    if(firstSession) return { date:firstSession.date, day:firstSession.day, type:firstSession.type, topic:firstSession.topic, artifact:firstSession.artifact, weekId:firstWeek.id };
    return null;
  }

  if(roadmapEnd && nowTime > roadmapEnd) return null;

  // Flatten weeks with ordering
  const flat = [];
  roadmap.phases.forEach((phase, pIndex)=>{
    if(!phase || !Array.isArray(phase.weeks)) return;
    phase.weeks.forEach((wk, wIndex)=>{
      if(!wk || !wk.start) return;
      const wStart = new Date(wk.start + 'T00:00:00').getTime();
      flat.push({ phase, phaseIndex:pIndex, week:wk, weekIndex:wIndex, wStart });
    });
  });
  flat.sort((a,b)=>a.wStart - b.wStart);

  // Determine active week index: prefer roadmapState.currentWeek if available
  let activeIdx = -1;
  if(roadmapState && roadmapState.currentWeek && roadmapState.currentWeek.id){
    activeIdx = flat.findIndex(f=>f.week.id === roadmapState.currentWeek.id);
  }
  if(activeIdx === -1){
    const explicit = findActiveWeek(now, roadmap);
    if(explicit && explicit.week && explicit.phase){
      activeIdx = flat.findIndex(f=>f.week.id === explicit.week.id && f.phaseIndex === explicit.phaseIndex);
    }
  }
  if(activeIdx === -1){
    activeIdx = flat.findIndex(f=>{
      if(!f.week || !f.week.end) return false;
      const wEnd = new Date(f.week.end + 'T23:59:59').getTime();
      return wEnd >= nowTime;
    });
  }
  if(activeIdx === -1) return null;

  for(let i=activeIdx;i<flat.length;i++){
    const wk = flat[i].week;
    if(!wk || !Array.isArray(wk.sessions) || wk.sessions.length===0) continue;
    const sessions = wk.sessions.slice().sort((a,b)=> new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime());
    for(const s of sessions){
      const sEnd = new Date(s.date + 'T23:59:59').getTime();
      if(sEnd >= nowTime){
        return { date:s.date, day:s.day, type:s.type, topic:s.topic, artifact:s.artifact, weekId:wk.id };
      }
    }
  }

  return null;
}

// ---------- Helper: filter evidence scoped to a week ----------
function filterEvidenceForWeek(evidence, week){
  if(!Array.isArray(evidence) || !week || !week.start || !week.end) return [];
  const startTs = new Date(week.start + 'T00:00:00').getTime();
  const endTs = new Date(week.end + 'T23:59:59').getTime();
  return evidence.filter(it=>{
    if(!it || !it.date) return false;
    const d = new Date(it.date + 'T00:00:00').getTime();
    return d >= startTs && d <= endTs;
  });
}

// ---------- Roadmap state calculator ----------
function calculateRoadmapState(now, roadmap){
  // default bounds and state shape
  const state={pctComplete:0,daysLeft:null,currentPhase:'Preparation',currentPhaseId:null,currentWeek:null,currentWeekIndex:null,totalWeeks:0,phaseProgressPct:0,phase:null,currentFocus:undefined};
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
    state.currentWeek = wk; // full week object
    state.currentFocus = wk.focus || (Array.isArray(wk.topic) ? wk.topic[0] : undefined);
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
          let found=null;const nowTime=now.getTime();
          for(let wIndex=0; wIndex<phase.weeks.length; wIndex++){
            const wk = phase.weeks[wIndex]; if(!wk || !wk.start || !wk.end) continue;
            const wStart = new Date(wk.start+'T00:00:00').getTime(); const wEnd = new Date(wk.end+'T23:59:59').getTime();
            if(nowTime >= wStart && nowTime <= wEnd){ found = wk; state.currentWeek = wk; state.currentWeekIndex = wk.week_number || (wIndex+1); state.currentFocus = wk.focus || (Array.isArray(wk.topic)?wk.topic[0]:undefined); break; }
          }
          if(!found){ // approximate
            const daysInto=Math.floor((now-ps)/(1000*60*60*24));
            const weekIndex=Math.min(state.totalWeeks, Math.floor(daysInto/7)+1);
            state.currentWeekIndex=weekIndex;
            const derived = phase.weeks[weekIndex-1] || null; state.currentWeek = derived;
            state.currentFocus = derived ? (derived.focus || (Array.isArray(derived.topic)?derived.topic[0]:undefined)) : undefined;
          }
        } else {
          const daysInto=Math.floor((now-ps)/(1000*60*60*24));
          const weekIndex=Math.min(state.totalWeeks, Math.floor(daysInto/7)+1);
          state.currentWeekIndex=weekIndex;
          state.currentWeek = null;
        }
        const phasePct=Math.round(((now-ps)/(pe-ps))*100);
        state.phaseProgressPct=Math.max(0,Math.min(100,phasePct));
        break;
      }
    }
  }

  if(now > roadmapEnd){ state.pctComplete=100; state.currentPhase='Roadmap Complete'; state.currentWeekIndex=null; state.currentWeek=null }
  return state;
}

// ---------- Evidence statistics ----------
function calculateEvidenceStats(evidence){
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

// helper: format session label/date
function formatSessionSummary(session, now){
  if(!session) return {label:'No next session.', line1:'No next session.'};
  const sDate = new Date(session.date + 'T00:00:00');
  const sameDay = sDate.toDateString() === now.toDateString();
  const when = sameDay ? 'TODAY' : 'NEXT';
  const dayPart = session.day || (sDate.toLocaleDateString(undefined,{weekday:'long'}));
  const shortDate = sDate.toLocaleDateString(undefined,{day:'numeric',month:'short'});
  const line1 = `${when} · ${dayPart} · ${shortDate}`;
  return { label: when, line1 };
}

function ensureThisWeekCard(){
  // find existing card container (do not replace). Try common IDs then create minimal container in DOM if none.
  let card = document.getElementById('this-week-card');
  const host = document.getElementById('command-centre') || document.getElementById('dashboard') || document.body;
  if(!card){
    card = document.createElement('section'); card.id = 'this-week-card'; card.className = 'card this-week';
    host.insertBefore(card, host.firstChild);
  }
  return card;
}

function renderThisWeekCard(state, roadmap, evidence, nextSession){
  const now = new Date();
  const container = ensureThisWeekCard();
  container.innerHTML='';
  // Build header elements
  const header = document.createElement('div'); header.className='this-week-header';
  const weekEl = document.createElement('h4');
  const phaseEl = document.createElement('h5');
  const focusEl = document.createElement('div'); focusEl.className='this-week-focus';

  // Determine display values for three main states
  const roadmapStart = roadmap && roadmap.start ? new Date(roadmap.start+'T00:00:00').getTime() : null;
  const roadmapEnd = roadmap && roadmap.end ? new Date(roadmap.end+'T23:59:59').getTime() : null;

  if(roadmapStart && now.getTime() < roadmapStart){
    // Before roadmap start: UP NEXT / Preparation
    weekEl.textContent = 'UP NEXT';
    phaseEl.textContent = 'Preparation';
    // focus: use first week's first session topic if available
    const firstPhase = roadmap.phases && roadmap.phases[0];
    let focusText = state.currentFocus || '';
    if(firstPhase && Array.isArray(firstPhase.weeks) && firstPhase.weeks.length){
      const fw = firstPhase.weeks[0];
      focusText = focusText || (Array.isArray(fw.sessions) && fw.sessions[0] && fw.sessions[0].topic) || (fw.focus || (Array.isArray(fw.topic)?fw.topic[0]:''));
    }
    focusEl.textContent = focusText || '';
  } else if(roadmapEnd && now.getTime() > roadmapEnd){
    // After roadmap end: COMPLETE
    weekEl.textContent = 'COMPLETE';
    phaseEl.textContent = 'Roadmap Complete';
    // focus: use last phase label or last week's focus
    const lastPhase = roadmap.phases && roadmap.phases[roadmap.phases.length-1];
    focusEl.textContent = (lastPhase && lastPhase.label) || '';
  } else {
    // During roadmap
    weekEl.textContent = state.currentWeekIndex ? `Week ${state.currentWeekIndex}` : 'This Week';
    phaseEl.textContent = state.currentPhase || '';
    focusEl.textContent = state.currentFocus || (state.phase && Array.isArray(state.phase.items) ? state.phase.items[Math.max(0,(state.currentWeekIndex||1)-1)] : '');
  }

  header.appendChild(weekEl); header.appendChild(phaseEl); header.appendChild(focusEl);

  // Next session block
  const nextBlock = document.createElement('div'); nextBlock.className='this-week-next';
  const sessSummary = formatSessionSummary(nextSession, now);
  const nextLabel = document.createElement('div'); nextLabel.className='next-label'; nextLabel.textContent = sessSummary.label;
  const nextLine = document.createElement('div'); nextLine.className='next-line1'; nextLine.textContent = nextSession ? sessSummary.line1 : 'No next session.';
  const topicLine = document.createElement('div'); topicLine.className='next-topic'; topicLine.textContent = nextSession && nextSession.topic ? nextSession.topic : (nextSession ? '' : 'No next session.');
  const expectedLine = document.createElement('div'); expectedLine.className='next-expected'; expectedLine.textContent = nextSession && nextSession.artifact ? `Expected evidence → ${nextSession.artifact}` : ( (now.getTime() > (roadmapEnd||Infinity)) ? 'No next session.' : 'Expected evidence → —' );

  nextBlock.appendChild(nextLabel); nextBlock.appendChild(nextLine); nextBlock.appendChild(topicLine); nextBlock.appendChild(expectedLine);

  // Accessibility: announce changes politely
  nextBlock.setAttribute('role','region'); nextBlock.setAttribute('aria-live','polite'); nextBlock.setAttribute('aria-label','Next session');

  container.appendChild(header); container.appendChild(nextBlock);
}

function renderCounters(stats){
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

function renderDashboard(state, stats, latest, roadmap, evidence, nextSession){
  const now = new Date();
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

  // status must be evidence-driven and scoped to current week only
  const statusEl=document.getElementById('dashboard-status');
  if(state.currentPhase==='Preparation'){ statusEl && (statusEl.textContent='PREPARING'); }
  else if(state.currentPhase==='Roadmap Complete'){ statusEl && (statusEl.textContent='COMPLETE'); }
  else {
    // derive status from evidence items that fall within currentWeek only
    let weekEvidence = [];
    if(Array.isArray(evidence) && state.currentWeek){
      weekEvidence = filterEvidenceForWeek(evidence, state.currentWeek);
    }
    let status='LEARNING';
    if(Array.isArray(weekEvidence) && weekEvidence.length>0){
      const statuses = weekEvidence.map(x=> (x.status||'').toUpperCase());
      if(statuses.includes('BUILDING')) status='BUILDING';
      else if(statuses.includes('SHIPPED')) status='SHIPPED';
      else if(statuses.includes('PUBLISHED')) status='PUBLISHED';
      else status='LEARNING';
    } else {
      status='LEARNING';
    }
    statusEl && (statusEl.textContent = status);
  }

  // counters and latest
  renderCounters(stats);
  renderLatest(latest);

  // render this-week card (extended) and next session summary
  renderThisWeekCard(state, roadmap, evidence, nextSession);
}

// ---------- Main orchestrator ----------
async function initDashboard(){
  const {roadmap,evidence,glossary} = await loadData();
  const now = new Date();
  const state = calculateRoadmapState(now, roadmap);
  const stats = calculateEvidenceStats(evidence);
  const latest = getLatestEvidence(Array.isArray(evidence)?evidence:[],5);
  const next = getNextSession(now, state, roadmap);
  renderDashboard(state, stats, latest, roadmap, evidence, next);
}

// Kick off
initDashboard().catch(err=>{console.error('Dashboard init failed',err);});

// keep keyboard-accessible reveals observed
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
