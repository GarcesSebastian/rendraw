import { describe, it, expect, vi } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Rect } from "../src/library/instances/_shapes/Rect";
import { History } from "../src/library/instances/utils/History";

/**
 * History is bounded: it keeps at most `maxEntries` snapshots (and optionally
 * stays within `maxBytes`), evicting the oldest while keeping undo/redo indices
 * consistent. Autosave is dirty-flagged: a no-op edit does not re-serialize.
 */
describe("bounded history cap", () => {
    it("caps the number of entries and evicts the oldest", () => {
        const { render } = makeRender();
        const history = new History(render, { maxEntries: 5 });

        // Push 12 distinct snapshots.
        for (let i = 0; i < 12; i++) {
            history.save([{ id: `s${i}`, type: "rect", position: { x: i, y: 0 } } as any]);
        }

        expect(history.length).toBe(5);
        // Index is clamped to the surviving range (last snapshot).
        expect(history.index).toBe(4);
        // Undo/redo still work and never underflow/overflow.
        expect(() => {
            for (let i = 0; i < 10; i++) history.undo();
            for (let i = 0; i < 10; i++) history.redo();
        }).not.toThrow();
    });

    it("default cap is 100", () => {
        const { render } = makeRender();
        const history = new History(render);
        for (let i = 0; i < 150; i++) {
            history.save([{ id: `s${i}`, type: "rect", position: { x: i, y: 0 } } as any]);
        }
        expect(history.length).toBe(100);
        expect(history.maxEntries).toBe(100);
    });

    it("respects a byte cap, always keeping the current snapshot", () => {
        const { render } = makeRender();
        // Each snapshot serializes to well over 10 bytes, so a 200-byte cap
        // forces eviction down to a small window.
        const history = new History(render, { maxEntries: 1000, maxBytes: 200 });

        for (let i = 0; i < 50; i++) {
            history.save([{ id: `shape-${i}`, type: "rect", position: { x: i, y: i } } as any]);
        }

        expect(history.maxBytes).toBe(200);
        expect(history.length).toBeGreaterThanOrEqual(1);
        // The current snapshot is never evicted.
        expect(history.index).toBeGreaterThanOrEqual(0);
        expect(history.index).toBeLessThan(history.length);
    });

    it("clamps an invalid maxEntries to a sane default", () => {
        const { render } = makeRender();
        const zero = new History(render, { maxEntries: 0 });
        expect(zero.maxEntries).toBe(100);

        const nan = new History(render, { maxEntries: Number.NaN });
        expect(nan.maxEntries).toBe(100);
    });

    it("undo/redo remain consistent after eviction", () => {
        const { render } = makeRender();
        const history = new History(render, { maxEntries: 3 });

        for (let i = 0; i < 6; i++) {
            history.save([{ id: `n${i}`, type: "rect", position: { x: i, y: 0 } } as any]);
        }

        // Only the last 3 snapshots (n3, n4, n5) survive; index points at n5.
        expect(history.length).toBe(3);
        expect(history.index).toBe(2);

        history.undo();
        expect(history.index).toBe(1);
        history.undo();
        expect(history.index).toBe(0);
        history.undo(); // no-op at the floor
        expect(history.index).toBe(0);

        history.redo();
        expect(history.index).toBe(1);
    });
});

describe("dirty-flag autosave", () => {
    it("does not re-serialize when nothing changed since the last save", async () => {
        const { render } = makeRender();
        new Rect({ position: new Vector(0, 0), width: 10, height: 10 }, render);

        const serializeSpy = vi.spyOn(render, "serialize");

        // First forced save: scene is dirty (a shape was added), so it serializes.
        render.forceSave();
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 10));
        const afterFirst = serializeSpy.mock.calls.length;
        expect(afterFirst).toBeGreaterThanOrEqual(1);

        // Second forced save with no edits in between: the dirty-flag fast path
        // must short-circuit, so no further serialize happens.
        render.forceSave();
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 10));
        expect(serializeSpy.mock.calls.length).toBe(afterFirst);

        serializeSpy.mockRestore();
    });

    it("re-serializes again after a real edit flips the dirty flag", async () => {
        const { render } = makeRender();
        new Rect({ position: new Vector(0, 0), width: 10, height: 10 }, render);

        const serializeSpy = vi.spyOn(render, "serialize");

        render.forceSave();
        await new Promise((r) => setTimeout(r, 10));
        const afterFirst = serializeSpy.mock.calls.length;

        // A new shape marks the scene dirty again.
        new Rect({ position: new Vector(20, 20), width: 10, height: 10 }, render);
        render.forceSave();
        await new Promise((r) => setTimeout(r, 10));

        expect(serializeSpy.mock.calls.length).toBeGreaterThan(afterFirst);
        serializeSpy.mockRestore();
    });
});
