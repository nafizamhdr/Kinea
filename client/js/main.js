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
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const btnSend = document.getElementById("btn-send");
const modeChat = document.getElementById("mode-chat");
const modeAgent = document.getElementById("mode-agent");

// Chat session state (persisted in-memory for --resume continuity).
let chatSessionId = null;
let chatModel = null; // null -> adapter default (a Flash model)
let mode = "chat";    // "chat" | "agent"

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

btnDetect.addEventListener("click", async () => {
  btnDetect.disabled = true;
  setStatus("Detecting Gemini CLI…");
  try {
    const b = loadBridge();
    if (!b) {
      setStatus("Node bridge unavailable — is --enable-nodejs set in the manifest?", "err");
      return;
    }
    const res = await b.detectProvider("gemini");
    if (!res.ok) {
      setStatus(res.error, "err");
      return;
    }
    const r = res.result;
    if (!r.found) {
      setStatus("Gemini CLI not found.\nInstall it with:\n  npm i -g @google/gemini-cli", "err");
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

async function sendChat() {
  const question = chatInput.value.trim();
  if (!question) return;

  const b = loadBridge();
  if (!b || !b.chat) {
    appendChat("err", "Node bridge unavailable. Try Detect Gemini, or check --enable-nodejs.");
    return;
  }

  appendChat("you", question);
  chatInput.value = "";
  btnSend.disabled = true;
  chatInput.disabled = true;
  const pending = appendChat("kinea", "Thinking…");
  pending.classList.add("chat-msg--pending");
  setStatus("Asking Gemini…");

  try {
    // 1) Refresh AE context (read-only) so the answer is project-aware.
    const ctxRes = await callHost("kinea_refreshContext('{\"includeTree\":false}')");
    const context = ctxRes && ctxRes.ok ? ctxRes.result : null;

    // 2) Ask the provider via the bridge.
    const res = await b.chat({ question, context, model: chatModel, sessionId: chatSessionId });

    pending.remove();
    if (!res.ok) {
      const rl = res.result && res.result.rateLimited;
      const msg = rl
        ? "Free-tier limit reached. Wait a bit and try again."
        : (res.error || "Chat failed.");
      appendChat("err", msg);
      setStatus(msg, "err");
      return;
    }

    const r = res.result;
    if (r.sessionId) chatSessionId = r.sessionId;
    appendChat("kinea", r.text || "(empty response)");
    setStatus(r.rateLimited ? "Answered — near the free-tier limit." : "Ready.", r.rateLimited ? "" : "ok");
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

async function sendPlan() {
  const question = chatInput.value.trim();
  if (!question) return;

  const b = loadBridge();
  if (!b || !b.plan) {
    appendChat("err", "Node bridge unavailable. Try Detect Gemini, or check --enable-nodejs.");
    return;
  }

  appendChat("you", question);
  chatInput.value = "";
  btnSend.disabled = true;
  chatInput.disabled = true;
  const pending = appendChat("kinea", "Planning…");
  pending.classList.add("chat-msg--pending");
  setStatus("Planning…");

  try {
    const ctxRes = await callHost("kinea_refreshContext('{\"includeTree\":false}')");
    const context = ctxRes && ctxRes.ok ? ctxRes.result : null;

    const res = await b.plan({ question, context, model: chatModel, sessionId: chatSessionId });
    pending.remove();

    if (!res.ok) {
      const rl = res.result && res.result.rateLimited;
      const msg = rl
        ? "Free-tier limit reached. Wait a bit and try again."
        : (res.error || "Planning failed.");
      appendChat("err", msg);
      setStatus(msg, "err");
      return;
    }

    if (res.result.sessionId) chatSessionId = res.result.sessionId;
    renderPlan(res.result.plan);
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
    if (li) li.classList.add("is-done");
  }
  setStatus("Plan complete.", "ok");
  appendChat("kinea", "✓ Done — all steps executed.");
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
  approve.className = "btn btn--primary";
  approve.textContent = `Approve & run (${plan.steps.length})`;
  const cancel = document.createElement("button");
  cancel.className = "btn btn--ghost";
  cancel.textContent = "Cancel";
  actions.appendChild(approve);
  actions.appendChild(cancel);
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

setStatus("Ready.");
