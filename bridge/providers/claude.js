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

function isRateLimited(text) {
    return /429|rate.?limit|overloaded|quota/i.test(text || "");
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
        var cmd = '"' + binPath + '" -p --output-format json';
        if (params.model) cmd += " --model " + params.model;
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

// NOTE: runStream (stream-json) is a follow-up once Claude Code is installed and
// the event shape is confirmed. Until then the bridge falls back to run(), so
// Claude chat works (non-streamed).

module.exports = {
    id: "claude",
    detectInstalled: detectInstalled,
    listEntitledModels: listEntitledModels,
    defaultModel: defaultModel,
    run: run
};
