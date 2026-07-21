(function () {
  const data = window.SOL_DATA;
  const root = document.documentElement;
  const paradigm = document.body.dataset.paradigm;
  const state = {
    theme: "dark",
    density: "comfortable",
    neighborhood: "all",
    zoom: "studio",
    query: "",
    selectedSpaceId: null,
    scenario: "live",
    stale: false,
    incomingKnock: false,
    mutedSpaces: new Set(),
    toasts: []
  };

  const icons = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    message: '<svg viewBox="0 0 24 24"><path d="M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z"/></svg>'
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function initials(name) {
    return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
  }

  function personById(id) { return data.people.find((person) => person.id === id); }
  function spaceById(id) { return data.spaces.find((space) => space.id === id); }
  function neighborhoodById(id) { return data.neighborhoods.find((neighborhood) => neighborhood.id === id); }
  function currentSpace() { return data.spaces.find((space) => space.members.includes(data.currentUserId)); }

  function getSpaces() {
    const query = state.query.trim().toLowerCase();
    return data.spaces.filter((space) => {
      const matchesNeighborhood = state.neighborhood === "all" || space.neighborhood === state.neighborhood;
      const peopleText = space.members.map((id) => personById(id).name).join(" ").toLowerCase();
      const neighborhood = neighborhoodById(space.neighborhood).name.toLowerCase();
      const matchesQuery = !query || `${space.name} ${space.type} ${space.activity} ${neighborhood} ${peopleText}`.toLowerCase().includes(query);
      return matchesNeighborhood && matchesQuery;
    });
  }

  function getMembers(space) {
    let members = space.members;
    if (state.scenario === "empty") members = members.filter((id) => id === data.currentUserId);
    return members.map(personById);
  }

  function avatar(person, sizeClass = "", interactive = true) {
    const photo = person.photo ? `<img src="${person.photo}" alt="" loading="lazy" onerror="this.remove()">` : "";
    const interaction = interactive ? `data-avatar="${person.id}" title="Message ${escapeHtml(person.name)}"` : "";
    const tag = interactive ? "button" : "span";
    return `<${tag} class="avatar ${sizeClass}" style="--avatar-a:${person.colors[0]};--avatar-b:${person.colors[1]}" ${interaction} ${interactive ? `aria-label="Message ${escapeHtml(person.name)}"` : ""}>
      <span>${initials(person.name)}</span>${photo}<i class="status ${person.status}"></i>
    </${tag}>`;
  }

  function signalColor(signal) {
    if (signal === "full") return "var(--danger)";
    if (signal === "locked") return "var(--violet)";
    if (signal === "live") return "var(--green)";
    if (signal === "social") return "var(--pink)";
    return "var(--cyan)";
  }

  function spaceCard(space, options = {}) {
    const members = getMembers(space);
    const neighborhood = neighborhoodById(space.neighborhood);
    const own = space.members.includes(data.currentUserId);
    const full = members.length >= space.capacity;
    const locked = space.signal === "locked";
    const maxAvatars = state.density === "compact" ? 4 : (options.large ? 7 : 5);
    const visible = members.slice(0, maxAvatars);
    const overflow = Math.max(0, members.length - visible.length);
    const peopleMarkup = visible.length
      ? visible.map((person) => avatar(person)).join("") + (overflow ? `<button class="avatar more" data-space-open="${space.id}" aria-label="Show ${overflow} more people">+${overflow}</button>` : "")
      : `<div class="empty-presence"><span class="empty-orb">+</span><span>Open and ready<br><b>Start something</b></span></div>`;
    let action = `<button class="primary-action" data-join="${space.id}">Join</button>`;
    if (own) action = `<button class="primary-action" disabled>You're here</button>`;
    else if (locked) action = `<button class="primary-action knock" data-knock="${space.id}">Knock</button>`;
    else if (full) action = `<button class="primary-action" disabled>Full</button>`;
    const audio = space.audio ? `<button class="audio-pill" data-audio-space="${space.id}" title="Toggle room audio">${state.mutedSpaces.has(space.id) ? "Audio off" : "◖))"}</button>` : "";
    return `<article class="space-card ${own ? "is-you" : ""} signal-${space.signal}" style="--room-color:${neighborhood.color};--signal:${signalColor(space.signal)}" data-space-open="${space.id}" id="space-${space.id}" tabindex="0">
      <div class="card-top"><div><div class="room-kicker">${escapeHtml(neighborhood.name)} · ${escapeHtml(space.type.replaceAll("_", " "))}</div><h3 class="room-title">${escapeHtml(space.name)}</h3></div><span class="room-signal">${escapeHtml(space.signal)}</span></div>
      <div class="activity">${escapeHtml(space.activity)}${space.audio ? "<small>· Audio open</small>" : ""}</div>
      <div class="presence">${peopleMarkup}</div>
      <div class="card-footer"><span class="capacity"><b>${members.length}</b> / ${space.capacity} people</span>${audio}${action}</div>
    </article>`;
  }

  function pageHead(title, copy) {
    return `<div class="page-head"><div><div class="eyebrow">${paradigm.replaceAll("-", " ")} · Live floor</div><h1>${title}</h1><p>${copy}</p></div><div class="legend"><span><i class="dot live"></i>Available</span><span><i class="dot busy"></i>Busy</span><span><i class="dot away"></i>Away</span></div></div>`;
  }

  function header() {
    const onlineCount = state.scenario === "empty" ? 1 : data.spaces.reduce((sum, space) => sum + space.members.length, 0);
    const activeCount = state.scenario === "empty" ? 1 : data.spaces.filter((space) => space.members.length).length;
    const filterButtons = [`<button class="chip ${state.neighborhood === "all" ? "active" : ""}" data-filter="all">All</button>`]
      .concat(data.neighborhoods.map((neighborhood) => `<button class="chip ${state.neighborhood === neighborhood.id ? "active" : ""}" data-filter="${neighborhood.id}">${neighborhood.code}</button>`)).join("");
    return `<header class="nowboard">
      <div class="brand"><div class="brand-mark">V</div><div class="brand-copy"><strong>VIRTUAL OFFICE</strong><span>Nowboard</span></div></div>
      <div class="live-metrics"><span class="metric live"><b>● ${onlineCount}</b> online</span><span class="metric"><b>${activeCount}</b> active spaces</span><span class="metric"><b>${data.spaces.filter((space) => space.audio).length}</b> on audio</span></div>
      <div class="now-controls"><div class="filter-row" aria-label="Neighborhood filter">${filterButtons}</div>
        <label class="search-wrap">${icons.search}<input class="search-input" value="${escapeHtml(state.query)}" placeholder="Find a person or space" aria-label="Find a person or space"></label>
        <div class="segmented" aria-label="Density"><button class="seg-btn ${state.density === "comfortable" ? "active" : ""}" data-density="comfortable">Roomy</button><button class="seg-btn ${state.density === "compact" ? "active" : ""}" data-density="compact">Compact</button></div>
        <select class="scenario-select" aria-label="Preview state"><option value="live" ${state.scenario === "live" ? "selected" : ""}>Live</option><option value="stale" ${state.scenario === "stale" ? "selected" : ""}>Stale</option><option value="empty" ${state.scenario === "empty" ? "selected" : ""}>Empty</option><option value="loading" ${state.scenario === "loading" ? "selected" : ""}>Loading</option></select>
        <button class="icon-btn demo-knock" aria-label="Preview incoming knock" title="Preview incoming knock">${icons.bell}</button>
        <button class="icon-btn theme-toggle" aria-label="Toggle theme" title="Toggle theme">${icons.sun}</button>
      </div>
    </header>`;
  }

  function selfChip() {
    const space = currentSpace();
    return `<button class="self-chip" aria-label="Go to your current space"><span class="self-pulse">MC</span><span><small>You are here</small><b>${escapeHtml(space.name)}</b></span></button>`;
  }

  function knockCard() {
    if (!state.incomingKnock) return "";
    return `<aside class="knock-card" role="alert"><div class="knock-head"><div class="knock-icon">⌁</div><div><h3>Noor is at the door</h3><p>Wants to join you in ${escapeHtml(currentSpace().name)}</p></div></div><div class="knock-actions"><button class="deny">Not now</button><button class="approve">Let Noor in</button></div></aside>`;
  }

  function drawer() {
    if (!state.selectedSpaceId) return "";
    const space = spaceById(state.selectedSpaceId);
    const members = getMembers(space);
    const neighborhood = neighborhoodById(space.neighborhood);
    const roster = members.length ? members.map((person) => `<div class="roster-person">${avatar(person, "", false)}<span><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.role)} · ${person.status}</small></span><button data-avatar="${person.id}" aria-label="Message ${escapeHtml(person.name)}">${icons.message}</button></div>`).join("") : `<div class="empty-presence"><span class="empty-orb">+</span><span>No one is here yet.</span></div>`;
    const events = data.activity.map((event) => `<div class="event"><b>${escapeHtml(event.text)}</b>${event.time} ago</div>`).join("");
    const wave = [10,18,25,14,22,9,28,18,12,23,16,8].map((height) => `<i style="--h:${height}px"></i>`).join("");
    return `<div class="drawer-backdrop"></div><aside class="detail-drawer" aria-label="Space details"><div class="drawer-top"><span class="eyebrow">Space detail</span><button class="drawer-close" aria-label="Close">${icons.close}</button></div>
      <div class="drawer-hero" style="border-color:${neighborhood.color}55"><div class="room-kicker">${escapeHtml(neighborhood.name)} · ${escapeHtml(space.type.replaceAll("_", " "))}</div><h2>${escapeHtml(space.name)}</h2><p>${escapeHtml(space.activity)} · ${members.length}/${space.capacity} people</p></div>
      <div class="drawer-section"><div class="section-label">Room audio</div><div class="audio-panel"><button class="audio-pill" data-audio-space="${space.id}">${state.mutedSpaces.has(space.id) ? "Unmute" : "Mute"}</button><div class="audio-wave">${wave}</div><span>${space.audio ? "Live" : "Closed"}</span></div></div>
      <div class="drawer-section"><div class="section-label">Everyone here · ${members.length}</div><div class="roster">${roster}</div></div>
      <div class="drawer-section"><div class="section-label">Recent room events</div>${events}</div>
    </aside>`;
  }

  function toastStack() {
    return `<div class="toast-stack" aria-live="polite">${state.toasts.map((toast) => `<div class="toast">${escapeHtml(toast)}</div>`).join("")}</div>`;
  }

  function renderMain() {
    if (state.scenario === "loading") return `<main class="page">${pageHead("The office is waking up", "Presence will appear without shifting the layout.")}<div class="skeleton-grid">${Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join("")}</div></main>`;
    const context = { state, data, spaces: getSpaces(), getMembers, personById, spaceById, neighborhoodById, avatar, spaceCard, pageHead, escapeHtml };
    return window.renderSolPrototype(context);
  }

  function bindRenderedInteractions() {
    const bindAll = (selector, handler) => document.querySelectorAll(selector).forEach((element) => element.addEventListener("click", (event) => { event.stopPropagation(); handler(event, element); }));
    bindAll(".theme-toggle", () => { state.theme = state.theme === "dark" ? "light" : "dark"; render(); });
    bindAll(".demo-knock", () => { state.incomingKnock = true; render(); });
    bindAll(".approve", () => { state.incomingKnock = false; addToast("Noor was admitted · Door is open"); });
    bindAll(".deny", () => { state.incomingKnock = false; addToast("Noor was notified · Request declined"); });
    bindAll("[data-filter]", (_, element) => { state.neighborhood = element.dataset.filter; state.query = ""; render(); });
    bindAll("[data-density]", (_, element) => { state.density = element.dataset.density; render(); });
    bindAll("[data-neighborhood-zoom]", (_, element) => { state.zoom = element.dataset.neighborhoodZoom; state.neighborhood = "all"; render(); });
    bindAll("[data-avatar]", (_, element) => { const person = personById(element.dataset.avatar); addToast(`Message ${person.name} · Conversation opened`); });
    bindAll("[data-join]", (_, element) => moveCurrentUser(element.dataset.join));
    bindAll("[data-join-person]", (_, element) => moveCurrentUser(element.dataset.joinPerson));
    bindAll("[data-knock]", (_, element) => addToast(`Knock sent to ${spaceById(element.dataset.knock).name}`));
    bindAll("[data-audio-space]", (_, element) => { const id = element.dataset.audioSpace; state.mutedSpaces.has(id) ? state.mutedSpaces.delete(id) : state.mutedSpaces.add(id); render(); });
    bindAll(".drawer-close, .drawer-backdrop", () => { state.selectedSpaceId = null; render(); });
    bindAll(".self-chip", () => {
      const location = currentSpace();
      const anchor = document.getElementById(`space-${location.id}`) || document.querySelector(".person-card.is-self") || document.querySelector(`[data-space-open="${location.id}"]`);
      anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!anchor?.hasAttribute("tabindex")) anchor?.setAttribute("tabindex", "-1");
      anchor?.focus({ preventScroll: true });
    });
    bindAll("[data-space-open]", (_, element) => { state.selectedSpaceId = element.dataset.spaceOpen; render(); });
    document.querySelector(".search-input")?.addEventListener("input", (event) => { event.stopPropagation(); state.query = event.target.value; render(); });
    document.querySelector(".scenario-select")?.addEventListener("change", (event) => {
      event.stopPropagation(); state.scenario = event.target.value; state.stale = state.scenario === "stale"; render();
      if (state.scenario === "loading") window.setTimeout(() => { state.scenario = "live"; render(); }, 1500);
    });
  }

  function render() {
    root.dataset.theme = state.theme;
    root.dataset.density = state.density;
    document.body.innerHTML = `<div class="ambient"></div>${header()}${state.stale ? '<div class="stale-bar">Presence last updated 2 minutes ago · Reconnecting…</div>' : ""}${renderMain()}${selfChip()}${knockCard()}${drawer()}${toastStack()}`;
    bindRenderedInteractions();
    const search = document.querySelector(".search-input");
    if (search && state.query) { search.focus(); search.setSelectionRange(state.query.length, state.query.length); }
  }

  function addToast(message) {
    state.toasts.push(message);
    state.toasts = state.toasts.slice(-3);
    render();
    window.setTimeout(() => { state.toasts.shift(); render(); }, 2400);
  }

  function moveCurrentUser(spaceId) {
    const target = spaceById(spaceId);
    if (!target || target.signal === "locked" || target.members.length >= target.capacity) return;
    data.spaces.forEach((space) => { space.members = space.members.filter((id) => id !== data.currentUserId); });
    target.members.unshift(data.currentUserId);
    state.selectedSpaceId = null;
    render();
    addToast(`You joined ${target.name}`);
  }

  document.addEventListener("input", (event) => {
    if (event.target.matches(".search-input")) { state.query = event.target.value; render(); }
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches(".scenario-select")) return;
    state.scenario = event.target.value;
    state.stale = state.scenario === "stale";
    render();
    if (state.scenario === "loading") window.setTimeout(() => { state.scenario = "live"; render(); }, 1500);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-space-open]")) {
      event.preventDefault(); state.selectedSpaceId = event.target.dataset.spaceOpen; render();
    }
    if (event.key === "Escape" && state.selectedSpaceId) { state.selectedSpaceId = null; render(); }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    const avatarButton = target.closest("[data-avatar]");
    const joinButton = target.closest("[data-join]");
    const knockButton = target.closest("[data-knock]");
    const audioButton = target.closest("[data-audio-space]");
    if (avatarButton) { event.stopPropagation(); const person = personById(avatarButton.dataset.avatar); addToast(`Message ${person.name} · Conversation opened`); return; }
    if (joinButton) { event.stopPropagation(); moveCurrentUser(joinButton.dataset.join); return; }
    if (knockButton) { event.stopPropagation(); addToast(`Knock sent to ${spaceById(knockButton.dataset.knock).name}`); return; }
    if (audioButton) { event.stopPropagation(); const id = audioButton.dataset.audioSpace; state.mutedSpaces.has(id) ? state.mutedSpaces.delete(id) : state.mutedSpaces.add(id); render(); return; }
    const filter = target.closest("[data-filter]");
    if (filter) { state.neighborhood = filter.dataset.filter; state.query = ""; render(); return; }
    const density = target.closest("[data-density]");
    if (density) { state.density = density.dataset.density; render(); return; }
    const zoom = target.closest("[data-neighborhood-zoom]");
    if (zoom) { state.zoom = zoom.dataset.neighborhoodZoom; state.neighborhood = "all"; render(); return; }
    if (target.closest(".theme-toggle")) { state.theme = state.theme === "dark" ? "light" : "dark"; render(); return; }
    if (target.closest(".demo-knock")) { state.incomingKnock = true; render(); return; }
    if (target.closest(".approve")) { state.incomingKnock = false; addToast("Noor was admitted · Door is open"); return; }
    if (target.closest(".deny")) { state.incomingKnock = false; addToast("Noor was notified · Request declined"); return; }
    if (target.closest(".drawer-close") || target.matches(".drawer-backdrop")) { state.selectedSpaceId = null; render(); return; }
    if (target.closest(".self-chip")) {
      const location = currentSpace();
      const anchor = document.getElementById(`space-${location.id}`) || document.querySelector(".person-card.is-self") || document.querySelector(`[data-space-open="${location.id}"]`);
      anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!anchor?.hasAttribute("tabindex")) anchor?.setAttribute("tabindex", "-1");
      anchor?.focus({ preventScroll: true });
      return;
    }
    const personJoin = target.closest("[data-join-person]");
    if (personJoin) { event.stopPropagation(); moveCurrentUser(personJoin.dataset.joinPerson); return; }
    const card = target.closest("[data-space-open]");
    if (card) { state.selectedSpaceId = card.dataset.spaceOpen; render(); }
  });

  render();
})();
