/**
 * A minimal, spy-able stand-in for `CanvasRenderingContext2D`.
 *
 * jsdom does not implement a real 2D canvas context, so the shapes and the
 * renderer would otherwise crash on `getContext('2d')` returning `null`. This
 * stub implements the subset of the 2D API that rendraw actually calls as
 * no-op spies, with `measureText` returning a deterministic width so text
 * metrics are predictable in tests.
 */
export interface StubContext2D {
    [key: string]: unknown;
    canvas: HTMLCanvasElement;
    measureText: (text: string) => TextMetrics;
}
/**
 * Builds a fresh stub 2D context bound to the given canvas element.
 * Every drawing method is a `vi.fn()` so tests can assert on calls.
 */
export declare function createStubContext2D(canvas: HTMLCanvasElement): StubContext2D;
/**
 * Installs the stub by overriding `HTMLCanvasElement.prototype.getContext`
 * so any canvas created during a test yields a stub 2D context. Also gives
 * `getBoundingClientRect` a stable, non-zero rect since jsdom reports zeros.
 */
export declare function installCanvasStub(): void;
/**
 * Creates a canvas element wired to the stub context, sized 800x600.
 */
export declare function createStubCanvas(): HTMLCanvasElement;
//# sourceMappingURL=canvas2d.d.ts.map