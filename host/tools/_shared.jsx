// Kinea host tools — shared helpers (ES3). Included before the tool files.

function kinea_activeComp() {
    var comp = app.project.activeItem;
    if (comp && comp instanceof CompItem) return comp;
    return null;
}

// Resolve a layer from a spec: { index } / { name } / { layer: number|string },
// falling back to the first selected layer. Returns a Layer or null.
function kinea_findLayer(comp, spec) {
    var idx = null;
    if (spec) {
        if (spec.index !== undefined && spec.index !== null) idx = spec.index;
        else if (typeof spec.layer === "number") idx = spec.layer;
    }
    if (idx !== null) {
        idx = parseInt(idx, 10);
        if (idx >= 1 && idx <= comp.numLayers) return comp.layer(idx);
        return null;
    }

    var nm = null;
    if (spec) {
        if (spec.name !== undefined && spec.name !== null) nm = spec.name;
        else if (typeof spec.layer === "string") nm = spec.layer;
    }
    if (nm) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === String(nm)) return comp.layer(i);
        }
        return null;
    }

    var sel = comp.selectedLayers;
    if (sel && sel.length) return sel[0];
    return null;
}

// Map a friendly transform name to its locale-safe matchName.
function kinea_transformMatch(name) {
    if (!name) return null;
    var n = String(name).toLowerCase();
    if (n === "position") return "ADBE Position";
    if (n === "scale") return "ADBE Scale";
    if (n === "rotation" || n === "rotate") return "ADBE Rotate Z";
    if (n === "opacity") return "ADBE Opacity";
    if (n === "anchor" || n === "anchorpoint" || n === "anchor point") return "ADBE Anchor Point";
    return null;
}

// Resolve a leaf property on a layer by friendly name or matchName.
function kinea_findProp(layer, propName) {
    if (!propName) return null;
    var tg = null;
    try { tg = layer.property("ADBE Transform Group"); } catch (e) {}

    var mn = kinea_transformMatch(propName);
    if (mn && tg) {
        try { var p = tg.property(mn); if (p) return p; } catch (e2) {}
    }
    try { var p2 = layer.property(propName); if (p2) return p2; } catch (e3) {}
    if (tg) { try { var p3 = tg.property(propName); if (p3) return p3; } catch (e4) {} }
    return null;
}
