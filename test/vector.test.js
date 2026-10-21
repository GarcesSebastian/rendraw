import { describe, it, expect } from "vitest";
import { Vector } from "../src/library/instances/common/Vector";
describe("Vector math", () => {
    it("adds and subtracts component-wise", () => {
        const a = new Vector(3, 4);
        const b = new Vector(1, 2);
        expect(a.add(b)).toMatchObject({ x: 4, y: 6 });
        expect(a.sub(b)).toMatchObject({ x: 2, y: 2 });
    });
    it("scales and divides by a scalar", () => {
        const a = new Vector(2, -3);
        expect(a.scale(2)).toMatchObject({ x: 4, y: -6 });
        expect(a.divScale(2)).toMatchObject({ x: 1, y: -1.5 });
    });
    it("multiplies and divides component-wise", () => {
        const a = new Vector(6, 8);
        const b = new Vector(2, 4);
        expect(a.mul(b)).toMatchObject({ x: 12, y: 32 });
        expect(a.div(b)).toMatchObject({ x: 3, y: 2 });
    });
    it("computes length", () => {
        expect(new Vector(3, 4).len()).toBe(5);
        expect(Vector.zero.len()).toBe(0);
    });
    it("normalizes a non-zero vector to unit length", () => {
        const n = new Vector(0, 5).normalize();
        expect(n.x).toBeCloseTo(0);
        expect(n.y).toBeCloseTo(1);
        expect(n.len()).toBeCloseTo(1);
    });
    it("pins current behavior: normalizing the zero vector yields NaN components", () => {
        // Documented current behavior (division by zero). A future guard (Phase D)
        // may change this; this test exists to make that change deliberate.
        const n = Vector.zero.normalize();
        expect(n.isNaN()).toBe(true);
    });
    it("reports zero and NaN state", () => {
        expect(Vector.zero.isZero()).toBe(true);
        expect(new Vector(NaN, 0).isNaN()).toBe(true);
        expect(new Vector(1, 1).isNaN()).toBe(false);
    });
    it("inverts, copies, and compares", () => {
        const a = new Vector(1, -2);
        expect(a.invert()).toMatchObject({ x: -1, y: 2 });
        expect(a.invertX()).toMatchObject({ x: -1, y: -2 });
        expect(a.invertY()).toMatchObject({ x: 1, y: 2 });
        const c = a.copy();
        expect(c).not.toBe(a);
        expect(a.equals(c)).toBe(true);
    });
    it("lerps between two vectors", () => {
        const a = new Vector(0, 0);
        const b = new Vector(10, 20);
        expect(a.lerp(b, 0.5)).toMatchObject({ x: 5, y: 10 });
    });
});
//# sourceMappingURL=vector.test.js.map