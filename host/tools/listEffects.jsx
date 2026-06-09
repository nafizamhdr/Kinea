// Kinea host tool — list common built-in effects (name + matchName + category).
// ExtendScript (ES3). READ-ONLY (safe in Chat Mode).
//
// AE has no clean API to enumerate every installed effect, so this is a curated
// catalog of common built-ins. When a layer is selected we verify each via
// canAddProperty so wrong/old matchNames on a given AE version are flagged
// (available:false). Custom/3rd-party effects aren't listed — use applyEffect
// with their matchName directly.
//
// params: { filter? (substring) }

function kinea_effectCatalog() {
    return [
        { name: "Gaussian Blur", matchName: "ADBE Gaussian Blur 2", category: "Blur & Sharpen" },
        { name: "Fast Box Blur", matchName: "ADBE Box Blur2", category: "Blur & Sharpen" },
        { name: "Directional Blur", matchName: "ADBE Motion Blur", category: "Blur & Sharpen" },
        { name: "Sharpen", matchName: "ADBE Sharpen", category: "Blur & Sharpen" },
        { name: "Brightness & Contrast", matchName: "ADBE Brightness & Contrast 2", category: "Color Correction" },
        { name: "Curves", matchName: "ADBE CurvesCustom", category: "Color Correction" },
        { name: "Hue/Saturation", matchName: "ADBE HUE SATURATION", category: "Color Correction" },
        { name: "Levels", matchName: "ADBE Easy Levels2", category: "Color Correction" },
        { name: "Tint", matchName: "ADBE Tint", category: "Color Correction" },
        { name: "Tritone", matchName: "ADBE Tritone", category: "Color Correction" },
        { name: "Exposure", matchName: "ADBE Exposure2", category: "Color Correction" },
        { name: "Posterize", matchName: "ADBE Posterize", category: "Color Correction" },
        { name: "Fill", matchName: "ADBE Fill", category: "Generate" },
        { name: "Gradient Ramp", matchName: "ADBE Ramp", category: "Generate" },
        { name: "4-Color Gradient", matchName: "ADBE 4ColorGradient", category: "Generate" },
        { name: "Stroke", matchName: "ADBE Stroke", category: "Generate" },
        { name: "Grid", matchName: "ADBE Grid", category: "Generate" },
        { name: "Fractal Noise", matchName: "ADBE Fractal Noise", category: "Noise & Grain" },
        { name: "Noise", matchName: "ADBE Noise", category: "Noise & Grain" },
        { name: "Glow", matchName: "ADBE Glo2", category: "Stylize" },
        { name: "Roughen Edges", matchName: "ADBE Roughen Edges", category: "Stylize" },
        { name: "Mosaic", matchName: "ADBE Mosaic", category: "Stylize" },
        { name: "Find Edges", matchName: "ADBE Find Edges", category: "Stylize" },
        { name: "Drop Shadow", matchName: "ADBE Drop Shadow", category: "Perspective" },
        { name: "Bevel Alpha", matchName: "ADBE Bevel Alpha", category: "Perspective" },
        { name: "Transform", matchName: "ADBE Geometry2", category: "Distort" },
        { name: "Turbulent Displace", matchName: "ADBE Turbulent Displace", category: "Distort" },
        { name: "Corner Pin", matchName: "ADBE Corner Pin", category: "Distort" },
        { name: "Offset", matchName: "ADBE Offset", category: "Distort" }
    ];
}

function kinea_listEffects(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) spec = JSON.parse(argsJson);
        var filter = spec.filter ? String(spec.filter).toLowerCase() : null;

        // Verify against a selected AV layer's effect parade if available.
        var fxGroup = null;
        var comp = kinea_activeComp();
        if (comp) {
            var sel = comp.selectedLayers;
            var layer = (sel && sel.length) ? sel[0] : null;
            if (layer) { try { fxGroup = layer.property("ADBE Effect Parade"); } catch (e0) {} }
        }

        var catalog = kinea_effectCatalog();
        var out = [];
        for (var i = 0; i < catalog.length; i++) {
            var e = catalog[i];
            if (filter) {
                var hay = (e.name + " " + e.matchName + " " + e.category).toLowerCase();
                if (hay.indexOf(filter) < 0) continue;
            }
            var entry = { name: e.name, matchName: e.matchName, category: e.category };
            if (fxGroup) {
                try { entry.available = fxGroup.canAddProperty(e.matchName); } catch (e1) { entry.available = false; }
            }
            out.push(entry);
        }

        return JSON.stringify({
            ok: true,
            result: { count: out.length, verifiedAgainstSelection: !!fxGroup, effects: out }
        });
    } catch (e) {
        return kinea_err(String(e));
    }
}
