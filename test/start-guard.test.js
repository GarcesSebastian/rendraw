import { describe, it, expect, vi, afterEach } from "vitest";
import { Render } from "../src/library/Render";
import { createStubCanvas } from "./stubs/canvas2d";
afterEach(() => {
    vi.restoreAllMocks();
});
describe("start()/stop() frame-id guard", () => {
    it("start() does not double-schedule even when rAF returns 0", () => {
        // requestAnimationFrame legitimately returns 0 in some environments.
        // The guard must use `!== null`, not a truthiness check.
        const raf = vi
            .spyOn(globalThis, "requestAnimationFrame")
            .mockImplementation(() => 0);
        const render = new Render(createStubCanvas());
        // Constructor already called start() once.
        const afterConstruct = raf.mock.calls.length;
        render.start();
        render.start();
        // No additional scheduling: the frame id (0) is treated as "running".
        expect(raf.mock.calls.length).toBe(afterConstruct);
        render.stop();
    });
    it("stop() cancels exactly once after a start()", () => {
        let next = 0;
        vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => ++next);
        const cancel = vi
            .spyOn(globalThis, "cancelAnimationFrame")
            .mockImplementation(() => { });
        const render = new Render(createStubCanvas());
        render.stop();
        render.stop();
        // Only one real cancellation; the second stop() is a guarded no-op.
        expect(cancel).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=start-guard.test.js.map