# Kinea

**Bring your own intelligence to After Effects.**

Kinea is a CEP extension for **Adobe After Effects** that turns natural-language
intent into real motion-design work. Describe what you want; Kinea plans it,
generates the steps, and builds it live in your active composition — using the
AI CLI **you** already have logged in. Kinea never holds API keys and never bills
model usage: cost and capability scale with your own account.

> Status: **MVP functionally complete** (milestones 1–5). Distribution packaging
> (`.zxp` signing) is the remaining step before public release.

---

## Two modes

- **Chat Mode** — read-only, project-aware Q&A. Explain effects, debug
  expressions, suggest approaches. Never mutates the project.
- **Agent Mode** — turns a request into a **visible plan** of tool calls, you
  **approve** it, then each step runs inside its own undo group. Reads the active
  comp before every turn.

## Bring Your Own Agent (BYO)

Kinea is a bridge, not a model host. It detects a locally-authenticated CLI agent
and drives it headlessly:

| Provider | Status | Notes |
|----------|--------|-------|
| **Gemini CLI** | default (free path) | Free tier with a personal Google account (Flash models) |
| **Claude Code** | supported | Faster/stronger; uses your Anthropic subscription/credits |
| Codex | planned | behind the same adapter |

You log into the CLI; Kinea only detects and spawns it. **No credentials ever
touch Kinea.**

---

## Requirements

- **After Effects 2020 (17.0) or later** (Windows/macOS). Manifest targets
  CSXS 9, so it also loads on AE 2021/2022+.
- **Node.js 18+** (the CLIs need it; the bridge runs in CEP's Node context).
- One provider CLI, authenticated:
  - Gemini: `npm i -g @google/gemini-cli`, then run `gemini` once and "Login with Google".
  - Claude Code (optional): `npm i -g @anthropic-ai/claude-code`, then sign in.

## Install (development)

Unsigned extensions need debug mode + the extension linked into the CEP folder.

```powershell
# from the repo root, in an elevated PowerShell
npm run dev-install
```

This sets `PlayerDebugMode=1` (CSXS 9–12) and symlinks the repo into
`%APPDATA%\Adobe\CEP\extensions\com.kinea.extension`. Then **fully restart After
Effects** and open `Window > Extensions > Kinea`.

> Editing host `.jsx` files requires reopening the panel / restarting AE — host
> code is loaded once at panel load.

A signed `.zxp` for end-user install is planned (not yet built).

## Usage

1. Open the panel → it checks your setup and shows the detected provider/model.
2. Pick **Provider** and **Model** in the header toolbar.
3. **Chat**: ask about your comp, effects, or expressions (read-only).
4. **Agent**: describe a task → review the plan → **Approve & run** → watch it
   build. Each step is one undo.

---

## MVP tool surface (Agent Mode)

The model returns a structured plan against this closed, tested tool set (no
free-form ExtendScript in the MVP):

`createComp` · `createLayer` (solid/text/null) · `duplicateLayer` ·
`setTransformKeyframes` · `setExpression` · `setEasing` · `applyEffect` ·
`renameAndOrganize` · `findAndFixExpressionError`

## Architecture

```
Panel UI (vanilla JS, CEF)
   → Node bridge (spawns the CLI, validates plans)
      → CLI agent (your account, headless)
   → Host ExtendScript via evalScript
      → AE DOM  → context refresh → back to the panel
```

- **`client/`** — panel UI: HTML + CSS + classic-script JS, no framework/build.
- **`bridge/`** — Node side: `bridge.js` (router), `providers/` (adapter +
  gemini/claude), `tools.js`/`safety.js` (closed tool registry + plan
  validation), `prompts.js`, `env.js` (PATH-safe binary resolution).
- **`host/`** — ExtendScript (ES3): `context.jsx` (read-only serializer) and
  `tools/*.jsx` (one tested function per capability, JSON in/out, undo group).
- **`CSXS/manifest.xml`**, **`scripts/dev-install.ps1`**, **`.debug`**.

## Safety guardrails

- Agent Mode is the only mode that mutates; Chat is strictly read-only.
- Every mutation runs in a single `beginUndoGroup`/`endUndoGroup` (one step = one undo).
- Plans are validated before anything runs; invalid plans are rejected whole.
- Destructive steps require an extra explicit confirm.
- Free-tier rate limits are detected with a recoverable backoff/resume message.

## Repo layout

```
kinea/
  CSXS/manifest.xml
  client/        index.html, css/, js/, lib/CSInterface.js (vendored)
  bridge/        bridge.js, providers/, tools.js, safety.js, prompts.js, env.js
  host/          index.jsx, context.jsx, lib/json2.js (vendored), tools/
  scripts/       dev-install.ps1
```

## Out of scope (for now)

Premiere support, local Ollama, direct API-key mode, voice input, image/PDF
references, vector shape layers, a preset/template library, and a structured
MCP tool layer (v2 reliability upgrade).

## Credits

`CSInterface.js` is Adobe's, vendored from the official CEP-Resources repo.
`json2.js` is Douglas Crockford's public-domain JSON polyfill (for ES3 host code).
Kinea itself is an original implementation built from publicly documented
CEP/ExtendScript APIs.

---

© 2026 Nafiza. All rights reserved.
