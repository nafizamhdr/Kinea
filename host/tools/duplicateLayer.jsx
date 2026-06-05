// Kinea host tool — duplicate a layer in the active comp. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.

function kinea_duplicateLayer(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return JSON.stringify({ ok: false, error: "No active composition." });

        var layer = kinea_findLayer(comp, spec);
        if (!layer) {
            return JSON.stringify({ ok: false, error: "Layer not found. Provide 'name' or 'index', or select a layer." });
        }

        app.beginUndoGroup("Kinea: Duplicate Layer");
        var dup;
        try {
            dup = layer.duplicate();
            if (spec.newName !== undefined && spec.newName !== null && String(spec.newName).length) {
                dup.name = String(spec.newName);
            }
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({ ok: true, result: { name: dup.name, index: dup.index, source: layer.name } });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
