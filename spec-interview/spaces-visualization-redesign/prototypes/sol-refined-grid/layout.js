(function () {
  window.renderSolPrototype = function (context) {
    const { state, data, spaces, getMembers, neighborhoodById, spaceCard, pageHead, escapeHtml } = context;
    const visibleNeighborhoods = data.neighborhoods.filter((neighborhood) => spaces.some((space) => space.neighborhood === neighborhood.id));
    const sections = visibleNeighborhoods.map((neighborhood, index) => {
      const roomList = spaces.filter((space) => space.neighborhood === neighborhood.id);
      const peopleCount = roomList.reduce((sum, space) => sum + getMembers(space).length, 0);
      const capacity = roomList.reduce((sum, space) => sum + space.capacity, 0);
      return `<section class="grid-neighborhood" style="--neighborhood:${neighborhood.color}">
        <header class="neighborhood-heading"><div class="neighborhood-index">0${index + 1}</div><div><span>${neighborhood.code} / ${escapeHtml(neighborhood.note)}</span><h2>${escapeHtml(neighborhood.name)}</h2></div><div class="neighborhood-stat"><b>${peopleCount}</b><span>people here</span></div><div class="occupancy-line"><i style="width:${Math.round((peopleCount / capacity) * 100)}%"></i></div></header>
        <div class="signal-grid">${roomList.map((space) => spaceCard(space)).join("")}</div>
      </section>`;
    }).join("");
    const noResults = !spaces.length ? `<div class="empty-state"><div class="empty-orb">⌕</div><h2>No signal found</h2><p>Try searching for another person, space, or neighborhood.</p></div>` : "";
    const quiet = state.scenario === "empty" ? `<section class="grid-welcome"><span class="welcome-spark">✦</span><div><span class="eyebrow">First one in</span><h2>The office starts with you.</h2><p>Every room is ready. Pick a destination or stay in North Star while the team arrives.</p></div><button class="primary-action" data-join="commons">Move to Commons</button></section>` : "";
    return `<main class="page grid-page">${pageHead("Every room, one fluent scan", "A disciplined presence grid where live state is part of the architecture.")}${quiet}${sections}${noResults}</main>`;
  };
})();
