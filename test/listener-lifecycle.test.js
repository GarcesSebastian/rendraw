import { describe, it, expect, vi, afterEach } from "vitest";
import { Render } from "../src/library/Render";
import { createStubCanvas } from "./stubs/canvas2d";
afterEach(() => {
    vi.restoreAllMocks();
});
/**
 * Counts, per (target,type), the net live listeners given recorded add/remove
 * calls. Any positive count after teardown is a leak.
 */
function netCounts(added, removed) {
    const counts = new Map();
    const key = (t, type) => `${t === window ? "window" : t === document ? "document" : "other"}:${type}`;
    for (const [t, type] of added)
        counts.set(key(t, type), (counts.get(key(t, type)) ?? 0) + 1);
    for (const [t, type] of removed)
        counts.set(key(t, type), (counts.get(key(t, type)) ?? 0) - 1);
    return counts;
}
describe("Render listener lifecycle", () => {
    it("destroy() removes every listener it added, from the same targets", async () => {
        const added = [];
        const removed = [];
        const winAdd = window.addEventListener.bind(window);
        const winRemove = window.removeEventListener.bind(window);
        const docAdd = document.addEventListener.bind(document);
        const docRemove = document.removeEventListener.bind(document);
        vi.spyOn(window, "addEventListener").mockImplementation((type, ...rest) => {
            added.push([window, type]);
            return winAdd(type, ...rest);
        });
        vi.spyOn(window, "removeEventListener").mockImplementation((type, ...rest) => {
            removed.push([window, type]);
            return winRemove(type, ...rest);
        });
        vi.spyOn(document, "addEventListener").mockImplementation((type, ...rest) => {
            added.push([document, type]);
            return docAdd(type, ...rest);
        });
        vi.spyOn(document, "removeEventListener").mockImplementation((type, ...rest) => {
            removed.push([document, type]);
            return docRemove(type, ...rest);
        });
        const render = new Render(createStubCanvas());
        render.stop();
        // Construction must have registered listeners.
        expect(added.length).toBeGreaterThan(0);
        await render.destroy();
        const counts = netCounts(added, removed);
        for (const [k, net] of counts) {
            expect(net, `leaked listener on ${k}`).toBe(0);
        }
    });
    it("cleanup() (deprecated alias) also drives teardown to zero", async () => {
        const added = [];
        const removed = [];
        const winAdd = window.addEventListener.bind(window);
        const winRemove = window.removeEventListener.bind(window);
        const docAdd = document.addEventListener.bind(document);
        const docRemove = document.removeEventListener.bind(document);
        vi.spyOn(window, "addEventListener").mockImplementation((type, ...rest) => {
            added.push([window, type]);
            return winAdd(type, ...rest);
        });
        vi.spyOn(window, "removeEventListener").mockImplementation((type, ...rest) => {
            removed.push([window, type]);
            return winRemove(type, ...rest);
        });
        vi.spyOn(document, "addEventListener").mockImplementation((type, ...rest) => {
            added.push([document, type]);
            return docAdd(type, ...rest);
        });
        vi.spyOn(document, "removeEventListener").mockImplementation((type, ...rest) => {
            removed.push([document, type]);
            return docRemove(type, ...rest);
        });
        const render = new Render(createStubCanvas());
        render.stop();
        render.cleanup();
        // Allow the async destroy kicked off by cleanup() to settle.
        await new Promise((r) => setTimeout(r, 0));
        const counts = netCounts(added, removed);
        for (const [k, net] of counts) {
            expect(net, `leaked listener on ${k}`).toBe(0);
        }
    });
});
//# sourceMappingURL=listener-lifecycle.test.js.map