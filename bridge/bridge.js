// Kinea bridge — message router between panel <-> providers <-> host
// (Node/CommonJS, runs in the CEP Node context; required directly by the panel
// thanks to --mixed-context).
//
// Provider-agnostic: it only uses the adapter contract. Sprint 3a exposes
// detectProvider(); chat/agent routing arrives in 3b/4.

var adapter = require("./providers/adapter");
var prompts = require("./prompts");
var gemini = require("./providers/gemini");

// Provider registry. New providers (claude, codex) register here once they
// implement the adapter contract.
var providers = {};
function register(p) {
    if (!adapter.isValidProvider(p)) {
        throw new Error("Invalid provider (missing adapter methods): " + (p && p.id));
    }
    providers[p.id] = p;
}
register(gemini);

// Detect whether a provider's CLI is installed + which models the account can
// use. Returns the standard { ok, result|error } envelope the panel expects.
function detectProvider(id) {
    var p = providers[id];
    if (!p) {
        return Promise.resolve({ ok: false, error: "Unknown provider: " + id });
    }
    return p.detectInstalled().then(function (info) {
        var models = [];
        var def = null;
        if (info.found) {
            try { models = p.listEntitledModels(); } catch (e) {}
            try { def = p.defaultModel(true); } catch (e2) {}
        }
        return {
            ok: true,
            result: {
                id: id,
                found: info.found,
                binPath: info.binPath,
                version: info.version,
                models: models,
                defaultModel: def,
                error: info.error || null
            }
        };
    }, function (err) {
        return { ok: false, error: String(err) };
    });
}

// Chat Mode (read-only). The panel supplies the already-serialized AE context
// (it owns the evalScript boundary); the bridge composes the prompt and routes
// it to the provider. Returns { ok, result:{ text, sessionId, rateLimited }, error }.
function chat(opts) {
    opts = opts || {};
    var id = opts.providerId || "gemini";
    var p = providers[id];
    if (!p) return Promise.resolve({ ok: false, error: "Unknown provider: " + id });
    if (typeof p.run !== "function") {
        return Promise.resolve({ ok: false, error: "Provider '" + id + "' has no run() yet." });
    }
    var prompt = prompts.buildChatPrompt(opts.question || "", opts.context || null);
    return p.run({ prompt: prompt, model: opts.model, sessionId: opts.sessionId }).then(
        function (r) {
            return { ok: !r.error, result: r, error: r.error || null };
        },
        function (e) {
            return { ok: false, error: String(e) };
        }
    );
}

function listProviders() {
    var ids = [];
    for (var k in providers) {
        if (providers.hasOwnProperty(k)) ids.push(k);
    }
    return ids;
}

module.exports = {
    detectProvider: detectProvider,
    chat: chat,
    listProviders: listProviders
};
