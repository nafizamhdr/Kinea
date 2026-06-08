// Kinea host tool — keyframe ANY property by path, with interpolation + easing.
// ExtendScript (ES3). Generic primitive (Phase 1). Generalizes the MVP's
// setTransformKeyframes. JSON in/out, try/catch, single undo group.
//
// params: { layer?, path:[matchName,...], keys:[ {
//   time, value, interpIn?, interpOut? ('hold'|'linear'|'bezier'),
//   easeIn?, easeOut? ({ influence, speed }) } ] }
// (spatialTangents are a later addition.)

function kinea_applyEaseArr(prop, ki, easeIn, easeOut, dim) {
    try {
        var a = [], b = [];
        for (var d = 0; d < dim; d++) { a.push(easeIn); b.push(easeOut); }
        prop.setTemporalEaseAtKey(ki, a, b);
        return true;
    } catch (e) { return false; }
}

function kinea_applyKeyInterp(prop, ki, k) {
    // Interpolation type (in/out)
    if (k.interpIn || k.interpOut) {
        var ti = k.interpIn ? kinea_interpType(k.interpIn) : KeyframeInterpolationType.BEZIER;
        var to = k.interpOut ? kinea_interpType(k.interpOut) : KeyframeInterpolationType.BEZIER;
        try { prop.setInterpolationTypeAtKey(ki, ti, to); } catch (e) {}
    }
    // Temporal ease
    if (k.easeIn || k.easeOut) {
        var dim = 1;
        try { var vv = prop.keyValue(ki); if (vv instanceof Array) dim = vv.length; } catch (e1) {}
        var inInf = k.easeIn ? kinea_clampInfluence(k.easeIn.influence) : 0.1;
        var outInf = k.easeOut ? kinea_clampInfluence(k.easeOut.influence) : 0.1;
        var inSpd = (k.easeIn && k.easeIn.speed !== undefined) ? Number(k.easeIn.speed) : 0;
        var outSpd = (k.easeOut && k.easeOut.speed !== undefined) ? Number(k.easeOut.speed) : 0;
        var ei = new KeyframeEase(inSpd, inInf);
        var eo = new KeyframeEase(outSpd, outInf);
        if (!kinea_applyEaseArr(prop, ki, ei, eo, dim)) kinea_applyEaseArr(prop, ki, ei, eo, 1);
    }
}

function kinea_setKeyframes(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);

        var comp = kinea_activeComp();
        if (!comp) return kinea_err("No active composition.");

        var layer = kinea_findLayer(comp, spec);
        if (!layer) return kinea_err("Layer not found.");

        var r = kinea_resolvePath(layer, spec.path);
        if (!r.ok) return kinea_err(r.error);
        var prop = r.prop;
        if (!kinea_isLeaf(prop)) return kinea_err("Path is not a keyframeable property.");

        var keys = spec.keys;
        if (!keys || !keys.length) return kinea_err("No keys provided.");

        app.beginUndoGroup("Kinea: Set Keyframes");
        var added = 0;
        try {
            // 1) place all values
            for (var i = 0; i < keys.length; i++) {
                prop.setValueAtTime(Number(keys[i].time), kinea_coerceValue(keys[i].value));
                added++;
            }
            // 2) apply per-key interpolation/easing (locate the key by time)
            for (var j = 0; j < keys.length; j++) {
                var ki = prop.nearestKeyIndex(Number(keys[j].time));
                kinea_applyKeyInterp(prop, ki, keys[j]);
            }
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({ ok: true, result: { path: spec.path, keyCount: added } });
    } catch (e) {
        return kinea_err(String(e));
    }
}
