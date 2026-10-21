import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

/**
 * Consumer smoke-test for the built CJS artifact and the `exports` resolution
 * contract.
 *
 * - Loads `dist/index.cjs` via `require` to prove the CJS entry resolves and
 *   exposes the public API (the dual-build requirement).
 * - Asserts the package `exports` map exposes ONLY the root `.` entry, so a deep
 *   internal path (e.g. `rendraw/dist/library/Render`) is NOT a resolvable
 *   public subpath.
 */
const distCjs = resolve(__dirname, "../dist/index.cjs");
const built = existsSync(distCjs);

describe.skipIf(!built)("consumer: built CJS entry (dist/index.cjs)", () => {
    it("exposes the public classes through require()", () => {
        if (!built) return;
        const require = createRequire(import.meta.url);
        const mod = require("../dist/index.cjs");

        for (const name of [
            "Vector",
            "Circle",
            "Rect",
            "Text",
            "Image",
            "Render",
            "RenderCreator",
            "Database",
            "Table",
        ]) {
            expect(typeof mod[name]).toBe("function");
        }

        const v = new mod.Vector(1, 2);
        expect(v.x).toBe(1);
        expect(v.y).toBe(2);
    });

    it("emits a CJS type-declaration file", () => {
        expect(existsSync(resolve(__dirname, "../dist/index.d.cts"))).toBe(true);
    });
});

describe("package exports contract", () => {
    const pkg = JSON.parse(
        readFileSync(resolve(__dirname, "../package.json"), "utf8")
    ) as {
        exports: Record<string, unknown>;
        types?: string;
        main?: string;
        module?: string;
    };

    it("declares types + import + require + default conditions on the root", () => {
        const root = pkg.exports["."] as Record<string, string>;
        expect(root).toBeDefined();
        expect(root.types).toBe("./dist/index.d.ts");
        expect(root.import).toBe("./dist/index.js");
        expect(root.require).toBe("./dist/index.cjs");
        expect(root.default).toBe("./dist/index.js");
        expect(pkg.types).toBe("./dist/index.d.ts");
        expect(pkg.main).toBe("./dist/index.cjs");
        expect(pkg.module).toBe("./dist/index.js");
    });

    it("exposes only the root entry — deep internal imports are not public", () => {
        const keys = Object.keys(pkg.exports);
        // Only "." is mapped; no "./dist/*" or "./library/*" deep subpaths.
        expect(keys).toEqual(["."]);
        expect(keys.some((k) => k !== "." )).toBe(false);
    });
});
