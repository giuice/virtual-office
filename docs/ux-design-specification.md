# {{project_name}} UX Design Specification

_Created on {{date}} by {{user_name}}_
_Generated using BMad Method - Create UX Design Workflow v1.0_

---

## Executive Summary

Virtual Office is evolving into a modern, cozy spatial workspace where every space—team hubs, presentation zones, lounges, and ad-hoc war rooms—broadcasts its live story at a glance. Leaders and teammates can see conversations unfolding, energy shifting, and critical moments (from Scrum lessons to strategy summits to lunch breaks) without drilling in. Communication flows through spaces with expressive avatars, status-rich signals, and ambient cues that make coordination effortless. Each interaction is logged so admin dashboards, meeting summaries, and historical insights can replay the company pulse long after the moment passes.

---

## 1. Design System Foundation

### 1.1 Design System Choice

Double down on the current shadcn/ui + Radix stack, enriching it with a bespoke cozy theme and spatial components rather than introducing a new system. This keeps accessibility and headless flexibility intact while letting us craft organic space cards, avatar clusters, and ambient status indicators that wrap around photo-based avatars. We’ll extend Tailwind tokens (colors, elevation, gradients) to support the island-inspired moods and ensure every interactive element inherits consistent focus/hover treatments across web and future responsive breakpoints.

---

## 2. Core User Experience

### 2.1 Defining Experience

Leadership and teammates land on the floor plan and instantly parse what every space is doing right now: team hubs glow when a stand-up starts, presentation zones display live agenda tags, kitchen lounges show casual chatter. Ambient beacons (color halos, motion pulses, light projections) translate the activity level, while avatar clusters highlight who’s present, who’s speaking, and who’s observing. A shared “now board” distills the heartbeat into a top-level summary bar so no one feels lost—even when dozens of spaces are alive at once. Champions brag about how they can spot the Strategy War Room spinning up and hover to reveal the live participant roster, agenda phase, activity log, and transcript snippet before they even step inside.

### 2.2 Novel UX Patterns

Introduce spatial storytelling patterns that go beyond rectangular rooms:
1. Zoned “neighborhood bands” that use subtle color gradients and lighting to group related spaces (product org, customer org, social) while preserving architectural clarity.
2. Status ribbons and phase trackers wrapping each space, changing texture based on meeting type (focus, collaborative, social) and showing the current agenda stage.
3. Avatar constellations that reposition automatically to prevent overlap, with micro-animations conveying talkers vs. listeners and tap targets that surface inline activity logs.
4. “Summon beams” that appear when a company-wide event kicks off, guiding users from their current space into the highlighted zone without feeling disruptive.
5. Persistent activity trails and transcript peeks that show where major events happened in the last few hours for asynchronous catch-up.
6. Dynamic overview mode that condenses spaces into a Sococo-inspired matrix without losing ambient cues—status ribbons, avatar constellations, and beacons scale down gracefully so 15+ spaces remain legible at once.

---

## 3. Visual Foundation

### 3.1 Color System

Craft a palette that balances efficiency, coziness, and inspiration:
- **Midnight Slate (#1E2330)** as the base canvas—calming and professional, ideal for dimming background noise.
- **Aurora Ember (#FF8A5C)** for high-priority attention beacons—warm energy that signals action without stress.
- **Soft Pine Mist (#6FB7A5)** for collaborative spaces—fresh, breathable, and reinforces calm focus.
- **Golden Thread (#F1C550)** as the accent for phase trackers and success states—sparks optimism and strategic momentum.
- **Ivory Glow (#FAF6EF)** for card surfaces and log panels—keeps the interface cozy and legible.
Each color ships with Tailwind tokens (e.g., `--vo-slate-900`, `--vo-ember-500`) plus semantic aliases like `--vo-signal-critical` to keep implementation consistent. Northstar Balance anchors the dark theme (executive focus mode), while Warm Control carries the light theme (daytime leadership scans). Theme switches reuse the same semantic token names so components inherit the correct mood automatically.

### 3.2 Typography

- **Headings:** "Satoshi" (or fallback `Inter`) in 600 weight, tight letter-spacing for control-center clarity. h1 44/52, h2 34/42, h3 26/32.
- **Body:** `Inter` 400 weight at 16/24 with 18/28 for dense logs. Small text 14/22 for metadata and timestamps.
- **Monospace:** `JetBrains Mono` for transcript snippets and token previews.
- Apply OpenType slashed-zero + tabular numbers for analytics-heavy panels.

### 3.3 Spacing & Layout

- Base unit: 4px grid with 12px/16px increments for macro spacing (16, 20, 24, 32, 40, 48).
- Layout grid: 12-column responsive, 80px gutters at >1440px, 48px at 1024px, 24px at 768px.
- Card padding defaults: 20px desktop, 16px tablet, 12px mobile.
- Hover reveal panels expand with 24px padding and 12px corner radius.

**Interactive Visualizations:**

- Color Theme Explorer: [ux-color-themes.html](./ux-color-themes.html)

---

## 4. Design Direction

### 4.1 Chosen Design Approach

Blend modern control center clarity with cozy hospitality cues, anchored in the Orbit Gallery direction for everyday leadership scans and paired with the Space Grid overview (Orbit Gallery layout) when occupancy crosses 15 spaces. Command Atrium and Analyst Matrix remain reference variants in the grid lab:
- Floor plan framed by a “now board” header and smart filters on the left, keeping the main canvas wide and breathable.
- Spaces rendered as elevated cards with rounded geometry, soft drop shadows, and light gradient washes keyed to their neighborhood band. When 15+ spaces are active, the canvas auto-switches into a zoomed-out Orbit Gallery grid so leadership still sees every space in one glance (inspired by Sococo, but with richer cues and higher fidelity).
- Avatars remain photo-forward, encircled by animated status rings (speaking, presenting, listening) and stacked in constellations that adapt to attendance.
- Hover reveals expand gracefully: translucent overlays surface agenda phase, recent log entries, and the latest transcript snippet without blocking surrounding content.
- Motion is purposeful: gentle pulses for live events, magnetic slides when people join/leave, and glowing trails when attention beacons fire for all-company moments.

**Interactive Mockups:**

- Design Direction Showcase: [ux-design-directions.html](./ux-design-directions.html)

---

## 5. User Journey Flows

### 5.1 Critical User Paths

{{user_journey_flows}}
1. **Leader Command Path:** CEO opens Virtual Office → spots attention beacon on Strategy War Space → hover reveals roster, phase, transcript → click to join or delegate.
2. **Team Sync Loop:** Product squad enters Sprint Launch space → agenda auto-advances phases → log captures key decisions → summary pushes to admin dashboard.
3. **Ad-hoc Coaching:** Mentor notices Pine Lounge chatter → hover to preview conversation → joins if needed → leaves note for async follow-up → log records for later review.

---

## 6. Component Library

### 6.1 Component Strategy

{{component_library_strategy}}
- Extend shadcn/Radix primitives into a Virtual Office kit:
  - `SpaceCard` component with gradient bands, status ribbons, hover reveal container, and configurable attention beacon slots.
  - `AvatarConstellation` layout that arranges real-photo avatars dynamically, layering animated status rings and tooltips for agenda roles.
  - `NowBoard` header module showing live priorities, filters, and key metrics.
  - `ActivityLogPanel` and `TranscriptPeek` components using Ivory Glow surfaces and timeline markers.
  - `AttentionBeacon` micro-component providing pulse animations and logging hooks for admin systems.
  - `SpaceGridOverview` responsive mosaic that preserves full-office visibility (15+ spaces) while retaining per-space status ribbons and beacon cues.

---

## 7. UX Pattern Decisions

### 7.1 Consistency Rules

{{ux_pattern_decisions}}
- Hover reveals must surface roster, agenda phase, activity log, and transcript snippet in a consistent hierarchy: roster first, phase tracker second, log entries third, transcript preview last.
- Attention beacons trigger when >60% of a space seats fill or when agenda phases change unexpectedly; they log events automatically.
- Summon beams only activate for company-wide or exec-flagged spaces and include a dismiss + snooze control to avoid interrupt overload.
- Avatar constellations maintain minimum 8px separation, prioritize speaker prominence, and collapse gracefully under 360px width.
- All logs and transcripts stream to Supabase tables with metadata timestamps for admin dashboards and meeting summaries.

---

## 8. Responsive Design & Accessibility

### 8.1 Responsive Strategy

{{responsive_accessibility_strategy}}
- Responsive ladders: 1440px (desktop control center), 1024px (compressed panels), 768px (stacked filters, single-column space list), 480px (mobile preview mode with quick actions).
- Keyboard navigation ensures focus order hits now board → filters → space cards → hover panels; quick keys (e.g., `G` go-to space) accelerate leadership workflows.
- Screen reader labels announce space name, activity level, attendee count, lead speaker, and agenda phase in one sentence.
- High contrast and reduced motion modes toggle via settings; attention beacons respect user preferences.
- Live transcripts expose captions with ARIA live regions for real-time accessibility.

---

## 9. Implementation Guidance

### 9.1 Completion Summary

{{completion_summary}}
- Floor plan UX centers on instant situational awareness for leaders and teammates through ambient cues, hover reveals, and attention beacons.
- Cozy, inspired visuals come from a tailored shadcn/Radix theme with Midnight Slate base, Aurora Ember signals, and Ivory Glow surfaces.
- Dual-theme support combines Warm Control (light default) and Cosmic Efficiency (dark default) so leadership can work in daylight or focused executive mode without losing semantic color meaning.
- Core journeys (leader command, team sync, ad-hoc coaching) are supported by SpaceCard, AvatarConstellation, NowBoard, ActivityLogPanel, and AttentionBeacon components.
- All interactions log to Supabase-backed dashboards and transcripts, ensuring today’s pulse becomes tomorrow’s intelligence.

**Immediate Implementation Actions**
- Draft build specs for Orbit Gallery components (`SpaceCard`, `AvatarConstellation`, `NowBoard`, `AttentionBeacon`, `SpaceGridOverview`) including props, token usage, and Supabase data contracts.
- Produce mid-fidelity Orbit Gallery wireframes (overview → hover → join) in Warm Control to validate hierarchy before development.
- Add backlog tickets covering theme toggles, grid activation logic, hover logging, and Cosmic Efficiency styling so engineering can slot the work.

---

## Appendix

### Related Documents

- Product Requirements: `{{prd_file}}`
- Product Brief: `{{brief_file}}`
- Brainstorming: `{{brainstorm_file}}`

### Core Interactive Deliverables

This UX Design Specification was created through visual collaboration:

- **Color Theme Visualizer**: [ux-color-themes.html](./ux-color-themes.html)
  - Interactive HTML showing all color theme options explored
  - Live UI component examples in each theme
  - Side-by-side comparison and semantic color usage

- **Design Direction Mockups**: [ux-design-directions.html](./ux-design-directions.html)
  - Interactive HTML with 6-8 complete design approaches
  - Full-screen mockups of key screens
  - Design philosophy and rationale for each direction
- **Space Grid Overview**: [ux-space-grid.html](./ux-space-grid.html)
  - Toggle between Warm Control (light default) and Cosmic Efficiency (dark default) while viewing 16 concurrent spaces
  - Orbit Gallery layout showcased as the primary condensed view; Command Atrium and Analyst Matrix remain as comparison toggles
  - Highlights avatars, agenda phases, beacons, and log snippets in condensed view

### Optional Enhancement Deliverables

_This section will be populated if additional UX artifacts are generated through follow-up workflows._

<!-- Additional deliverables added here by other workflows -->

### Next Steps & Follow-Up Workflows

This UX Design Specification can serve as input to:

- **Wireframe Generation Workflow** - Create detailed wireframes from user flows
- **Figma Design Workflow** - Generate Figma files via MCP integration
- **Interactive Prototype Workflow** - Build clickable HTML prototypes
- **Component Showcase Workflow** - Create interactive component library
- **AI Frontend Prompt Workflow** - Generate prompts for v0, Lovable, Bolt, etc.
- **Solution Architecture Workflow** - Define technical architecture with UX context

### Version History

| Date     | Version | Changes                         | Author        |
| -------- | ------- | ------------------------------- | ------------- |
| {{date}} | 1.0     | Initial UX Design Specification | {{user_name}} |

---

_This UX Design Specification was created through collaborative design facilitation, not template generation. All decisions were made with user input and are documented with rationale._
