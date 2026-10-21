import { describe, it, expect, vi, afterEach } from "vitest";
import { Render } from "../src/library/Render";
import { createStubCanvas } from "./stubs/canvas2d";

afterEach(() => {
    vi.restoreAllMocks();
});

type Target = Window & typeof globalThis | Document;

/**
 * Counts, per (target,type), the net live listeners given recorded add/remove
 * calls. Any positive count after teardown is a leak.
 */
function netCounts(
    added: Array<[Target, string]>,
    removed: Array<[Target, string]>
): Map<string, number> {
    const counts = new Map<string, number>();
    const key = (t: Target, type: string) =>
        `${t === window ? "window" : t === document ? "document" : "other"}:${type}`;
    for (const [t, type] of added) counts.set(key(t, type), (counts.get(key(t, type)) ?? 0) + 1);
    for (const [t, type] of removed) counts.set(key(t, type), (counts.get(key(t, type)) ?? 0) - 1);
    return counts;
}

describe("Render listener lifecycle", () => {
    it("destroy() removes every listener it added, from the same targets", async () => {
        const added: Array<[Target, string]> = [];
        const removed: Array<[Target, string]> = [];

        const winAdd = window.addEventListener.bind(window);
        const winRemove = window.removeEventListener.bind(window);
        const docAdd = document.addEventListener.bind(document);
        const docRemove = document.removeEventListener.bind(document);

        vi.spyOn(window, "addEventListener").mockImplementation((type: string, ...rest: any[]) => {
            added.push([window, type]);
            return (winAdd as any)(type, ...rest);
        });
        vi.spyOn(window, "removeEventListener").mockImplementation((type: string, ...rest: any[]) => {
            removed.push([window, type]);
            return (winRemove as any)(type, ...rest);
        });
        vi.spyOn(document, "addEventListener").mockImplementation((type: string, ...rest: any[]) => {
            added.push([document, type]);
            return (docAdd as any)(type, ...rest);
        });
        vi.spyOn(document, "removeEventListener").mockImplementation((type: string, ...rest: any[]) => {
            removed.push([document, type]);
            return (docRemove as any)(type, ...rest);
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
        const added: Array<[Target, string]> = [];
        const removed: Array<[Target, string]> = [];
        const winAdd = window.addEventListener.bind(window);
        const winRemove = window.removeEventListener.bind(window);
        const docAdd = document.addEventListener.bind(document);
        const docRemove = document.removeEventListener.bind(document);

        vi.spyOn(window, "addEventListener").mockImplementation((type: string, ...rest: any[]) => {
            added.push([window, type]);
            return (winAdd as any)(type, ...rest);
        });
        vi.spyOn(window, "removeEventListener").mockImplementation((type: string, ...rest: any[]) => {
            removed.push([window, type]);
            return (winRemove as any)(type, ...rest);
        });
        vi.spyOn(document, "addEventListener").mockImplementation((type: string, ...rest: any[]) => {
            added.push([document, type]);
            return (docAdd as any)(type, ...rest);
        });
        vi.spyOn(document, "removeEventListener").mockImplementation((type: string, ...rest: any[]) => {
            removed.push([document, type]);
            return (docRemove as any)(type, ...rest);
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
