# CLAUDE.md — Kinea

Operating guide for building **Kinea**, an AI agent extension for Adobe After Effects.
Read this fully before writing code. The "Golden rules" are non-negotiable guardrails.

---

## What we're building

Kinea is a **CEP extension** for After Effects (2021+, Win/Mac). It has two modes:

- **Chat Mode** — read-only, project-aware Q&A (explain effects, debug expressions).
- **Agent Mode** — turns a natural-language request into a step plan, generates **ExtendScript**, and executes it live in the active composition.

The "brain" is **not** an embedded API. Kinea bridges to a **locally-installed CLI agent** that the user has authenticated with their own account (BYO — bring your own agent). MVP provider is **Gemini CLI**; the design must keep Claude Code and Codex behind a swappable adapter.

---

## Golden rules (do not violate)

1. **Agent Mode is the only mode that mutates the project.** Chat Mode must never call an `evalScript` that changes state — read-only operations only.
2. **Wrap every mutation in a single undo group.** All Agent execution runs inside `app.beginUndoGroup(stepName) … app.endUndoGroup()`. One step = one undo.
3. **Confirm before executing.** In Agent Mode, show the planned steps and require explicit user approval before running anything that changes the project.
4. **Never handle credentials.** Kinea does not store, request, or transmit API keys, passwords, or OAuth tokens. Authentication lives entirely inside the user's CLI. We only detect and spawn it.
5. **Respect the language boundary.** Host code (`host/*.jsx`) is **ExtendScript (ES3)** — no `let`/`const`, no arrow functions, no template literals, no native `JSON` (bundle `json2.js`), no `Array.forEach`/`map` unless polyfilled. Bridge and panel code is modern JS/ES modules. Never mix the two.
6. **`evalScript` is a string-only boundary.** Host functions receive string args and must **return a JSON string**. Always `try/catch` inside the host function and return `{"ok":false,"error":"…"}` on failure — never let an exception escape silently.
7. **Stay in MVP scope.** Do NOT build Premiere support, Ollama, direct API-key mode, voice input, or image/PDF references yet. If a task drifts there, stop and flag it.

---

## Tech stack & requirements

- **Runtime (pinned):** Adobe **CEP 9 / CSXS 9**, targeting **After Effects 2020 (17.0) and later** on Windows and macOS. Manifest declares `RequiredRuntime CSXS 9.0` and host `AEFT` from `17.0`. Because `RequiredRuntime` is a *minimum*, this also loads on AE 2021/2022+ (CSXS 10/11/12) — so we keep wide compatibility while supporting the dev machine (AE 2020). MVP needs only `evalScript` + Node `child_process`, neither of which requires CEP 11 APIs. (Lowered from the original CEP 11 pin on 2026-06-05 because the dev machine runs AE 2020; bump later only if a newer-only API is genuinely needed.)
- **Panel UI (pinned): plain vanilla JS** — HTML + CSS + plain `<script>` JS, **no framework, no build step** (no React, no Vite, no bundler) for the MVP. This keeps the CEP load path simple and debuggable. NOTE: use **classic scripts, not native ES modules** — `<script type="module">` is fetched with CORS and silently fails from the `file://` origin CEP serves the panel from. With no bundler, share code via globals / multiple `<script>` tags. No `localStorage`/`sessionStorage` — persist via the Node bridge to disk if needed.
- **`CSInterface.js` is an Adobe-provided file, not ours.** Download it from Adobe's official CEP-Resources repository and vendor it into `client/lib/CSInterface.js`. Do **not** hand-write or reimplement it.
- **Node bridge:** runs in the CEP Node context (manifest must enable Node, e.g. `--enable-nodejs` / `<CEFCommandLine>`). Uses `child_process` to spawn CLIs.
- **Host:** ExtendScript `.jsx`, invoked via `CSInterface.evalScript`.
- **CLIs (BYO providers):**
  - **Gemini CLI** (MVP default): `npm i -g @google/gemini-cli` (needs Node); free tier with a personal Google account serves Flash models (~60 RPM, ~1,000 req/day). NOTE: migrating into **Antigravity CLI** for individual tiers (~June 18, 2026) — keep it behind the adapter.
  - **Claude Code** (phase 5): `npm i -g @anthropic-ai/claude-code` (requires Node.js 18+) or the native installer `curl -fsSL https://claude.ai/install.sh | bash`. Headless invocation: `claude -p "<prompt>" --output-format json`, with `--resume <session_id>` for continuity and `--allowedTools` to scope tools. Do not use `sudo npm install -g`. Docs: https://docs.claude.com/en/docs/claude-code
  - **Codex CLI** (later).

---

## Proposed repo structure

```
kinea/
  CSXS/
    manifest.xml          # extension manifest; declares panel, Node enable, AE host versions
  client/                 # panel UI (runs in CEF/Chromium) — vanilla JS, no build step
    index.html
    css/
    js/                   # ES module JS, no framework/bundler
    lib/CSInterface.js    # vendored from Adobe CEP-Resources (do not reimplement)
  bridge/                 # Node-side logic (runs in CEP Node context)
    bridge.js             # message router between panel <-> providers <-> host
    providers/
      adapter.js          # the Provider interface (contract below)
      gemini.js           # MVP
      claude.js           # phase 5
      codex.js            # later
    context.js            # requests + caches serialized AE state
    safety.js             # plan validation, destructive-op detection
    env.js                # PATH / binary resolution (see Gotchas)
  host/                   # ExtendScript (ES3) — runs inside AE
    index.jsx             # entry; dispatches tool calls
    lib/json2.js          # JSON polyfill for ES3
    context.jsx           # serialize active comp/layers/props/expressions -> JSON string
    tools/                # one file per capability (see MVP tool surface)
  scripts/
    sign.sh               # ZXPSignCmd packaging
    dev-install.sh        # symlink/copy to CEP extensions dir
  .debug                  # remote debug ports for CEF
  package.json
  PROJECT_BRIEF.md
  CLAUDE.md
```

---

## Architecture & the Agent loop

Data flow: **Panel UI → Node bridge → CLI agent (user account) → ExtendScript via `evalScript` → AE DOM → context refresh → back to bridge.**

Agent Mode loop (each turn):

1. **Receive** the user prompt in the panel.
2. **Refresh context** — bridge calls `host/context.jsx` to serialize the current comp/selection to JSON.
3. **Optimize + plan** — bridge sends prompt + context to the provider; the model returns a list of visible steps.
4. **Confirm** — UI shows the plan; user approves (Golden rule 3).
5. **Per step:** model emits ExtendScript → bridge validates (safety.js) → executes via `evalScript` inside an undo group → captures the JSON result.
6. **Verify + refresh** — re-read state; on success continue to next step, on error surface it and stop.
7. **Resilience** — on a provider rate-limit (HTTP 429 / quota), back off and resume the session later rather than failing the whole task.

---

## Provider adapter contract

Every provider in `bridge/providers/` implements this interface:

```js
// adapter.js (shape, not implementation)
{
  id: "gemini",                       // stable key
  detectInstalled(): { found, binPath, version } ,   // async
  listEntitledModels(): string[],     // models THIS account can actually use
  defaultModel(isFreeTier): string,   // e.g. a Flash model for free accounts
  run({ prompt, model, context, sessionId, allowedTools }):
      // async; spawns the CLI headless, parses output, returns:
      { text, sessionId, steps?, scripts?, rateLimited?: boolean, error? }
}
```

Rules:
- Each adapter spawns its CLI in non-interactive mode and parses structured (JSON) output.
- Adapters own their own rate-limit detection and report `rateLimited` up to the bridge.
- The bridge is provider-agnostic — it must work against the interface only, never against a specific CLI's quirks.

---

## Context reader spec (`host/context.jsx`)

Serialize, as a JSON string, only what the model needs:
- Active comp: name, width, height, frameRate, duration, current time.
- Selected layers (or all layers if none selected, capped): index, name, type, enabled, key transform values.
- Selected/active properties and any expressions on them.
- On request, a compact project tree (comp names + layer counts).

Keep payloads small (especially for free tiers). Provide a `refreshContext()` entry the bridge can call before each turn.

---

## ExtendScript execution contract & safety

- Each capability is a **host function** that returns `JSON.stringify({ ok: true, result })` or `{ ok: false, error }`.
- Mutations run inside `app.beginUndoGroup(label)` / `app.endUndoGroup()`.
- `safety.js` flags potentially destructive operations (deleting layers/comps, overwriting files, anything via `system.callSystem`) — these require explicit confirmation even within an approved plan.
- Escape strings carefully when building the `evalScript` call; prefer passing a single JSON-string argument and parsing it host-side with `json2.js`.

---

## Agent execution model (MVP — decided 2026-06-05)

Agent Mode does **not** let the model emit free-form ExtendScript in the MVP
(that's the v2 reliability upgrade per PROJECT_BRIEF). Instead the model returns a
**structured tool-call plan** against the closed MVP tool surface below. This
keeps execution to tested host functions only (Coding conventions: "keep the MVP
tool list closed").

Plan shape the agent must return (the adapter parses this out of the CLI's JSON):

```json
{
  "summary": "one-line description of the whole task",
  "steps": [
    {
      "tool": "createComp",                 // must be one of the MVP tools
      "label": "Create 4K comp 'Hero'",     // human-readable, shown in the plan UI
      "params": { "name": "Hero", "width": 3840, "height": 2160, "fps": 30, "duration": 10 }
    }
  ]
}
```

Execution rules:
- The bridge validates every step **before** running: `tool` must be a known MVP
  tool, and `params` must pass that tool's schema. Unknown tool / bad params →
  reject the whole plan, surface why (never partially run an invalid plan).
- The user sees the plan (labels) and approves before anything runs (Golden rule 3).
- Each approved step maps to exactly one `host/tools/*` function, executed in its
  own `beginUndoGroup`/`endUndoGroup` (Golden rule 2 — one step = one undo).
- `safety.js` flags destructive steps (delete/overwrite/`system.callSystem`) for an
  extra explicit confirm even inside an approved plan.
- Free-tier: cap steps per turn; on `rateLimited`, persist `sessionId` and offer
  resume. Model-provided *data* (e.g. an expression string for `setExpression`) is
  allowed — it's a parameter, not arbitrary script.

---

## MVP tool surface (build these, test them hard)

Keep it small and reliable. Host functions live in `host/tools/`:

1. `createComp(spec)` — name, resolution, fps, duration.
2. `createLayer(spec)` — shape / text / solid / null in the active comp.
3. `duplicateLayer(ref)`.
4. `setTransformKeyframes(spec)` — position/scale/rotation/opacity keyframes with times + values.
5. `applyEffect(spec)` — apply a named effect with basic parameters.
6. `setExpression(spec)` — write or replace an expression on a property.
7. `findAndFixExpressionError()` — Chat-Mode-friendly: locate the erroring layer/property, explain, propose a fix (apply only in Agent Mode).
8. `renameAndOrganize(spec)` — rename layers, set labels, basic ordering.
9. `setEasing(spec)` — apply easy-ease / influence on existing keyframes.

The classic demo ("4K comp + simple animated character with a looping/blinking expression") should be expressible purely through these.

---

## Free-tier handling rules

- On connect: `detectInstalled()` → `listEntitledModels()` → if free tier, `defaultModel(true)` (a Flash model).
- Show only entitled models in the UI; never offer a model the account can't reach.
- Cap the number of execution steps per turn for free tiers; prefer several small turns over one large one.
- On `rateLimited`: exponential backoff, persist `sessionId`, show a clear recoverable message ("Free-tier limit reached — resuming in Ns / try again after reset"). Never fail silently.

---

## Dev & build

- **Enable unsigned extensions (dev):** set `PlayerDebugMode=1` (macOS: `defaults write com.adobe.CSXS.9 PlayerDebugMode 1`; Windows: registry `HKCU\Software\Adobe\CSXS.9`). Match the CSXS version to the AE version you target — AE 2020 is CSXS 9. `scripts/dev-install.ps1` sets it across CSXS 9–12 to cover AE 2020 → latest.
- **Install for dev:** copy or symlink the extension folder into the CEP extensions directory (`scripts/dev-install.sh`). Restart AE; open via `Window > Extensions > Kinea`.
- **Remote debug:** add a `.debug` file with CEF debug ports; inspect via Chrome at the chosen port.
- **Package for distribution:** sign with `ZXPSignCmd` → `.zxp` (`scripts/sign.sh`). Users install via a ZXP installer. AE rejects unsigned extensions without the debug flag.
- **Testing ExtendScript:** there is no easy unit-test harness for the AE engine; build a small manual "eval harness" panel button that runs a chosen `host/tools/*` function against a scratch comp and prints the JSON result.

---

## Critical gotchas

- **PATH not inherited:** when AE launches the CEP Node context (especially macOS GUI launch), `child_process` may not see the user's shell PATH, so `gemini` / `claude` / `node` appear "not found" even when installed. Resolve absolute binary paths in `env.js` (e.g. probe common install dirs, or source the login shell once and cache PATH).
- **Node prerequisite:** the npm-based CLIs need Node 18+. Detect Node in onboarding; guide install if missing.
- **ES3 host code:** see Golden rule 5. A common failure is the model writing modern JS into `.jsx`. The generation prompt for ExtendScript must explicitly state ES3 constraints, and `safety.js` should lint for `=>`, `` ` ``, `let`/`const` before executing.
- **Host `.jsx` is loaded once at panel load:** AE evaluates `ScriptPath` (`host/index.jsx` + its `#include`s) when the panel opens. Editing a host tool does **not** hot-reload — the dev symlink keeps files current on disk, but the old functions stay in memory until you **close & reopen the panel (or restart AE)**. Panel HTML/JS reloads on panel reopen; host code is the one that bit us (a "fixed" host tool kept failing because the stale version was still running). Always restart AE after host edits before testing.
- **CSP in the panel:** CEP enforces a content security policy; configure it in the manifest if the panel ever loads remote resources (MVP should avoid remote loads).
- **`evalScript` payload size & escaping:** large scripts/strings are slow and easy to mis-escape — prefer compact JSON arguments and host-side parsing.

---

## Milestone definition of done

1. **Skeleton** — panel opens in AE; a button runs `evalScript` that creates a red solid and returns a JSON success string to the panel.
2. **Context + Chat** — `context.jsx` returns valid JSON for the active comp; Chat Mode answers an expression question using one provider; no mutation occurs.
3. **Providers + login** — Gemini adapter detects the CLI, lists entitled models, runs a headless prompt, and reports rate limits; UI shows only available models.
4. **Agent loop** — a multi-step request produces a visible plan, executes each step in an undo group after confirmation, verifies, and recovers from a simulated 429.
5. **Polish & ship** — graceful errors and onboarding (incl. PATH/Node detection); signed `.zxp` installs cleanly; Claude Code adapter added behind the same interface.

---

## Coding conventions

- Clear module boundaries: panel ↔ bridge communicate via a small typed message protocol; bridge ↔ host communicate only through `evalScript` + JSON.
- Every host tool: single responsibility, JSON in / JSON out, `try/catch`, undo group for mutations.
- No secrets in the repo. No telemetry that captures prompt content without consent.
- Keep the MVP tool list closed — adding a capability means adding a tested `host/tools/*` function, not letting the model emit arbitrary scripts unchecked.

---

## Working agreement (how to collaborate on this repo)

**The most important constraint: you cannot run or test inside After Effects.** AE is a GUI app on the developer's machine. You can write the panel, bridge, and `.jsx`, but you cannot launch AE, confirm the panel loads, or verify that `evalScript` succeeds. Verification is human-in-the-loop. Therefore:

1. **Work one sprint at a time.** Implement toward a single milestone's definition of done, then **stop and hand off for manual testing in AE.** Do not race ahead to the next sprint.
2. **Make AE-facing changes small and verifiable.** Each `host/tools/*` function should be testable in isolation via the manual eval-harness button. Prefer many small, checkable steps over one large untested change.
3. **State your assumptions and ask before big moves.** Before any large refactor, dependency addition, or change to the architecture/contracts in this file, pause and ask.
4. **Never invent AE API behavior.** If unsure whether an ExtendScript call or property exists in AE 2021+, say so and ask the developer to confirm in AE rather than guessing. Cite the AE scripting guide when relying on a specific API.
5. **Respect the Golden rules above** in every change. If a request conflicts with them, flag it instead of complying silently.
6. **Keep this file current.** When a decision is made or a contract changes, update CLAUDE.md in the same change so it stays the source of truth.

## References (study these; do not copy proprietary code)

- **Adobe CEP-Resources** — official `CSInterface.js`, sample manifests, and CEP docs (vendor `CSInterface.js` from here): https://github.com/Adobe-CEP/CEP-Resources
- **`mikechambers/adb-mcp`** — open-source CEP + ExtendScript + MCP control of Adobe apps incl. After Effects; the cleanest legal reference for the bridge/host pattern: https://github.com/mikechambers/adb-mcp
- **After Effects Scripting Guide** — authoritative ExtendScript DOM reference for comps, layers, properties, expressions, render queue.
- **Claude Code docs** (phase-5 provider): https://docs.claude.com/en/docs/claude-code
- **Gemini CLI** (MVP provider): https://github.com/google-gemini/gemini-cli — note the Antigravity CLI migration for individual tiers.
- **PROJECT_BRIEF.md** — vision, scope, and roadmap context for this repo.
