// Kinea panel logic (classic script, modern JS — runs in the CEF/Chromium context).
// Talks to the host (ExtendScript) only through CSInterface.evalScript, and
// every host call is expected to return a JSON string per the host contract.

// CSInterface is a global defined by lib/CSInterface.js (loaded before this module).
const cs = new CSInterface();

const statusEl = document.getElementById("status");
const btnPing = document.getElementById("btn-ping");
const btnContext = document.getElementById("btn-context");
const btnSolid = document.getElementById("btn-solid");

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

btnSolid.addEventListener("click", () => {
  runAction(
    btnSolid,
    "Creating red solid",
    "kinea_createRedSolid()",
    (r) => `Created "${r.layerName}" (layer ${r.layerIndex}) in "${r.compName}" — ${r.width}×${r.height}.`
  );
});

setStatus("Ready.");
