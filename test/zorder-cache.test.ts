import { describe, it, expect } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Rect } from "../src/library/instances/_shapes/Rect";

/**
 * The renderer caches the z-ordered shape list and only rebuilds it when the
 * scene changes. These tests pin two things:
 *  1. the cached order is identical to the old `sort((a,b) => b.zIndex-a.zIndex)`
 *     (descending zIndex, top-most first), and
 *  2. the cache is invalidated on add / remove / zIndex change.
 */
describe("z-order cache", () => {
    it("matches the old sort+order and returns the same array identity when unchanged", () => {
        const { render } = makeRender();

        const a = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 1 }, render);
        const b = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 5 }, render);
        const c = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 3 }, render);

        // `childs` returns a copy of the cache in descending-zIndex order, which
        // is exactly what the previous per-call sort produced.
        const order = render.childs.map((s) => s.zIndex);
        const expected = [a, b, c].map((s) => s.zIndex).sort((x, y) => y - x);
        expect(order).toEqual(expected);
        expect(order).toEqual([5, 3, 1]);

        // Private cache identity: two reads with no mutation return the same array.
        const first = (render as any)._getChildrens();
        const second = (render as any)._getChildrens();
        expect(second).toBe(first);
    });

    it("invalidates on add", () => {
        const { render } = makeRender();
        new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 1 }, render);

        const before = (render as any)._getChildrens();
        new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 2 }, render);
        const after = (render as any)._getChildrens();

        expect(after).not.toBe(before);
        expect(after.map((s: any) => s.zIndex)).toEqual([2, 1]);
    });

    it("invalidates on remove", () => {
        const { render } = makeRender();
        const a = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 1 }, render);
        const b = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 2 }, render);

        const before = (render as any)._getChildrens();
        expect(before).toHaveLength(2);

        b.destroy();
        const after = (render as any)._getChildrens();

        expect(after).not.toBe(before);
        expect(after).toHaveLength(1);
        expect(after[0]).toBe(a);
    });

    it("invalidates on zIndex change", () => {
        const { render } = makeRender();
        const a = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 1 }, render);
        const b = new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 2 }, render);

        // Read once to populate the cache.
        const before = (render as any)._getChildrens();
        expect(before.map((s: any) => s.zIndex)).toEqual([2, 1]);

        // Promote `a` above `b` via a direct zIndex write (goes through the setter).
        a.zIndex = 10;
        const after = (render as any)._getChildrens();

        expect(after).not.toBe(before);
        expect(after[0]).toBe(a);
        expect(after.map((s: any) => s.zIndex)).toEqual([10, 2]);

        // setFront also invalidates the cache (a new array is produced) and the
        // order stays sorted by the resulting zIndex values.
        const beforeFront = (render as any)._getChildrens();
        b.setFront();
        const afterFront = (render as any)._getChildrens();
        expect(afterFront).not.toBe(beforeFront);
        const zs = afterFront.map((s: any) => s.zIndex);
        expect(zs).toEqual([...zs].sort((x, y) => y - x));
    });

    it("draw order (back-to-front) is the reverse of the cached top-most-first order", () => {
        const { render } = makeRender();
        new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 1 }, render);
        new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 9 }, render);
        new Rect({ position: new Vector(0, 0), width: 10, height: 10, zIndex: 4 }, render);

        const topFirst = (render as any)._getChildrens().map((s: any) => s.zIndex);
        const drawOrder = [...topFirst].reverse();

        // Rendering must paint lowest zIndex first so higher ones land on top.
        expect(drawOrder).toEqual([1, 4, 9]);

        // Driving a frame must not corrupt the cached array (no in-place reverse).
        render._render();
        const afterFrame = (render as any)._getChildrens().map((s: any) => s.zIndex);
        expect(afterFrame).toEqual(topFirst);
    });
});
