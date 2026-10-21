import { describe, it, expect, afterEach, vi } from "vitest";
import { makeRender } from "./helpers/render";

/**
 * resize() must scale the backing store by the device pixel ratio and scale the
 * context by the same factor, so on-screen sharpness matches the DPR-scaled
 * export path while all drawing math keeps working in CSS pixels.
 */
describe("HiDPI-correct resize", () => {
    const originalDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");

    afterEach(() => {
        if (originalDpr) {
            Object.defineProperty(window, "devicePixelRatio", originalDpr);
        } else {
            // @ts-expect-error cleanup of the test-only override
            delete (window as any).devicePixelRatio;
        }
    });

    function setDpr(value: number): void {
        Object.defineProperty(window, "devicePixelRatio", {
            configurable: true,
            value,
        });
    }

    it("scales the backing store by devicePixelRatio (CSS size unchanged)", () => {
        setDpr(2);
        const { render, canvas } = makeRender();

        render.resize();

        // Stub canvas rect is 800x600 (CSS). Backing store is CSS * dpr.
        expect(canvas.width).toBe(1600);
        expect(canvas.height).toBe(1200);

        // CSS dimensions still report the on-screen box, not the backing store.
        expect(render.cssWidth).toBe(800);
        expect(render.cssHeight).toBe(600);
        expect(render.devicePixelRatio).toBe(2);
    });

    it("applies a DPR context transform so drawing stays in CSS units", () => {
        setDpr(3);
        const { render } = makeRender();

        const setTransform = vi.spyOn(render.ctx, "setTransform");
        render.resize();

        expect(setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0);
        setTransform.mockRestore();
    });

    it("falls back to 1x when devicePixelRatio is unavailable", () => {
        setDpr(1);
        const { render, canvas } = makeRender();

        render.resize();

        expect(canvas.width).toBe(800);
        expect(canvas.height).toBe(600);
        expect(render.devicePixelRatio).toBe(1);
    });
});
