// Kinea host entry — ExtendScript (ES3). Loaded via manifest ScriptPath.
// Pulls in the JSON polyfill and every host tool, then exposes them to
// evalScript. Host functions are the ONLY boundary the bridge can call.
//
// ES3 constraints (Golden rule 5): no let/const, no arrow functions,
// no template literals, no native JSON (json2.js below), no Array.forEach/map.

#include "lib/json2.js"
#include "context.jsx"
#include "tools/_shared.jsx"
#include "tools/createSolid.jsx"
#include "tools/createComp.jsx"
#include "tools/createLayer.jsx"
#include "tools/duplicateLayer.jsx"
#include "tools/setExpression.jsx"
#include "tools/setTransformKeyframes.jsx"
#include "tools/renameAndOrganize.jsx"

// Sprint-1 smoke test: confirms the evalScript round-trip and JSON contract
// without touching the project. Read-only, safe in either mode.
function kinea_ping() {
    try {
        var hostName = "unknown";
        try { hostName = app.appName + " " + app.version; } catch (e0) {}
        return JSON.stringify({ ok: true, result: { pong: true, host: hostName } });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
