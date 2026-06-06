// Kinea bridge — message router between panel <-> providers <-> host
// (Node/CommonJS, runs in the CEP Node context; required directly by the panel
// thanks to --mixed-context).
//
// Provider-agnostic: it only uses the adapter contract. Sprint 3a exposes
// detectProvider(); chat/agent routing arrives in 3b/4.

var adapter = require("./providers/adapter");
var prompts = require("./prompts");
var safety = require("./safety");
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
function chat(opts, onChunk) {
    opts = opts || {};
    if (opts.simulateRateLimit) {
        return Promise.resolve({
            ok: false,
            result: { rateLimited: true, sessionId: opts.sessionId || null, text: "" },
            error: "Simulated free-tier rate limit."
        });
    }
    var id = opts.providerId || "gemini";
    var p = providers[id];
    if (!p) return Promise.resolve({ ok: false, error: "Unknown provider: " + id });
    if (typeof p.run !== "function" && typeof p.runStream !== "function") {
        return Promise.resolve({ ok: false, error: "Provider '" + id + "' has no run() yet." });
    }
    var prompt = prompts.buildChatPrompt(opts.question || "", opts.context || null);
    var args = { prompt: prompt, model: opts.model, sessionId: opts.sessionId };

    var exec = (typeof onChunk === "function" && typeof p.runStream === "function")
        ? p.runStream(args, onChunk)
        : p.run(args);

    return exec.then(
        function (r) {
            return { ok: !r.error, result: r, error: r.error || null };
        },
        function (e) {
            return { ok: false, error: String(e) };
        }
    );
}

// Extract a JSON plan object from the model's text (tolerates stray prose by
// falling back to the outermost { ... }).
function parsePlanText(text) {
    if (!text) return null;
    try { return JSON.parse(String(text).trim()); } catch (e) {}
    var t = String(text);
    var first = t.indexOf("{");
    var last = t.lastIndexOf("}");
    if (first >= 0 && last > first) {
        try { return JSON.parse(t.substring(first, last + 1)); } catch (e2) {}
    }
    return null;
}

// Agent Mode planning (no execution — that happens in the panel after the user
// approves). Returns { ok, result:{ plan, sessionId, rateLimited, raw }, error }.
// The plan is already VALIDATED against the tool registry here.
function plan(opts) {
    opts = opts || {};
    if (opts.simulateRateLimit) {
        return Promise.resolve({
            ok: false,
            result: { rateLimited: true, sessionId: opts.sessionId || null, text: "" },
            error: "Simulated free-tier rate limit."
        });
    }
    var id = opts.providerId || "gemini";
    var p = providers[id];
    if (!p) return Promise.resolve({ ok: false, error: "Unknown provider: " + id });
    if (typeof p.run !== "function") {
        return Promise.resolve({ ok: false, error: "Provider '" + id + "' has no run() yet." });
    }
    var prompt = prompts.buildPlanPrompt(opts.question || "", opts.context || null);
    return p.run({ prompt: prompt, model: opts.model, sessionId: opts.sessionId }).then(
        function (r) {
            if (r.error) return { ok: false, result: r, error: r.error };
            var parsed = parsePlanText(r.text);
            if (!parsed) {
                return {
                    ok: false, result: r,
                    error: "Could not parse a JSON plan from the model. Raw start: " +
                           String(r.text || "").substring(0, 200)
                };
            }
            var v = safety.validatePlan(parsed);
            if (!v.ok) return { ok: false, result: r, error: v.error };
            return {
                ok: true,
                result: {
                    plan: v.result,
                    sessionId: r.sessionId,
                    rateLimited: r.rateLimited,
                    raw: r.text
                },
                error: null
            };
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
    plan: plan,
    listProviders: listProviders
};
