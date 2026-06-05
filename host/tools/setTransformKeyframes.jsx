// Kinea host tool — set keyframes on a transform property. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.
//
// params: { layer?, property, keyframes:[{ time:<seconds>, value:<number|array> }] }
// value dimensionality must match the property (Position [x,y]/[x,y,z],
// Scale [x,y,z]%, Rotation number, Opacity number).

function kinea_setTransformKeyframes(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return JSON.stringify({ ok: false, error: "No active composition." });

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return JSON.stringify({ ok: false, error: "Layer not found." });

        var propName = spec.property || spec.prop;
        var prop = kinea_findProp(layer, propName);
        if (!prop) return JSON.stringify({ ok: false, error: "Property not found: " + propName });

        var kfs = spec.keyframes;
        if (!kfs || !kfs.length) return JSON.stringify({ ok: false, error: "No keyframes provided." });

        app.beginUndoGroup("Kinea: Set Transform Keyframes");
        var added = 0;
        try {
            for (var i = 0; i < kfs.length; i++) {
                var t = Number(kfs[i].time);
                prop.setValueAtTime(t, kfs[i].value);
                added++;
            }
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({
            ok: true,
            result: { layer: layer.name, property: prop.name, keyframes: added }
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
