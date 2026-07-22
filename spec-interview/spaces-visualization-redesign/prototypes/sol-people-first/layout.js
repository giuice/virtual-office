(function () {
  window.renderSolPrototype = function (context) {
    const { state, data, spaces, getMembers, neighborhoodById, avatar, pageHead, escapeHtml } = context;
    const visibleRooms = new Set(spaces.map((space) => space.id));
    const groups = data.neighborhoods.map((neighborhood) => {
      const roomList = spaces.filter((space) => space.neighborhood === neighborhood.id);
      const people = roomList.flatMap((space) => getMembers(space).map((person) => ({ person, space })));
      if (!people.length && state.scenario !== "empty") return "";
      const peopleCards = people.map(({ person, space }) => {
        const own = person.id === data.currentUserId;
        const full = getMembers(space).length >= space.capacity;
        const locked = space.signal === "locked";
        let action = `<button class="follow-action" data-join-person="${space.id}">Join them</button>`;
        if (own) action = `<span class="you-label">This is you</span>`;
        else if (locked) action = `<button class="follow-action knock" data-knock="${space.id}">Knock</button>`;
        else if (full) action = `<button class="follow-action" disabled>Space full</button>`;
        return `<article class="person-card ${own ? "is-self" : ""}" style="--person-room:${neighborhood.color}">
          <div class="person-portrait">${avatar(person)}<span class="availability ${person.status}">${person.status}</span></div>
          <div class="person-copy"><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.role)}</p><button class="person-location" data-space-open="${space.id}"><i></i>${escapeHtml(space.name)}<span>${escapeHtml(space.activity)}</span></button></div>
          <div class="person-actions"><button class="message-action" data-avatar="${person.id}" aria-label="Message ${escapeHtml(person.name)}">Message</button>${action}</div>
        </article>`;
      }).join("");
      const quietCopy = state.scenario === "empty" ? `<div class="solo-invite"><b>The floor is yours.</b><span>Your teammates will settle around you as they connect.</span></div>` : "";
      return `<section class="people-neighborhood" style="--people-color:${neighborhood.color}"><header><div><span class="eyebrow">${neighborhood.code} · ${escapeHtml(neighborhood.note)}</span><h2>${escapeHtml(neighborhood.name)}</h2></div><span>${people.length} ${people.length === 1 ? "person" : "people"}</span></header>${quietCopy}<div class="people-grid">${peopleCards}</div></section>`;
    }).join("");

    const roomRail = data.spaces.filter((space) => visibleRooms.has(space.id)).map((space) => {
      const neighborhood = neighborhoodById(space.neighborhood);
      const members = getMembers(space);
      const preview = members.slice(0, 3).map((person) => avatar(person, "", false)).join("");
      return `<button class="rail-room" data-space-open="${space.id}" style="--rail:${neighborhood.color}"><span class="rail-mark"></span><span class="rail-copy"><b>${escapeHtml(space.name)}</b><small>${escapeHtml(space.activity)}</small></span><span class="rail-faces">${preview || "<i>Open</i>"}</span><span class="rail-count">${members.length}/${space.capacity}</span></button>`;
    }).join("");
    const noResults = !groups.trim() ? `<div class="empty-state"><div class="empty-orb">⌕</div><h2>No one found</h2><p>Search by teammate, role, room, or neighborhood.</p></div>` : groups;
    const online = state.scenario === "empty" ? 1 : data.spaces.reduce((sum, space) => sum + getMembers(space).length, 0);
    return `<main class="page people-page">${pageHead("Find the person. See the place.", "People lead the view; rooms stay close enough to act in one move.")}
      <div class="people-toolbar"><div class="people-total"><b>${online}</b><span>teammates placed on the floor</span></div><div class="people-hint"><kbd>/</kbd> Search a name <span>·</span> select a room to see everyone</div></div>
      <div class="people-layout"><div class="people-stream">${noResults}</div><aside class="space-rail"><header><span class="eyebrow">Spatial index</span><h2>Spaces</h2><p>The whole floor, kept in reach.</p></header><div class="rail-list">${roomRail}</div></aside></div>
    </main>`;
  };
})();
