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

    setEasing: {
        hostFn: "kinea_setEasing",
        implemented: true,
        destructive: false,
        required: ["property"],
        describe: "Apply easing to a property's EXISTING keyframes. params: layer " +
                  "(name/index, optional), property ('Position'|'Scale'|'Rotation'|" +
                  "'Opacity', required), easing ('easyEase'|'easeIn'|'easeOut', " +
                  "default easyEase), influence (0.1..100, default 33.33), " +
                  "keyIndices (optional array of 1-based keyframe indices; default all)."
    },
    applyEffect: {
        hostFn: "kinea_applyEffect",
        implemented: true,
        destructive: false,
        required: [],
        describe: "Apply an effect to a layer. params: layer (name/index, optional), " +
                  "effectMatchName (matchName like 'ADBE Gaussian Blur 2', required), " +
                  "instanceName (optional), params (optional array of { path:[matchNames " +
                  "relative to the effect], value } to set initial parameters). After " +
                  "applying, tune params with setProperty/setKeyframes using the " +
                  "effect-relative path."
    },
    findAndFixExpressionError: {
        hostFn: "kinea_findAndFixExpressionError",
        implemented: true,
        destructive: false,
        required: [],
        describe: "Scan for expression errors and report them (read-only; does not " +
                  "change anything). Use this to locate broken expressions, then " +
                  "propose a fix via setExpression. params: maxLayers, maxFindings (optional)."
    },

    // --- Phase 1a: generic primitives + introspection ---
    setProperty: {
        hostFn: "kinea_setProperty",
        implemented: true,
        destructive: false,
        required: ["path", "value"],
        describe: "Set a static value on ANY property by its matchName path. params: " +
                  "layer (name/index/'selected', optional), path (array of matchNames " +
                  "from the layer root, e.g. ['ADBE Transform Group','ADBE Position']), " +
                  "value (number, or array for multi-dim like [x,y] position or [r,g,b] " +
                  "color 0..1), force (bool, optional — override an existing expression)."
    },
    setKeyframes: {
        hostFn: "kinea_setKeyframes",
        implemented: true,
        destructive: false,
        required: ["path", "keys"],
        describe: "Keyframe ANY property by matchName path with interpolation/easing. " +
                  "params: layer (optional), path (array of matchNames), keys (array of " +
                  "{ time: seconds, value, interpIn?/interpOut? ('hold'|'linear'|'bezier'), " +
                  "easeIn?/easeOut? ({ influence: 0.1..100, speed }) }). Generalizes " +
                  "setTransformKeyframes to any property."
    },
    describeProperty: {
        hostFn: "kinea_describeProperty",
        implemented: true,
        destructive: false,
        readOnly: true,
        required: [],
        describe: "Read-only: introspect a property subtree (matchNames/types/values) " +
                  "for inspect-then-set. params: layer, path (optional), depth (optional)."
    },
    describeLayer: {
        hostFn: "kinea_describeLayer",
        implemented: true,
        destructive: false,
        readOnly: true,
        required: [],
        describe: "Read-only: summarize a layer and its top-level property groups " +
                  "(to discover available matchName paths). params: layer (optional)."
    },

    // --- Phase 1b: effect control ---
    listEffects: {
        hostFn: "kinea_listEffects",
        implemented: true,
        destructive: false,
        readOnly: true,
        required: [],
        describe: "Read-only: list common built-in effects (name, matchName, category). " +
                  "params: filter (optional substring)."
    },
    removeEffect: {
        hostFn: "kinea_removeEffect",
        implemented: true,
        destructive: true,
        required: [],
        describe: "Remove an effect instance from a layer. params: layer (optional), " +
                  "effectMatchName or effectIndex. Destructive (removes user content)."
    }
};

module.exports = { TOOLS: TOOLS };
