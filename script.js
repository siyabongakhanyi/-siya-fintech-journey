const toggle=document.querySelector('.nav-toggle');const nav=document.querySelector('.nav');
toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});
document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.08});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

const filters=document.querySelectorAll('.filter');const cards=document.querySelectorAll('.evidence-card');
filters.forEach(btn=>btn.addEventListener('click',()=>{filters.forEach(b=>b.classList.remove('active'));btn.classList.add('active');const f=btn.dataset.filter;cards.forEach(card=>{const tags=card.dataset.tags||'';card.classList.toggle('hidden',f!=='all'&&!tags.includes(f));});}));

const start=new Date('2026-09-01T00:00:00+02:00');const end=new Date('2026-12-31T23:59:59+02:00');const now=new Date();
const days=Math.max(0,Math.ceil((end-now)/(1000*60*60*24)));const daysEl=document.getElementById('daysLeft');if(daysEl)daysEl.textContent=now>end?'0':days;
const progressBar=document.getElementById('progressBar');const progressLabel=document.getElementById('progressLabel');
let pct=0;if(now<start){pct=0;progressLabel.textContent='Begins 01 Sep 2026'}else if(now>end){pct=100;progressLabel.textContent='Roadmap complete'}else{pct=Math.round(((now-start)/(end-start))*100);progressLabel.textContent=`${pct}% of Sep–Dec runway elapsed`}
if(progressBar)setTimeout(()=>progressBar.style.width=pct+'%',400);

const monthMap={8:'sep',9:'oct',10:'nov',11:'dec'};const key=monthMap[now.getMonth()];if(now.getFullYear()===2026&&key){document.querySelector(`[data-month="${key}"]`)?.classList.add('active-month')}
