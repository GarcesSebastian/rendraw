import { describe, it, expect, vi } from "vitest";
import { makeRender } from "./helpers/render";
import { Vector } from "../src/library/instances/common/Vector";

/**
 * E4: SVG vector export. `exportSVG()` returns markup containing an element per
 * shape, `download({format:"svg"})` yields an image/svg+xml Blob, and the raster
 * `export()` contract (returns a Blob) is untouched.
 */
describe("E4 SVG export", () => {
    it("exportSVG returns <svg> markup with an element per shape", async () => {
        const { render } = makeRender();
        render.creator.Rect({ position: new Vector(10, 10), width: 100, height: 50, color: "#ff0000" });
        render.creator.Circle({ position: new Vector(200, 80), radius: 25, color: "#00ff00" });
        render.creator.Text({ position: new Vector(5, 5), text: "Hi", color: "#0000ff" });
        render.creator.Line({ from: new Vector(0, 0), to: new Vector(40, 40) });

        const svg = await render.exporter.exportSVG();

        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("</svg>");
        expect(svg).toContain("<rect");
        expect(svg).toContain("<circle");
        expect(svg).toContain("<text");
        expect(svg).toContain("<line");
        expect(svg).toContain("viewBox=");
    });

    it("escapes user-controlled text so markup cannot be broken out of", async () => {
        const { render } = makeRender();
        render.creator.Text({ position: new Vector(0, 0), text: "<script>&\"'" });

        const svg = await render.exporter.exportSVG();
        expect(svg).not.toContain("<script>");
        expect(svg).toContain("&lt;script&gt;");
    });

    it("download({format:'svg'}) produces a .svg filename from an svg Blob", async () => {
        const { render } = makeRender();
        render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });

        // Stub the DOM download sinks that jsdom does not implement.
        const g = globalThis as unknown as { URL: { createObjectURL?: unknown; revokeObjectURL?: unknown } };
        const originalCreate = g.URL.createObjectURL;
        const originalRevoke = g.URL.revokeObjectURL;
        g.URL.createObjectURL = vi.fn(() => "blob:stub");
        g.URL.revokeObjectURL = vi.fn();

        let downloadName = "";
        const createEl = vi.spyOn(document, "createElement").mockImplementation(
            (() => ({ set download(v: string) { downloadName = v; }, href: "", click() {} }) as unknown as HTMLElement) as typeof document.createElement
        );

        await render.exporter.download({ format: "svg", name: "diagram" });
        expect(downloadName).toBe("diagram.svg");

        createEl.mockRestore();
        g.URL.createObjectURL = originalCreate;
        g.URL.revokeObjectURL = originalRevoke;
    });

    it("export({format:'svg'}) returns an image/svg+xml Blob", async () => {
        const { render } = makeRender();
        render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });
        const blob = await render.exporter.export({ format: "svg", name: "diagram" });
        expect(blob.type).toBe("image/svg+xml");
    });

    it("raster export() still returns a Blob", async () => {
        const { render } = makeRender();
        render.creator.Rect({ position: new Vector(0, 0), width: 10, height: 10 });
        const blob = await render.exporter.export({ format: "json", name: "scene" });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe("application/json");
    });
});
