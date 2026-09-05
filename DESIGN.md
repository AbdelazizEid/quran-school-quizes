---
name: Dar Makkah
description: Quran school quiz platform — live competitions and self-paced practice
colors:
  parchment: "#f8f4ec"
  ink: "#2a1f10"
  ink-deep: "#1f150a"
  gold: "#b0884b"
  ink-body: "#5c4a25"
  ink-muted: "#6b5a36"
  rule: "#e6dccb"
  wash: "#efe4d4"
typography:
  display:
    fontFamily: "Thmanyah Serif Display, Thmanyah Serif Text, Times New Roman, serif"
    fontSize: "clamp(3.5rem, 8vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Thmanyah Sans, Segoe UI, Tahoma, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Thmanyah Sans, Segoe UI, Tahoma, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.3em"
rounded:
  md: "12px"
spacing:
  page-x: "2rem"
  page-top: "4rem"
  page-bottom: "6rem"
  section-gap: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.md}"
    padding: "16px 32px"
  button-primary-hover:
    backgroundColor: "{colors.ink-deep}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px 32px"
  button-outline-hover:
    backgroundColor: "{colors.wash}"
---

# Design System: Dar Makkah

## Overview

**Creative North Star: "The Teacher's Board"**

The system reads like a Quran school teacher's board: a warm parchment surface where structure comes from ruled lines rather than boxes, hierarchy comes from ink weight, and gold appears the way it does on a well-kept board — rarely, and only to mark what matters. The interface is calm and legible first; a teacher mid-lesson and a student on a phone should both parse it in one glance.

The board is flat. No shadows, no cards floating over the ground; the only relief is the medallion's inset ring. Content is organized the way annotations are: a strong heading, a clear column, and a start-ruled margin for supporting notes. The Arabic-only RTL setting is native to the system — start edges (right) lead, rules hang from the start, reading order is editorial.

**Key Characteristics:**
- Parchment ground with dark ink type; no pure white, no pure black
- Structure from hairline rules, never enclosing boxes
- Gold reserved for markers (kickers, medallions, outline borders)
- Flat surfaces; the medallion ring is the only relief
- Thmanyah families: Serif Display for headings, Sans for UI (planned; system fallbacks until wired)

## Colors

Parchment and ink carry the page; gold marks, rule lines structure.

### Primary
- **Ink** (#2a1f10): Primary text and primary button fill. The board's writing.
- **Ink deep** (#1f150a): Hover state of primary buttons.

### Secondary
- **Gold** (#b0884b): Kickers, medallion ornaments, outline-button borders. The marker chalk of the board.

### Neutral
- **Parchment** (#f8f4ec): Page ground and primary-button text.
- **Ink body** (#5c4a25): Body copy, one step lighter than headings.
- **Ink muted** (#6b5a36): Supporting notes and captions.
- **Rule** (#e6dccb): Hairline rules and ruled margin lines.
- **Wash** (#efe4d4): Hover fill for outline buttons.

### Named Rules
**The Gold Ration Rule.** Gold covers ≤10% of any screen. Its rarity is what makes a gold mark read as important.

**The Board Rule.** Never a pure white or pure black. The lightest value is parchment, the darkest is ink deep.

## Typography

**Display Font:** Thmanyah Serif Display (with Thmanyah Serif Text, Times New Roman fallback)
**Body Font:** Thmanyah Sans (with Segoe UI, Tahoma fallback)

**Character:** A dignified serif display over a quiet workhorse sans — the heading speaks, the UI works. (Thmanyah files not yet wired; fallbacks are active.)

### Hierarchy
- **Display** (700, ~3.5–4.5rem, 1.15): Page titles only. One per page.
- **Body** (400, 1.25rem, 1.7): Lead paragraphs and main reading.
- **Support** (400, 0.875rem, 1.6): Margin notes and captions.
- **Label** (400, 0.75rem, 0.3em tracking, uppercase): Gold kickers above titles.

### Named Rules
**The One Display Rule.** Display type appears once per page; everything else is body scale. No intermediate heading sizes yet.

## Layout

Single editorial column (max-width 72rem) on the parchment ground, RTL-first: content is anchored to the start (right) edge. Page padding 2rem sides, 4rem top, 6rem bottom. Supporting notes hang from a hairline start-rule (`border-inline-start`, 1px rule color, 1.5rem padding) — the annotated-margin pattern. Section gaps ~2.5rem. Mobile stacks actions vertically; nothing else reflows.

## Elevation & Depth

**The system is flat.** No drop shadows anywhere. Depth is conveyed by ink weight and, for the medallion alone, an inset double ring (2px gold ring, parchment gap, 1.5px gold inner ring).

### Named Rules
**The Flat Board Rule.** Surfaces never lift. If a state needs emphasis, change the ink (wash fill, gold border) — never add a shadow.

## Shapes

Language of the ruled line: 1px hairlines, rounded-md (12px) on interactive controls, fully-round (9999px) reserved for the medallion, dot markers, and session Bubbles (فقاعات). No enclosing card rectangles.

## Components

### Buttons
- **Shape:** gently rounded (12px), padding 16px 32px, text-lg semibold
- **Primary:** ink fill on parchment text — the inked stamp
- **Hover:** deepens to ink-deep; instant, no motion theatrics
- **Outline:** transparent with 1px gold border, ink text; hover fills with wash

### Labels / Kickers
- Gold, 0.75rem, 0.3em tracking, uppercase Latin; Arabic companion line sits under it in muted ink

### Medallion (signature)
- 14px circle, double gold inset ring — marks headings the way surah headers are marked; one per page header

### Margin notes
- Start-ruled column: 1px rule line, 1.5rem inset, support-size text in muted ink

### Inputs
Not yet implemented. When they arrive: transparent ground, 1px rule-colored underline or border, focus shifts border to gold — never a glow.

## Do's and Don'ts

### Do:
- **Do** structure with hairline start-rules instead of cards and boxes.
- **Do** keep gold to markers and borders; under 10% of any screen.
- **Do** use Thmanyah names in font stacks with the documented fallbacks.
- **Do** anchor layouts to the RTL start edge.

### Don't:
- **Don't** add drop shadows, glows, or floating cards.
- **Don't** use pure white or pure black anywhere.
- **Don't** introduce a second display heading size.
- **Don't** let gold become a fill for large surfaces.
