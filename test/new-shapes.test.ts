import { describe, it, expect, vi } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Line, type LineRawData } from "../src/library/instances/_shapes/Line";
import { Arrow, type ArrowRawData } from "../src/library/instances/_shapes/Arrow";
import { Polygon, type PolygonRawData } from "../src/library/instances/_shapes/Polygon";
import { Path, type PathRawData } from "../src/library/instances/_shapes/Path";
import { Pen, type PenRawData } from "../src/library/instances/_shapes/Pen";

/**
 * E2: new diagramming primitives. Each shape must round-trip through its raw
 * data, report a correct hit test, and declare its own `type`. The loader must
 * skip an unknown type with a warning rather than throwing.
 */
describe("E2 new shapes", () => {
    it("Line round-trips and hit-tests along its segment", () => {
        const { render } = makeRender();
        const line = render.creator.Line({
            from: new Vector(0, 0),
            to: new Vector(100, 0),
            color: "#123456",
            width: 3,
        });

        expect(line.type).toBe("line");

        const raw = line._rawData() as LineRawData;
        expect(raw.type).toBe("line");
        expect(raw.position).toEqual({ x: 0, y: 0 });
        expect(raw.to).toEqual({ x: 100, y: 0 });

        const restored = Line._fromRawData(raw, render);
        expect(restored._rawData()).toEqual(raw);

        // A point on the segment hits; a far point misses.
        render.mousePosition().x = 50;
        render.mousePosition().y = 0;
        expect(line._isClicked()).toBe(true);
        render.mousePosition().x = 50;
        render.mousePosition().y = 80;
        expect(line._isClicked()).toBe(false);
    });

    it("Arrow round-trips, keeps its head, and reports type arrow", () => {
        const { render } = makeRender();
        const arrow = render.creator.Arrow({
            from: new Vector(10, 10),
            to: new Vector(110, 10),
            head: "both",
            headSize: 12,
        });

        expect(arrow.type).toBe("arrow");
        const raw = arrow._rawData() as ArrowRawData;
        expect(raw.type).toBe("arrow");
        expect(raw.head).toBe("both");
        expect(raw.headSize).toBe(12);

        const restored = Arrow._fromRawData(raw, render);
        expect(restored.head).toBe("both");
        expect(restored._rawData()).toEqual(raw);
    });

    it("Polygon round-trips and hit-tests inside a closed shape", () => {
        const { render } = makeRender();
        const poly = render.creator.Polygon({
            points: [new Vector(0, 0), new Vector(100, 0), new Vector(50, 100)],
            closed: true,
            fill: "#abcdef",
        });

        expect(poly.type).toBe("polygon");
        const raw = poly._rawData() as PolygonRawData;
        expect(raw.points).toHaveLength(3);

        const restored = Polygon._fromRawData(raw, render);
        expect(restored._rawData()).toEqual(raw);

        // Centroid-ish interior point hits a filled triangle.
        render.mousePosition().x = 50;
        render.mousePosition().y = 40;
        expect(poly._isClicked()).toBe(true);
        render.mousePosition().x = 500;
        render.mousePosition().y = 500;
        expect(poly._isClicked()).toBe(false);
    });

    it("Path round-trips and supports streaming points", () => {
        const { render } = makeRender();
        const path = render.creator.Path({
            points: [new Vector(0, 0), new Vector(10, 10)],
            smoothing: 0,
        });

        path.addPoint(new Vector(20, 0));
        expect(path.points).toHaveLength(3);

        const raw = path._rawData() as PathRawData;
        expect(raw.type).toBe("path");
        const restored = Path._fromRawData(raw, render);
        expect(restored._rawData()).toEqual(raw);
    });

    it("Pen serializes under its own pen type and round-trips", () => {
        const { render } = makeRender();
        const pen = render.creator.Pen({ points: [new Vector(0, 0), new Vector(5, 5), new Vector(10, 0)] });

        expect(pen.type).toBe("pen");
        const raw = pen._rawData() as PenRawData;
        expect(raw.type).toBe("pen");

        const restored = Pen._fromRawData(raw, render);
        expect(restored.type).toBe("pen");
        expect(restored._rawData()).toEqual(raw);
    });

    it("deserialize reconstructs every new shape type via Render", () => {
        const { render } = makeRender();
        render.creator.Line({ from: new Vector(0, 0), to: new Vector(5, 5) });
        render.creator.Arrow({ from: new Vector(1, 1), to: new Vector(9, 9) });
        render.creator.Polygon({ points: [new Vector(0, 0), new Vector(2, 2), new Vector(4, 0)] });
        render.creator.Path({ points: [new Vector(0, 0), new Vector(3, 3)] });
        render.creator.Pen({ points: [new Vector(0, 0), new Vector(1, 1)] });

        const serialized = render.serialize();
        render.deserialize(serialized);
        const reserialized = render.serialize();

        const types = reserialized.map((s) => s.type).sort();
        expect(types).toEqual(["arrow", "line", "path", "pen", "polygon"]);
    });

    it("loader skips an unknown shape type with a warning and never throws", () => {
        const { render } = makeRender();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        expect(() =>
            render.deserialize([
                { id: "x", type: "hexagon", position: { x: 0, y: 0 }, rotation: 0, zIndex: 0, dragging: false, visible: true } as never,
                { id: "ok", type: "line", position: { x: 0, y: 0 }, rotation: 0, zIndex: 0, dragging: false, visible: true, to: { x: 10, y: 0 }, color: "#000", width: 1 } as never,
            ])
        ).not.toThrow();

        // The unknown type is dropped; the valid line survives.
        expect(render.serialize().map((s) => s.type)).toEqual(["line"]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
