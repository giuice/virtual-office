// Patch kimi-people.html: people-first paradigm layer over the shared hybrid DNA.
const fs = require('fs');
const p = 'E:/projects/virtual-office/spec-interview/spaces-visualization-redesign/prototypes/kimi-people.html';
let s = fs.readFileSync(p, 'utf8');
const put = (needle, repl) => {
  if (s.indexOf(needle) === -1) throw new Error('NEEDLE NOT FOUND: ' + needle.slice(0, 70));
  if (s.indexOf(needle) !== s.lastIndexOf(needle)) throw new Error('NEEDLE NOT UNIQUE: ' + needle.slice(0, 70));
  s = s.replace(needle, () => repl);
};

put('<title>Kimi · Hybrid — Virtual Office Floor Plan</title>',
    '<title>Kimi · People — Virtual Office Floor Plan</title>');

put('<b>kimi-hybrid</b> · paradigm 1/3 — full grid overview + per-neighborhood zoom. Same dataset &amp; systems as kimi-grid / kimi-people.',
    '<b>kimi-people</b> · paradigm 3/3 — people directory as the primary axis; spaces as a spatial rail. Same dataset &amp; systems as kimi-hybrid / kimi-grid.');

put("'Prototype 1/3 · hybrid — click “Zoom in” on any neighborhood.'",
    "'Prototype 3/3 · people-first — click a person to jump to their space.'");

put('</style>', `
/* ============ PEOPLE PARADIGM: directory + spatial rail ============ */
.layout{display:flex;gap:18px;align-items:flex-start}
.dir{flex:1;min-width:0;max-width:860px}
.floor{width:300px;flex:none;position:sticky;top:18px;max-height:calc(100vh - 56px - 40px);overflow-y:auto;padding:2px 2px 40px}
.floor-title{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;color:var(--faint);margin:2px 0 10px}
.p-row{display:flex;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--line);border-radius:14px;
  background:linear-gradient(180deg,var(--card2),var(--card));margin-bottom:8px;position:relative;cursor:pointer;
  transition:border-color var(--t-fast),transform var(--t-fast) var(--ease),box-shadow var(--t-fast)}
.p-row:hover{border-color:var(--line2);transform:translateX(3px)}
.p-row.is-you{border-color:var(--cyan-line);box-shadow:var(--self-glow);cursor:default}
.p-row.flash,.mini-card.flash{animation:flash 1.6s var(--ease)}
.p-row .av{width:40px;height:40px;margin:0;flex:none}
.p-id{min-width:0;flex:1}
.p-id b{font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p-id small{font-size:11px;color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p-space{display:flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--line);
  color:var(--muted);font-size:11.5px;font-weight:650;flex:none;max-width:168px;transition:all var(--t-fast)}
.p-space:hover{color:var(--cyan-ink);border-color:var(--cyan-line)}
.p-space span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p-space.off{border-style:dashed;color:var(--faint);pointer-events:none}
.p-row .stxt{font-size:10px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;flex:none;width:52px;text-align:right}
.p-row .stxt.online{color:var(--green)}.p-row .stxt.away{color:var(--amber)}.p-row .stxt.busy{color:var(--rose)}.p-row .stxt.offline{color:var(--faint)}
.p-acts{display:flex;gap:6px;flex:none;opacity:0;transition:opacity var(--t-fast)}
.p-row:hover .p-acts,.p-row:focus-within .p-acts{opacity:1}
.space-group{margin-bottom:16px}
.sg-head{display:flex;align-items:center;gap:9px;padding:6px 8px;margin-bottom:6px;cursor:pointer;border-radius:10px;transition:background var(--t-fast)}
.sg-head:hover{background:var(--card2)}
.sg-head .c-ico{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--card3);color:var(--hc,var(--cyan));border:1px solid var(--line);flex:none}
.sg-head b{font-size:13px}
.sg-head .cap{margin-left:2px}
.sg-head .mini-btn{margin-left:auto}
.mini-card{position:relative;border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,var(--card2),var(--card));
  padding:11px 12px;margin-bottom:10px;cursor:pointer;transition:border-color var(--t-fast),transform var(--t-fast) var(--ease)}
.mini-card:hover{border-color:var(--line2);transform:translateY(-1px)}
.mini-card.is-you{border-color:var(--cyan-line);box-shadow:var(--self-glow)}
.mini-card .c-ico{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--card3);color:var(--hc,var(--cyan));border:1px solid var(--line);flex:none}
.mc-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.mini-card .c-name{font-size:12.5px}
.mini-card .sig-chip{margin-bottom:8px}
.mini-card .avs{margin-bottom:8px;min-height:28px}
.mini-card .av{width:28px;height:28px;font-size:9.5px}
.mc-foot .join{height:30px;font-size:11.5px;width:100%}
.rail-hood{margin-bottom:16px}
.rh-name{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:750;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;text-transform:uppercase}
.rh-name .cdot{width:7px;height:7px;border-radius:50%}
[data-density="compact"] .p-row{padding:6px 10px;gap:10px;margin-bottom:6px}
[data-density="compact"] .p-row .av{width:30px;height:30px;font-size:10px}
[data-density="compact"] .p-id small{display:none}
[data-density="compact"] .p-space{height:24px;font-size:10.5px}
[data-density="compact"] .mini-card{padding:8px 10px}
@media (max-width:1100px){.floor{display:none}}
</style>`);

put('</body>', `<script>
/* ============ PEOPLE-FIRST PARADIGM (override layer) ============ */
function personRow(u,isYou){
  const s=spaceById(u.space);
  return \`<div class="p-row \${isYou?'is-you':''}" data-uid="\${u.id}" tabindex="0" role="button" aria-label="\${u.name}, \${u.role}, \${u.status}">
    \${avHTML(u)}
    <div class="p-id"><b>\${u.name}\${isYou?' <span class="you-tag" style="position:static;margin-left:6px">YOU</span>':''}</b><small>\${u.role}</small></div>
    \${s?\`<button class="p-space" data-space-link="\${s.id}" title="Open \${s.name}">\${ico(TYPE_ICON[s.type])}<span>\${s.name}</span></button>\`:\`<span class="p-space off">offline</span>\`}
    <span class="stxt \${u.status}">\${u.status}</span>
    <span class="p-acts">
      <button class="mini-btn" data-act="msg" data-uid="\${u.id}" title="Message \${u.name}">\${ico('msg')} Message</button>
      \${!isYou&&s&&YOU.space!==s.id?\`<button class="mini-btn ghost" data-act="join" data-sid="\${s.id}" title="Join \${u.name} in \${s.name}">\${ico('door')} Join</button>\`:''}
    </span>
  </div>\`;
}
function sgHead(h,s){
  const ppl=occupants(s.id),full=isFull(s),knocking=state.knocking[s.id];
  let btn;
  if(YOU.space===s.id) btn=\`<button class="mini-btn ghost" data-act="open" data-sid="\${s.id}">Open</button>\`;
  else if(knocking) btn=\`<button class="mini-btn ghost" disabled>Knocking…</button>\`;
  else if(s.locked||full) btn=\`<button class="mini-btn ghost" data-act="knock" data-sid="\${s.id}">Knock</button>\`;
  else btn=\`<button class="mini-btn" data-act="join" data-sid="\${s.id}">Join</button>\`;
  return \`<div class="sg-head" data-sgid="\${s.id}">
    <span class="c-ico">\${ico(TYPE_ICON[s.type])}</span>
    <b>\${s.name}</b>\${s.locked?\`<span class="lock-tag">\${ico('lock')}PRIVATE</span>\`:''}
    <span class="cap \${full?'full':''}">\${full?'FULL':ppl.length+'/'+s.cap}</span>
    \${btn}
  </div>\`;
}
function renderPeople(){
  const q=state.q.trim().toLowerCase();
  const matchU=u=>!q||u.name.toLowerCase().includes(q)||u.role.toLowerCase().includes(q);
  const hoods=(state.hood==='all'?HOODS:HOODS.filter(h=>h.id===state.hood));
  const youSec=\`<section class="hood-sec" style="--hc:var(--cyan)">
    <div class="hood-head"><span class="glyph" style="color:var(--cyan)">\${ico('locate')}</span>
    <div><h2>You</h2><div class="meta">your spot on the floor</div></div></div>
    \${personRow(YOU,true)}
  </section>\`;
  let sections='';
  if(!state.emptyOffice){
    sections=hoods.map(h=>{
      const spaces=SPACES.filter(s=>s.hood===h.id);
      const groups=spaces.map(s=>{
        const ppl=occupants(s.id).filter(u=>u.id!=='you'&&matchU);
        if(!ppl.length)return'';
        return \`<div class="space-group" style="--hc:\${h.color}">\${sgHead(h,s)}\${ppl.map(u=>personRow(u,false)).join('')}</div>\`;
      }).join('');
      if(!groups)return'';
      const total=spaces.reduce((a,s)=>a+occupants(s.id).length,0);
      return \`<section class="hood-sec" style="--hc:\${h.color}">
        <div class="hood-head"><span class="glyph">\${ico(h.icon)}</span>
        <div><h2>\${h.name}</h2><div class="meta"><b>\${total}</b> people · <b>\${spaces.length}</b> spaces</div></div></div>
        \${groups}</section>\`;
    }).join('');
    const off=USERS.filter(u=>u.status==='offline'&&matchU);
    if(off.length){
      sections+=\`<section class="hood-sec" style="--hc:var(--faint)">
        <div class="hood-head"><span class="glyph" style="color:var(--faint)">\${ico('users')}</span>
        <div><h2>Offline</h2><div class="meta"><b>\${off.length}</b> away from the office</div></div></div>
        \${off.map(u=>personRow(u,false)).join('')}</section>\`;
    }
  }
  const dirBody=state.emptyOffice
    ?\`<div class="no-results"><div class="big">🌙</div><b>The office is quiet</b>You're the first one in. Pick any space on the floor — it's all yours.</div>\`
    :(sections||\`<div class="no-results"><div class="big">🔍</div><b>No people match “\${esc(state.q)}”</b>Try another name or role.</div>\`);
  main.innerHTML=\`<div class="view layout">
    <div class="dir">\${youSec}\${dirBody}</div>
    <aside class="floor" aria-label="The floor — spatial context"><div class="floor-title">THE FLOOR · SPATIAL CONTEXT</div>\${renderRailCards()}</aside>
  </div>\`;
}
function renderRailCards(){
  const hoods=(state.hood==='all'?HOODS:HOODS.filter(h=>h.id===state.hood));
  return hoods.map(h=>{
    const spaces=SPACES.filter(s=>s.hood===h.id);
    return \`<div class="rail-hood" style="--hc:\${h.color}">
      <div class="rh-name"><span class="cdot" style="background:\${h.color}"></span>\${h.name}</div>
      \${spaces.map(s=>{
        const occ=occupants(s.id),full=isFull(s),vibe=vibeOf(s),youHere=occ.some(u=>u.id==='you'),knocking=state.knocking[s.id];
        let act;
        if(youHere)act=\`<button class="join inside" data-act="open" data-sid="\${s.id}">You're here</button>\`;
        else if(knocking)act=\`<button class="join knock" disabled><span class="spin"></span>Knocking…</button>\`;
        else if(s.locked)act=\`<button class="join knock" data-act="knock" data-sid="\${s.id}">Knock to enter</button>\`;
        else if(full)act=\`<button class="join knock" data-act="knock" data-sid="\${s.id}">Full · Knock</button>\`;
        else act=\`<button class="join" data-act="join" data-sid="\${s.id}">Join</button>\`;
        return \`<div class="mini-card \${youHere?'is-you':''}" data-space="\${s.id}" tabindex="0" style="--hc:\${h.color}">
          \${youHere?'<span class="you-tag">YOU</span>':''}
          <div class="mc-top"><span class="c-ico">\${ico(TYPE_ICON[s.type])}</span>
            <div style="min-width:0;flex:1"><div class="c-name"><span class="sig-dot \${vibe}"></span><span class="nm">\${s.name}</span>\${s.locked?\`<span class="lock-tag">\${ico('lock')}</span>\`:''}</div></div>
            <span class="cap \${full?'full':''}">\${full?'FULL':occ.length+'/'+s.cap}</span></div>
          <span class="sig-chip \${vibe}"><span class="d"></span>\${VIBE_TXT[vibe]}</span>
          <div class="avs">\${avatarsHTML(s,4)}</div>
          <div class="mc-foot">\${act}</div>
        </div>\`;
      }).join('')}
    </div>\`;
  }).join('');
}
renderSkeletons=function(){
  main.innerHTML=\`<div class="view layout"><div class="dir">\${Array.from({length:7},()=>\`<div class="sk" style="height:60px;border-radius:14px;margin-bottom:8px"></div>\`).join('')}</div>
  <aside class="floor"><div class="sk" style="height:120px;border-radius:14px;margin-bottom:10px"></div><div class="sk" style="height:120px;border-radius:14px"></div></aside></div>\`;
};
render=function(){
  renderHeader();renderYouChip();
  if(state.skeleton){renderSkeletons();return;}
  closePop();
  renderPeople();
  hydrateIcons();
};
joinSpace=function(sid){
  const s=spaceById(sid);
  if(!s||isFull(s)&&YOU.space!==sid)return;
  if(YOU.space===sid)return;
  YOU.space=sid;
  toast('ok',\`You joined \${s.name}\`,TYPE_LABEL[s.type]+' · '+hoodById(s.hood).name);
  addEvent(sid,'<b>You</b> joined');
  render();
  requestAnimationFrame(()=>{
    const card=main.querySelector(\`.mini-card[data-space="\${sid}"]\`);
    if(card){card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');}
  });
  const chip=document.getElementById('you-chip');
  chip.classList.remove('attn');void chip.offsetWidth;chip.classList.add('attn');
};
locateYou=function(){
  const row=main.querySelector('.p-row[data-uid="you"]');
  if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.remove('flash');void row.offsetWidth;row.classList.add('flash');}
  const s=spaceById(YOU.space);
  if(s){const card=main.querySelector(\`.mini-card[data-space="\${s.id}"]\`);
    if(card){card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');}}
};
main.addEventListener('click',e=>{
  const act=e.target.closest('[data-act]');
  if(act){e.stopPropagation();const a=act.dataset.act,sid=act.dataset.sid,uid=act.dataset.uid;
    if(a==='join')joinSpace(sid);
    else if(a==='knock')knock(sid);
    else if(a==='open')openDetail(sid);
    else if(a==='msg'){const u=userById(uid);if(u)openChat(u);}
    return;}
  const sl=e.target.closest('[data-space-link]');
  if(sl){e.stopPropagation();openDetail(sl.dataset.spaceLink);return;}
  const sg=e.target.closest('.sg-head');
  if(sg){openDetail(sg.dataset.sgid);return;}
  const mc=e.target.closest('.mini-card');
  if(mc){const av=e.target.closest('.av[data-uid]');
    if(av){openPop(av.dataset.uid,av);return;}
    openDetail(mc.dataset.space);return;}
  const row=e.target.closest('.p-row');
  if(row){e.stopPropagation();const u=userById(row.dataset.uid);if(!u)return;
    if(u.space){const card=main.querySelector(\`.mini-card[data-space="\${u.space}"]\`);
      if(card){card.scrollIntoView({behavior:'smooth',block:'nearest'});card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');}}
    openPop(u.id,row);}
});
main.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.classList&&e.target.classList.contains('p-row')){e.target.click();}
  if(e.key==='Enter'&&e.target.classList&&e.target.classList.contains('mini-card')){openDetail(e.target.dataset.space);}
});
render();
</script>
</body>`);

fs.writeFileSync(p, s);
console.log('kimi-people.html patched OK, bytes:', s.length);
