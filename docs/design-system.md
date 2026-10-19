# BetterGarmin design system

Rules every screen follows. If something needs a value that isn't here, add it
here first rather than inventing a one-off.

## Spacing

A 4px scale only: Tailwind steps 1, 2, 3, 4, 5, 6, 8, 10 and 12 (4–48px). There
are no half steps (`p-1.5`) and no arbitrary values (`mt-[7px]`).

- **Cards:** 20px inner padding (`p-5`).
- **Gaps:** 16px between cards in a stack (`gap-4`), 12px in tile grids
  (`gap-3`).

## Type

One family, Manrope, for headings and body. The user can switch the whole app
to System, Serif or Mono in Customize.

| Role | Class | Size / line height | Weight |
| --- | --- | --- | --- |
| Caption, labels | `text-xs` / `.eyebrow` | 12/16 (eyebrow: uppercase, 0.06em tracking) | 600 |
| Secondary text | `text-sm` | 14/20 | 400–500 |
| Body | `text-base` | 16/24 | 400 |
| Card title | `font-semibold` at base size | 16/24 | 600 |
| Page title | `text-2xl font-bold` | 24/32 | 700 |
| Display numbers | `text-3xl`–`text-5xl font-extrabold tabular-nums` | — | 800 |

Nothing is set smaller than 12px.

## Colour

- **Surfaces and text** come only from theme tokens: `--bg-base`,
  `--bg-elevated`, `--bg-panel`, `--border-panel`, `--text-primary`,
  `--text-secondary`, `--text-tertiary`.
- **The accent** (the user's choice) is used for primary actions, the active
  tab and links.
- **Metric colours** encode data and are used the same way everywhere:
  - heart: red
  - sleep: violet
  - stress: amber
  - energy: green
  - training: teal
  - readiness: sky
- **Semantic colours** are for status only: emerald good, amber caution, rose
  problem.
- No decorative gradients, glows or neon.

## Shape and elevation

- **`rounded-card`** for cards and sheets.
- **`rounded-control`** for buttons, inputs and inner tiles.
- **`rounded-full`** for pills, dots, avatars and progress bars.

All three follow the user's Corners setting.

There are two shadows:

- **`--shadow-panel`** for cards.
- **`--shadow-float`** for floating layers: the tab bar and popovers.

## Components

- **`Button`:**
  - Variants: primary (solid accent), secondary (panel) and ghost.
  - Minimum height 40px.
  - `loading` shows a spinner and blocks repeat taps; use it for every async
    action.
- **`Card`:** the only container style. It follows the user's card style
  (Glass, Liquid, Solid or Outline).
- **`Badge`:** the only pill or status label. Tones: neutral, accent, success,
  warning, danger.
- **`Skeleton`:** the placeholder while a screen's data loads.

## Motion

- **Feedback:** hover and press only change colour or opacity. Nothing scales
  or shifts the layout.
- **Transitions:** 150ms for controls; charts and rings animate once on load.
- **Reduced motion:** everything respects `prefers-reduced-motion`.

## Don'ts

- Emoji or sparkle icons as decoration
- Text glyphs (★ ✓ ⭐) in place of icons or badges
- One-off radii, shadows or font sizes
- Decorative purple gradients
