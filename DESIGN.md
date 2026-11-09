---
name: BetterGarmin
description: A private health dashboard for one Garmin CIRQA band, in liquid glass over photographs.
colors:
  bg-base: "#0a0b0f"
  bg-elevated: "#121420"
  text-primary: "#f4f5f7"
  text-secondary: "#9aa3b2"
  text-tertiary: "#636b7a"
  accent: "#38bdf8"
  metric-heart: "#fb4a59"
  metric-sleep: "#8b7bf6"
  metric-stress: "#f5a623"
  metric-energy: "#34d399"
  metric-training: "#2dd4bf"
  metric-readiness: "#38bdf8"
typography:
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
rounded:
  control: "16px"
  card: "24px"
components:
  card:
    rounded: "{rounded.card}"
    padding: "20px"
  button-primary:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
---

# Design System: BetterGarmin

## Overview

Liquid glass cards floating over a full-screen photograph (the daily mountain and forest backdrops), on an iPhone Home Screen app. Glass is the material, not decoration: every surface is a pane the photo shows through, so the backdrop the owner chose stays present on every screen. Data reads first; the glass, photo and accent colour frame it.

Binding (PRODUCT.md): liquid glass, the photo backgrounds, and every Customize option (presets, card styles, glass tint, fonts, radius, accent, widget order and visibility) stay.

## Colors

Dark by default (glanced at in the morning and at night). Each metric owns one colour everywhere it appears: heart red, sleep violet, stress amber, energy green, training teal, readiness sky. The accent (sky by default, changeable in Customize) marks the selected control and focus. Over liquid glass, secondary and tertiary text lift toward white (92% / 78%) so they survive a bright photo.

## Typography

Manrope (or the system face, per Customize), one family. Screen titles are bold 1.5rem; card titles 1rem semibold; supporting copy 0.75rem. Figures use tabular numerals.

## Layout

Single column at phone width with 16px gutters, cards stacked with a consistent gap; a floating tab bar at the bottom. Today's default order follows the morning glance: readiness, sync, sleep/stress/energy, energy forecast, then detail.

## Elevation & Depth

Depth comes from the glass itself: a saturated backdrop blur (28px, 185%), a bright 1px rim, an inner top highlight, and one soft offset drop shadow. Clear glass over a bright photo adds a light smoky base so white text keeps contrast; Dark glass deepens the pane instead. The `glass`, `solid` and `outline` card styles remain as Customize options.

## Shapes

Rounded rectangles throughout: 24px cards, 16px controls and inner tiles, pill-shaped chips and range selectors. Radius scales with the Customize radius setting.

## Components

- **Card (`.glass-panel`)**: the only surface. Never nest one card inside another; a panel inside a card drops its surface (see `BandCard bare`).
- **Buttons**: primary is the accent fill; secondary is a glass outline; ghost is text only. Visible accent focus ring.
- **Range chips** (Week / Month / 3 months / All) above history charts; day charts are hourly blocks labelled 6a, 12p, 6p.
- **Obsolete features** (Bluetooth band tools, live heart rate) stay reachable but folded away rather than shown up front.

## Do's and Don'ts

- Do keep one metric colour per metric across every screen.
- Do test text on the brightest backdrop (misty forest) with clear liquid glass.
- Don't add eyebrow labels above headings, gradient text, or cards inside cards.
- Don't crowd chart axes: at most about four labels.
- Don't surface Bluetooth-only explanations in the Home Screen app, where they can't apply.
