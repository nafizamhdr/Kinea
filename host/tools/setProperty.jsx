// Kinea host tool — set a static value on ANY property by path. ExtendScript (ES3).
// Generic primitive (Phase 1). JSON in/out, try/catch, single undo group.
//
// params: { layer?, path:[matchName,...], value:<number|number[]|string|bool>, force? }

function kinea_setProperty(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return kinea_err("No active composition.");

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return kinea_err("Layer not found.");

        var r = kinea_resolvePath(layer, spec.path);
        if (!r.ok) return kinea_err(r.error);
        var prop = r.prop;

        if (!kinea_isLeaf(prop)) return kinea_err("Path points to a group, not a settable property.");

        try {
            if (prop.expressionEnabled && prop.expression && prop.expression.length && !spec.force) {
                return kinea_err("Property has an active expression; pass force:true to set the value anyway.");
            }
        } catch (eExpr) {}

        app.beginUndoGroup("Kinea: Set Property");
        try {
            prop.setValue(kinea_coerceValue(spec.value));
        } finally {
            app.endUndoGroup();
        }

        var out = null;
        try { out = prop.value; } catch (eVal) {}
        return JSON.stringify({ ok: true, result: { path: spec.path, value: out } });
    } catch (e) {
        return kinea_err(String(e));
    }
}
