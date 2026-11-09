---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/features/today/TodayPage.tsx"]
---

# Surface: BetterGarmin app (all screens), Today first

Mode: Operate. Owner glances on an iPhone Home Screen app in the morning to see how they are and how hard to train. All features and numbers stay. Rejected so far: dark liquid glass (generic, busy, moody) and trail signage (not modern enough). Must not feel clinical or gamified.

## Direction contract

THESIS: Your day as bold colour blocks, like a year-in-review recap: each measure owns a full field of colour and one giant number. Refuses rings, glass, thin grey cards and dashboard chrome.

OWN-WORLD: Warm paper ground (#f4f1ec), ink #121212. Blocks with 26px corners in a fixed metric palette: readiness violet #5b3df5 (white text), sleep lime #c7f05a, stress coral #ff7a59, energy black with lime numerals, heart pink #ffb8e0, training sunflower #ffd23f, steps and neutral panels white. Bricolage Grotesque, 800 weight for numbers with tight negative tracking; 600–700 for labels in sentence case. No borders, no shadows except on the tab bar.

STORY: The owner opens the app, reads the violet readiness block (giant number plus a one-line verdict) and the three coloured blocks under it, and knows how hard to train before scrolling.

FIRST VIEWPORT: Date line and a big greeting title. Full-width violet readiness block with a 130px number, status and verdict. Two-by-two grid: sleep (lime), stress (coral), energy (black/lime), steps (white). Sync control as a compact chip. Bottom: a dark docked bar of large word tabs (Today, Health, Training, Sleep, Insights, More), swipeable, the current tab in a violet bubble.

FORM: Year-in-review colour blocks (Impeccable's pick, re-roll 1). seed:6d549b4c0b4ac04a
Charts (owner's choice, mix of mockups 1 and 2): every chart is its measure's colour block with a plain-language headline computed from the data, the key number on an ink pill, and the chart in the block's ink (chunky rounded bars or a heavy line, no grid, no y-axis).
Signature move: every metric is a full colour block with one giant number, the same colour everywhere it appears; navigation by big word tabs.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
