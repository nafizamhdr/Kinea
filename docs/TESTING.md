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

> Sprint 2 done. Chat/Agent modes + plan/confirm UI arrive in Sprints 3b–4.

---

## Sprint 3a — Provider detection (Gemini CLI)

**Goal:** the Node bridge resolves the `gemini` binary (even when AE's Node
context didn't inherit the shell PATH) and reports version + entitled models to
the panel. No prompting yet — this validates the panel ↔ Node ↔ CLI path.

### Prerequisite (you do this — Kinea never handles credentials)
1. Install the CLI (Node 18+ is already present):
   ```
   npm i -g @google/gemini-cli
   ```
2. Authenticate once in your own terminal (free tier, personal Google account):
   ```
   gemini
   ```
   Follow the Google login prompt, then exit. (Run this in a normal terminal,
   or type `! gemini` here — it's interactive.)

### Reload
- Files are live via the symlink — close and reopen the **Kinea** panel
  (restart AE if it looks stale).

### Verify
1. **Before installing**, click **Detect Gemini** → expect a red message
   `Gemini CLI not found. Install it with: npm i -g @google/gemini-cli`.
2. **After installing + login**, click **Detect Gemini** → expect green:
   `Gemini detected — <version>`, a `bin:` absolute path, a `models:` list, and
   a `default:` model.
3. If you see `Node bridge unavailable…`, the Node context didn't load — tell me
   (we'll check `--enable-nodejs`/`--mixed-context` and the `localhost:8088`
   console).

### Report back
- The exact status text for both before/after, and the `bin:` path shown.

> Note: the bridge was also smoke-tested outside AE with plain Node
> (`node -e "require('./bridge/bridge.js').detectProvider('gemini')"`) — syntax
> and the not-found path are already confirmed; AE only needs to confirm the
> in-panel `require` + the found path.
