// Kinea provider — Gemini CLI adapter (Node/CommonJS). MVP default provider.
//
// Sprint 3a implements detectInstalled() only. listEntitledModels()/run() are
// stubbed against the known free-tier Flash models and filled in at 3b.
//
// We never touch credentials (Golden rule 4): the user authenticates inside the
// Gemini CLI itself; we only locate and spawn the binary.

var child_process = require("child_process");
var os = require("os");
var fs = require("fs");
var path = require("path");
var env = require("../env");

// Known free-tier Flash models a personal Google account can reach.
// 3b will refine this by probing the account where possible.
var KNOWN_FREE_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

// Run a binary and resolve { err, stdout, stderr }. On Windows we go through
// the shell so .cmd npm shims work (Node 20+ refuses to spawn .cmd directly).
function run(bin, args, opts) {
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
            child_process.exec('"' + bin + '" ' + args.join(" "),
                { timeout: timeout, windowsHide: true }, cb);
        } else {
            child_process.execFile(bin, args, { timeout: timeout }, cb);
        }
    });
}

function detectInstalled() {
    return new Promise(function (resolve) {
        var binPath = env.resolveBinary("gemini");
        if (!binPath) {
            resolve({ found: false, binPath: null, version: null });
            return;
        }
        run(binPath, ["--version"]).then(function (r) {
            var version = r.stdout || r.stderr || "unknown";
            // A non-zero exit with no output usually means the shim ran but the
            // CLI errored; still report found so onboarding can guide the user.
            resolve({
                found: true,
                binPath: binPath,
                version: version,
                error: (r.err && !r.stdout) ? String(r.err) : null
            });
        });
    });
}

function listEntitledModels() {
    return KNOWN_FREE_MODELS.slice();
}

function defaultModel(isFreeTier) {
    // Free tier serves Flash; same default for now until 3b probes entitlements.
    return KNOWN_FREE_MODELS[0];
}

// A neutral empty working dir so Gemini's agentic tools (grep/edit) have nothing
// to act on — we only want text answers, never file mutation in the project.
function tempWorkDir() {
    var d = path.join(os.tmpdir(), "kinea-gemini");
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
}

function parseJson(s) {
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) {}
    // Output may carry a non-JSON preamble; extract the outermost { ... }.
    var first = s.indexOf("{");
    var last = s.lastIndexOf("}");
    if (first >= 0 && last > first) {
        try { return JSON.parse(s.substring(first, last + 1)); } catch (e2) {}
    }
    return null;
}

function isRateLimited(text, parsed) {
    var hay = (text || "");
    try { if (parsed && parsed.error) hay += " " + JSON.stringify(parsed.error); } catch (e) {}
    return /429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(hay);
}

// Headless run. The full prompt is fed via STDIN (so we never have to escape it
// on the command line); the CLI's -p value is just a space and gets appended.
// On both platforms we go through the shell (exec) so the npm .cmd shim works
// on Windows; only safe, fixed tokens (model, session id) go on the cmd line.
function run(params) {
    params = params || {};
    return new Promise(function (resolve) {
        var binPath = env.resolveBinary("gemini");
        if (!binPath) {
            resolve({ text: "", sessionId: params.sessionId || null, error: "Gemini CLI not found." });
            return;
        }
        var model = params.model || defaultModel(true);
        var prompt = params.prompt || "";

        // --approval-mode plan keeps Gemini read-only (no file tools) and, in
        // practice, stops agentic tool-call fragments from leaking into the
        // response. Fits Chat Mode (Golden rule 1); for Agent Mode we still only
        // want text/script back and execute it ourselves via evalScript.
        var cmd = '"' + binPath + '" -o json --skip-trust --approval-mode plan -m ' + model;
        if (params.sessionId) cmd += " --resume " + params.sessionId;
        cmd += ' -p " "';

        var cp = child_process.exec(cmd, {
            cwd: tempWorkDir(),
            timeout: params.timeout || 120000,
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024
        }, function (err, stdout, stderr) {
            var parsed = parseJson(stdout);
            var rateLimited = isRateLimited((stdout || "") + "\n" + (stderr || ""), parsed);

            if (parsed && typeof parsed.response === "string") {
                resolve({
                    text: parsed.response,
                    sessionId: parsed.session_id || params.sessionId || null,
                    rateLimited: rateLimited,
                    error: null
                });
                return;
            }
            var msg = (parsed && parsed.error)
                ? (typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error))
                : (stderr || (err && String(err)) || "No parseable response from Gemini.");
            resolve({
                text: "",
                sessionId: params.sessionId || null,
                rateLimited: rateLimited,
                error: msg
            });
        });

        try {
            cp.stdin.write(prompt);
            cp.stdin.end();
        } catch (e) {
            // exec already running; if stdin fails the timeout will catch it.
        }
    });
}

module.exports = {
    id: "gemini",
    detectInstalled: detectInstalled,
    listEntitledModels: listEntitledModels,
    defaultModel: defaultModel,
    run: run
};
