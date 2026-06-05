// Kinea provider — Gemini CLI adapter (Node/CommonJS). MVP default provider.
//
// Sprint 3a implements detectInstalled() only. listEntitledModels()/run() are
// stubbed against the known free-tier Flash models and filled in at 3b.
//
// We never touch credentials (Golden rule 4): the user authenticates inside the
// Gemini CLI itself; we only locate and spawn the binary.

var child_process = require("child_process");
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

module.exports = {
    id: "gemini",
    detectInstalled: detectInstalled,
    listEntitledModels: listEntitledModels,
    defaultModel: defaultModel
};
