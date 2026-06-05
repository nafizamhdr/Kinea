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
                var layer = kinea_findLayer(comp, it);
                if (!layer) { errors.push("Item " + (i + 1) + ": layer not found"); continue; }

                if (it.newName !== undefined && it.newName !== null && String(it.newName).length) {
                    layer.name = String(it.newName);
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

        var result = { changed: changed };
        if (errors.length) result.errors = errors;
        return JSON.stringify({ ok: true, result: result });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
