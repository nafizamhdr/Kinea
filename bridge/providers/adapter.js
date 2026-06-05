// Kinea provider adapter contract (Node/CommonJS).
//
// Every provider in bridge/providers/ exposes this shape. The bridge is
// provider-agnostic and talks only to this interface — never to a CLI's quirks.
//
//   {
//     id: "gemini",                                  // stable key
//     detectInstalled(): Promise<{ found, binPath, version, error? }>,
//     listEntitledModels(): string[],                // models THIS account can use
//     defaultModel(isFreeTier): string,              // e.g. a Flash model
//     run({ prompt, model, context, sessionId, allowedTools }):
//         Promise<{ text, sessionId, steps?, scripts?, rateLimited?, error? }>
//   }
//
// run() is built in Sprint 3b; Sprint 3a only needs detectInstalled().

// Minimal shape check so a misbuilt provider fails loudly at registration.
function isValidProvider(p) {
    return !!p &&
        typeof p.id === "string" &&
        typeof p.detectInstalled === "function" &&
        typeof p.listEntitledModels === "function" &&
        typeof p.defaultModel === "function";
}

module.exports = { isValidProvider: isValidProvider };
