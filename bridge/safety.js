// Kinea — plan validation & destructive-op detection (Node/CommonJS).
// A plan must fully pass before ANY step runs; an invalid plan is rejected
// whole (never partially executed). See CLAUDE.md "Agent execution model".

var tools = require("./tools");

// Cap steps per turn — keeps free-tier turns small and bounds blast radius.
var MAX_STEPS = 12;

function validatePlan(plan) {
    if (!plan || typeof plan !== "object") {
        return { ok: false, error: "Plan is not an object." };
    }
    if (!plan.steps || !plan.steps.length) {
        return { ok: false, error: "Plan has no steps." };
    }
    if (plan.steps.length > MAX_STEPS) {
        return { ok: false, error: "Plan has too many steps (" + plan.steps.length + " > " + MAX_STEPS + ")." };
    }

    var validated = [];
    var destructiveSteps = [];

    for (var i = 0; i < plan.steps.length; i++) {
        var s = plan.steps[i];
        var n = i + 1;
        if (!s || typeof s !== "object") {
            return { ok: false, error: "Step " + n + " is malformed." };
        }
        var def = tools.TOOLS[s.tool];
        if (!def) {
            return { ok: false, error: "Step " + n + " uses an unknown tool: " + s.tool };
        }
        if (!def.implemented) {
            return { ok: false, error: "Step " + n + " uses a not-yet-available tool: " + s.tool };
        }

        var params = s.params || {};
        if (typeof params !== "object") {
            return { ok: false, error: "Step " + n + " params must be an object." };
        }
        var req = def.required || [];
        for (var j = 0; j < req.length; j++) {
            var key = req[j];
            if (params[key] === undefined || params[key] === null || params[key] === "") {
                return { ok: false, error: "Step " + n + " (" + s.tool + ") is missing required param: " + key };
            }
        }

        var step = {
            tool: s.tool,
            label: s.label ? String(s.label) : s.tool,
            params: params,
            hostFn: def.hostFn,
            destructive: !!def.destructive
        };
        if (step.destructive) destructiveSteps.push(n);
        validated.push(step);
    }

    return {
        ok: true,
        result: {
            summary: plan.summary ? String(plan.summary) : "",
            steps: validated,
            destructiveSteps: destructiveSteps
        }
    };
}

module.exports = { validatePlan: validatePlan, MAX_STEPS: MAX_STEPS };
