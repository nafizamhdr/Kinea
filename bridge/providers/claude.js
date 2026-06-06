// Kinea provider — Claude Code adapter (Node/CommonJS). SCAFFOLD (phase 5).
// Implements the same contract as gemini.js so the bridge can swap providers.
// Verified to load + detect; the run() path is built to the documented Claude
// Code headless interface but should be confirmed once Claude Code is installed.
//
// Headless docs: `claude -p --output-format json` (the -p/--print flag is a
// boolean; the prompt is read from stdin), `--resume <session_id>` for
// continuity, `--model <alias|id>`. We never handle credentials (Golden rule 4):
// the user authenticates inside Claude Code itself.

var child_process = require("child_process");
var os = require("os");
var fs = require("fs");
var path = require("path");
var env = require("../env");

// Claude Code accepts these short aliases (or full ids like claude-sonnet-4-6).
// Entitlement detection is a TODO; Claude has no free tier, so we don't gate.
var KNOWN_MODELS = ["sonnet", "opus", "haiku"];

function tempWorkDir() {
    var d = path.join(os.tmpdir(), "kinea-claude");
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
}

function shellRun(bin, args, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 15000;
    return new Promise(function (resolve) {
        function cb(err, stdout, stderr) {
            resolve({
                err: err,
                stdout: (stdout || "").toString().trim(),
                stderr: (stderr || "").toString().trim()
            });
        }
        if (env.isWin) {
            child_process.exec('"' + bin + '" ' + args.join(" "), { timeout: timeout, windowsHide: true }, cb);
        } else {
            child_process.execFile(bin, args, { timeout: timeout }, cb);
        }
    });
}

function detectInstalled() {
    return new Promise(function (resolve) {
        var binPath = env.resolveBinary("claude");
        if (!binPath) {
            resolve({ found: false, binPath: null, version: null });
            return;
        }
        shellRun(binPath, ["--version"]).then(function (r) {
            resolve({
                found: true,
                binPath: binPath,
                version: r.stdout || r.stderr || "unknown",
                error: (r.err && !r.stdout) ? String(r.err) : null
            });
        });
    });
}

function listEntitledModels() {
    return KNOWN_MODELS.slice();
}

function defaultModel(isFreeTier) {
    return "sonnet";
}

function parseJson(s) {
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) {}
    var first = s.indexOf("{");
    var last = s.lastIndexOf("}");
    if (first >= 0 && last > first) {
        try { return JSON.parse(s.substring(first, last + 1)); } catch (e2) {}
    }
    return null;
}

var RL_RE = /429|RATE_LIMIT|rate.?limit|too many requests|quota|exhausted|overloaded|UNAVAILABLE|\b503\b/i;

function isRateLimited(text) {
    return RL_RE.test(text || "");
}

// Headless run. Prompt is piped via stdin (-p is a boolean print flag), so no
// command-line escaping of the prompt is needed.
function run(params) {
    params = params || {};
    return new Promise(function (resolve) {
        var binPath = env.resolveBinary("claude");
        if (!binPath) {
            resolve({ text: "", sessionId: params.sessionId || null, error: "Claude Code CLI not found." });
            return;
        }
        var prompt = params.prompt || "";
        // Always pin a model (default sonnet) so we never inherit the user's
        // Claude Code default (which may be Opus and ~20x the cost).
        var model = params.model || defaultModel();
        var cmd = '"' + binPath + '" -p --output-format json --model ' + model;
        if (params.sessionId) cmd += " --resume " + params.sessionId;

        var cp = child_process.exec(cmd, {
            cwd: tempWorkDir(),
            timeout: params.timeout || 120000,
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024
        }, function (err, stdout, stderr) {
            var parsed = parseJson(stdout);
            var rateLimited = isRateLimited((stdout || "") + "\n" + (stderr || ""));
            // Claude Code json result: { result, session_id, is_error, ... }
            if (parsed && typeof parsed.result === "string" && !parsed.is_error) {
                resolve({
                    text: parsed.result,
                    sessionId: parsed.session_id || params.sessionId || null,
                    rateLimited: rateLimited,
                    error: null
                });
                return;
            }
            var msg = (parsed && parsed.result) ? String(parsed.result)
                : (stderr || (err && String(err)) || "No parseable response from Claude Code.");
            resolve({ text: "", sessionId: params.sessionId || null, rateLimited: rateLimited, error: msg });
        });

        try { cp.stdin.write(prompt); cp.stdin.end(); } catch (e) {}
    });
}

// Streaming via stream-json + --include-partial-messages: emits Anthropic
// content_block_delta/text_delta events we forward through onChunk. The result
// event carries the authoritative final text + session id.
function runStream(params, onChunk) {
    params = params || {};
    return new Promise(function (resolve) {
        var binPath = env.resolveBinary("claude");
        if (!binPath) {
            resolve({ text: "", sessionId: params.sessionId || null, error: "Claude Code CLI not found." });
            return;
        }
        var prompt = params.prompt || "";
        var model = params.model || defaultModel();
        var cmd = '"' + binPath + '" -p --output-format stream-json --verbose --include-partial-messages --model ' + model;
        if (params.sessionId) cmd += " --resume " + params.sessionId;

        var cp = child_process.exec(cmd, {
            cwd: tempWorkDir(),
            timeout: params.timeout || 120000,
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024
        });

        var sessionId = params.sessionId || null;
        var text = "";       // accumulated from text_delta events
        var finalText = "";  // from the result event (authoritative)
        var errAcc = "";
        var rlFlag = false;
        var buf = "";

        function handleLine(line) {
            line = line.replace(/\r$/, "");
            if (!line) return;
            var obj = null;
            try { obj = JSON.parse(line); } catch (e) { return; }
            if (obj.type === "system" && obj.subtype === "init" && obj.session_id) {
                sessionId = obj.session_id;
            } else if (obj.type === "stream_event" && obj.event) {
                var ev = obj.event;
                if (ev.type === "content_block_delta" && ev.delta &&
                    ev.delta.type === "text_delta" && typeof ev.delta.text === "string") {
                    text += ev.delta.text;
                    if (typeof onChunk === "function") { try { onChunk(ev.delta.text); } catch (e2) {} }
                }
            } else if (obj.type === "rate_limit_event" && obj.rate_limit_info) {
                if (obj.rate_limit_info.status && obj.rate_limit_info.status !== "allowed") rlFlag = true;
            } else if (obj.type === "result") {
                if (obj.session_id) sessionId = obj.session_id;
                if (typeof obj.result === "string") finalText = obj.result;
                if (obj.is_error) errAcc += " " + (obj.result || "error");
            }
        }

        cp.stdout.on("data", function (d) {
            buf += d.toString();
            var idx;
            while ((idx = buf.indexOf("\n")) >= 0) {
                var line = buf.substring(0, idx);
                buf = buf.substring(idx + 1);
                handleLine(line);
            }
        });
        cp.stderr.on("data", function (d) { errAcc += d.toString(); });
        cp.on("error", function (e) {
            resolve({ text: text || finalText, sessionId: sessionId, rateLimited: rlFlag, error: String(e) });
        });
        cp.on("close", function (code) {
            if (buf) handleLine(buf);
            var out = finalText || text;
            var rateLimited = rlFlag || isRateLimited(errAcc);
            var error = out ? null : (errAcc || ("Claude Code exited with code " + code));
            resolve({ text: out, sessionId: sessionId, rateLimited: rateLimited, error: error });
        });

        try { cp.stdin.write(prompt); cp.stdin.end(); } catch (e) {}
    });
}

module.exports = {
    id: "claude",
    detectInstalled: detectInstalled,
    listEntitledModels: listEntitledModels,
    defaultModel: defaultModel,
    run: run,
    runStream: runStream
};
