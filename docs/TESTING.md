# Manual testing — handoff log

Kinea can't be auto-tested: After Effects is a GUI app. Each sprint ends here,
with steps for **you** to verify in AE before we move on.

---

## Sprint 1 — Skeleton (evalScript round-trip)

**Goal (definition of done):** the panel opens in AE; a button runs `evalScript`
that creates a red solid and returns a JSON success string to the panel.

### Install
1. Open an **elevated** PowerShell in the repo root and run:
   ```powershell
   npm run dev-install
   ```
   This sets `PlayerDebugMode=1` for CSXS.9–12 (allows the unsigned dev build) and
   links the repo into `%APPDATA%\Adobe\CEP\extensions\com.kinea.extension`.
   (If symlink fails without admin, it copies instead — re-run after each edit.)
2. **Fully restart** After Effects (2020 / 17.0 or later).

### Verify
3. `Window > Extensions > Kinea` — the panel should open and show two buttons.
4. Click **Ping host**. Expect a green line like: `Host alive: AfterFX 18.x`.
   - This proves panel → `evalScript` → host → JSON → panel works.
5. Create or open a composition, then click **Create red solid**.
   Expect a green line like:
   `Created "Kinea Red Solid" (layer 1) in "Comp 1" — 1920×1080.`
   - A red solid should appear in the comp.
   - **Undo (Ctrl+Z) should remove it in one step** (undo-group check).
6. With **no comp open/active**, click **Create red solid**. Expect a red error:
   `No active composition. Open or select a comp, then try again.`

### Debugging (optional)
- With the panel open, browse to <http://localhost:8088> in Chrome to inspect
  the panel (console, network). Port is set in `.debug`.

### Report back
- Which steps passed/failed, and the exact status text + any console errors.
- Whether AE is 2020+ and on Windows or Mac (manifest targets AEFT 17.0+).

> Sprint 1 is intentionally just the round-trip.

---

## Sprint 2 — Context reader (read-only)

**Goal:** `kinea_refreshContext()` returns valid JSON describing the active comp,
its layers, transforms, and any expressions — **without mutating anything**
(safe for Chat Mode). The provider/Chat piece is deferred to Sprint 3.

### Reload
- Files are live via the symlink — no reinstall. Close the **Kinea** panel and
  reopen it (`Window > Extensions > Kinea`); restart AE if it looks stale.

### Verify
1. Open a comp with a few layers. Click **Read context**.
   Expect a neutral status header like
   `Context — "Comp 1" (3/3 layers, source: all):` followed by pretty JSON.
   Check that comp `name/width/height/frameRate/duration` and each layer's
   `index/name/type/enabled/transform` look correct.
2. **Select one layer**, click **Read context** again.
   Expect `source: selection` and only that layer in `layers`.
3. **Add an expression** to a property (e.g. wiggle on Position), select that
   property, click **Read context**.
   Expect the expression text to appear under the layer's `transform.expressions`
   and/or under `selectedProperties`.
4. Different layer types: add a **text**, **shape**, **solid**, **null**,
   **camera/light** layer — confirm each reports the right `type`.
5. **No comp active** (click empty Project panel area, deselect comp), click
   **Read context** → expect `"No active composition…"` and `activeComp: null`.

### Report back
- Whether the JSON matches the actual comp, any layer type mislabeled, and any
  red error text (check `localhost:8088` console if something looks off).

> Not yet built: provider adapters, Chat/Agent modes, plan/confirm UI (Sprints 3–4).
