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

    duplicateLayer: {
        hostFn: "kinea_duplicateLayer",
        implemented: true,
        destructive: false,
        required: [],
        describe: "Duplicate a layer in the active comp. params: layer " +
                  "(name string or 1-based index; optional — defaults to the " +
                  "selected layer), newName (string, optional)."
    },
    setExpression: {
        hostFn: "kinea_setExpression",
        implemented: true,
        destructive: false,
        required: ["property", "expression"],
        describe: "Write/replace an expression on a property. params: layer " +
                  "(name/index, optional), property ('Position'|'Scale'|" +
                  "'Rotation'|'Opacity' or a matchName, required), expression " +
                  "(string, required, e.g. 'wiggle(2,30)'), enabled (bool, optional)."
    },
    setTransformKeyframes: {
        hostFn: "kinea_setTransformKeyframes",
        implemented: true,
        destructive: false,
        required: ["property", "keyframes"],
        describe: "Add keyframes to a transform property. params: layer " +
                  "(name/index, optional), property ('Position'|'Scale'|" +
                  "'Rotation'|'Opacity', required), keyframes (required array of " +
                  "{ time: seconds, value: number for Rotation/Opacity OR [x,y]/" +
                  "[x,y,z] for Position, [x,y,z]% for Scale })."
    },
    renameAndOrganize: {
        hostFn: "kinea_renameAndOrganize",
        implemented: true,
        destructive: false,
        required: ["items"],
        describe: "Rename layers and set label colors. params: items (required " +
                  "array of { layer: name/index, newName?: string, label?: 0..16 }). " +
                  "label 0 = none; 1..16 are AE label colors."
    },

    // --- roadmap (Sprint 4b-2), not yet exposed to the planner ---
    applyEffect:               { implemented: false },
    findAndFixExpressionError: { implemented: false },
    setEasing:                 { implemented: false }
};

module.exports = { TOOLS: TOOLS };
