// Kinea host tool — write/replace an expression on a property. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.

function kinea_setExpression(argsJson) {
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
        if (!prop.canSetExpression) {
            return JSON.stringify({ ok: false, error: "Property cannot hold an expression: " + propName });
        }

        var expr = (spec.expression !== undefined && spec.expression !== null) ? String(spec.expression) : "";

        app.beginUndoGroup("Kinea: Set Expression");
        try {
            prop.expression = expr;
            if (spec.enabled === false) prop.expressionEnabled = false;
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({
            ok: true,
            result: { layer: layer.name, property: prop.name, expression: expr, enabled: prop.expressionEnabled }
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
