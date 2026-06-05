// Kinea host tool — create a composition. ExtendScript (ES3).
// JSON string in / JSON string out, try/catch, single undo group (Golden rule 2).
// Mutating -> Agent Mode only.

function kinea_createComp(argsJson) {
    try {
        var spec = {};
        if (argsJson && argsJson.length) {
            spec = JSON.parse(argsJson);
        }

        var name = (spec.name !== undefined && spec.name !== null && String(spec.name).length)
            ? String(spec.name) : "Kinea Comp";
        var width = spec.width ? parseInt(spec.width, 10) : 1920;
        var height = spec.height ? parseInt(spec.height, 10) : 1080;
        var fps = spec.fps ? Number(spec.fps) : 30;
        var duration = spec.duration ? Number(spec.duration) : 10;
        var pixelAspect = 1;

        if (!(width > 0) || !(height > 0)) {
            return JSON.stringify({ ok: false, error: "width/height must be positive numbers." });
        }
        if (!(duration > 0)) {
            return JSON.stringify({ ok: false, error: "duration must be a positive number." });
        }

        app.beginUndoGroup("Kinea: Create Comp");
        var comp;
        try {
            comp = app.project.items.addComp(name, width, height, pixelAspect, duration, fps);
            comp.openInViewer(); // make it the active item for subsequent steps
        } finally {
            app.endUndoGroup();
        }

        return JSON.stringify({
            ok: true,
            result: {
                name: comp.name,
                width: comp.width,
                height: comp.height,
                fps: comp.frameRate,
                duration: comp.duration
            }
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
