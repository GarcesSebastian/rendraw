import { beforeEach } from "vitest";
import { installCanvasStub } from "./stubs/canvas2d";

// jsdom lacks requestAnimationFrame timing guarantees; provide deterministic,
// non-zero-returning stand-ins so the render loop can be driven in tests.
let rafId = 0;
if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
        rafId += 1;
        // Do not actually invoke the callback; tests drive frames explicitly.
        return rafId;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
}

beforeEach(() => {
    installCanvasStub();
});
