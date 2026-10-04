# RoadGuard AI — Design system: "Kerb & Asphalt"

The single source of truth for every visual decision in the landing page, the Inspector Console and the Citizen app. Tokens live in `shared/tokens.css`; components read tokens only.

## Idea

RoadGuard is built from the things a road engineer in Mumbai actually works with: cement-grey kerbs, asphalt, thermoplastic road paint, the black-and-yellow kerb stripe, kilometre stones with a yellow cap, chainage written as `0+250`, and the spray-paint ring an inspector sprays around a pothole before the crew arrives. Personality lives in three places: the condensed signage type, the paint marks on real photographs, and the kerb stripe. Everything else is quiet and disciplined.

Light first. Inspectors and citizens use this outdoors and in site offices; concrete-grey with asphalt ink reads in sunlight. The console has a designed dark "Night shift" mode (asphalt surfaces, road paint that glows like retroreflective marking), never an inversion.

## Colour (OKLCH)

| Token | Day | Night shift | Role |
|---|---|---|---|
| `--color-paper` | `0.962 0.004 250` | `0.205 0.010 262` | Page (concrete / asphalt) |
| `--color-paper-2` | `0.935 0.005 250` | `0.236 0.010 262` | Secondary surface, rails |
| `--color-paper-3` | `0.902 0.006 250` | `0.272 0.011 262` | Pressed, hover, wells |
| `--color-sheet` | `0.988 0.003 250` | `0.252 0.011 262` | The one raised object (evidence sheet, drawers) |
| `--color-ink` | `0.215 0.012 262` | `0.935 0.006 250` | Text, icons |
| `--color-ink-2` | `0.385 0.012 262` | `0.790 0.008 250` | Secondary text |
| `--color-ink-3` | `0.505 0.010 262` | `0.665 0.008 250` | Labels, captions (≥ 4.5:1 on paper) |
| `--color-line` | `0.865 0.006 250` | `0.335 0.010 262` | Hairlines |
| `--color-line-strong` | `0.735 0.008 255` | `0.455 0.010 262` | Rules, input borders |
| `--color-asphalt` | `0.228 0.010 262` | `0.165 0.010 262` | Photo plates, dark bands |
| `--color-paint` | `0.865 0.165 92` | `0.865 0.165 92` | Road-marking yellow. Fill only, with asphalt ink on top. Never text on paper. |
| `--color-paint-ink` | `0.215 0.020 90` | `0.215 0.020 90` | Text on paint |
| `--color-paint-deep` | `0.640 0.135 85` | `0.865 0.165 92` | Paint as a line on paper (focus halo, chart strokes) |
| `--color-crit` | `0.550 0.200 27` | `0.680 0.190 27` | S4, rejected, SLA breach |
| `--color-ok` | `0.525 0.120 155` | `0.720 0.130 155` | Fixed |
| `--color-info` | `0.520 0.110 248` | `0.720 0.100 248` | Acknowledged, in progress |

Proportion: ~60 % paper, ~30 % ink and asphalt, ≤ 10 % paint. Paint goes on the primary action, the signature marks, the active nav item, focus halos, and the kerb stripe. Status colours are separate from the accent.

### Severity is encoded in form, then colour
| Level | Name | Chip | Paint mark on photos |
|---|---|---|---|
| S1 | Minor | outline, ink | thin paint ring |
| S2 | Moderate | paint hatch | paint ring |
| S3 | Severe | solid paint | heavy paint ring + tick |
| S4 | Critical | solid crit, white text | crit ring + double tick |

### Status is a stamp
`submitted` "Open" (ink outline), `acknowledged` "Acknowledged" (info outline), `in_progress` "Crew assigned" (info solid), `fixed` "Fixed" (ok solid). Always text plus form, never colour alone.

## Type

| Role | Family | Use |
|---|---|---|
| Display | **Barlow Condensed** 600/700/800 | Headlines, numerals in summaries, nav, stamps. Uppercase for signage moments with `letter-spacing: 0.01em`; sentence case for headlines over 40 px. |
| Body | **Instrument Sans** (variable) | Reading text, controls |
| Mono | **JetBrains Mono** (variable) | Chainage, GPS, IDs, confidences, rupees in tables, model metrics. `font-variant-numeric: tabular-nums`. |

Barlow was drawn from the signage of public infrastructure; it is the voice of the road. Instrument Sans is calm and humanist next to it. All three are self-hosted through fontsource with `font-display: swap`.

Scale (1.25, base 15 px): 12 · 13.5 · 15 · 18.75 · 23.4 · 29.3 · 36.6 · 45.8 · 57.2 · 71.5 · 89.4. Hero headline `clamp(3.4rem, 8.2vw, 7.6rem)`, line-height 0.88. Body line-height 1.55, headlines 0.9–1.05. Labels: 12 px, uppercase, `letter-spacing: 0.08em`, mono or display. Headlines get `text-wrap: balance`, paragraphs `text-wrap: pretty`, prose `max-width: 62ch`.

## Space, radius, depth

- 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Landing sections alternate 96 and 160 px; console uses 16/24/32.
- Radius: 2 px (inputs, chips' inner), 4 px (buttons, cards), 6 px (photo plates), 999 px (pills only). Signage, not bubbles.
- Depth: tonal steps first. One shadow, `--shadow-sheet`, for the single raised object on a screen. No glow.
- Outer gutter ≥ 16 px; landing content max 1240 px; console fluid.

## Motifs

1. **Kerb stripe** — a 6 px band of alternating asphalt and paint, 28 px segments, at the top of every app and as the divider before major sections. `.kerb`.
2. **Lane dash** — dashed rules (paint on asphalt, ink on paper) for chainage rulers and timelines.
3. **Asphalt grain** — a static SVG noise texture over asphalt surfaces so dark areas feel physical. No moving noise.
4. **Chainage** — positions written `0+000`, `0+250` (km+m), used for the ruler under photos and for the "how it works" sequence.
5. **KM stone** — the Indian milestone (white body, rounded top, yellow cap for national highways) as the marker for each step of the pipeline.
6. **Defect codes** — every defect carries its RDD code (`D00` longitudinal, `D10` transverse, `D20` alligator, `D40` pothole) and a small line glyph.

## Motion budget

| Where | Duration | Easing |
|---|---|---|
| Hero load: headline words, then paint marks drawing on | ≤ 900 ms total, 60 ms stagger | `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| Paint mark draw (stroke-dashoffset) | 420 ms each, 70 ms stagger | ease-out |
| Hover, press, toggle | 140–200 ms | ease-out in, ease-in out |
| Drawer / sheet | 240 ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Route change | 200 ms fade + 6 px rise | ease-out |

Transform and opacity only. `prefers-reduced-motion: reduce` shows final states (marks fully drawn, no stagger). Hover styles behind `@media (hover: hover)`. Nothing loops forever except the live-scan indicator while a camera is running.

## Signature moment: The Inspector's Mark

A real RDD2022 India road photograph sits on an asphalt plate. Its detections, produced by RoadGuard's detector, are drawn as spray-paint rings (SVG strokes roughened with a turbulence displacement filter, a few overspray dots) with a field note beside each: `D40 · POTHOLE · 0.91 · S4 · ₹21,800`. A vertical drag handle splits the plate: left of it the road as photographed, right of it the road as surveyed. Under the plate, a chainage ruler places each defect along the frame. Keyboard: the handle is a slider (arrow keys, Home/End). With JavaScript off, the static image and its marks are server-rendered by the build (the SVG is part of the HTML). With the API running, "Try your own photo" runs the live model on the visitor's image and marks it the same way. Costs no WebGL; the same component renders scan results in the console and report results in the citizen app.

One WebGL element is allowed on the landing page, below the fold: the RoadGuard sign plate rendered in liquid metal (Paper Shaders `LiquidMetal`) behind the closing call to action, lazy-mounted on visibility, static SVG poster first, frozen for reduced motion.

## Copy rules

- Claims and outcomes, not greetings. "Every pothole, on the record."
- Name things the way inspectors and citizens do: hazard, ward, crew, repair order, complaint.
- Every number on screen is measured or computed from data, with its basis available (tooltip or footnote).
- Errors say what happened and what to do. Buttons say what happens ("File complaint", then "Complaint drafted").
- No "seamless", "powerful", "AI-powered", "unleash", "revolutionary". No exclamation marks except in the citizen success state.

## Banned here

Emerald or cyan on near-black, gradient text, glass on every surface, floating blurred orbs, particles, sparkles icons for AI, emoji as icons, three equal feature cards, everything centred, invented statistics, stock illustrations.
