import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeRender } from "./helpers/render";

/**
 * B3: remote-image loading is gated behind `allowRemoteImages` (default false).
 *
 * The clipboard paste path turns a pasted image URL into an `Image` shape only
 * when the flag is enabled. These tests drive a synthetic `paste` event (the
 * configuration binds `paste` on `window`) carrying a remote image URL and
 * assert the scene gains an image only when the flag is on. Data-URL/file paste
 * is unaffected (it does not depend on the flag).
 */

function makePasteEvent(text: string): ClipboardEvent {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    // jsdom's ClipboardEvent has no clipboardData; define the minimal shape used.
    Object.defineProperty(event, "clipboardData", {
        value: {
            items: [],
            getData: (type: string) => (type === "text/plain" ? text : ""),
        },
        configurable: true,
    });
    return event;
}

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
    vi.restoreAllMocks();
});

describe("remote-image paste gate", () => {
    it("ignores a pasted remote image URL by default", async () => {
        const { render } = makeRender();
        await render.loadConfiguration({}); // allowRemoteImages defaults to false

        window.dispatchEvent(makePasteEvent("https://example.com/photo.png"));

        expect(render.serialize()).toHaveLength(0);
    });

    it("loads a pasted remote image URL when allowRemoteImages is true", async () => {
        const { render } = makeRender();
        await render.loadConfiguration({ allowRemoteImages: true });

        window.dispatchEvent(makePasteEvent("https://example.com/photo.png"));

        const scene = render.serialize();
        expect(scene).toHaveLength(1);
        expect(scene[0]!.type).toBe("image");
    });
});
