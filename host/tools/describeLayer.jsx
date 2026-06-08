// Kinea host tool — summarize a layer + its top-level property groups.
// ExtendScript (ES3). READ-ONLY (safe in Chat Mode). Uses kinea_describeNode
// (from describeProperty.jsx) so include order keeps that defined first.
//
// params: { layer? }

function kinea_describeLayer(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return kinea_err("No active composition.");

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return kinea_err("Layer not found.");

        var budget = { count: 0, max: 120 };
        var tree = kinea_describeNode(layer, 1, budget); // depth 1: top-level groups

        var info = {
            index: layer.index,
            name: layer.name,
            type: kinea_layerType(layer),
            enabled: layer.enabled,
            groups: tree.children || []
        };
        return JSON.stringify({ ok: true, result: info });
    } catch (e) {
        return kinea_err(String(e));
    }
}
