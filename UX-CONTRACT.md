# Tapdance canvas behavior

Source: user-approved migration from NiegeIP production canvas; existing Tapdance project lifecycle and model service contracts. Visual ownership is documented in DESIGN.md.

- Project creation and reopening enter the same canvas, persisted through Project.canvasFlow. Missing fields in older projects receive defaults. Keep node positions, connections, groups, reference order, viewport and recycle bin.
- A normal wheel pans; Ctrl/Cmd + wheel zooms around the pointer. Space, middle button or hand mode pans. Selection mode supports marquee, Shift selection and atomic group movement. Alt bypasses snapping.
- Undo/redo covers document edits. System generation results and view movement do not add history entries. Replaying an edit preserves asynchronous results. Undo does not cancel a submitted task.
- Copy/duplicate remaps node/group IDs and internal connections. Editable text controls retain their native copy, paste, select-all and IME behavior. Shortcuts stop while a modal is open.
- Deleting a selection names its scope and moves nodes plus associated connections into the project's recycle bin. Restore recovers available connections, including endpoints restored in separate operations. Permanent deletion requires explicit confirmation and clears undo history.
- Generation reuses global model settings and existing Tapdance provider services. Busy/error states appear on nodes. Imports validate media kind and report errors locally. Audio import/playback does not imply an audio synthesis provider.
- Native browser dialogs are not used. Application dialogs and selects reuse Studio primitives. Source-specific cloud billing, portrait authorization, server save-conflict detection and super-resolution require matching backend capabilities and must not be represented as working local operations.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | StudioSelect | src/components/studio/StudioPrimitives.tsx | Authored select with existing Studio tokens | Canvas browser tests and popup keyboard inspection |
| Form | Studio primitives and canvas node/composer fields | Existing model configuration and media-type contracts | Node title, prompt, generation configuration | Typecheck and canvas browser tests |
| Dialog | StudioModal with CanvasModal focus/isolation adapter | src/components/studio/StudioPrimitives.tsx | Preview, delete, recycle bin, generation configuration | Canvas keyboard and dialog tests |
| Scrollbar | Application stylesheet | src/index.css | Existing global baseline; bounded canvas panels | Existing baseline; global standards-property gap tracked separately |
| CRUD | Project lifecycle and canvas editor | src/features/projects and src/features/infiniteCanvas | Create, edit, recycle, restore | tests/e2e/infinite-canvas.spec.ts |
| Toast | Canvas local notice | Canvas workspace | Import, download and asset-save feedback | Canvas failure-state browser checks |

- Selecting or creating a single image/video node mounts its creation composer immediately. Clicking card media, titles and empty content must select the node; dragging or Shift selection must preserve multi-selection. Deselecting or selecting multiple nodes hides the composer. Node switching restores each node's prompt/model/parameters.
- The composer supports direct generation, model/ratio selection, image batch count, supported video parameters, expandable editing, and @ references. Mention tokens persist stable node IDs, display ordered labels and resolve to provider reference labels when submitting. Image generation cannot silently accept unsupported audio/video references.
- Composer reference upload/selection adds upstream material and keeps the creation target selected. It must not replace the target or open a disconnected draft node.
