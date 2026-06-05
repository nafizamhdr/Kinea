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
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const btnSend = document.getElementById("btn-send");

// Chat session state (persisted in-memory for --resume continuity).
let chatSessionId = null;
let chatModel = null; // null -> adapter default (a Flash model)

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

btnSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
  // Enter sends; Shift+Enter inserts a newline.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

setStatus("Ready.");
