// Kinea host tool — add a layer (solid | text | null) to the active comp.
// ExtendScript (ES3). JSON in / JSON out, try/catch, single undo group.
// Mutating -> Agent Mode only.

function kinea_createLayer(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) {
            spec = JSON.parse(argsJson);
        }

        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            return JSON.stringify({ ok: false, error: "No active composition. Create or open a comp first." });
        }

        var type = spec.type ? String(spec.type).toLowerCase() : "solid";
        if (type !== "solid" && type !== "text" && type !== "null") {
            return JSON.stringify({ ok: false, error: "Unsupported layer type: " + type + " (use solid | text | null)." });
        }

        app.beginUndoGroup("Kinea: Create Layer");
        var layer = null;
        try {
            if (type === "solid") {
                var color = (spec.color && spec.color.length === 3) ? spec.color : [1, 0, 0];
                var solidName = (spec.name !== undefined && spec.name !== null && String(spec.name).length)
                    ? String(spec.name) : "Kinea Solid";
                layer = comp.layers.addSolid(color, solidName, comp.width, comp.height, comp.pixelAspect, comp.duration);
            } else if (type === "text") {
                var txt = (spec.text !== undefined && spec.text !== null) ? String(spec.text) : "Text";
                layer = comp.layers.addText(txt);
                if (spec.name) layer.name = String(spec.name);
            } else { // null
                layer = comp.layers.addNull(comp.duration);
                if (spec.name) layer.name = String(spec.name);
            }
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({
            ok: true,
            result: {
                name: layer.name,
                index: layer.index,
                type: type,
                comp: comp.name
            }
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
