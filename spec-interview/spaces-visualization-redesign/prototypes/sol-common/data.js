(function () {
  const names = [
    "Maya Chen", "Theo Martins", "Noor Haddad", "Leo Costa", "Amara Okafor", "Iris Novak",
    "Sam Rivera", "Aya Nakamura", "Jon Bell", "Priya Shah", "Nico Laurent", "Zoe Kim",
    "Ben Ortiz", "Lina Alves", "Owen Price", "Nadia Flores", "Kai Jensen", "Mei Santos",
    "Ravi Patel", "Cleo Adams", "Eli Brooks", "Ana Torres", "Finn Müller", "Luz Moreno",
    "Milo Grant", "Sara Costa", "Yara Salem", "Hugo Lima", "June Park", "Dani Moretti",
    "Tess Morgan", "Omar Aziz", "Alex Wood", "Mina Cho", "Ren Ito", "Eva Silva",
    "Tom Becker", "Nia King", "Ian Foster", "Gia Rossi", "Max Young", "Isa Melo",
    "Lou Reed", "Bea Cunha", "Sol Vega", "Kim Tan", "Paz Rios", "Vic Stone"
  ];

  const palette = [
    ["#21d4fd", "#6b5cff"], ["#ff4fd8", "#7c3aed"], ["#3ee6a8", "#0ea5e9"],
    ["#ffb84d", "#ff5f6d"], ["#8b5cf6", "#ec4899"], ["#36d1dc", "#5b86e5"]
  ];
  const statuses = ["online", "online", "online", "busy", "away", "online"];
  const people = names.map((name, index) => ({
    id: `p${index}`,
    name,
    role: index % 7 === 0 ? "Design" : index % 5 === 0 ? "Product" : index % 3 === 0 ? "Engineering" : "Operations",
    status: statuses[index % statuses.length],
    colors: palette[index % palette.length],
    photo: index > 0 && index < 34 ? `https://i.pravatar.cc/96?img=${(index % 68) + 1}` : null
  }));

  const neighborhoods = [
    { id: "studio", name: "Studio", code: "ST", color: "#a970ff", note: "Make · critique · ship" },
    { id: "harbor", name: "Harbor", code: "HB", color: "#20d7d0", note: "Focus · build · launch" },
    { id: "garden", name: "Garden", code: "GD", color: "#75db8b", note: "Connect · learn · reset" },
    { id: "foundry", name: "Foundry", code: "FD", color: "#ff8d5c", note: "Prototype · test · refine" }
  ];

  const definitions = [
    ["north-star", "North Star", "studio", "conference", 8, 4, "Design review", "live"],
    ["focus-bay", "Focus Bay", "studio", "workspace", 4, 3, "Pairing", "focus"],
    ["pulse-lab", "Pulse Lab", "studio", "lab", 6, 5, "Prototype sprint", "live"],
    ["quiet-booth", "Quiet Booth", "studio", "private_office", 1, 1, "Focused", "locked"],
    ["dock-01", "Dock 01", "harbor", "workspace", 4, 3, "Building", "focus"],
    ["launch-room", "Launch Room", "harbor", "conference", 5, 5, "Release sync", "full"],
    ["wave-booth", "Wave Booth", "harbor", "private_office", 2, 1, "1:1", "locked"],
    ["library", "Library", "harbor", "breakout", 6, 2, "Quiet work", "quiet"],
    ["commons", "Commons", "garden", "open_space", 10, 7, "Co-working", "live"],
    ["kitchen-table", "Kitchen Table", "garden", "social", 8, 4, "Coffee chat", "social"],
    ["porch", "Porch", "garden", "lounge", 6, 2, "Available", "open"],
    ["nimbus", "Nimbus", "garden", "breakout", 4, 0, "Available", "open"],
    ["prototype-lab", "Prototype Lab", "foundry", "lab", 8, 4, "User testing", "live"],
    ["materials", "Materials", "foundry", "workspace", 4, 1, "Focused", "focus"],
    ["crit-room", "Crit Room", "foundry", "conference", 6, 4, "Feedback session", "live"],
    ["after-hours", "After Hours", "foundry", "social", 12, 0, "Available", "open"]
  ];

  let cursor = 0;
  const spaces = definitions.map(([id, name, neighborhood, type, capacity, count, activity, signal]) => {
    const members = people.slice(cursor, cursor + count).map((person) => person.id);
    cursor += count;
    return { id, name, neighborhood, type, capacity, members, activity, signal, audio: count > 1 && !["quiet", "open"].includes(signal) };
  });

  window.SOL_DATA = {
    currentUserId: "p0",
    neighborhoods,
    people,
    spaces,
    activity: [
      { time: "Now", text: "Maya joined the room" },
      { time: "4m", text: "Audio room opened" },
      { time: "12m", text: "Theo joined the room" },
      { time: "18m", text: "Room status changed" }
    ]
  };
})();
