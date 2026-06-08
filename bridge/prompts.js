// Kinea bridge — prompt composition (Node/CommonJS).
// Keeps model-facing text in one place so providers stay interchangeable.

var tools = require("./tools");

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

// Catalog of tools the planner is allowed to use (implemented ones only).
function toolCatalog() {
    var t = tools.TOOLS;
    var lines = [];
    for (var k in t) {
        // Read-only introspection tools aren't part of a build plan.
        if (t.hasOwnProperty(k) && t[k].implemented && !t[k].readOnly) {
            lines.push("- " + k + ": " + t[k].describe);
        }
    }
    return lines.join("\n");
}

// Agent Mode planner: turn a request into a STRICT JSON tool-call plan against
// the closed tool surface. Output must be JSON only (CLAUDE.md schema).
function buildPlanPrompt(question, context) {
    var ctxStr = "{}";
    try {
        if (context) ctxStr = JSON.stringify(context);
    } catch (e) {}

    var sys = [
        "You are Kinea's planner for Adobe After Effects (Agent Mode).",
        "Turn the user's request into a STRICT JSON plan using ONLY the tools listed below.",
        "Do not invent tools or parameters. If the request needs a capability that is",
        "not listed, include only the steps you can do and note the gap in 'summary'.",
        "Respond with JSON ONLY — no prose, no markdown code fences. Exact shape:",
        '{ "summary": string, "steps": [ { "tool": string, "label": string, "params": object } ] }',
        "'label' is a short human-readable description of the step shown to the user.",
        "PROPERTY PATHS: setProperty/setKeyframes address any property by a 'path' —",
        "an array of locale-safe matchNames from the layer root. Common matchNames:",
        "Transform group 'ADBE Transform Group' with 'ADBE Position', 'ADBE Scale',",
        "'ADBE Rotate Z', 'ADBE Opacity', 'ADBE Anchor Point'; effects live under",
        "'ADBE Effect Parade'. Prefer the dedicated MVP tools (createComp, createLayer,",
        "applyEffect, ...) for common actions; use the generic setProperty/setKeyframes",
        "for properties those don't cover."
    ].join(" ");

    return sys +
        "\n\n=== AVAILABLE TOOLS ===\n" + toolCatalog() +
        "\n\n=== AE CONTEXT (JSON) ===\n" + ctxStr +
        "\n\n=== USER REQUEST ===\n" + question + "\n";
}

module.exports = {
    buildChatPrompt: buildChatPrompt,
    buildPlanPrompt: buildPlanPrompt
};
