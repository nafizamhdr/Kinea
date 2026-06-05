// Kinea bridge — prompt composition (Node/CommonJS).
// Keeps model-facing text in one place so providers stay interchangeable.

// Chat Mode is READ-ONLY: the model explains / debugs / proposes, but must not
// claim to have changed the project (Golden rule 1).
function buildChatPrompt(question, context) {
    var ctxStr = "{}";
    try {
        if (context) ctxStr = JSON.stringify(context);
    } catch (e) {}

    var sys = [
        "You are Kinea, an assistant embedded inside Adobe After Effects (Chat Mode).",
        "Chat Mode is READ-ONLY: explain effects, debug expressions, and propose",
        "ExtendScript or expression code, but NEVER claim to have changed the project.",
        "Be concise and practical. Answer in the user's language.",
        "Ground your answer in the AE context JSON when it is relevant; if it shows",
        "no active composition, say so briefly and answer generally."
    ].join(" ");

    return sys +
        "\n\n=== AE CONTEXT (JSON) ===\n" + ctxStr +
        "\n\n=== USER QUESTION ===\n" + question + "\n";
}

module.exports = { buildChatPrompt: buildChatPrompt };
