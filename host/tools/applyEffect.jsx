// Kinea host tool — apply an effect to a layer. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.
//
// params: { layer?, effectMatchName | effect (required),
//           instanceName?, index?,
//           settings?({ paramName: value }),               // backward-compat
//           params?([{ path:[matchName,...], value }]) }   // Phase 1, effect-relative
//
// Effect names depend on locale/installed plugins; matchName (e.g.
// "ADBE Gaussian Blur 2") is the most reliable. canAddProperty is checked first.

function kinea_applyEffect(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return kinea_err("No active composition.");

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return kinea_err("Layer not found.");

        var effName = spec.effectMatchName || spec.effect;
        if (!effName || !String(effName).length) return kinea_err("Missing 'effectMatchName' (or 'effect').");
        effName = String(effName);

        var fxGroup = null;
        try { fxGroup = layer.property("ADBE Effect Parade"); } catch (e0) {}
        if (!fxGroup) return kinea_err("This layer type cannot take effects.");
        if (!fxGroup.canAddProperty(effName)) {
            return kinea_err("Effect not available: '" + effName + "'. Use the exact AE effect name or " +
                             "its matchName (e.g. 'ADBE Gaussian Blur 2'). Try listEffects to discover names.");
        }

        app.beginUndoGroup("Kinea: Apply Effect");
        var fx, warnings = [];
        try {
            fx = fxGroup.addProperty(effName);
            if (spec.instanceName && String(spec.instanceName).length) fx.name = String(spec.instanceName);

            // settings: { paramName: value } — also accept params when it's a plain object.
            var settings = spec.settings;
            if (!settings && spec.params && !(spec.params instanceof Array)) settings = spec.params;
            if (settings && typeof settings === "object") {
                for (var key in settings) {
                    if (!settings.hasOwnProperty(key)) continue;
                    try {
                        var pp = fx.property(key);
                        if (pp) pp.setValue(kinea_coerceValue(settings[key]));
                        else warnings.push("param not found: " + key);
                    } catch (e2) {
                        warnings.push("could not set " + key + ": " + e2);
                    }
                }
            }

            // params: [{ path:[...], value }] — effect-relative property paths.
            if (spec.params && spec.params instanceof Array) {
                for (var i = 0; i < spec.params.length; i++) {
                    var item = spec.params[i];
                    var r = kinea_resolvePath(fx, item.path);
                    if (!r.ok) { warnings.push("param path failed: " + r.error); continue; }
                    try { r.prop.setValue(kinea_coerceValue(item.value)); }
                    catch (e3) { warnings.push("could not set " + (item.path ? item.path.join("/") : "?") + ": " + e3); }
                }
            }
        } finally {
            app.endUndoGroup();
        }

        var result = { layer: layer.name, effect: fx.name, matchName: fx.matchName, effectIndex: fx.propertyIndex };
        if (warnings.length) result.warnings = warnings;
        return JSON.stringify({ ok: true, result: result });
    } catch (e) {
        return kinea_err(String(e));
    }
}
