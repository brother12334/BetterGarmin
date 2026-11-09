---
name: BetterGarmin
description: A private health dashboard for one Garmin CIRQA band, as bold colour blocks.
colors:
  paper: "#f4f1ec"
  white-block: "#ffffff"
  inset: "#ece8e1"
  ink: "#121212"
  ink-secondary: "#4a4640"
  ink-tertiary: "#6c6760"
  readiness-violet: "#5b3df5"
  sleep-lime: "#c7f05a"
  stress-coral: "#ff7a59"
  energy-black: "#121212"
  heart-pink: "#ffb8e0"
  training-sunflower: "#ffd23f"
  night-ground: "#0e0e0e"
  night-panel: "#1c1c1c"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "8.25rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
  number:
    fontFamily: "Bricolage Grotesque Variable, Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 800
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  label:
    fontFamily: "Bricolage Grotesque Variable, Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
  body:
    fontFamily: "Bricolage Grotesque Variable, Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  block: "26px"
  pill: "999px"
spacing:
  gutter: "16px"
  grid-gap: "10px"
components:
  readiness-block:
    backgroundColor: "{colors.readiness-violet}"
    textColor: "{colors.white-block}"
    typography: "{typography.display}"
    rounded: "{rounded.block}"
    padding: "20px"
  metric-block:
    rounded: "{rounded.block}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.white-block}"
    textColor: "{colors.ink}"
    rounded: "{rounded.block}"
    padding: "20px"
  button-primary:
    backgroundColor: "{colors.readiness-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  tab-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "72px"
---

# Design System: BetterGarmin

## Overview

**North star: your day as a recap.** Like a year-in-review story, each measure owns a full field of colour with one giant number, so the morning glance reads in a second: the violet readiness block with a short verdict, then sleep, stress, energy and steps as a two-by-two grid of colour. Warm paper ground, near-black ink, Bricolage Grotesque at heavy weights. It refuses rings, glass, thin grey cards and dashboard chrome. Light by default (read in morning daylight); a dark theme keeps the same blocks on a near-black ground.

## Colors

**One colour per metric family, everywhere.** Readiness violet (white text; violet is readiness and the current-tab bubble only), sleep lime, stress coral, energy black with lime numerals, heart pink, training sunflower; steps, distance, calories, HRV and other neutral stats are white blocks. Charts use deeper "solid" versions of the same hues so lines read on white (`metricColors.ts`: `solid` for charts and text, `block`/`blockInk` for fills). State text uses `--tone-*` tokens tuned per theme for contrast.

## Typography

Bricolage Grotesque only. Numbers at 800 with -0.04em tracking: 8.25rem for readiness, 3.5rem in metric blocks, 2.75rem in stat blocks (2rem for values over five characters, never wrapped). Labels 700 in sentence case. Screen titles 2.125rem 800.

## Layout

Phone-first single column, 16px gutters, 10px between blocks. Today: date with a compact Sync chip, a greeting title, the readiness block, the 2x2 metric grid, then training (sunflower), forecast and energy chart, stats, sleep detail, heart rate (pink) and insights. Detail charts and settings live on white panels.

## Elevation & Depth

Flat colour. No shadows or borders on blocks or panels; the dark tab bar alone carries one soft shadow.

## Shapes

26px corners on blocks and panels; pills for buttons, chips and the tab bubble.

## Components

- **MetricBlock / Dial / BigStat:** a metric's colour field with label, giant number, caption; mini trends drawn in the block's ink with start and end values labelled. Content inside a block inherits the block's ink (text, buttons, rules) via `.metric-block`.
- **Charts (DetailChart, ClockRing, Energy Reserve, forecast, sleep stages):** each is its measure's colour block. A plain-language headline worked out from the chart's own data comes first (the day's peak and when, or the period's average and latest), with the key number on an ink pill. The chart below is drawn in the block's ink: chunky rounded bars or a heavy line, secondary series lighter, no grid, no y-axis, labels inset from the edges; range chips sit inside the block. Day charts quote the hourly figures they draw.
- **Readiness block:** violet, 130px number, verdict top-right from the readiness bands (80/60/40), status and recommendation below.
- **Sync chip:** ink pill beside the date; status messages appear under the hero only while relevant.
- **Word tab bar:** dark bar docked to the bottom, large word tabs that scroll sideways, the current tab in a sliding violet bubble. Desktop sidebar mirrors it.
- **Panels:** white, for charts, sleep stages, insights and settings.

## Do's and Don'ts

- Do keep each metric in its family colour on every screen.
- Do show the number big; every block carries its value.
- Don't use violet for anything but readiness and the current tab.
- Don't add rings, glass, gradients, borders or shadows on blocks.
- Don't let long values wrap; step the size down.
