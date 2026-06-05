// Kinea host tool — rename layers and set labels. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.
//
// params: { items: [ { layer:<name|index>, newName?:<string>, label?:<0..16> } ] }
// label 0 = none; 1..16 are AE's label colors.

function kinea_renameAndOrganize(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return JSON.stringify({ ok: false, error: "No active composition." });

        var items = spec.items;
        if (!items || !items.length) {
            return JSON.stringify({ ok: false, error: "No items provided. Expected items:[{layer,newName?,label?}]." });
        }

        app.beginUndoGroup("Kinea: Rename & Organize");
        var changed = 0;
        var errors = [];
        try {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];

                // Resolve the layer ONLY by layer/index (not `name`, which here
                // means the *new* name). Avoids the rename ambiguity.
                var ref = {};
                if (it.index !== undefined && it.index !== null) ref.index = it.index;
                else ref.layer = it.layer;
                var layer = kinea_findLayer(comp, ref);
                if (!layer) { errors.push("Item " + (i + 1) + ": layer not found"); continue; }

                // New name from newName, or fall back to `name`.
                var newName = null;
                if (it.newName !== undefined && it.newName !== null) newName = it.newName;
                else if (it.name !== undefined && it.name !== null) newName = it.name;
                if (newName !== null && String(newName).length) {
                    layer.name = String(newName);
                    changed++;
                }

                if (it.label !== undefined && it.label !== null) {
                    var lb = parseInt(it.label, 10);
                    if (lb >= 0 && lb <= 16) { layer.label = lb; changed++; }
                    else errors.push("Item " + (i + 1) + ": label out of range (0..16)");
                }
            }
        } finally {
            app.endUndoGroup();
        }

        var result = { changed: changed, errors: errors };
        // Surface real failures: nothing changed AND we hit errors => not ok.
        if (changed === 0 && errors.length) {
            return JSON.stringify({ ok: false, error: errors.join("; ") });
        }
        return JSON.stringify({ ok: true, result: result });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
