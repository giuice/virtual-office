// Patch kimi-grid.html: refined-grid paradigm layer over the shared hybrid DNA.
const fs = require('fs');
const p = 'E:/projects/virtual-office/spec-interview/spaces-visualization-redesign/prototypes/kimi-grid.html';
let s = fs.readFileSync(p, 'utf8');
const put = (needle, repl) => {
  if (s.indexOf(needle) === -1) throw new Error('NEEDLE NOT FOUND: ' + needle.slice(0, 70));
  if (s.indexOf(needle) !== s.lastIndexOf(needle)) throw new Error('NEEDLE NOT UNIQUE: ' + needle.slice(0, 70));
  s = s.replace(needle, () => repl);
};

put('<title>Kimi · Hybrid — Virtual Office Floor Plan</title>',
    '<title>Kimi · Grid — Virtual Office Floor Plan</title>');

put('<b>kimi-hybrid</b> · paradigm 1/3 — full grid overview + per-neighborhood zoom. Same dataset &amp; systems as kimi-grid / kimi-people.',
    '<b>kimi-grid</b> · paradigm 2/3 — one continuous adaptive grid: sticky neighborhood headers + quick-nav rail. Same dataset &amp; systems as kimi-hybrid / kimi-people.');

put("'Prototype 1/3 · hybrid — click “Zoom in” on any neighborhood.'",
    "'Prototype 2/3 · refined grid — jump between neighborhoods with the left rail.'");

put('</style>', `
/* ============ GRID PARADIGM: quick-nav rail + sticky hood headers ============ */
main{padding-left:84px}
#rail{position:fixed;left:0;top:56px;bottom:0;width:64px;z-index:50;display:flex;flex-direction:column;align-items:center;gap:9px;padding:14px 0;border-right:1px solid var(--line);background:var(--hdr-bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.rail-btn{position:relative;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:var(--faint);border:1px solid transparent;transition:all var(--t-fast) var(--ease)}
.rail-btn:hover{color:var(--text);background:var(--card2)}
.rail-btn.on{color:var(--rc,var(--cyan));border-color:var(--rc,var(--cyan));background:var(--card2);box-shadow:0 0 16px var(--cyan-soft)}
.rail-btn .bdg{position:absolute;top:-6px;right:-8px;min-width:18px;height:17px;padding:0 4px;border-radius:9px;background:var(--card3);border:1px solid var(--line2);color:var(--muted);font-family:var(--mono);font-size:9px;font-weight:700;display:grid;place-items:center}
.rail-btn.on .bdg{color:var(--rc,var(--cyan));border-color:var(--rc,var(--cyan))}
.hood-sec .hood-head{top:0;z-index:6;background:var(--bg0);border-bottom:1px solid var(--line);padding:8px 2px 10px;margin-bottom:14px;box-shadow:0 14px 20px -16px rgba(0,0,0,.6)}
[data-theme="light"] .hood-sec .hood-head{box-shadow:0 14px 20px -16px rgba(30,42,80,.3)}
@media (max-width:900px){main{padding-left:74px}}
</style>`);

put('<main id="main" tabindex="-1" aria-label="Floor plan"></main>',
    '<main id="main" tabindex="-1" aria-label="Floor plan"></main>\n<nav id="rail" aria-label="Neighborhood quick nav"></nav>');

put('</body>', `<script>
/* ============ GRID PARADIGM (override layer): no zoom — rail nav + sticky headers ============ */
function renderOverview(){
  const hoods=state.hood==='all'?HOODS:HOODS.filter(h=>h.id===state.hood);
  const secs=hoods.map(h=>{
    const spaces=visibleSpaces(h.id);
    if(!spaces.length)return'';
    const occ=spaces.reduce((a,s)=>a+occupants(s.id).length,0);
    const cap=spaces.reduce((a,s)=>a+s.cap,0);
    const collapsed=state.collapsed[h.id];
    return \`<section class="hood-sec" style="--hc:\${h.color}" data-hsec="\${h.id}">
      <div class="hood-head">
        <span class="glyph">\${ico(h.icon)}</span>
        <div><h2>\${h.name}</h2><div class="meta"><b>\${occ}</b> here · <b>\${spaces.length}</b> spaces</div></div>
        <span class="occ"><i style="width:\${Math.min(100,occ/Math.max(cap,1)*100)}%"></i></span>
        <span class="spacer"></span>
        <button class="hood-btn" data-collapse="\${h.id}">\${ico('chev')} \${collapsed?'Expand':'Collapse'}</button>
      </div>
      \${collapsed?'':\`<div class="grid">\${spaces.map(s=>cardHTML(s,false)).join('')}</div>\`}
    </section>\`;
  }).join('');
  main.innerHTML=\`<div class="view">\${secs||emptyStateHTML()}</div>\`;
}
function renderRail(){
  const on=onlineUsers();
  const items=[{id:'all',name:'Whole floor',icon:'grid',color:'var(--cyan)'}].concat(HOODS.map(h=>({id:h.id,name:h.name,icon:h.icon,color:h.color})));
  document.getElementById('rail').innerHTML=items.map(h=>{
    const n=h.id==='all'?on.length:on.filter(u=>{const s=spaceById(u.space);return s&&s.hood===h.id}).length;
    return \`<button class="rail-btn" data-rail="\${h.id}" title="\${h.name}" style="--rc:\${h.color}">\${ico(h.icon)}<span class="bdg">\${n}</span></button>\`;
  }).join('');
  spyUpdate();
}
function spyUpdate(){
  const secs=[...main.querySelectorAll('[data-hsec]')];
  if(!secs.length)return;
  let cur=secs[0].dataset.hsec;
  for(const s of secs){if(s.getBoundingClientRect().top<=150)cur=s.dataset.hsec;}
  document.querySelectorAll('.rail-btn').forEach(b=>b.classList.toggle('on',b.dataset.rail===cur));
}
main.addEventListener('scroll',spyUpdate,{passive:true});
document.getElementById('rail').addEventListener('click',e=>{
  const b=e.target.closest('[data-rail]');if(!b)return;
  const id=b.dataset.rail;
  if(id==='all'){if(state.hood!=='all'){state.hood='all';render();}main.scrollTo({top:0,behavior:'smooth'});return;}
  if(state.hood!=='all'&&state.hood!==id){state.hood='all';render();}
  requestAnimationFrame(()=>{const sec=main.querySelector(\`[data-hsec="\${id}"]\`);
    if(sec&&state.collapsed[id]===undefined||!state.collapsed[id]){const y=sec.offsetTop-8;main.scrollTo({top:y,behavior:'smooth'});}
    else if(sec){state.collapsed[id]=false;render();requestAnimationFrame(()=>{const s2=main.querySelector(\`[data-hsec="\${id}"]\`);if(s2)main.scrollTo({top:s2.offsetTop-8,behavior:'smooth'});});}});
});
const __renderGrid=render;
render=function(){__renderGrid();renderRail();};
render();
</script>
</body>`);

fs.writeFileSync(p, s);
console.log('kimi-grid.html patched OK, bytes:', s.length);
