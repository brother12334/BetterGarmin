---
name: BetterGarmin
description: A private health dashboard for one Garmin CIRQA band, read like a trailhead sign.
colors:
  stone-ground: "#e8ebe4"
  signboard: "#f8f9f5"
  inset-stone: "#eceee8"
  band-ink: "#0f110f"
  band-text: "#f3f4ef"
  ink: "#151814"
  ink-secondary: "#474c44"
  ink-tertiary: "#686e64"
  forest: "#2f7d4a"
  sky: "#2c6e9b"
  brick: "#c2412d"
  ochre: "#c98a14"
  dusk-indigo: "#4f4fae"
  river-teal: "#1f7a78"
  earth: "#6b4a2b"
  blaze-blue: "#1f5fa8"
  night-ground: "#161916"
  night-board: "#1f231f"
typography:
  title:
    fontFamily: "Public Sans Variable, Public Sans, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    letterSpacing: "0.04em"
  display:
    fontFamily: "Public Sans Variable, Public Sans, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Public Sans Variable, Public Sans, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
  label:
    fontFamily: "Public Sans Variable, Public Sans, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    letterSpacing: "0.04em"
  body:
    fontFamily: "Public Sans Variable, Public Sans, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  card: "2px"
  control: "4px"
spacing:
  gutter: "16px"
  card: "20px"
components:
  signboard:
    backgroundColor: "{colors.signboard}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  page-title-plate:
    backgroundColor: "{colors.band-ink}"
    textColor: "{colors.band-text}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    padding: "4px 12px"
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.inset-stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  tab-bar:
    backgroundColor: "{colors.band-ink}"
    textColor: "{colors.band-text}"
    rounded: "{rounded.control}"
    height: "64px"
---

# Design System: BetterGarmin

## Overview

**North star: the trailhead sign.** Every morning the owner reads their body the way a hiker reads the board at a trailhead: one grade says which trail they can take today, a signpost lists the distances, and a profile shows the climb ahead. The interface is national-park signage on a light stone ground: black header bands with white bold caps, flat signboards ruled with hairlines, heavy tabular numbers, and trail blazes as the only filled symbols.

It refuses the category default (dark glass cards, progress rings, neon accents) and the clinical look of a lab chart. Hierarchy comes from scale contrast and weight, not decoration. Light by default, because it is read in morning daylight; a night-trail theme keeps the same system on a dark ground.

Signature moves: readiness as a **trail grade** (black diamond 80+, blue square 60–79, green circle 40–59, trail closed under 40, the readiness score's own bands), and the day's energy as a **hike's elevation profile** with hour waypoint posts and a "YOU ARE HERE" marker.

## Colors

Restrained ground, committed ink. Stone ground (`stone-ground`) under off-white signboards (`signboard`); inner sections use `inset-stone`. Black (`band-ink`) owns the header bands, page-title plates, tab bar and desktop sidebar. Metric colours come from the trail and mean one thing everywhere: heart brick, sleep dusk indigo, stress ochre, energy forest, training river teal, readiness sky. State text uses the `--tone-*` tokens (red, blue, amber, green, teal, violet), which have darker day values and lighter night values so text keeps 4.5:1 contrast on both grounds. Blaze colours (forest circle, `blaze-blue` square, black diamond, brick closed sign) are reserved for the trail grade.

## Typography

Public Sans (self-hosted, variable) for everything, with tabular figures app-wide. Labels on signposts, stats, waypoints and short panel titles are 800-weight caps with 0.04em tracking. Values are large and heavy (3xl to 5xl, 800). Body copy stays sentence case at 14px. Long titles (Insights findings, workout names) stay in sentence case, set heavy, because caps hurt reading at length.

## Layout

Single column at phone width with 16px gutters; the Today sign runs full bleed under the safe area. Today follows the morning glance: the sign (grade + readiness), sync row, the Sleep / Stress / Energy signpost, energy forecast, training, energy profile, stats, sleep, heart rate, insights. On desktop an ink sidebar runs full height and the content column sits beside it.

## Elevation & Depth

Flat. No shadows on panels, no blur, no glass. Separation comes from 1px hairline rules (`--border-panel`) and the stone/board contrast. Only the floating tab bar carries one soft offset shadow (`--shadow-float`).

## Shapes

Near-square: 2px panels and plates, 4px controls. Tracks are straight bars with quarter ticks, not rounded pills. Blazes are the only geometric icons with fill.

## Components

- **Signboard (`.glass-panel` in the trail style):** off-white board, hairline rule, 2px corners. Never nest boards; split a board with hairlines (stats, sleep stages) instead.
- **Sign band / page-title plate (`.sign-band`, `.page-title`):** black with white caps; plates are sized to their word on every screen.
- **Signpost row (`RangeBar`):** caps label and status word left, heavy number right, segmented track below.
- **Signpost tile (`Dial`):** caps label, large number, segmented track, caption. Replaces gauge rings everywhere.
- **Trail blaze (`TrailBlaze`):** grade symbol plus grade name; used for readiness.
- **Elevation profile:** ink ridge line over translucent earth, ink baseline with two-hour posts, bold 6 AM / 12 PM / 6 PM labels, YOU ARE HERE post; waypoint rows below for biggest drain and best recharge.
- **Tab bar:** black band, white icons, current tab on a white plate.
- **Buttons:** primary forest fill with white text; secondary inset stone with a hairline; ghost text only. Visible accent focus ring.

## Do's and Don'ts

- Do keep one colour per metric across every screen.
- Do show the number: every signpost carries its value large and right-aligned.
- Do split boards with hairlines rather than nesting cards.
- Don't use rings, glass, blur, glows or gradients.
- Don't put long text in caps.
- Don't add eyebrow labels above headings.
- Don't use the blaze shapes for anything but the trail grade.
