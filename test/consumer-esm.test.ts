import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Consumer smoke-test for the built ESM artifact.
 *
 * Imports the public surface from the emitted `dist/index.js` (not the `src`
 * tree) to prove the packaged entry resolves and exposes the documented API.
 * Requires `npm run build` to have run first; the test is skipped (with a clear
 * message) when the artifact is absent so a bare `vitest` run does not fail.
 */
const distEsm = resolve(__dirname, "../dist/index.js");
const built = existsSync(distEsm);

describe.skipIf(!built)("consumer: built ESM entry (dist/index.js)", () => {
    it("exposes the public classes and type-only surface", async () => {
        if (!built) return;
        const mod = await import("../dist/index.js");

        // Runtime (value) exports.
        for (const name of [
            "Vector",
            "Circle",
            "Rect",
            "Text",
            "Image",
            "Render",
            "RenderCreator",
            "Shape",
            "Camera",
            "Transformer",
            "Exporter",
            "SnapSmart",
            "History",
            "Selection",
            "Database",
            "Table",
        ]) {
            expect(typeof (mod as Record<string, unknown>)[name]).toBe("function");
        }

        // A constructed value from the built entry behaves like the library.
        const v = new mod.Vector(3, 4);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
    });

    it("emits a type-declaration file alongside the ESM entry", () => {
        expect(existsSync(resolve(__dirname, "../dist/index.d.ts"))).toBe(true);
    });
});

if (!built) {
    // Surfaces the reason in the report without failing an un-built checkout.
    describe("consumer: built ESM entry (dist/index.js)", () => {
        it.skip("skipped: run `npm run build` first to emit dist/index.js", () => {});
    });
}
