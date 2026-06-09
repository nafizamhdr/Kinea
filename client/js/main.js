// Kinea panel logic (classic script, modern JS — runs in the CEF/Chromium context).
// Talks to the host (ExtendScript) only through CSInterface.evalScript, and
// every host call is expected to return a JSON string per the host contract.

// CSInterface is a global defined by lib/CSInterface.js (loaded before this module).
const cs = new CSInterface();

const statusEl = document.getElementById("status");
const btnPing = document.getElementById("btn-ping");
const btnContext = document.getElementById("btn-context");
const btnDetect = document.getElementById("btn-detect");
const btnSolid = document.getElementById("btn-solid");
const btnTestRename = document.getElementById("btn-test-rename");
const btnDescribe = document.getElementById("btn-describe");
const btnListEffects = document.getElementById("btn-list-effects");
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const btnSend = document.getElementById("btn-send");
const modeChat = document.getElementById("mode-chat");
const modeAgent = document.getElementById("mode-agent");
const simRateLimit = document.getElementById("sim-ratelimit");
const simDestructive = document.getElementById("sim-destructive");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");

// Chat session state (persisted in-memory for --resume continuity).
let chatSessionId = null;
let chatModel = null;          // null -> adapter default
let activeProvider = "gemini"; // selectable; defaults to the MVP provider
let mode = "chat";             // "chat" | "agent"
let rlAttempt = 0;             // rate-limit backoff counter (resets on success)

// Install hints per provider, shown during onboarding if the CLI is missing.
const INSTALL_HINTS = {
  gemini: "1) Install:  npm i -g @google/gemini-cli\n2) Log in:  run  gemini  in a terminal → choose “Login with Google” (free).",
  claude: "1) Install:  npm i -g @anthropic-ai/claude-code\n2) Log in:  run  claude  once in a terminal and sign in.",
};

// --- Node bridge ---------------------------------------------------------
// With --mixed-context, the panel shares the Node context, so we can require
// the bridge directly. Resolve it from the extension root so the path is stable.
let bridge = null;
function loadBridge() {
  if (bridge) return bridge;
  try {
    const nodeRequire =
      (window.cep_node && window.cep_node.require) ||
      (typeof require !== "undefined" ? require : null);
    if (!nodeRequire) return null;
    const path = nodeRequire("path");
    const extRoot = cs.getSystemPath(SystemPath.EXTENSION);
    bridge = nodeRequire(path.join(extRoot, "bridge", "bridge.js"));
  } catch (e) {
    console.error("Bridge load failed:", e);
    bridge = null;
  }
  return bridge;
}

/**
 * Render a status line. tone: "" | "ok" | "err".
 */
function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-ok", tone === "ok");
  statusEl.classList.toggle("is-err", tone === "err");
}

/**
 * Call a host function and resolve with its parsed JSON result.
 * The host contract guarantees a JSON string; anything else (e.g. CEP's
 * "EvalScript error.") is surfaced as a host-level failure.
 */
function callHost(script) {
  return new Promise((resolve) => {
    cs.evalScript(script, (raw) => {
      if (raw === "EvalScript error." || raw === undefined || raw === "") {
        resolve({ ok: false, error: `Host did not return JSON (got: ${JSON.stringify(raw)})` });
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({ ok: false, error: `Could not parse host response: ${raw}` });
      }
    });
  });
}

/**
 * Run a host call with button locking + consistent status messaging.
 * okTone lets data dumps (e.g. context JSON) render neutral instead of green.
 */
async function runAction(button, label, script, onOk, okTone = "ok") {
  button.disabled = true;
  setStatus(`${label}…`);
  try {
    const res = await callHost(script);
    if (res.ok) {
      setStatus(onOk(res.result), okTone);
    } else {
      setStatus(res.error, "err");
    }
  } finally {
    button.disabled = false;
  }
}

btnPing.addEventListener("click", () => {
  runAction(btnPing, "Pinging host", "kinea_ping()", (r) => `Host alive: ${r.host}`);
});

btnContext.addEventListener("click", () => {
  runAction(
    btnContext,
    "Reading context",
    "kinea_refreshContext('{\"includeTree\":true}')",
    (r) => {
      const head = r.activeComp
        ? `Context — "${r.activeComp.name}" (${r.layers.length}/${r.activeComp.numLayers} layers, source: ${r.layerSource}):`
        : "No active composition. Open or select a comp.";
      return `${head}\n${JSON.stringify(r, null, 2)}`;
    },
    "" // neutral tone for a data dump
  );
});

// Diagnostic: call the rename host fn DIRECTLY (bypassing the model) on the
// selected layer, and show the RAW host string so we can see exactly what it
// returns. Helps tell "host worked / display issue" from "host failed".
btnTestRename.addEventListener("click", () => {
  btnTestRename.disabled = true;
  setStatus("Testing rename on selected layer…");
  const payload = JSON.stringify({ items: [{ newName: "KineaTest", label: 9 }] });
  const script = `kinea_renameAndOrganize(${JSON.stringify(payload)})`;
  cs.evalScript(script, (raw) => {
    setStatus("Raw host return:\n" + raw, "");
    btnTestRename.disabled = false;
  });
});

// Phase 1a: introspect the selected layer's property tree (read-only). Shows the
// matchNames the agent uses for setProperty/setKeyframes paths.
btnDescribe.addEventListener("click", async () => {
  btnDescribe.disabled = true;
  setStatus("Describing selected layer…");
  try {
    const res = await callHost("kinea_describeLayer('{\"layer\":\"selected\"}')");
    if (res.ok) {
      appendChat("kinea", "describeLayer:\n" + JSON.stringify(res.result, null, 2));
      setStatus("Ready.", "ok");
    } else {
      setStatus(res.error, "err");
    }
  } finally {
    btnDescribe.disabled = false;
  }
});

// Phase 1b: list common effects; with a layer selected, marks which matchNames
// actually resolve on this AE install (available:true/false).
btnListEffects.addEventListener("click", async () => {
  btnListEffects.disabled = true;
  setStatus("Listing effects…");
  try {
    const res = await callHost("kinea_listEffects('{}')");
    if (res.ok) {
      const r = res.result;
      const lines = r.effects.map((e) => {
        const mark = e.available === undefined ? "•" : (e.available ? "✓" : "✗");
        return `${mark} ${e.name} — ${e.matchName} [${e.category}]`;
      });
      const head = r.verifiedAgainstSelection
        ? "Effects (✓ = addable to the selected layer):"
        : "Effects (select a layer to verify availability):";
      appendChat("kinea", `${head}\n${lines.join("\n")}`);
      setStatus("Ready.", "ok");
    } else {
      setStatus(res.error, "err");
    }
  } finally {
    btnListEffects.disabled = false;
  }
});

btnDetect.addEventListener("click", async () => {
  btnDetect.disabled = true;
  setStatus("Detecting Gemini CLI…");
  try {
    const b = loadBridge();
    if (!b) {
      setStatus("Node bridge unavailable — is --enable-nodejs set in the manifest?", "err");
      return;
    }
    const res = await b.detectProvider(activeProvider);
    if (!res.ok) {
      setStatus(res.error, "err");
      return;
    }
    const r = res.result;
    if (!r.found) {
      setStatus(`${activeProvider} CLI not found.\n${INSTALL_HINTS[activeProvider] || ""}`, "err");
      return;
    }
    const lines = [
      `Gemini detected — ${r.version}`,
      `bin: ${r.binPath}`,
      `models: ${r.models.join(", ")}`,
      `default: ${r.defaultModel}`,
    ];
    if (r.error) lines.push(`note: ${r.error}`);
    setStatus(lines.join("\n"), r.error ? "" : "ok");
    // Re-enable sending + refresh the model picker.
    populateModels(r.models, r.defaultModel);
    setReady(true);
  } finally {
    btnDetect.disabled = false;
  }
});

btnSolid.addEventListener("click", () => {
  runAction(
    btnSolid,
    "Creating red solid",
    "kinea_createRedSolid()",
    (r) => `Created "${r.layerName}" (layer ${r.layerIndex}) in "${r.compName}" — ${r.width}×${r.height}.`
  );
});

// --- Chat Mode -----------------------------------------------------------

function appendChat(role, text) {
  const div = document.createElement("div");
  const cls = role === "you" ? "chat-msg--you" : role === "err" ? "chat-msg--err" : "chat-msg--kinea";
  div.className = `chat-msg ${cls}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

// Recoverable rate-limit UI: exponential backoff with auto-retry + a manual
// "Retry now" button. sessionId is already persisted so the work resumes.
function renderRateLimit(retryFn) {
  rlAttempt++;
  const delay = Math.min(60, 5 * Math.pow(2, rlAttempt - 1)); // 5,10,20,40,60s

  const card = document.createElement("div");
  card.className = "chat-msg chat-msg--err";
  const text = document.createElement("div");
  const btn = document.createElement("button");
  btn.className = "btn btn--ghost";
  btn.textContent = "Retry now";
  btn.style.marginTop = "6px";
  card.appendChild(text);
  card.appendChild(btn);
  chatLog.appendChild(card);
  chatLog.scrollTop = chatLog.scrollHeight;

  let remaining = delay;
  let timer = null;
  const cleanup = () => { if (timer) clearTimeout(timer); card.remove(); };
  const fire = () => { cleanup(); retryFn(); };
  const tick = () => {
    text.textContent = `Free-tier limit reached (session saved). Auto-retry in ${remaining}s…`;
    if (remaining <= 0) { fire(); return; }
    remaining--;
    timer = setTimeout(tick, 1000);
  };
  btn.addEventListener("click", fire);
  setStatus("Free-tier limit reached — will resume.", "err");
  tick();
}

async function sendChat(retryQuestion) {
  const question = retryQuestion || chatInput.value.trim();
  if (!question) return;

  const b = loadBridge();
  if (!b || !b.chat) {
    appendChat("err", "Node bridge unavailable. Try Detect Gemini, or check --enable-nodejs.");
    return;
  }

  if (!retryQuestion) appendChat("you", question);
  chatInput.value = "";
  btnSend.disabled = true;
  chatInput.disabled = true;
  const pending = appendChat("kinea", "Thinking…");
  pending.classList.add("chat-msg--pending");
  setStatus("Asking Gemini…");

  const simRL = simRateLimit && simRateLimit.checked;
  if (simRateLimit) simRateLimit.checked = false; // one-shot

  // Live streaming: replace the "Thinking…" bubble with text as it arrives.
  let streamed = "";
  const onChunk = (delta) => {
    if (!streamed) { pending.classList.remove("chat-msg--pending"); pending.textContent = ""; }
    streamed += delta;
    pending.textContent = streamed;
    chatLog.scrollTop = chatLog.scrollHeight;
  };

  try {
    // 1) Refresh AE context (read-only) so the answer is project-aware.
    const ctxRes = await callHost("kinea_refreshContext('{\"includeTree\":false}')");
    const context = ctxRes && ctxRes.ok ? ctxRes.result : null;

    // 2) Ask the provider via the bridge (streamed).
    const res = await b.chat(
      { question, context, model: chatModel, sessionId: chatSessionId, providerId: activeProvider, simulateRateLimit: simRL },
      onChunk
    );

    if (res.result && res.result.sessionId) chatSessionId = res.result.sessionId;

    if (!res.ok) {
      pending.remove();
      if (res.result && res.result.rateLimited) {
        renderRateLimit(() => sendChat(question));
      } else {
        appendChat("err", res.error || "Chat failed.");
        setStatus(res.error || "Chat failed.", "err");
      }
      return;
    }

    rlAttempt = 0; // success resets backoff
    // Settle the bubble on the authoritative final text (covers non-stream fallback).
    pending.classList.remove("chat-msg--pending");
    pending.textContent = res.result.text || streamed || "(empty response)";
    setStatus("Ready.", "ok");
  } catch (e) {
    pending.remove();
    appendChat("err", String(e));
    setStatus(String(e), "err");
  } finally {
    btnSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

// --- Agent Mode: plan -> approve -> execute ------------------------------

async function sendPlan(retryQuestion) {
  const question = retryQuestion || chatInput.value.trim();
  if (!question) return;

  const b = loadBridge();
  if (!b || !b.plan) {
    appendChat("err", "Node bridge unavailable. Try Detect Gemini, or check --enable-nodejs.");
    return;
  }

  if (!retryQuestion) appendChat("you", question);
  chatInput.value = "";
  btnSend.disabled = true;
  chatInput.disabled = true;
  const pending = appendChat("kinea", "Planning…");
  pending.classList.add("chat-msg--pending");
  setStatus("Planning…");

  const simRL = simRateLimit && simRateLimit.checked;
  if (simRateLimit) simRateLimit.checked = false; // one-shot

  try {
    const ctxRes = await callHost("kinea_refreshContext('{\"includeTree\":false}')");
    const context = ctxRes && ctxRes.ok ? ctxRes.result : null;

    // Planning is STATELESS: do not resume a prior session. Resuming made the
    // model think the task was already done and return an empty plan ("Plan has
    // no steps") on the 2nd+ request. The prompt already carries full context.
    const res = await b.plan({ question, context, model: chatModel, providerId: activeProvider, simulateRateLimit: simRL });
    pending.remove();

    if (!res.ok) {
      if (res.result && res.result.rateLimited) {
        renderRateLimit(() => sendPlan(question));
      } else {
        const raw = res.result && res.result.raw ? `\n\nModel said:\n${String(res.result.raw).slice(0, 300)}` : "";
        appendChat("err", (res.error || "Planning failed.") + raw);
        setStatus(res.error || "Planning failed.", "err");
      }
      return;
    }

    rlAttempt = 0; // success resets backoff
    const plan = res.result.plan;

    // Dev: simulate a destructive plan to exercise the extra-confirm gate.
    if (simDestructive && simDestructive.checked) {
      plan.destructiveSteps = plan.steps.map((_, i) => i + 1);
      plan.steps.forEach((s) => { s.destructive = true; });
      simDestructive.checked = false;
    }

    renderPlan(plan);
    setStatus("Plan ready — review and approve.", "");
  } catch (e) {
    pending.remove();
    appendChat("err", String(e));
    setStatus(String(e), "err");
  } finally {
    btnSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

// Build the evalScript call for one step, escaping the JSON arg safely
// (Golden rule 6 / escaping gotcha): JSON.stringify twice -> a valid JS string
// literal containing the JSON text.
function buildStepScript(step) {
  const argJson = JSON.stringify(step.params || {});
  return `${step.hostFn}(${JSON.stringify(argJson)})`;
}

// Short, human-readable confirmation of what a step actually did (from the host
// tool's returned result) — this is the per-step verification surfaced to the user.
function summarizeResult(tool, r) {
  if (!r || typeof r !== "object") return "";
  switch (tool) {
    case "createComp": return `${r.name} ${r.width}×${r.height} @${r.fps}fps`;
    case "createLayer": return `${r.name} (${r.type})`;
    case "duplicateLayer": return `${r.name}`;
    case "setTransformKeyframes": return `${r.keyframes} key(s) on ${r.property}`;
    case "setExpression": return `${r.property}: ${r.expression}`;
    case "setEasing": return `${r.keysEased} key(s) eased`;
    case "applyEffect": return `${r.effect}`;
    case "renameAndOrganize": return `${r.changed} change(s)`;
    case "findAndFixExpressionError": return `${r.count} error(s) found`;
    default: return "";
  }
}

async function executePlan(plan, stepEls) {
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const li = stepEls[i];
    if (li) li.classList.add("is-running");
    setStatus(`Running step ${i + 1}/${plan.steps.length}: ${step.label}…`);

    const res = await callHost(buildStepScript(step));

    if (li) li.classList.remove("is-running");
    if (!res.ok) {
      if (li) li.classList.add("is-fail");
      appendChat("err", `Step ${i + 1} failed (${step.tool}): ${res.error}`);
      setStatus(`Stopped at step ${i + 1}: ${res.error}`, "err");
      return false;
    }
    if (li) {
      li.classList.add("is-done");
      const detail = summarizeResult(step.tool, res.result);
      if (detail) li.textContent = `${step.label}  → ${detail}`; // verify: show what happened
    }

    // Diagnostic tool: surface its findings (it's read-only, no mutation).
    if (step.tool === "findAndFixExpressionError") {
      const r = res.result;
      if (r && r.errors && r.errors.length) {
        appendChat("kinea", "Expression errors found:\n" +
          r.errors.map((e) => `• ${e.layer} → ${e.property}: ${e.error}`).join("\n"));
      } else {
        appendChat("kinea", "No expression errors found.");
      }
    }
  }

  // Verify + refresh (Agent loop step 6): re-read AE state to confirm the result.
  const verify = await callHost("kinea_refreshContext('{}')");
  if (verify.ok && verify.result && verify.result.activeComp) {
    const c = verify.result.activeComp;
    appendChat("kinea", `✓ Done. Verified — active comp “${c.name}”, ${c.numLayers} layer(s).`);
  } else {
    appendChat("kinea", "✓ Done — all steps executed.");
  }
  setStatus("Plan complete.", "ok");
  return true;
}

function renderPlan(plan) {
  const card = document.createElement("div");
  card.className = "plan-card";

  const summary = document.createElement("div");
  summary.className = "plan-card__summary";
  summary.textContent = plan.summary || "Proposed plan";
  card.appendChild(summary);

  const ol = document.createElement("ol");
  ol.className = "plan-card__steps";
  const stepEls = [];
  plan.steps.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.destructive ? `⚠️ ${s.label}` : s.label;
    ol.appendChild(li);
    stepEls.push(li);
  });
  card.appendChild(ol);

  const actions = document.createElement("div");
  actions.className = "plan-card__actions";
  const approve = document.createElement("button");
  approve.className = "btn btn--run";
  approve.textContent = `Approve & run (${plan.steps.length})`;
  const cancel = document.createElement("button");
  cancel.className = "btn btn--ghost";
  cancel.textContent = "Cancel";
  actions.appendChild(approve);
  actions.appendChild(cancel);

  // Destructive steps need an extra explicit confirm even inside an approved
  // plan (Golden rule / safety.js). Approve stays disabled until acknowledged.
  const hasDestructive = plan.destructiveSteps && plan.destructiveSteps.length;
  if (hasDestructive) {
    approve.disabled = true;
    const warn = document.createElement("label");
    warn.className = "plan-card__warn";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    warn.appendChild(cb);
    warn.appendChild(document.createTextNode(
      ` This plan has ${plan.destructiveSteps.length} destructive step(s). Tick to confirm you want to run them.`));
    card.appendChild(warn);
    cb.addEventListener("change", () => { approve.disabled = !cb.checked; });
  }

  card.appendChild(actions);

  chatLog.appendChild(card);
  chatLog.scrollTop = chatLog.scrollHeight;

  approve.addEventListener("click", async () => {
    approve.disabled = true;
    cancel.disabled = true;
    approve.textContent = "Running…";
    const okAll = await executePlan(plan, stepEls);
    approve.textContent = okAll ? "Done ✓" : "Stopped";
  });
  cancel.addEventListener("click", () => {
    card.classList.add("plan-card--cancelled");
    approve.disabled = true;
    cancel.disabled = true;
    setStatus("Plan cancelled.", "");
  });
}

// --- Send dispatch + mode toggle -----------------------------------------

function onSend() {
  if (mode === "agent") sendPlan();
  else sendChat();
}

function setMode(next) {
  mode = next;
  const agent = next === "agent";
  modeAgent.classList.toggle("mode__btn--active", agent);
  modeChat.classList.toggle("mode__btn--active", !agent);
  modeAgent.setAttribute("aria-selected", String(agent));
  modeChat.setAttribute("aria-selected", String(!agent));
  chatInput.placeholder = agent
    ? "Describe what to build… (Agent plans, you approve)"
    : "Ask Kinea… (Enter to send, Shift+Enter for newline)";
  setStatus(agent ? "Agent Mode — describe a task to plan." : "Chat Mode — read-only.", "");
}

modeChat.addEventListener("click", () => setMode("chat"));
modeAgent.addEventListener("click", () => setMode("agent"));

btnSend.addEventListener("click", onSend);
chatInput.addEventListener("keydown", (e) => {
  // Enter sends; Shift+Enter inserts a newline.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
});

// --- Onboarding: check the setup on panel load and guide if something's missing.

function setIntro(text, isError) {
  const intro = document.getElementById("intro-msg");
  if (!intro) return;
  intro.textContent = text;
  intro.className = "chat-msg " + (isError ? "chat-msg--err" : "chat-msg--kinea");
}

function setReady(ready) {
  // Block sending until the provider is usable; keeps errors graceful.
  btnSend.disabled = !ready;
}

function populateProviders(b) {
  if (!providerSelect) return;
  let ids = [];
  try { ids = b.listProviders(); } catch (e) {}
  if (!ids.length) ids = ["gemini"];
  providerSelect.innerHTML = "";
  ids.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    providerSelect.appendChild(opt);
  });
  if (ids.indexOf(activeProvider) < 0) activeProvider = ids[0];
  providerSelect.value = activeProvider;
}

// Fill the model picker with the provider's entitled models (CLAUDE.md free-tier
// rule: only offer models the account can reach). Sets chatModel accordingly.
function populateModels(models, def) {
  const list = (models && models.length) ? models.slice() : (def ? [def] : []);
  if (modelSelect) {
    modelSelect.innerHTML = "";
    list.forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      modelSelect.appendChild(o);
    });
    if (def && list.indexOf(def) >= 0) modelSelect.value = def;
    modelSelect.disabled = list.length === 0;
    chatModel = modelSelect.value || def || null;
  } else {
    chatModel = def || null;
  }
}

async function init() {
  setStatus("Checking setup…");
  setReady(false);

  const b = loadBridge();
  if (!b) {
    setIntro(
      "⚠️ Node bridge unavailable — the panel can't reach the CLI.\n" +
      "Ensure the manifest enables Node (--enable-nodejs) and reopen the panel.",
      true
    );
    setStatus("Node bridge unavailable.", "err");
    return;
  }

  populateProviders(b);

  try {
    const res = await b.detectProvider(activeProvider);
    if (res.ok && res.result.found) {
      populateModels(res.result.models, res.result.defaultModel);
      setIntro(
        `Ready — ${activeProvider} ${res.result.version} detected (model: ${res.result.defaultModel}).\n` +
        "Chat is read-only Q&A about your comp. Switch to Agent to plan & build."
      );
      setStatus("Ready.", "ok");
      setReady(true);
    } else {
      const hint = INSTALL_HINTS[activeProvider] || "Install the provider's CLI and log in.";
      setIntro(
        `⚠️ ${activeProvider} CLI not found. To finish setup:\n${hint}\n` +
        "Then reopen this panel (or click Detect Gemini in Dev tools).",
        true
      );
      setStatus(`${activeProvider} CLI not found.`, "err");
    }
  } catch (e) {
    setIntro("Setup check failed: " + e, true);
    setStatus("Setup check failed.", "err");
  }
}

if (providerSelect) {
  providerSelect.addEventListener("change", () => {
    activeProvider = providerSelect.value;
    chatSessionId = null; // new provider -> fresh session
    init();
  });
}
if (modelSelect) {
  modelSelect.addEventListener("change", () => { chatModel = modelSelect.value; });
}

init();
