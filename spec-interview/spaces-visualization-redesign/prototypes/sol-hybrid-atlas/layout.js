(function () {
  window.renderSolPrototype = function (context) {
    const { state, data, spaces, getMembers, neighborhoodById, avatar, spaceCard, pageHead, escapeHtml } = context;
    const selected = state.query || state.neighborhood !== "all" ? null : state.zoom;
    const zoomSpaces = selected ? spaces.filter((space) => space.neighborhood === selected) : spaces;
    const zoomNeighborhood = selected ? neighborhoodById(selected) : null;

    const districts = data.neighborhoods.map((neighborhood) => {
      const districtSpaces = data.spaces.filter((space) => space.neighborhood === neighborhood.id);
      const members = districtSpaces.flatMap((space) => getMembers(space));
      const occupied = districtSpaces.filter((space) => getMembers(space).length).length;
      const preview = members.slice(0, 5).map((person) => avatar(person, "", false)).join("");
      const active = selected === neighborhood.id;
      return `<button class="district ${active ? "active" : ""}" data-neighborhood-zoom="${neighborhood.id}" style="--district:${neighborhood.color}">
        <span class="district-code">${neighborhood.code}</span>
        <span class="district-copy"><b>${escapeHtml(neighborhood.name)}</b><small>${escapeHtml(neighborhood.note)}</small></span>
        <span class="district-presence">${preview || '<i class="district-empty">Quiet</i>'}</span>
        <span class="district-score"><b>${members.length}</b> people<small>${occupied}/${districtSpaces.length} spaces active</small></span>
      </button>`;
    }).join("");

    const cards = zoomSpaces.length ? zoomSpaces.map((space) => spaceCard(space, { large: true })).join("") : `<div class="empty-state"><div class="empty-orb">⌁</div><h2>No matching spaces</h2><p>Try another person, room, or neighborhood.</p></div>`;
    const selectedPeople = zoomSpaces.flatMap((space) => getMembers(space).map((person) => ({ person, space })));
    const lensPeople = selectedPeople.slice(0, 8).map(({ person, space }) => `<button class="lens-person" data-avatar="${person.id}">${avatar(person, "", false)}<span><b>${escapeHtml(person.name)}</b><small>${escapeHtml(space.name)}</small></span><i>↗</i></button>`).join("");
    const quiet = state.scenario === "empty" ? `<div class="quiet-banner"><span>✦</span><div><b>You opened the office</b><small>Choose a space and make it yours. Everyone else will appear here as they arrive.</small></div></div>` : "";

    return `<main class="page hybrid-page">${pageHead("Your office, from wide angle to close-up", "Scan every neighborhood, then zoom without losing the whole floor.")}${quiet}
      <section class="district-overview" aria-label="Neighborhood overview">${districts}</section>
      <div class="zoom-heading"><div><span class="eyebrow">Neighborhood lens</span><h2>${zoomNeighborhood ? escapeHtml(zoomNeighborhood.name) : state.query ? `Results for “${escapeHtml(state.query)}”` : "All visible spaces"}</h2></div><span>${zoomSpaces.length} spaces · ${selectedPeople.length} people</span></div>
      <section class="zoom-layout"><div class="zoom-grid">${cards}</div>
        <aside class="neighborhood-lens"><div class="lens-radar" style="--lens-color:${zoomNeighborhood?.color || "var(--cyan)"}"><span>${zoomNeighborhood?.code || "ALL"}</span><i></i><i></i><i></i></div>
          <div class="section-label">People in view</div><div class="lens-roster">${lensPeople || '<div class="lens-empty">It’s quiet here—for now.</div>'}</div>
          <div class="lens-foot"><span><i class="dot live"></i> Updates live</span><b>Click any person to message</b></div>
        </aside>
      </section>
    </main>`;
  };
})();
