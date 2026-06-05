// Kinea host tool — create a red solid in the active composition.
// ExtendScript (ES3). Sprint-1 skeleton proof of the mutation contract:
//   - JSON string in / JSON string out
//   - try/catch so no exception escapes
//   - single undo group around the mutation (Golden rule 2)
//
// This is Agent-Mode behavior (it mutates). Chat Mode must never call it.

function kinea_createRedSolid() {
    try {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            return JSON.stringify({
                ok: false,
                error: "No active composition. Open or select a comp, then try again."
            });
        }

        app.beginUndoGroup("Kinea: Create Red Solid");
        var solid;
        try {
            // addSolid(color[r,g,b 0..1], name, width, height, pixelAspect, duration)
            solid = comp.layers.addSolid(
                [1, 0, 0],
                "Kinea Red Solid",
                comp.width,
                comp.height,
                comp.pixelAspect,
                comp.duration
            );
        } finally {
            // endUndoGroup must run even if addSolid throws, or AE's undo
            // stack is left open.
            app.endUndoGroup();
        }

        return JSON.stringify({
            ok: true,
            result: {
                layerName: solid.name,
                layerIndex: solid.index,
                compName: comp.name,
                width: comp.width,
                height: comp.height
            }
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
