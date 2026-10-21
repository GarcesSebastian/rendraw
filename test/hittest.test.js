import { describe, it, expect } from "vitest";
import { makeRender, setMouse } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Rect } from "../src/library/instances/_shapes/Rect";
import { Circle } from "../src/library/instances/_shapes/Circle";
import { Image } from "../src/library/instances/_shapes/Image";
describe("hit tests", () => {
    it("Rect._isClicked: inside vs outside (axis-aligned)", () => {
        const { render } = makeRender();
        const rect = new Rect({ position: new Vector(100, 100), width: 50, height: 30 }, render);
        setMouse(render, 120, 110);
        expect(rect._isClicked()).toBe(true);
        setMouse(render, 10, 10);
        expect(rect._isClicked()).toBe(false);
        // Just outside the right edge.
        setMouse(render, 151, 110);
        expect(rect._isClicked()).toBe(false);
    });
    it("Rect._isClicked: respects rotation", () => {
        const { render } = makeRender();
        const rect = new Rect({ position: new Vector(100, 100), width: 100, height: 20, rotation: Math.PI / 2 }, render);
        // Rotated 90deg about its origin: local axes swap, so a point along the
        // rotated long edge is a hit while the unrotated footprint is not.
        setMouse(render, 95, 150);
        expect(rect._isClicked()).toBe(true);
        setMouse(render, 150, 105);
        expect(rect._isClicked()).toBe(false);
    });
    it("Circle._isClicked: inside radius vs outside", () => {
        const { render } = makeRender();
        const circle = new Circle({ position: new Vector(200, 200), radius: 40 }, render);
        setMouse(render, 200, 200);
        expect(circle._isClicked()).toBe(true);
        setMouse(render, 235, 200);
        expect(circle._isClicked()).toBe(true);
        setMouse(render, 250, 200);
        expect(circle._isClicked()).toBe(false);
    });
    it("Rect._isShapeInBoundary detects overlap", () => {
        const { render } = makeRender();
        const rect = new Rect({ position: new Vector(100, 100), width: 50, height: 50 }, render);
        expect(rect._isShapeInBoundary(80, 80, 100, 100)).toBe(true);
        expect(rect._isShapeInBoundary(0, 0, 10, 10)).toBe(false);
    });
    it("Image bounds hit via boundary check", () => {
        const { render } = makeRender();
        const image = new Image({ position: new Vector(0, 0), src: "data:image/png;base64,AAAA", width: 100, height: 100 }, render);
        // Image uses the Rect-style boundary logic for selection.
        expect(image._isShapeInBoundary(10, 10, 20, 20)).toBe(true);
        expect(image._isShapeInBoundary(200, 200, 20, 20)).toBe(false);
    });
});
//# sourceMappingURL=hittest.test.js.map