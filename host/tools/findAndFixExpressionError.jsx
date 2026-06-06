// Kinea host tool — locate expression errors. ExtendScript (ES3). READ-ONLY:
// it reports erroring expressions so the model can propose a fix (the actual
// fix is applied via setExpression in a follow-up step). Safe in either mode.
//
// params: { maxLayers?(default 50), maxFindings?(default 25) }
// Scans selected layers (or all), returns { count, errors:[{layer, property,
// matchName, expression, error}] }.

function kinea_scanExprErrors(group, layerName, out, budget) {
    if (out.length >= budget.max) return;
    if (budget.visited >= budget.maxVisited) return;

    var n = 0;
    try { n = group.numProperties; } catch (e) { n = 0; }

    for (var i = 1; i <= n; i++) {
        if (out.length >= budget.max || budget.visited >= budget.maxVisited) return;
        budget.visited++;

        var p;
        try { p = group.property(i); } catch (e1) { continue; }
        try {
            if (p.propertyType === PropertyType.PROPERTY) {
                if (p.canSetExpression && p.expressionEnabled && p.expression && p.expression.length) {
                    var errStr = "";
                    try { errStr = p.expressionError; } catch (e2) {}
                    if (errStr && errStr.length) {
                        out.push({
                            layer: layerName,
                            property: p.name,
                            matchName: p.matchName,
                            expression: String(p.expression).substring(0, 300),
                            error: String(errStr).substring(0, 300)
                        });
                    }
                }
            } else {
                kinea_scanExprErrors(p, layerName, out, budget); // recurse into the group
            }
        } catch (e3) {}
    }
}

function kinea_findAndFixExpressionError(argsJson) {
    try {
        var comp = kinea_activeComp();
        if (!comp) return JSON.stringify({ ok: false, error: "No active composition." });

        var spec = {};
        if (argsJson && argsJson.length) { try { spec = JSON.parse(argsJson); } catch (e0) {} }

        var sel = comp.selectedLayers;
        var layers = (sel && sel.length) ? sel : null;
        var total = layers ? layers.length : comp.numLayers;
        var cap = spec.maxLayers ? spec.maxLayers : 50;
        var budget = { max: spec.maxFindings ? spec.maxFindings : 25, visited: 0, maxVisited: 5000 };

        var out = [];
        for (var i = 0; i < total && i < cap; i++) {
            var layer = layers ? layers[i] : comp.layer(i + 1);
            kinea_scanExprErrors(layer, layer.name, out, budget);
            if (out.length >= budget.max) break;
        }

        return JSON.stringify({ ok: true, result: { count: out.length, errors: out } });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
