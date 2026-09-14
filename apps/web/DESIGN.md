---
name: Retain DSA
description: A calm, editorial practice ledger with developer-tool precision.
colors:
  canvas: '#080a19'
  surface: '#0b1022'
  surface-raised: '#0e1930'
  surface-active: '#0d1b31'
  text-primary: '#f0f0f6'
  text-secondary: '#a6afc5'
  text-muted: '#71809b'
  action-blue: '#38a3f8'
  action-blue-strong: '#71c4ff'
  activity-green: '#48d597'
  warning-amber: '#f0b34d'
  destructive-red: '#ef7278'
  border-subtle: 'rgba(154, 176, 209, 0.15)'
  border-focus: 'rgba(56, 163, 248, 0.52)'
  heat-empty: '#101b2c'
  heat-low: '#10392f'
  heat-medium: '#126346'
  heat-high: '#1b9a66'
  heat-peak: '#48d597'
typography:
  display:
    fontFamily: 'Mukta Malar, sans-serif'
    fontSize: 'clamp(48px, 5vw, 61px)'
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: '-0.028em'
  headline:
    fontFamily: 'Figtree Variable, sans-serif'
    fontSize: '28px'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Figtree Variable, sans-serif'
    fontSize: '17px'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.012em'
  body:
    fontFamily: 'Figtree Variable, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'JetBrains Mono Variable, monospace'
    fontSize: '11px'
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: '0.08em'
rounded:
  cell: '2px'
  control: '4px'
  dialog: '8px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '14px'
  lg: '24px'
  xl: '40px'
components:
  button-primary:
    backgroundColor: '{colors.action-blue}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '44px'
  button-primary-hover:
    backgroundColor: '{colors.action-blue-strong}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '44px'
  button-ghost:
    backgroundColor: 'rgba(16, 27, 46, 0.68)'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '44px'
  input:
    backgroundColor: '#080e1d'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.control}'
    padding: '9px 11px'
    height: '44px'
---

# Design System: Retain DSA

## Overview

**Creative North Star: "The Practice Ledger"**

Retain DSA is a precise daily tool: technical without costume, editorial without spectacle, and calm enough for honest reflection. Practice history leads the first view, curriculum progress provides context, and the recommendation queue presents clear next actions without turning the page into a scoreboard.

The identity comes from deep ink surfaces, broad display type, compact operational metadata, thin cool rules, and small state signals. Decorative effects stay local and quiet so real practice data remains the strongest visual material.

**Key Characteristics:**

- deep ink and navy surfaces
- broad editorial display type
- sparse monospaced metadata
- blue actions and progress
- green recorded activity and timer states
- warm accents reserved for meaning

## Colors

Near-black navy establishes the workspace. Near-white text and cool muted copy provide hierarchy; electric blue identifies actions, progress, and focus; green records activity and live timer state. Amber marks medium difficulty or attention, while red is restrained to hard difficulty, errors, and destructive actions.

**The Signal Separation Rule.** Blue means interaction or progress, green means activity or timer state, amber means attention, and red means danger or hard difficulty. Never rely on color alone to communicate state.

## Typography

**Display Font:** Mukta Malar, bold  
**Body Font:** Figtree Variable, sans-serif  
**Label/Mono Font:** JetBrains Mono Variable, monospace

**Character:** Mukta Malar gives route headings a broad editorial silhouette. Figtree keeps dense operational copy clear, while JetBrains Mono makes timers, identifiers, dates, counts, and compact statuses feel exact.

### Hierarchy

- **Display** (700, fluid 48-61px, 0.98 line-height): route identity and the first strong statement.
- **Headline** (700, 28px, 1.12 line-height): major queue and analytics sections.
- **Title** (700, 17px, 1.3 line-height): problem names and compact content headings.
- **Body** (400, 16px, 1.55 line-height): descriptions and explanatory copy.
- **Label** (650, 11px, 0.08em tracking): uppercase queue headers and compact metadata.

**The Sparse Mono Rule.** Use monospaced type for IDs, timers, dates, counts, and technical status; keep narrative and action copy in Figtree.

## Layout

Use one centered content rail capped at 1385px with fluid 4vw side gutters. The primary overview is a responsive two-column grid: route statement at left, compact coverage at right, then the annual activity calendar spanning the full width above the recommendation queue. Challenge recommendations form one editorial list divided by rules, with aligned metadata columns and actions at the right.

At 1100px, queue columns collapse into readable row groups and analytics becomes a single column. At 760px, the overview stacks, the calendar scrolls horizontally, and metrics reflow. At 560px, challenge metadata and controls wrap into a compact single-column reading order. Coarse pointers expand calendar cells to 24px while preserving the seven-row grid.

## Elevation & Depth

The system is flat by default. Tonal navy layers and low-contrast rules establish depth; the active timer row receives a restrained blue-tinted field. A faint canvas glow adds atmosphere, while the completion dialog alone receives substantial elevation (`0 28px 90px rgba(0, 0, 0, 0.5)`).

**The Protected Elevation Rule.** Reserve strong shadow and backdrop blur for modal focus; ordinary rows and sections remain flat.

## Shapes

The form language is compact and precise: square heatmap cells and progress bars use a 2px radius, controls use 4px corners, and the completion dialog uses 8px. Circular forms appear only as tiny status indicators. Thin borders, open whitespace, and horizontal rules carry structure instead of rounded containers.

## Components

### Buttons

Primary actions use blue fill, dark ink text, 4px corners, and a 44px minimum height. Ghost controls sit on translucent navy with a subtle rule; destructive controls use red only where consequences require it. Hover states brighten borders or fills, and keyboard focus uses a 2px blue outline with 3px offset.

### Inputs

Inputs and selects use an inset navy field, subtle border, 4px corners, and a 44px minimum height. They share the global blue focus outline; errors pair red text with explicit messages.

### Navigation

The compact sticky header uses a translucent canvas and blur. Navigation links remain muted until hover; the active route gains near-white text and a thin blue underline. The brand wordmark disappears below 760px while the mark and routes remain available.

### Editorial queue

Recommendations are rows within one uninterrupted list. The problem title is strongest, with blue IDs, outlined difficulty badges, quieter skill tags, and compact actions. Timer ownership adds a soft blue field; the timer itself uses green text, border, and a labeled control group.

### Activity calendar

The annual heatmap sits above the queue. Weeks align in columns and weekdays in semantic rows; each date is a focusable gridcell with a date/count label. Roving focus follows arrow keys, Home, and End, while hover or focus updates the visible readout. On coarse pointers, cells expand from 11px to 24px. Reduced motion removes cell scaling and transform transitions while preserving color, border, and opacity feedback.

## Do's and Don'ts

### Do:

- **Do** make real activity and the next practice decision the dominant content.
- **Do** use rules, alignment, and whitespace to organize editorial rows.
- **Do** preserve clear keyboard focus, semantic calendar roles, roving focus, and touch-friendly calendar targets.
- **Do** keep loading, error, empty, shortage, active, and paused states visually and verbally distinct.

### Don't:

- **Don't** turn the page into a uniform grid of equally weighted cards.
- **Don't** use monospaced type, glow, gradients, or rounded containers as generic developer decoration.
- **Don't** let progress, activity, timer, difficulty, and destructive signals share ambiguous color meaning.
- **Don't** use continuous decorative motion; keep transitions short, functional, and reduced-motion aware.
