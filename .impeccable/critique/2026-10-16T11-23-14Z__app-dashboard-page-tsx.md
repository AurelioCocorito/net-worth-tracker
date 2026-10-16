---
target: tablet landscape 1024x768 (Panoramica, Tracciamento, Rendimenti, Patrimonio, Storico)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Giuseppe\\Documents\\Github\\net-worth-tracker\\app\\dashboard\\page.tsx"
target_fingerprint: "sha256:cd8f63e4efc38da16be9e109a0dd4b7c8bb3dba33afafebc40576e7f2ebaec66"
target_path: "C:\\Users\\Giuseppe\\Documents\\Github\\net-worth-tracker\\app\\dashboard\\page.tsx"
timestamp: 2026-10-16T11-23-14Z
slug: app-dashboard-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser). Evidence from Playwright (Chrome extension not connected), census@example.com fixture, production build of develop on :3200, 1024×768 (isMobile, hasTouch). Target: the tablet landscape composition (container 960–1439) of Panoramica, Tracciamento, Rendimenti, Patrimonio, Storico — the rail of 2026-10-16 (decision 104).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | The bar says «Portfolio Tracker», not where you are; the pill's current-page marker of portrait is missing |
| 2 | Match System / Real World | 3 | «Il resto della pagina» names the interface, not the content |
| 3 | User Control and Freedom | 3 | Rows open in place; a page change takes two taps (hamburger, sheet) |
| 4 | Consistency and Standards | 2 | Three headers for one page; Rendimenti's «Dettaglio» outside the rail; two unaligned grids |
| 5 | Error Prevention | 3 | Nothing destructive at stake |
| 6 | Recognition Rather Than Recall | 2 | The rail shows labels without answers on a canvas that has room for them |
| 7 | Flexibility and Efficiency | 2 | No side-by-side comparison; «Apri tutte» makes a 360px column with the left empty |
| 8 | Aesthetic and Minimalist Design | 2 | Canvas split backwards; curve at 5:1 |
| 9 | Error Recovery | 3 | Failed row red, one live node |
| 10 | Help and Documentation | 3 | «Il perché», «Come si calcola» |
| **Total** | | **26/40** | **Acceptable** (25 on the first version) |

## Design Specificity Verdict

Specific at the top, generic below. Verdict with the coloured full stop, mono figures and the hero with «Massimo storico» are this product's. Below it the page is the phone in two columns: a stack of 4–8 identical 52px cards with a 10px eyebrow — the «accordion dashboard» of any product. At 1440 the same area holds ~35 figures, at 1024 none.

Deterministic scan: 0 findings on 11 files. In the browser 26–34 elements per page, all false or not the surface's (the 9–11px eyebrow ramp of DESIGN.md, nested-cards on transparent wrappers, the pill and the shell hidden at 1024); the one to look at: the curve's range labels at 10px mono («295.576 €»), figures not eyebrows.

## Overall Impression

A phone made wider, not a tablet designed. 1024 is 87% of 1440's usable width but shows ~5 figures outside the verdict against ~40.

## What's Working

1. The core holds at every width: verdict, strip, THE tile, mono figures.
2. 360px is a desktop tile's width: Sintesi opened in the rail is identical to Sintesi at 1440 — the tiles are ready for a richer layout.
3. Sound technical base: one DOM order, no horizontal scroll, 200% zoom falls back to the phone.

## Priority Issues

- [P1] The canvas is split backwards — bar 53px, two-line header and the stacked verdict take 38% (Panoramica), 49% (Rendimenti), 59% (Tracciamento) of the 715px; THE tile starts at y=322/400/477 and ends below the fold on Tracciamento (922), Patrimonio (808), Storico (837); 131–409px empty right of the verdict; the curve stays 120px on a 620px tile. Fix: bar and header on one row, verdict and strip on one band, elastic curve. Command: /impeccable layout.
- [P1] The rail reads as a list of buttons — 4–8 identical `rounded-2xl` surfaces with shadow, against the Flat List Row and DESIGN.md's chrome reduction; asides state the scope, not the answer. Fix: open tiles, or one flat `divide-y` index whose rows answer when closed. Command: /impeccable distill.
- [P1] Navigation regresses in landscape — a hamburger in the worst corner for two hands, a brand name, no current page; two taps per page change. Fix: icon rail on the left or text segments in the header row. Command: /impeccable adapt.
- [P2] Two grids that do not talk — strip in thirds/halves of 992 vs the `1fr/360` body; «Il perché»'s chevron at x=928; centred tab pill on a left-aligned page. Fix: one grid top to bottom. Command: /impeccable layout.
- [P2] Voids move instead of disappearing — 20 925 px² (Patrimonio) and 36 624 px² (Storico) of empty rail on the first screen; opening Storico's Composizione (791px) leaves 351 327 px² empty under THE tile (not sticky); worse on larger iPads (1180–1366px). Command: /impeccable adapt.

## Persona Red Flags

- The owner on the sofa, iPad in landscape: the curve is a 120px ribbon; on Tracciamento the header and half a chart; turning the iPad to portrait shows more.
- Alex (power user with iPad and keyboard): no Spese/Entrate side by side; actions are icons to decipher.
- Sam (accessibility): 10px eyebrows and asides at 40cm; five sub-44 targets — «Cambia base» 68×16, YTD 42×44 (Rendimenti), Patrimonio's two 36px header buttons, Storico's 36×36 +snapshot.

## Minor Observations

- Patrimonio's THE tile footer clipped by the fold by a few px.
- «Apri tutte» is the weakest control on a page of identical cards.
- Greeting and date on two lines; at 1440 an eyebrow.

## Questions to Consider

1. Why is a landscape iPad a big phone and not a 1440 with the sidebar closed?
2. Does a closed row that does not show its answer deserve its place on a canvas with room for the answer?
3. In landscape, should the page speak of time (a large curve) more than of inventory (the list of sections)?

## Directions (for the design canvas)

- D1 · Small desktop: 60px icon rail, one-row header, whole verdict, 12-col grid (THE tile 7, open tiles 5). Reopens all three permitted decisions; risk: `screens` at 1024 ~2,5–3, a new switch (orientation + width) beside `desktop:`.
- D2 · Lectern: left the answer, still (verdict, strip, THE tile with a curve filling the height); right the open tiles scrolling; navigation as text in the header. Risk: two scroll contexts (VoiceOver, focus).
- D3 · An index that answers: direction A kept, the rail becomes ONE tile with flat rows that answer when closed («Sintesi · 13,2% liquidabile»), THE tile sticky, the frame one row. Risk: a short answer per tile, the «no figure in the aside» rule reopened.
