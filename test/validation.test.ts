import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    validateShapes,
    validateProperties,
    validateConfig,
} from "../src/library/validation/schemas";
import { makeRender } from "./helpers/render";
import type { ShapeRawData } from "../src/library/instances/Shape";

/**
 * B2: zod validation at the trust boundary. Malformed shapes are repaired when a
 * safe default exists and dropped (with a warning) otherwise. No surviving shape
 * ever has NaN geometry, and nothing throws.
 */

beforeEach(() => {
    // Silence the expected drop/repair warnings so the test output stays clean.
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Collects every finite-expected numeric field of a raw shape for assertions. */
function numericFields(s: ShapeRawData & Record<string, unknown>): number[] {
    const nums: number[] = [s.position.x, s.position.y, s.rotation, s.zIndex];
    for (const k of [
        "width",
        "height",
        "radius",
        "borderWidth",
        "borderRadius",
        "fontSize",
    ]) {
        const v = s[k];
        if (typeof v === "number") nums.push(v);
    }
    return nums;
}

describe("validateShapes: drop invalid shapes", () => {
    it("drops a shape with an unknown type", () => {
        const out = validateShapes([{ type: "banana", position: { x: 0, y: 0 } }]);
        expect(out).toHaveLength(0);
    });

    it("drops a shape with NaN position", () => {
        const out = validateShapes([
            { type: "rect", position: { x: NaN, y: 0 }, width: 10, height: 10 },
        ]);
        expect(out).toHaveLength(0);
    });

    it("drops a shape with Infinity position", () => {
        const out = validateShapes([
            { type: "circle", position: { x: 0, y: Infinity }, radius: 5 },
        ]);
        expect(out).toHaveLength(0);
    });

    it("drops a rect with a negative width", () => {
        const out = validateShapes([
            { type: "rect", position: { x: 0, y: 0 }, width: -5, height: 10 },
        ]);
        expect(out).toHaveLength(0);
    });

    it("drops an image with a javascript: src", () => {
        const out = validateShapes([
            {
                type: "image",
                position: { x: 0, y: 0 },
                src: "javascript:alert(1)",
                width: 10,
                height: 10,
            },
        ]);
        expect(out).toHaveLength(0);
    });

    it("drops an image with a data:text/html src", () => {
        const out = validateShapes([
            {
                type: "image",
                position: { x: 0, y: 0 },
                src: "data:text/html,<script>alert(1)</script>",
                width: 10,
                height: 10,
            },
        ]);
        expect(out).toHaveLength(0);
    });

    it("keeps a data:image/ src", () => {
        const out = validateShapes([
            {
                type: "image",
                position: { x: 0, y: 0 },
                src: "data:image/png;base64,iVBORw0KGgo=",
                width: 10,
                height: 10,
            },
        ]);
        expect(out).toHaveLength(1);
    });
});

describe("validateShapes: repair valid-but-incomplete shapes", () => {
    it("fills missing rotation/zIndex/visible with safe defaults", () => {
        const out = validateShapes([
            { type: "rect", position: { x: 1, y: 2 }, width: 10, height: 10 },
        ]);
        expect(out).toHaveLength(1);
        const s = out[0]!;
        expect(s.rotation).toBe(0);
        expect(s.zIndex).toBe(0);
        expect(s.visible).toBe(true);
        expect(s.dragging).toBe(false);
    });

    it("never drops text for content: missing text becomes empty string", () => {
        const out = validateShapes([{ type: "text", position: { x: 0, y: 0 } }]);
        expect(out).toHaveLength(1);
        expect((out[0] as Record<string, unknown>).text).toBe("");
    });

    it("coerces a non-string text value to a string", () => {
        const out = validateShapes([
            { type: "text", position: { x: 0, y: 0 }, text: 123 },
        ]);
        expect((out[0] as Record<string, unknown>).text).toBe("123");
    });

    it("defaults a non-string color rather than failing", () => {
        const out = validateShapes([
            { type: "rect", position: { x: 0, y: 0 }, width: 5, height: 5, color: "" },
        ]);
        expect(out).toHaveLength(1);
        expect((out[0] as Record<string, unknown>).color).toBe("#000000");
    });
});

describe("validateShapes: no NaN geometry survives", () => {
    it("every surviving shape has only finite geometry", () => {
        const input = [
            { type: "rect", position: { x: 0, y: 0 }, width: 10, height: 20 },
            { type: "rect", position: { x: NaN, y: 0 }, width: 10, height: 10 }, // dropped
            { type: "circle", position: { x: 5, y: 5 }, radius: 3 },
            { type: "circle", position: { x: 0, y: 0 }, radius: NaN }, // dropped
            { type: "text", position: { x: 1, y: 1 }, text: "ok" },
            { type: "image", position: { x: 2, y: 2 }, src: "data:image/png;base64,AA==" },
        ];
        const out = validateShapes(input);
        // Two dropped, four survive.
        expect(out).toHaveLength(4);
        for (const s of out) {
            for (const n of numericFields(s as ShapeRawData & Record<string, unknown>)) {
                expect(Number.isFinite(n)).toBe(true);
            }
        }
    });

    it("does not throw on a non-array input", () => {
        expect(() => validateShapes(null)).not.toThrow();
        expect(validateShapes(null)).toEqual([]);
        expect(validateShapes({ not: "an array" })).toEqual([]);
    });
});

describe("validateShapes: remote-image gate inside validation", () => {
    it("drops a remote (http) image when allowRemoteImages is false (default)", () => {
        const out = validateShapes([
            {
                type: "image",
                position: { x: 0, y: 0 },
                src: "https://example.com/a.png",
                width: 10,
                height: 10,
            },
        ]);
        expect(out).toHaveLength(0);
    });

    it("keeps a remote image when allowRemoteImages is true", () => {
        const out = validateShapes(
            [
                {
                    type: "image",
                    position: { x: 0, y: 0 },
                    src: "https://example.com/a.png",
                    width: 10,
                    height: 10,
                },
            ],
            { allowRemoteImages: true }
        );
        expect(out).toHaveLength(1);
    });

    it("always keeps a data-url image regardless of the flag", () => {
        const out = validateShapes([
            {
                type: "image",
                position: { x: 0, y: 0 },
                src: "data:image/png;base64,AA==",
                width: 10,
                height: 10,
            },
        ]);
        expect(out).toHaveLength(1);
    });
});

describe("Render.deserialize validates untrusted data", () => {
    it("drops malformed shapes and never produces NaN geometry", () => {
        const { render } = makeRender();
        render.deserialize([
            { type: "rect", position: { x: 0, y: 0 }, width: 10, height: 10 } as never,
            { type: "rect", position: { x: NaN, y: 1 }, width: 10, height: 10 } as never,
            { type: "bogus", position: { x: 0, y: 0 } } as never,
        ]);
        const scene = render.serialize();
        expect(scene).toHaveLength(1);
        expect(Number.isFinite(scene[0]!.position.x)).toBe(true);
        expect(Number.isFinite(scene[0]!.position.y)).toBe(true);
    });

    it("does not throw on a corrupt document", () => {
        const { render } = makeRender();
        expect(() =>
            render.deserialize([
                null as never,
                "garbage" as never,
                { type: "circle" } as never,
            ])
        ).not.toThrow();
        expect(render.serialize()).toHaveLength(0);
    });
});

describe("validateProperties / validateConfig", () => {
    it("drops a NaN zoom from stored view-state", () => {
        const out = validateProperties({ zoom: NaN, globalPosition: { x: 1, y: 2 } });
        expect(out.zoom).toBeUndefined();
        expect(out.globalPosition).toEqual({ x: 1, y: 2 });
    });

    it("drops a malformed camera vector", () => {
        const out = validateProperties({ globalPosition: { x: "bad", y: 2 } });
        expect(out.globalPosition).toBeUndefined();
    });

    it("keeps only recognized config keys", () => {
        const out = validateConfig({
            history: true,
            save: "indexeddb",
            allowRemoteImages: true,
            bogus: 42,
        });
        expect(out).toMatchObject({
            history: true,
            save: "indexeddb",
            allowRemoteImages: true,
        });
        expect("bogus" in out).toBe(false);
    });

    it("rejects an invalid save method without throwing", () => {
        const out = validateConfig({ save: "ftp" });
        expect(out.save).toBeUndefined();
    });
});
