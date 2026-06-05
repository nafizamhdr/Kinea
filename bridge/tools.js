// Kinea — MVP tool registry (Node/CommonJS). Single source of truth for which
// tools the planner may use, their required params, the host function each maps
// to, and whether they're destructive. The closed list (CLAUDE.md) lives here.
//
// Sprint 4a ships createComp + createLayer; the rest are listed with
// implemented:false so we track the roadmap without exposing them to the model.

var TOOLS = {
    createComp: {
        hostFn: "kinea_createComp",
        implemented: true,
        destructive: false,
        required: ["name"],
        describe: "Create a new composition and make it active. params: name " +
                  "(string, required), width (px, default 1920), height (px, " +
                  "default 1080), fps (default 30), duration (seconds, default 10)."
    },
    createLayer: {
        hostFn: "kinea_createLayer",
        implemented: true,
        destructive: false,
        required: ["type"],
        describe: "Add a layer to the ACTIVE comp. params: type " +
                  "('solid' | 'text' | 'null', required), name (string), " +
                  "color ([r,g,b] each 0..1, for solids), text (string, for text layers)."
    },

    // --- roadmap (Sprint 4b), not yet exposed to the planner ---
    duplicateLayer:        { implemented: false },
    setTransformKeyframes: { implemented: false },
    applyEffect:           { implemented: false },
    setExpression:         { implemented: false },
    findAndFixExpressionError: { implemented: false },
    renameAndOrganize:     { implemented: false },
    setEasing:             { implemented: false }
};

module.exports = { TOOLS: TOOLS };
