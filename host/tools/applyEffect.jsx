// Kinea host tool — apply a named effect to a layer. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.
//
// params: { layer?, effect (display name or matchName, required),
//           instanceName?(string), settings?({ paramName: value }) }
//
// Effect names depend on locale/installed plugins; matchName (e.g.
// "ADBE Gaussian Blur 2") is the most reliable. We check canAddProperty first
// and return a clear error instead of guessing.

function kinea_applyEffect(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return JSON.stringify({ ok: false, error: "No active composition." });

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return JSON.stringify({ ok: false, error: "Layer not found." });

        var effName = spec.effect;
        if (!effName || !String(effName).length) {
            return JSON.stringify({ ok: false, error: "Missing 'effect' name." });
        }
        effName = String(effName);

        var fxGroup = null;
        try { fxGroup = layer.property("ADBE Effect Parade"); } catch (e0) {}
        if (!fxGroup) {
            return JSON.stringify({ ok: false, error: "This layer type cannot take effects." });
        }
        if (!fxGroup.canAddProperty(effName)) {
            return JSON.stringify({
                ok: false,
                error: "Effect not available: '" + effName + "'. Use the exact AE effect name or its " +
                       "matchName (e.g. 'ADBE Gaussian Blur 2')."
            });
        }

        app.beginUndoGroup("Kinea: Apply Effect");
        var fx, warnings = [];
        try {
            fx = fxGroup.addProperty(effName);
            if (spec.instanceName && String(spec.instanceName).length) fx.name = String(spec.instanceName);

            var settings = spec.settings || spec.params;
            if (settings && typeof settings === "object") {
                for (var key in settings) {
                    if (!settings.hasOwnProperty(key)) continue;
                    try {
                        var pp = fx.property(key);
                        if (pp) pp.setValue(settings[key]);
                        else warnings.push("param not found: " + key);
                    } catch (e2) {
                        warnings.push("could not set " + key + ": " + e2);
                    }
                }
            }
        } finally {
            app.endUndoGroup();
        }

        var result = { layer: layer.name, effect: fx.name, matchName: fx.matchName };
        if (warnings.length) result.warnings = warnings;
        return JSON.stringify({ ok: true, result: result });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
