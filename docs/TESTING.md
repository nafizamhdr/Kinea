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

---

## Sprint 3b — Chat Mode (read-only, Gemini)

**Goal:** type a question in the panel → Kinea refreshes the AE context
(read-only) → asks Gemini headless → shows a project-aware answer. No mutation.

Implementation notes:
- Gemini is run headless: `gemini -o json --skip-trust --approval-mode plan
  -m <model> -p " "` with the full prompt piped via **stdin** (avoids Windows
  command-line escaping). `plan` mode keeps it read-only and yields clean text.
- Runs in an empty temp dir so Gemini's tools have nothing to touch.
- `session_id` is reused via `--resume` for multi-turn continuity.
- Already validated end-to-end outside AE with plain Node (correct, context-aware
  answers, clean output, session id returned). AE needs to confirm the in-panel
  flow + UI.

### Reload
- Live via symlink — close & reopen the **Kinea** panel (restart AE if stale).

### Verify
1. Open a comp. In the chat box, ask: *"What does my project look like right
   now?"* → Enter. Expect a "Thinking…" bubble, then an answer that references
   your comp (name/size) and layers.
2. Put `wiggle(2,30)` on a layer's Position, select it, ask *"how do I slow down
   this wiggle?"* → expect advice referencing the expression (e.g. lower the
   frequency). This proves context (incl. expressions) reaches the model.
3. Ask a follow-up like *"and to make it smoother?"* → it should stay on topic
   (session continuity via `--resume`).
4. **Read-only check:** confirm nothing in the project changed and no undo entry
   was added by chatting.
5. (Optional) Dev tools are tucked under the **Dev tools** disclosure — Ping /
   Read context / Detect Gemini / Create red solid still work there.

### Report back
- Whether answers are project-aware, response latency (Flash + ~12k-token
  overhead means a few seconds is normal), any artifact text leaking into
  answers, and any error bubbles. Check `localhost:8088` console if it hangs.

> Chat Mode done.

---

## Sprint 4a — Agent Mode (plan → approve → execute), minimal tools

**Goal:** a request becomes a **visible, validated tool-call plan**; nothing runs
until you approve; each approved step runs as one host tool inside its own undo
group. Tools shipped in 4a: **createComp**, **createLayer** (solid/text/null).

How it works (decided in CLAUDE.md): the model returns a structured JSON plan
against the closed tool list; the bridge validates every step against the tool
registry **before** anything runs (invalid plan → rejected whole). Already
validated outside AE with plain Node (a 2-step plan parsed + validated correctly).

### Reload
- Live via symlink — close & reopen the **Kinea** panel (restart AE if stale).

### Verify
1. Top-right, switch to the **Agent** tab. The placeholder changes.
2. Type: *"Create a 1080p comp named Hero at 30fps for 8 seconds, then add a red
   solid called BG."* → Enter.
3. Expect a **plan card**: a summary + a numbered step list
   (1. Create 'Hero'… 2. Add 'BG' red solid…) with **Approve & run** / **Cancel**.
4. Click **Cancel** first → card dims, nothing happens in AE. Good.
5. Re-plan and click **Approve & run** → steps turn green one by one; a new comp
   "Hero" (1920×1080) appears, opens, and gets a red solid "BG".
6. **Undo check:** each step is its own undo — Ctrl+Z removes the solid, Ctrl+Z
   again removes the comp (two separate undos).
7. Try a request needing an unavailable capability (e.g. *"add a glow effect"*) →
   expect either a plan that only includes doable steps with a note in the
   summary, or a clean rejection message (no partial/garbage execution).
8. Switch back to **Chat** → Chat Mode still works and stays read-only.

### Report back
- Whether the plan looks right, the approve/cancel gate works, both steps execute,
  undo is one-per-step, and Chat still works. Note planning latency (similar to
  chat, a few seconds to ~1 min on free Flash).

> Sprint 4a verified.

---

## Sprint 4b-1 — More Agent tools

**New tools:** `duplicateLayer`, `setExpression`, `setTransformKeyframes`,
`renameAndOrganize`. (4b-2 will add `setEasing`, `applyEffect`,
`findAndFixExpressionError`.) Planner + validation already confirmed outside AE
(a 3-step expression+keyframes+rename plan parsed and validated correctly).

> ExtendScript caveat: I can't run AE, so test each tool against a scratch comp.
> If any AE call behaves unexpectedly, paste the error — some APIs vary by version.

### Reload
- Live via symlink — close & reopen the **Kinea** panel (restart AE if stale).

### Verify (Agent tab)
1. **setExpression + setTransformKeyframes + renameAndOrganize** (one plan):
   make a comp + a solid (or reuse one), select the solid, then ask:
   *"Add wiggle(3,50) to the selected layer's Position, animate its Opacity from
   0 at 0s to 100 at 1s, rename it Hero and set label 9."*
   Approve → expect: Position shows the wiggle expression, Opacity has 2
   keyframes (0→100), layer renamed **Hero** with a label color. Each step = one
   undo.
2. **duplicateLayer:** select a layer, ask *"duplicate the selected layer and
   name the copy BG Copy."* → a duplicate appears named "BG Copy".
3. **Property naming:** try *"set Rotation to 0 at 0s and 360 at 2s on Hero"* →
   2 rotation keyframes (a full spin).
4. **Error path:** ask to set an expression on a non-existent layer/property →
   expect a clean red "Step failed: …" message, no crash, no partial mess.
5. Quick dev-harness checks (Dev tools disclosure) still work; Chat still
   read-only.

### Report back
- Per tool: did it do the right thing in AE, is undo one-per-step, and any
  ExtendScript error text. Especially confirm property resolution (Position /
  Scale / Rotation / Opacity) works on your AE 2020.

> Sprint 4b-1 verified (rename was a Source/Layer-Name display thing, not a bug).

---

## Sprint 4b-2 — final Agent tools (all 9 MVP tools now live)

**New tools:** `setEasing`, `applyEffect`, `findAndFixExpressionError`. Planner +
validation confirmed outside AE (a keyframes→easyEase→Gaussian-Blur plan parsed
correctly, including the effect matchName `ADBE Gaussian Blur 2`).

> Reminder: restart AE after this (host `.jsx` only reloads at panel load).

### Verify (Agent tab)
1. **setTransformKeyframes + setEasing** (one plan): with a layer selected, ask:
   *"Move the selected layer position from [0,540] at 0s to [1920,540] at 2s and
   apply easy ease to those keyframes."* → Approve → 2 Position keyframes that
   ease (keyframe icons become hourglors, not linear). Check the graph/keyframe
   shape if unsure.
2. **applyEffect:** *"add a Gaussian Blur to the selected layer."* → the layer
   gets a Gaussian Blur in Effect Controls. Try a made-up effect (*"add a
   flibber effect"*) → expect a clean "Effect not available" error, no crash.
3. **findAndFixExpressionError:** put a deliberately broken expression on a
   property (e.g. `thisLayer.nonsense()` on Opacity), then ask *"find expression
   errors."* → Kinea should reply with a bubble listing the layer/property and
   the error text. With no broken expressions, it says "No expression errors
   found." (This tool is read-only — it reports; it does not change anything.)
4. **Full mini-demo (optional):** *"Create a 1080p comp, add a red solid, give
   its Position a wiggle(2,40) expression, and animate Opacity 0→100 over 1s with
   easy ease."* → review plan → approve → watch it build.

### Report back
- Per tool: correct result in AE, one-undo-per-step, and any ExtendScript errors.
- Especially confirm `setEasing` on **Position** (spatial) works — it retries the
  ease arrays at dimension 1 if the per-dimension call is rejected.

> Sprint 4b-2 verified — all 9 tools work.

---

## Sprint 4c — resilience (destructive confirm + 429 recovery)

Completes the Agent loop per milestone 4. Both paths are testable via Dev-tools
simulation toggles (no real quota / no destructive tool needed yet).

### Reload
- Close & reopen the panel (restart AE if host looks stale).

### Verify — rate-limit recovery (no quota used)
1. Open **Dev tools**, tick **"Simulate rate limit (next send)"**.
2. In **Agent** (or Chat), send any request. Instead of a plan/answer you get a
   red bubble: *"Free-tier limit reached (session saved). Auto-retry in 5s…"*
   with a **Retry now** button.
3. Let it auto-retry (or click Retry now). Since the simulate flag is one-shot,
   the retry runs for real → you get the actual plan/answer. (The backoff grows
   5→10→20→40→60s across consecutive limits, and resets on success.)
4. Sanity: the session continues (it reused the saved sessionId).

### Verify — destructive-step confirmation
5. Tick **"Simulate destructive plan"**, then send an Agent request (e.g.
   *"create a 1080p comp and add a solid"*).
6. The plan card marks steps with ⚠️ and shows a red confirm box:
   *"This plan has N destructive step(s). Tick to confirm…"* — **Approve & run is
   disabled** until you tick it.
7. Tick the box → Approve enables → run proceeds normally. (Real destructive
   tools like delete aren't in the MVP 9; this is the safety gate they'll use.)

### Report back
- Rate-limit bubble + auto-retry + manual Retry all work; destructive gate blocks
  Approve until confirmed. Then Chat/Agent still behave normally with the toggles
  off.

> Milestone 4 (Agent loop) complete after this. Next: Sprint 5 polish — streaming
> to mask latency, onboarding (PATH/Node/CLI detection), signed `.zxp`, and the
> Claude Code adapter behind the same interface.
