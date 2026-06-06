// Kinea host tool — apply easing to existing keyframes. ExtendScript (ES3).
// JSON in / JSON out, try/catch, single undo group. Agent Mode only.
//
// params: { layer?, property, easing?('easyEase'|'easeIn'|'easeOut'),
//           influence?(0.1..100, default 33.33), keyIndices?([1-based ints]) }

// Apply temporal ease to one key, sizing the ease arrays to the property's
// dimensions. Spatial props (Position) want a single ease, so we retry with 1
// element if the per-dimension call is rejected (avoids asserting the rule).
function kinea_applyEaseToKey(prop, ki, easeIn, easeOut, dim) {
    try {
        var inArr = [], outArr = [];
        for (var d = 0; d < dim; d++) { inArr.push(easeIn); outArr.push(easeOut); }
        prop.setTemporalEaseAtKey(ki, inArr, outArr);
        return true;
    } catch (e) {
        return false;
    }
}

function kinea_setEasing(argsJson) {
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

        var numKeys = 0;
        try { numKeys = prop.numKeys; } catch (e0) {}
        if (!numKeys || numKeys < 1) {
            return JSON.stringify({ ok: false, error: "Property has no keyframes to ease: " + propName });
        }

        var inf = spec.influence ? Number(spec.influence) : 33.3333;
        if (inf < 0.1) inf = 0.1;
        if (inf > 100) inf = 100;

        var easing = (spec.easing ? String(spec.easing) : "easyease").toLowerCase();
        var inInf = inf, outInf = inf;
        if (easing === "easein") outInf = 0.1;
        else if (easing === "easeout") inInf = 0.1;

        var easeIn = new KeyframeEase(0, inInf);
        var easeOut = new KeyframeEase(0, outInf);

        var indices = [];
        if (spec.keyIndices && spec.keyIndices.length) {
            for (var a = 0; a < spec.keyIndices.length; a++) indices.push(parseInt(spec.keyIndices[a], 10));
        } else {
            for (var k = 1; k <= numKeys; k++) indices.push(k);
        }

        app.beginUndoGroup("Kinea: Set Easing");
        var done = 0;
        try {
            for (var i = 0; i < indices.length; i++) {
                var ki = indices[i];
                if (ki < 1 || ki > numKeys) continue;
                prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);

                var dim = 1;
                try { var vv = prop.keyValue(ki); if (vv instanceof Array) dim = vv.length; } catch (e1) {}
                if (!kinea_applyEaseToKey(prop, ki, easeIn, easeOut, dim)) {
                    kinea_applyEaseToKey(prop, ki, easeIn, easeOut, 1);
                }
                done++;
            }
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({
            ok: true,
            result: { layer: layer.name, property: prop.name, keysEased: done, easing: easing }
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
