import { describe, it, expect, vi } from "vitest";
import { createStubCanvas } from "./stubs/canvas2d";
import { createRender, EnvironmentError, isBrowserEnvironment } from "../src/library/createRender";

/**
 * E6: createRender factory + SSR/headless guard. In the browser (jsdom) the
 * factory fills defaults from a partial config and returns a working Render; with
 * `window`/`document` stubbed away it throws a typed EnvironmentError before
 * constructing anything.
 */
describe("E6 createRender + environment guard", () => {
    it("constructs a Render from a partial config and fills defaults", async () => {
        const canvas = createStubCanvas();
        const render = await createRender(canvas, { pan: true });

        // The partial flag is applied...
        expect(render.configuration.config.pan).toBe(true);
        // ...and an unspecified flag keeps its default (false).
        expect(render.configuration.config.zoom).toBe(false);
        // ...and a defaulted feature flag is present (touch defaults true).
        expect(render.configuration.config.touch).toBe(true);

        await render.destroy();
    });

    it("works with no config at all", async () => {
        const canvas = createStubCanvas();
        const render = await createRender(canvas);
        expect(render).toBeTruthy();
        await render.destroy();
    });

    it("isBrowserEnvironment is true under jsdom", () => {
        expect(isBrowserEnvironment()).toBe(true);
    });

    it("throws a typed EnvironmentError under SSR (no window/document)", async () => {
        const canvas = createStubCanvas();

        // Simulate a headless/SSR environment.
        vi.stubGlobal("window", undefined);
        vi.stubGlobal("document", undefined);
        try {
            await expect(createRender(canvas)).rejects.toBeInstanceOf(EnvironmentError);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("new Render(canvas) also throws EnvironmentError under SSR", async () => {
        const { Render } = await import("../src/library/Render");
        const canvas = createStubCanvas();

        vi.stubGlobal("window", undefined);
        vi.stubGlobal("document", undefined);
        try {
            expect(() => new Render(canvas)).toThrow(EnvironmentError);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
