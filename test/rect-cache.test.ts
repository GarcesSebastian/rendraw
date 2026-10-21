import { describe, it, expect, vi } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Rect } from "../src/library/instances/_shapes/Rect";

/**
 * The canvas bounding rect is cached and only refreshed on resize/scroll/
 * orientationchange and at drag start, so the per-mousemove hit tests no longer
 * force a layout read. These tests pin:
 *  1. hit tests stay correct after a rect-cache refresh (e.g. the canvas moved),
 *  2. a drag across N shapes does not call getBoundingClientRect per shape/move.
 */
describe("getBoundingClientRect cache", () => {
    it("hit tests are correct and update after the cached rect refreshes", () => {
        const { render, canvas } = makeRender();
        const rect = new Rect({ position: new Vector(100, 100), width: 50, height: 30 }, render);

        // Default stub rect has left/top = 0, so screen == world.
        const mouse = render.mousePosition();
        mouse.x = 120;
        mouse.y = 110;
        expect(rect._isClicked()).toBe(true);

        // The canvas scrolls/moves: its box now starts at (40, 40). Until the
        // cache refreshes, the stale rect is used; after a scroll event it must
        // pick up the new offset and resolve the same world point correctly.
        canvas.getBoundingClientRect = (() => ({
            x: 40, y: 40, top: 40, left: 40, right: 840, bottom: 640,
            width: 800, height: 600, toJSON: () => ({}),
        })) as typeof canvas.getBoundingClientRect;

        window.dispatchEvent(new Event("scroll"));

        // With a +40 offset, the same world point (120,110) now sits at screen
        // (160,150). Pointing at the old screen location must miss; the new one hits.
        mouse.x = 120;
        mouse.y = 110;
        expect(rect._isClicked()).toBe(false);

        mouse.x = 160;
        mouse.y = 150;
        expect(rect._isClicked()).toBe(true);
    });

    it("a drag across many shapes reads the rect once per frame, not once per shape", () => {
        const { render, canvas } = makeRender();

        // 20 shapes to make a per-shape layout read obvious if it existed.
        for (let i = 0; i < 20; i++) {
            new Rect({ position: new Vector(i * 5, 0), width: 4, height: 4, zIndex: i }, render);
        }

        const spy = vi.spyOn(canvas, "getBoundingClientRect");

        // Start a drag: mousedown refreshes the rect exactly once.
        window.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 2, clientY: 2 }));
        const afterDown = spy.mock.calls.length;

        // Now move the mouse many times across all shapes. Each move runs
        // pointerInWorld + hit tests against every shape; none of that may hit
        // the layout engine because the rect is served from cache.
        for (let i = 0; i < 20; i++) {
            window.dispatchEvent(new MouseEvent("mousemove", { clientX: i * 5 + 1, clientY: 2 }));
        }

        // No additional getBoundingClientRect calls happened during the moves.
        expect(spy.mock.calls.length).toBe(afterDown);
        // And the drag-start refresh itself was at most a single read.
        expect(afterDown).toBeLessThanOrEqual(1);

        spy.mockRestore();
    });
});
