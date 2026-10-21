import { describe, it, expect } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";
import { Rect } from "../src/library/instances/_shapes/Rect";

describe("History undo/redo", () => {
    it("undo returns to the previous saved snapshot; redo advances again", () => {
        const { render } = makeRender();

        // Snapshot 0: one rect.
        new Rect({ position: new Vector(0, 0), width: 10, height: 10 }, render);
        render.history.save(render.serialize());

        // Snapshot 1: two rects.
        new Rect({ position: new Vector(20, 20), width: 10, height: 10 }, render);
        render.history.save(render.serialize());

        expect(render.serialize()).toHaveLength(2);

        render.undo();
        expect(render.serialize()).toHaveLength(1);

        render.redo();
        expect(render.serialize()).toHaveLength(2);
    });

    it("undo at the start of history is a no-op", () => {
        const { render } = makeRender();
        new Rect({ position: new Vector(0, 0), width: 10, height: 10 }, render);
        render.history.save(render.serialize());

        render.undo();
        render.undo();
        // Still the single saved state; no throw, no empty scene underflow.
        expect(render.serialize()).toHaveLength(1);
    });

    it("saving after an undo truncates the redo future", () => {
        const { render } = makeRender();

        new Rect({ position: new Vector(0, 0), width: 10, height: 10 }, render);
        render.history.save(render.serialize());

        new Rect({ position: new Vector(1, 1), width: 10, height: 10 }, render);
        render.history.save(render.serialize());

        render.undo();
        expect(render.serialize()).toHaveLength(1);

        // New edit from the past: future (the 2-shape state) is discarded.
        render.deserialize([]);
        render.history.save(render.serialize());

        render.redo();
        // Redo should not resurrect the truncated 2-shape state.
        expect(render.serialize()).toHaveLength(0);
    });
});
