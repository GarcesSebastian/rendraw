/**
 * Small helpers shared by every shape's `_toSVG()` implementation (E4).
 *
 * These keep SVG output well-formed without pulling in a dependency: numbers are
 * trimmed to a compact representation and any text that lands in an attribute or
 * element body is XML-escaped so a user-controlled string (a color, a text
 * value) can never break out of the markup.
 */

/** Formats a number for SVG output, dropping trailing zeros and guarding NaN. */
export function svgNum(value: number): string {
    if (!Number.isFinite(value)) return "0";
    // Round to 3 decimals to keep the output compact, then strip trailing zeros.
    return String(Math.round(value * 1000) / 1000);
}

/** XML-escapes a value for safe use inside an SVG attribute or text node. */
export function svgEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Builds the `transform` attribute content for a shape positioned at
 * `(x, y)` with an optional rotation (radians) about that origin, matching the
 * canvas `translate(...)` + `rotate(...)` draw order used across the shapes.
 */
export function svgTransform(x: number, y: number, rotation: number): string {
    const parts = [`translate(${svgNum(x)} ${svgNum(y)})`];
    if (rotation) {
        // SVG rotate() takes degrees.
        parts.push(`rotate(${svgNum((rotation * 180) / Math.PI)})`);
    }
    return parts.join(" ");
}
