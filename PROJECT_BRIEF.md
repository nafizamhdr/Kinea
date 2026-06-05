# Kinea — Project Brief

> An AI agent for Adobe After Effects. Describe what you want in plain language; Kinea plans it, writes ExtendScript, and builds it live in your composition — using the AI account you already have.

**Status:** Pre-MVP / kickoff · **Owner:** Nafiza · **Platform:** Adobe After Effects (CEP) · **Last updated:** 2026-06-05

---

## 1. Vision

Kinea turns natural-language intent into real After Effects work. It runs as a native Extensions panel and connects to the user's own AI agent (Claude Code, Codex, or Gemini CLI). The user "brings their own intelligence" — Kinea never holds API keys and never bills model usage, so cost and capability scale with each user's own account tier. Free-tier users can participate with limited models; paid users unlock stronger ones.

**Tagline candidate:** *Bring your own intelligence to After Effects.*

## 2. Problem & opportunity

- ExtendScript and expressions have a steep learning curve; most motion designers avoid scripting entirely.
- Existing AI helpers either force API-key setup (cost + friction) or are generic chatbots disconnected from the live project.
- Opportunity: a *project-aware* agent that both advises (Chat) and *executes* (Agent), powered by the user's existing AI subscription — zero model cost to the developer, and a genuine free path for newcomers.

## 3. Target users

- Motion designers and video editors, beginner-to-intermediate scripting ability, who want speed without learning ExtendScript.
- Two tiers in mind: free users on Gemini Flash, and power users on paid Claude / Codex accounts.

## 4. Core concept — Bring Your Own Agent (BYO)

Kinea is a bridge, not a model host. It detects a locally-authenticated CLI agent and drives it headlessly. The user logs into their own CLI; the model and quota they get are whatever their account is entitled to. Kinea exposes only the models the connected account can actually access.

## 5. Key features (MVP)

- **Chat Mode** — read-only, project-aware Q&A: explain effects, debug expressions, suggest approaches. Never mutates the project.
- **Agent Mode** — plans a request into visible steps, writes ExtendScript, and executes it live inside the active composition.
- **Composition awareness** — reads the active comp, selected layers, properties, and expressions before each turn.
- **Multi-provider via adapters** — Gemini CLI first (free-friendly), structured for Claude Code and Codex.
- **Visible plan + confirm** — the user sees and approves the step plan before execution.
- **Safety** — every mutation wrapped in a single AE undo group.

## 6. Positioning vs the reference product (AE GPT)

AE GPT (by SUZA) is the closest existing product and our main reference. Kinea occupies the same category but differentiates on:

- **Free-tier-first onboarding** — designed so a user with only a free Google account can do real work.
- **Provider abstraction** — resilient to CLI churn (e.g. Gemini CLI's migration to Antigravity CLI), so the product isn't tied to one tool's lifecycle.
- **Reliability roadmap** — a path from free-form ExtendScript toward structured (MCP-style) tools for safer, more predictable execution.
- **Optional niche focus** — can specialize toward a workflow Nafiza knows well (e.g. reusable motion templates, gaming-montage automation) rather than staying fully generic.

*Kinea is an original implementation built from publicly documented CEP/ExtendScript APIs and open references — not a derivative of AE GPT's proprietary code.*

## 7. Scope

**In (MVP)**
- After Effects only (2021+), Windows and macOS.
- CEP panel with Node-enabled bridge.
- Chat Mode + Agent Mode.
- Gemini CLI provider (default), with an adapter interface ready for Claude Code / Codex.
- Curated, well-tested capability set (see CLAUDE.md).
- Plan preview, confirm-before-run, undo-group safety, free-tier rate-limit handling.

**Out (later versions)**
- Premiere Pro support.
- Local Ollama mode, direct API-key mode.
- Voice / Whisper input, image & PDF references.
- Structured MCP tool layer (v2 reliability upgrade).
- Preset / template library, deep multi-language polish.

## 8. MVP definition of done

A new user can:
1. Install the Kinea panel into After Effects.
2. Connect a Gemini account through the CLI (free tier acceptable).
3. In Agent Mode, type e.g. *"create a 4K comp and add a bouncing ball with squash and stretch"*, review the step plan, approve it, and watch Kinea build it.
4. In Chat Mode, paste a broken expression and get a correct explanation and fix.
5. Hit a free-tier rate limit and see a clear, recoverable message rather than a silent failure.

## 9. Provider & free-tier strategy

- **Gemini (default, free path):** ~60 req/min and ~1,000 req/day on a personal Google account; free tier serves Flash models (Pro is gated). Good enough for MVP workloads with small step batches.
- **Claude Code / Codex (paid path):** generally require a paid subscription or API credits; offered as upgrades for power users.
- **Entitlement-aware:** on connect, detect the provider and list only the models the account can use. Default free users to Flash. Apply exponential backoff on rate limits and persist the session so work resumes after quota reset.
- **Heads-up (time-sensitive):** Google is folding Gemini CLI into **Antigravity CLI** (individual tiers affected ~June 18, 2026). Keep providers behind an adapter so the underlying CLI can be swapped without touching core logic.

## 10. Key risks & mitigations

- **Destructive AI-generated scripts** → undo-group wrapping, confirm-before-run, Chat Mode is strictly read-only.
- **Free-tier rate limits** → small step batches, backoff, session resume.
- **CLI not found / PATH issues** → install detection, guided onboarding, full-path binary resolution (GUI-launched panels don't inherit shell PATH).
- **ExtendScript fragility** → small curated tool surface now; structured tools later.
- **Provider/CLI churn** → adapter layer (see Antigravity note).
- **Distribution friction** → sign with ZXPSignCmd; use PlayerDebugMode during development.

## 11. Roadmap (5 sprints)

1. **Skeleton** — CEP panel + `evalScript` round-trip ("create a red solid").
2. **Context + Chat** — serialize active comp/layers to JSON; read-only Chat with one provider.
3. **Providers + login** — adapter layer, Gemini CLI connect, model detection, free-tier handling.
4. **Agent loop** — plan → generate ExtendScript → execute in undo group → verify; step-list UI; confirm/safety.
5. **Polish & ship** — error handling, onboarding, signing/packaging; add Claude Code as second provider.

## 12. Branding

- **Name:** Kinea (from *kinetic*). Verify domain, social handles, and trademark before locking.
- **Voice:** capable, calm, motion-design-native. Not hype-y.
