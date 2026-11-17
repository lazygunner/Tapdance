---
version: alpha
colors:
  primary: "#a7f3d0"
  darkBackground: "#050b16"
  darkText: "#f8fbff"
  lightBackground: "#f6f1e8"
  lightText: "#1a2433"
typography:
  sans:
    fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif'
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace'
omitted:
  - section: spacing
    reason: Existing Tailwind spacing and canonical Studio primitives remain the implementation owners.
  - section: rounded
    reason: Existing Studio primitives own application geometry; canvas geometry follows the approved NiegeIP reference.
---

## Overview

Tapdance is a Chinese director's workbench for composing prompts, visual references, storyboards and generation tasks. This is a product interface: editing space, legible assets and predictable controls take priority over decoration.

The approved infinite-canvas reference is the production NiegeIP canvas. Preserve its media-first cards, floating tools, selection behavior, shortcut organization and group geometry. Adapt service boundaries to Tapdance; do not introduce NiegeIP accounts or billing.

## Colors

`src/index.css` is the canonical runtime theme owner. The values above document its existing backgrounds and text; they do not generate a second theme. Canvas surfaces, borders, text, focus and selection consume `--studio-*` tokens. Dark and light themes keep the same visual hierarchy. Canvas selection uses `--studio-accent-emerald-text` through a scoped `--canvas-accent` alias.

## Typography

Use existing `--font-sans` and `--font-mono` roles. System fallback must render Chinese. Canvas utility labels are compact, with readable line height and truncation only where the complete node title remains available to editing controls.

## Layout

Canvas content occupies the workspace. Keep the NiegeIP arrangement: top creation actions, bottom-left tools and minimap, bottom-right history/shortcuts, optional left asset list, contextual node actions. Selecting a single image or video node always exposes the NiegeIP creation composer at the bottom, independent of canvas zoom. It contains the reference strip, mention editor, model and parameter controls, and the direct generate action. The right inspector remains an auxiliary reference tool; it must not replace the composer. At narrow widths, wrap controls and bound overlays without changing document coordinates.

## Elevation & Depth

Use existing `--studio-panel-shadow` and surface tokens. Groups are quiet frames; cards and active controls carry stronger hierarchy. Do not recolor media assets.

## Shapes

Canvas cards use 10px corners and a 34px header, following NiegeIP. Reuse existing Studio modal and select geometry for application overlays.

## Components

Canonical owners: `StudioModal` and `StudioSelect` in `src/components/studio/StudioPrimitives.tsx`; theme tokens in `src/index.css`; project lifecycle/persistence in existing project features and app storage. CanvasTools, CanvasShortcutPanel and the pure canvas editor modules are ported from NiegeIP. CanvasNodeCard adapts the same compact media-card layout to Tapdance generation callbacks. CanvasCreationComposer ports NiegeIP’s selected-node creation flow. PromptMentionEditor, CreationGenerationControls and CreationParameterPanel are copied from its production studio; CreationDropdown adapts their contract to StudioSelect. Prompt/material IDs are mapped to local canvas node IDs.

## Do's and Don'ts

- Preserve existing project data and all other project types.
- Keep keyboard operations scoped to the editor and leave text editing/IME to inputs.
- Respect reduced motion; keep focus visible and action labels in Chinese.
- Keep cloud-only capabilities out of active controls until the corresponding service exists.
