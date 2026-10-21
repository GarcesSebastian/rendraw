/**
 * Environment detection + the error thrown when rendraw runs headless (E6).
 *
 * Kept in its own dependency-free module so both {@link Render} (constructor
 * guard) and {@link createRender} can import it without creating an import
 * cycle between them.
 */

/**
 * Error thrown when rendraw is used outside a browser-like environment (SSR,
 * plain Node, a worker without DOM). It is thrown synchronously — before any
 * canvas, listener, or worker is created — so a server render never leaks
 * resources or crashes deep inside the constructor.
 */
export class EnvironmentError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "EnvironmentError";
        // Restore the prototype chain for instanceof across transpile targets.
        Object.setPrototypeOf(this, EnvironmentError.prototype);
    }
}

/**
 * Returns true when the current global environment can host a rendraw canvas:
 * `window`, `document`, and `HTMLCanvasElement` must all exist.
 */
export function isBrowserEnvironment(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof document !== "undefined" &&
        typeof HTMLCanvasElement !== "undefined"
    );
}
