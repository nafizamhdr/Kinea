// Kinea host tool — introspect a property subtree. ExtendScript (ES3). READ-ONLY
// (safe in Chat Mode). Lets the agent discover matchNames/types/values at runtime
// (inspect-then-set) instead of hardcoding everything.
//
// params: { layer?, path?:[matchName,...] (default layer root), depth? (default 2) }

function kinea_nodeType(node) {
    try {
        if (node.propertyType === PropertyType.PROPERTY) return "property";
        if (node.propertyType === PropertyType.INDEXED_GROUP) return "indexedGroup";
        if (node.propertyType === PropertyType.NAMED_GROUP) return "namedGroup";
    } catch (e) {}
    return "group";
}

function kinea_describeNode(node, depth, budget) {
    var info = {};
    try { info.matchName = node.matchName; } catch (e) {}
    try { info.name = node.name; } catch (e2) {}
    info.type = kinea_nodeType(node);

    if (kinea_isLeaf(node)) {
        try { info.value = node.value; } catch (e3) {}
        try {
            if (node.expressionEnabled && node.expression && node.expression.length) {
                info.expression = String(node.expression).substring(0, 200);
            }
        } catch (e4) {}
        return info;
    }

    if (depth > 0) {
        info.children = [];
        var n = 0;
        try { n = node.numProperties; } catch (e5) { n = 0; }
        for (var i = 1; i <= n && budget.count < budget.max; i++) {
            budget.count++;
            var ch = null;
            try { ch = node.property(i); } catch (e6) { continue; }
            info.children.push(kinea_describeNode(ch, depth - 1, budget));
        }
    }
    return info;
}

function kinea_describeProperty(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return kinea_err("No active composition.");

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return kinea_err("Layer not found.");

        var root = layer;
        if (spec.path && spec.path.length) {
            var r = kinea_resolvePath(layer, spec.path);
            if (!r.ok) return kinea_err(r.error);
            root = r.prop;
        }

        var depth = (spec.depth !== undefined && spec.depth !== null) ? parseInt(spec.depth, 10) : 2;
        var budget = { count: 0, max: 250 };
        var tree = kinea_describeNode(root, depth, budget);

        return JSON.stringify({ ok: true, result: { tree: tree, truncated: budget.count >= budget.max } });
    } catch (e) {
        return kinea_err(String(e));
    }
}
