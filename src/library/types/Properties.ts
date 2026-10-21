import type { Vector } from "../instances/common/Vector";

/**
 * View-state properties of a {@link Render} instance: the current zoom factor,
 * the global canvas position, and the pan offset. Shared here so that both
 * `Render` and the serialization schemas can reference it without creating an
 * import cycle through `Render.ts`.
 */
export interface RenderProperties {
    zoom: number;
    globalPosition: Vector;
    offsetPan: Vector;
}
