// Kinea host tool — remove an effect instance from a layer. ExtendScript (ES3).
// DESTRUCTIVE (removes user content). JSON in/out, try/catch, single undo group.
//
// params: { layer?, effectMatchName | effect | effectIndex }

function kinea_removeEffect(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return kinea_err("No active composition.");

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return kinea_err("Layer not found.");

        var fxGroup = null;
        try { fxGroup = layer.property("ADBE Effect Parade"); } catch (e0) {}
        if (!fxGroup) return kinea_err("This layer has no effects.");

        // Locate the target BEFORE mutating (so errors don't open an undo group).
        var target = null;
        if (spec.effectIndex !== undefined && spec.effectIndex !== null) {
            var idx = parseInt(spec.effectIndex, 10);
            if (idx >= 1 && idx <= fxGroup.numProperties) target = fxGroup.property(idx);
            else return kinea_err("effectIndex out of range (1.." + fxGroup.numProperties + ").");
        } else if (spec.effectMatchName || spec.effect) {
            var mn = String(spec.effectMatchName || spec.effect);
            for (var i = 1; i <= fxGroup.numProperties; i++) {
                var e = fxGroup.property(i);
                if (e.matchName === mn || e.name === mn) { target = e; break; }
            }
            if (!target) return kinea_err("Effect not found on layer: " + mn);
        } else {
            return kinea_err("Provide effectMatchName or effectIndex.");
        }

        var removedName = target.name;
        app.beginUndoGroup("Kinea: Remove Effect");
        try { target.remove(); } finally { app.endUndoGroup(); }

        return JSON.stringify({ ok: true, result: { layer: layer.name, removed: removedName } });
    } catch (e) {
        return kinea_err(String(e));
    }
}
