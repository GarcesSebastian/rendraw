import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { IPath, Path, PathRawData } from "./Path";

/** Serialized form of a {@link Pen}. Identical shape to a path, tagged "pen". */
export type PenRawData = PathRawData & { type: "pen" };

/** Configuration for a free-draw pen stroke. Same shape as {@link IPath}. */
export interface IPen extends IPath {}

/**
 * A free-draw pen stroke: a {@link Path} whose points are typically streamed in
 * from a pointer via {@link Path.addPoint}. Serializes under its own `"pen"`
 * type so a consumer can distinguish deliberate paths from free-hand ink.
 *
 * @example
 * ```ts
 * const pen = render.creator.Pen({ points: [new Vector(0, 0)] });
 * render.on("pointermove", ({ pointer }) => pen.addPoint(pointer.world));
 * ```
 */
export class Pen extends Path {
    public constructor(props: IPen, render: Render, id?: string) {
        super(props, render, id);
    }

    public override get type() {
        return "pen" as const;
    }

    public override clone(): Pen {
        const cloned = new Pen({
            points: this.points.map((p) => new Vector(this.position.x + p.x, this.position.y + p.y)),
            color: this.color,
            width: this.width,
            smoothing: this.smoothing,
            rotation: this.rotation,
            visible: this.visible,
        }, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    public override _rawData(): PenRawData {
        return { ...super._rawData(), type: "pen" };
    }

    public static override _fromRawData(data: PenRawData, render: Render): Pen {
        const pen = new Pen({
            points: data.points.map((p) => new Vector(data.position.x + p.x, data.position.y + p.y)),
            color: data.color,
            width: data.width,
            smoothing: data.smoothing,
            position: new Vector(data.position.x, data.position.y),
        }, render, data.id);
        pen.rotation = data.rotation;
        pen.zIndex = data.zIndex;
        pen.dragging = data.dragging;
        pen.visible = data.visible;

        render.emit("create", { shape: pen });
        return pen;
    }
}
