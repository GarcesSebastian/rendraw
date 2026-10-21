import { Render } from "../../src/library/Render";
import { Vector } from "../../src/library/instances/common/Vector";
/**
 * Builds a Render against a stubbed canvas, stopping its animation loop so a
 * test controls when (if ever) frames run. Returns the render and its canvas.
 */
export declare function makeRender(): {
    render: Render;
    canvas: HTMLCanvasElement;
};
/**
 * Moves the renderer's internal mouse position to the given world/screen point.
 * With zoom 1, globalPosition 0 and a (0,0)-origin canvas rect, screen == world,
 * so hit tests resolve against this point.
 */
export declare function setMouse(render: Render, x: number, y: number): void;
export { Vector };
//# sourceMappingURL=render.d.ts.map