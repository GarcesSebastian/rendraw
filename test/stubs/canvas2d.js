import { vi } from "vitest";
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
];
/**
 * Builds a fresh stub 2D context bound to the given canvas element.
 * Every drawing method is a `vi.fn()` so tests can assert on calls.
 */
export function createStubContext2D(canvas) {
    const ctx = {
        canvas,
        // Common writable style/state properties the code assigns to.
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        font: "10px sans-serif",
        textAlign: "left",
        textBaseline: "alphabetic",
        globalAlpha: 1,
        measureText: (text) => {
            return {
                width: text.length * 7,
                actualBoundingBoxAscent: 8,
                actualBoundingBoxDescent: 2,
                fontBoundingBoxAscent: 8,
                fontBoundingBoxDescent: 2,
            };
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
export function installCanvasStub() {
    const contexts = new WeakMap();
    HTMLCanvasElement.prototype.getContext = function (contextId) {
        if (contextId !== "2d")
            return null;
        let ctx = contexts.get(this);
        if (!ctx) {
            ctx = createStubContext2D(this);
            contexts.set(this, ctx);
        }
        return ctx;
    };
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
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
        };
    };
}
/**
 * Creates a canvas element wired to the stub context, sized 800x600.
 */
export function createStubCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    return canvas;
}
//# sourceMappingURL=canvas2d.js.map