// Kinea bridge — binary resolution (Node/CommonJS, runs in CEP Node context).
//
// Critical gotcha (see CLAUDE.md): when AE launches the CEP Node context, the
// child process PATH may not include the user's shell PATH, so `gemini`/`node`
// look "not found" even when installed. We resolve an ABSOLUTE binary path by
// (1) asking the OS resolver, then (2) probing common global-install dirs.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child_process = require("child_process");

var isWin = process.platform === "win32";

// Common locations CLI binaries land in, beyond whatever PATH we inherited.
function candidateDirs() {
    var dirs = [];
    var home = os.homedir();

    if (isWin) {
        if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, "npm")); // npm -g
        dirs.push("C:\\Program Files\\nodejs");
        if (process.env.LOCALAPPDATA) {
            dirs.push(path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps"));
        }
    } else {
        dirs.push("/usr/local/bin", "/opt/homebrew/bin", "/usr/bin");
        dirs.push(path.join(home, ".npm-global", "bin"));
        dirs.push(path.join(home, ".local", "bin"));
    }

    // Append whatever PATH we did inherit.
    var p = process.env.PATH || "";
    var parts = p.split(path.delimiter);
    for (var i = 0; i < parts.length; i++) {
        if (parts[i]) dirs.push(parts[i]);
    }
    return dirs;
}

// On Windows an npm-installed CLI is usually a .cmd shim.
function binNames(name) {
    return isWin ? [name + ".cmd", name + ".exe", name + ".bat", name] : [name];
}

// Returns an absolute path to the binary, or null if not found.
function resolveBinary(name) {
    // 1) Ask the OS resolver first.
    try {
        var finder = isWin ? "where" : "which";
        var out = child_process
            .execFileSync(finder, [name], { encoding: "utf8" })
            .split(/\r?\n/)
            .filter(Boolean);
        if (out.length) return out[0].trim();
    } catch (e) {
        // Not on PATH — fall through to probing.
    }

    // 2) Probe known install dirs.
    var dirs = candidateDirs();
    var names = binNames(name);
    for (var i = 0; i < dirs.length; i++) {
        for (var j = 0; j < names.length; j++) {
            var full = path.join(dirs[i], names[j]);
            try {
                if (fs.existsSync(full)) return full;
            } catch (e2) {}
        }
    }
    return null;
}

module.exports = { resolveBinary: resolveBinary, isWin: isWin };
