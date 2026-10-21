import { describe, it, expect } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import type { Patch } from "../src/library/providers/Render.provider";

/**
 * E5: granular change-stream. Creating, updating (drag/applyPatch), and removing
 * shapes emits `patch` events; `applyPatch` mutates the scene WITHOUT re-emitting
 * a patch so two peers do not feed back on each other.
 */
describe("E5 patch change-stream", () => {
    it("emits an add patch when a shape is created", () => {
        const { render } = makeRender();
        const patches: Patch[] = [];
        render.on("patch", (p) => patches.push(p));

        const rect = render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });

        expect(patches).toHaveLength(1);
        expect(patches[0]!.op).toBe("add");
        expect(patches[0]!.id).toBe(rect.id);
        expect(patches[0]!.type).toBe("rect");
        expect(patches[0]!.delta).toBeDefined();
    });

    it("emits a remove patch when a shape is destroyed", () => {
        const { render } = makeRender();
        const rect = render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });

        const patches: Patch[] = [];
        render.on("patch", (p) => patches.push(p));
        rect.destroy();

        expect(patches.some((p) => p.op === "remove" && p.id === rect.id)).toBe(true);
    });

    it("applyPatch(add) inserts a shape without re-emitting a patch", () => {
        const { render } = makeRender();
        const patches: Patch[] = [];
        render.on("patch", (p) => patches.push(p));

        render.applyPatch({
            op: "add",
            id: "remote-1",
            type: "circle",
            delta: {
                id: "remote-1",
                type: "circle",
                position: { x: 5, y: 5 },
                rotation: 0,
                zIndex: 0,
                dragging: false,
                visible: true,
                radius: 12,
                color: "#abc",
            } as never,
        });

        // The scene gained the shape...
        expect(render.childrens.has("remote-1")).toBe(true);
        // ...but no outbound patch was echoed (loop-safe).
        expect(patches).toHaveLength(0);
    });

    it("applyPatch(update) mutates an existing shape in place, loop-safe", () => {
        const { render } = makeRender();
        const rect = render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });

        const patches: Patch[] = [];
        render.on("patch", (p) => patches.push(p));

        render.applyPatch({
            op: "update",
            id: rect.id,
            type: "rect",
            delta: { position: { x: 42, y: 7 } },
        });

        const updated = render.childrens.get(rect.id);
        expect(updated).toBeDefined();
        expect(updated!.position.x).toBe(42);
        expect(updated!.position.y).toBe(7);
        expect(patches).toHaveLength(0);
    });

    it("applyPatch(remove) deletes a shape, loop-safe", () => {
        const { render } = makeRender();
        const rect = render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });

        const patches: Patch[] = [];
        render.on("patch", (p) => patches.push(p));

        render.applyPatch({ op: "remove", id: rect.id, type: "rect" });

        expect(render.childrens.has(rect.id)).toBe(false);
        expect(patches).toHaveLength(0);
    });
});
