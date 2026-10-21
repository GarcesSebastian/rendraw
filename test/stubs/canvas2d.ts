import { vi } from "vitest";

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

const NOOP_METHODS = [
    "save",
    "restore",
    "translate",
    "rotate",
    "scale",
    "setTransform",
    "resetTransform",
    "beginPath",
    "closePath",
    "moveTo",
    "lineTo",
    "arc",
    "rect",
    "roundRect",
    "quadraticCurveTo",
    "bezierCurveTo",
    "fill",
    "stroke",
    "clip",
    "clearRect",
    "fillRect",
    "strokeRect",
    "fillText",
    "strokeText",
    "drawImage",
    "getImageData",
    "putImageData",
    "createLinearGradient",
    "createRadialGradient",
    "setLineDash",
] as const;

/**
 * Builds a fresh stub 2D context bound to the given canvas element.
 * Every drawing method is a `vi.fn()` so tests can assert on calls.
 */
export function createStubContext2D(canvas: HTMLCanvasElement): StubContext2D {
    const ctx: StubContext2D = {
        canvas,
        // Common writable style/state properties the code assigns to.
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        font: "10px sans-serif",
        textAlign: "left",
        textBaseline: "alphabetic",
        globalAlpha: 1,
        measureText: (text: string): TextMetrics => {
            return {
                width: text.length * 7,
                actualBoundingBoxAscent: 8,
                actualBoundingBoxDescent: 2,
                fontBoundingBoxAscent: 8,
                fontBoundingBoxDescent: 2,
            } as unknown as TextMetrics;
        },
    };

    for (const name of NOOP_METHODS) {
        ctx[name] = vi.fn(() => {
            if (name === "getImageData") {
                return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
            }
            return undefined;
        });
    }

    return ctx;
}

/**
 * Installs the stub by overriding `HTMLCanvasElement.prototype.getContext`
 * so any canvas created during a test yields a stub 2D context. Also gives
 * `getBoundingClientRect` a stable, non-zero rect since jsdom reports zeros.
 */
export function installCanvasStub(): void {
    const contexts = new WeakMap<HTMLCanvasElement, StubContext2D>();

    HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        contextId: string
    ): StubContext2D | null {
        if (contextId !== "2d") return null;
        let ctx = contexts.get(this);
        if (!ctx) {
            ctx = createStubContext2D(this);
            contexts.set(this, ctx);
        }
        return ctx;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getBoundingClientRect = function (): DOMRect {
        return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            toJSON: () => ({}),
        } as DOMRect;
    };
}

/**
 * Creates a canvas element wired to the stub context, sized 800x600.
 */
export function createStubCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    return canvas;
}
