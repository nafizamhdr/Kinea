// Kinea context reader — ExtendScript (ES3). READ-ONLY.
// Serializes the active comp / selection into a small JSON string the bridge
// sends to the model before each turn. Never mutates the project, so it is
// safe in Chat Mode (Golden rule 1).
//
// Entry point: kinea_refreshContext(optsJson)
//   optsJson (optional JSON string): { "includeTree": bool, "maxLayers": number }
//
// Uses locale-independent matchNames ("ADBE Position", ...) so it works
// regardless of the user's AE UI language.

// --- small helpers -------------------------------------------------------

function kinea_round3(n) {
    if (typeof n !== "number") return n;
    return Math.round(n * 1000) / 1000;
}

function kinea_truncate(s, max) {
    if (typeof s !== "string") return s;
    if (s.length <= max) return s;
    return s.substring(0, max) + "…";
}

function kinea_getProp(group, matchName) {
    try {
        return group.property(matchName);
    } catch (e) {
        return null;
    }
}

// Reads a leaf property's value; if it carries an enabled expression, records
// it into `exprBucket` so the model can see expressions for debugging.
function kinea_readProp(group, matchName, exprBucket) {
    var p = kinea_getProp(group, matchName);
    if (!p) return null;
    var val = null;
    try { val = p.value; } catch (e) {}
    try {
        if (p.expressionEnabled && p.expression && p.expression.length) {
            exprBucket.push({
                prop: p.name,
                matchName: matchName,
                expression: kinea_truncate(p.expression, 500)
            });
        }
    } catch (e2) {}
    return val;
}

function kinea_layerType(layer) {
    // Check the AVLayer subclasses first (TextLayer/ShapeLayer extend AVLayer).
    if (layer instanceof TextLayer) return "text";
    if (layer instanceof ShapeLayer) return "shape";
    if (layer instanceof CameraLayer) return "camera";
    if (layer instanceof LightLayer) return "light";
    if (layer instanceof AVLayer) {
        if (layer.nullLayer) return "null";
        if (layer.adjustmentLayer) return "adjustment";
        try {
            // A solid layer's .source is a FootageItem whose .mainSource is the
            // SolidSource — not the SolidSource directly.
            if (layer.source && layer.source.mainSource &&
                (layer.source.mainSource instanceof SolidSource)) return "solid";
        } catch (e) {}
        return "av";
    }
    return "unknown";
}

function kinea_transformSummary(layer) {
    var out = { position: null, scale: null, rotation: null, opacity: null, expressions: [] };
    var tg = kinea_getProp(layer, "ADBE Transform Group");
    if (!tg) return out;
    out.position = kinea_readProp(tg, "ADBE Position", out.expressions);
    out.scale = kinea_readProp(tg, "ADBE Scale", out.expressions);
    out.rotation = kinea_readProp(tg, "ADBE Rotate Z", out.expressions);
    out.opacity = kinea_readProp(tg, "ADBE Opacity", out.expressions);
    return out;
}

function kinea_layerSummary(layer) {
    var info = {
        index: layer.index,
        name: layer.name,
        type: kinea_layerType(layer),
        enabled: layer.enabled
    };
    try { info.transform = kinea_transformSummary(layer); } catch (e) { info.transform = null; }
    return info;
}

// Selected leaf properties + their expressions (capped).
function kinea_selectedProps(comp) {
    var out = [];
    var sel;
    try { sel = comp.selectedProperties; } catch (e) { return out; }
    if (!sel) return out;
    for (var i = 0; i < sel.length && out.length < 20; i++) {
        var p = sel[i];
        try {
            if (p.propertyType !== PropertyType.PROPERTY) continue; // skip groups
        } catch (eType) { continue; }
        var entry = { name: p.name, matchName: p.matchName };
        try { entry.value = p.value; } catch (eVal) {}
        try {
            if (p.canSetExpression) {
                entry.expressionEnabled = p.expressionEnabled;
                if (p.expression && p.expression.length) {
                    entry.expression = kinea_truncate(p.expression, 500);
                }
            }
        } catch (eExpr) {}
        out.push(entry);
    }
    return out;
}

// Compact project tree: comp names + layer counts (capped).
function kinea_projectTree() {
    var comps = [];
    try {
        var items = app.project.items; // 1-based collection
        for (var i = 1; i <= items.length && comps.length < 50; i++) {
            var it = items[i];
            if (it instanceof CompItem) {
                comps.push({ name: it.name, layers: it.numLayers });
            }
        }
    } catch (e) {}
    return comps;
}

// --- entry point ---------------------------------------------------------

function kinea_refreshContext(optsJson) {
    try {
        var opts = {};
        if (optsJson && optsJson.length) {
            try { opts = JSON.parse(optsJson); } catch (e0) { opts = {}; }
        }
        var maxLayers = opts.maxLayers ? opts.maxLayers : 30;
        var includeTree = opts.includeTree ? true : false;

        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            var empty = { activeComp: null };
            if (includeTree) empty.projectTree = kinea_projectTree();
            return JSON.stringify({ ok: true, result: empty });
        }

        var compInfo = {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            frameRate: kinea_round3(comp.frameRate),
            duration: kinea_round3(comp.duration),
            currentTime: kinea_round3(comp.time),
            numLayers: comp.numLayers
        };

        // Prefer the selection; fall back to all layers (capped).
        var sel = comp.selectedLayers;
        var usingSelection = (sel && sel.length > 0);
        var total = usingSelection ? sel.length : comp.numLayers;
        var list = [];
        for (var i = 0; i < total && list.length < maxLayers; i++) {
            var layer = usingSelection ? sel[i] : comp.layer(i + 1);
            list.push(kinea_layerSummary(layer));
        }

        var ctx = {
            activeComp: compInfo,
            layerSource: usingSelection ? "selection" : "all",
            layers: list,
            truncatedLayers: (total > list.length),
            selectedProperties: kinea_selectedProps(comp)
        };
        if (includeTree) ctx.projectTree = kinea_projectTree();

        return JSON.stringify({ ok: true, result: ctx });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
