import { Render } from "../../src/library/Render";
import { Vector } from "../../src/library/instances/common/Vector";
import { createStubCanvas } from "../stubs/canvas2d";
/**
 * Builds a Render against a stubbed canvas, stopping its animation loop so a
 * test controls when (if ever) frames run. Returns the render and its canvas.
 */
export function makeRender() {
    const canvas = createStubCanvas();
    const render = new Render(canvas);
    render.stop();
    return { render, canvas };
}
/**
 * Moves the renderer's internal mouse position to the given world/screen point.
 * With zoom 1, globalPosition 0 and a (0,0)-origin canvas rect, screen == world,
 * so hit tests resolve against this point.
 */
export function setMouse(render, x, y) {
    const pos = render.mousePosition();
    pos.x = x;
    pos.y = y;
}
export { Vector };
//# sourceMappingURL=render.js.map