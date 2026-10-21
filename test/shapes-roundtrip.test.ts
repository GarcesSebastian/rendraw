import { describe, it, expect } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Rect, type RectRawData } from "../src/library/instances/_shapes/Rect";
import { Circle, type CircleRawData } from "../src/library/instances/_shapes/Circle";
import { Text, type TextRawData } from "../src/library/instances/_shapes/Text";
import { Image, type ImageRawData } from "../src/library/instances/_shapes/Image";

describe("serialize / deserialize round-trips", () => {
    it("Rect preserves all fields including borderRadius (regression)", () => {
        const { render } = makeRender();
        const original = new Rect(
            {
                position: new Vector(12, 34),
                width: 200,
                height: 150,
                color: "#3498db",
                borderWidth: 4,
                borderColor: "#111111",
                borderRadius: 18,
                rotation: 0.5,
                zIndex: 3,
                visible: true,
                dragging: false,
            },
            render
        );

        const raw = original._rawData() as RectRawData;
        const restored = Rect._fromRawData(raw, render);

        // borderRadius must survive the reload — this is the A7 regression.
        expect(restored.borderRadius).toBe(18);
        expect(restored.borderWidth).toBe(4);
        expect(restored.borderColor).toBe("#111111");
        expect(restored.color).toBe("#3498db");
        expect(restored.width).toBe(200);
        expect(restored.height).toBe(150);
        expect(restored.rotation).toBe(0.5);
        expect(restored.zIndex).toBe(3);
        expect(restored.id).toBe(original.id);
        expect(restored.position.x).toBe(12);
        expect(restored.position.y).toBe(34);

        // Full-field equality via raw data comparison.
        expect(restored._rawData()).toEqual(raw);

        // C6: position serializes as a plain {x,y} object, not a Vector instance,
        // while the JSON stays byte-identical to the Vector's own JSON shape.
        expect(raw.position).not.toBeInstanceOf(Vector);
        expect(raw.position).toEqual({ x: 12, y: 34 });
        expect(JSON.stringify(raw.position)).toBe(
            JSON.stringify(new Vector(12, 34))
        );
    });

    it("Rect borderRadius survives a JSON serialize/deserialize cycle", () => {
        const { render } = makeRender();
        const rect = new Rect(
            { position: new Vector(0, 0), width: 10, height: 10, borderRadius: 7 },
            render
        );

        const json = JSON.stringify(rect._rawData());
        const parsed = JSON.parse(json) as RectRawData;
        const restored = Rect._fromRawData(parsed, render);

        expect(restored.borderRadius).toBe(7);
    });

    it("Circle round-trips", () => {
        const { render } = makeRender();
        const original = new Circle(
            { position: new Vector(50, 60), radius: 25, color: "#ff0000", zIndex: 2 },
            render
        );
        const raw = original._rawData() as CircleRawData;
        const restored = Circle._fromRawData(raw, render);

        expect(restored.radius).toBe(25);
        expect(restored.color).toBe("#ff0000");
        expect(restored.position.x).toBe(50);
        expect(restored.position.y).toBe(60);
        expect(restored._rawData()).toEqual(raw);
    });

    it("Text round-trips", () => {
        const { render } = makeRender();
        const original = new Text(
            {
                position: new Vector(5, 5),
                text: "Hello",
                fontSize: 20,
                color: "#222222",
            },
            render
        );
        const raw = original._rawData() as TextRawData;
        const restored = Text._fromRawData(raw, render);

        expect(restored.value).toBe("Hello");
        expect(restored.fontSize).toBe(20);
        expect(restored.color).toBe("#222222");
        expect(restored.position.x).toBe(5);
        expect(restored._rawData()).toEqual(raw);
    });

    it("Image round-trips", () => {
        const { render } = makeRender();
        const original = new Image(
            {
                position: new Vector(9, 9),
                src: "data:image/png;base64,AAAA",
                width: 80,
                height: 40,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: "#999999",
            },
            render
        );
        const raw = original._rawData() as ImageRawData;
        const restored = Image._fromRawData(raw, render);

        expect(restored.src).toBe("data:image/png;base64,AAAA");
        expect(restored.width).toBe(80);
        expect(restored.height).toBe(40);
        expect(restored.borderRadius).toBe(6);
        expect(restored._rawData()).toEqual(raw);
    });

    it("Render.serialize/deserialize reproduces the scene", () => {
        const { render } = makeRender();
        new Rect({ position: new Vector(1, 2), width: 10, height: 10, borderRadius: 3 }, render);
        new Circle({ position: new Vector(3, 4), radius: 5 }, render);

        const serialized = render.serialize();
        expect(serialized).toHaveLength(2);

        render.deserialize(serialized);
        const reserialized = render.serialize();

        expect(reserialized).toEqual(serialized);
    });
});
