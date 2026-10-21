import { describe, it, expect } from "vitest";
import { makeRender } from "./helpers/render";
import type { RenderEventPinch, RenderEventPointer } from "../src/library/providers/Render.provider";

/**
 * E1: Pointer Events + touch/pen gesture recognition.
 *
 * jsdom ships a `PointerEvent` constructor; the renderer registers pointer
 * listeners on the canvas. These tests dispatch synthetic PointerEvents and
 * assert the additive events fire with the right `pointerType`, and that a
 * two-pointer touch sequence emits `pinch`.
 */

function pointer(type: string, init: PointerEventInit): PointerEvent {
    // Fall back to a plain Event with the fields the handlers read when the
    // environment lacks a PointerEvent constructor.
    if (typeof PointerEvent === "function") {
        return new PointerEvent(type, init);
    }
    const e = new Event(type, { bubbles: init.bubbles ?? false });
    // Attach the pointer fields the handlers read (bubbles is already set above).
    Object.defineProperties(e, {
        pointerId: { value: init.pointerId ?? 0, configurable: true },
        pointerType: { value: init.pointerType ?? "mouse", configurable: true },
        clientX: { value: init.clientX ?? 0, configurable: true },
        clientY: { value: init.clientY ?? 0, configurable: true },
    });
    return e as unknown as PointerEvent;
}

describe("E1 pointer events", () => {
    it("emits pointerdown/move/up with the originating pointerType", () => {
        const { render, canvas } = makeRender();
        const events: RenderEventPointer[] = [];
        render.on("pointerdown", (e) => events.push(e));
        render.on("pointermove", (e) => events.push(e));
        render.on("pointerup", (e) => events.push(e));

        canvas.dispatchEvent(pointer("pointerdown", { pointerId: 1, pointerType: "pen", clientX: 10, clientY: 20, bubbles: true }));
        canvas.dispatchEvent(pointer("pointermove", { pointerId: 1, pointerType: "pen", clientX: 15, clientY: 25, bubbles: true }));
        canvas.dispatchEvent(pointer("pointerup", { pointerId: 1, pointerType: "pen", clientX: 15, clientY: 25, bubbles: true }));

        expect(events).toHaveLength(3);
        expect(events.every((e) => e.pointerType === "pen")).toBe(true);
        expect(events[0]!.pointerId).toBe(1);
    });

    it("reports mouse pointerType for mouse pointers", () => {
        const { render, canvas } = makeRender();
        let seen: RenderEventPointer | null = null;
        render.on("pointerdown", (e) => { seen = e; });

        canvas.dispatchEvent(pointer("pointerdown", { pointerId: 7, pointerType: "mouse", clientX: 0, clientY: 0, bubbles: true }));
        expect(seen).not.toBeNull();
        expect(seen!.pointerType).toBe("mouse");
    });

    it("emits a pinch event for a two-touch sequence when zoom is enabled", async () => {
        const { render, canvas } = makeRender();
        await render.loadConfiguration({ zoom: true, pinchZoom: true });

        const pinches: RenderEventPinch[] = [];
        render.on("pinch", (e) => pinches.push(e));

        // Two fingers down, then spread apart -> pinch.
        canvas.dispatchEvent(pointer("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100, bubbles: true }));
        canvas.dispatchEvent(pointer("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100, bubbles: true }));
        // First move establishes the baseline distance.
        canvas.dispatchEvent(pointer("pointermove", { pointerId: 2, pointerType: "touch", clientX: 220, clientY: 100, bubbles: true }));
        // Second move changes the distance -> emits a pinch with a scale.
        canvas.dispatchEvent(pointer("pointermove", { pointerId: 2, pointerType: "touch", clientX: 300, clientY: 100, bubbles: true }));

        expect(pinches.length).toBeGreaterThan(0);
        expect(pinches[pinches.length - 1]!.scale).toBeGreaterThan(0);
        expect(pinches[pinches.length - 1]!.center).toBeDefined();
    });
});
