import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { ILine, Line, LineRawData } from "./Line";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

/** Where to draw arrow heads along the segment. */
export type ArrowHead = "end" | "both" | "none";

/** Serialized form of an {@link Arrow}. */
export type ArrowRawData = LineRawData & {
    head: ArrowHead;
    headSize: number;
};

/**
 * Configuration for an arrow: a {@link Line} with one or two heads.
 */
export interface IArrow extends ILine {
    /** Which ends carry a head. Defaults to "end". */
    head?: ArrowHead;
    /** Head size in pixels. Defaults to 10. */
    headSize?: number;
}

/**
 * A straight arrow primitive — a line with a triangular head on one or both
 * ends.
 *
 * @example
 * ```ts
 * const arrow = render.creator.Arrow({ from: new Vector(0, 0), to: new Vector(120, 0), head: "both" });
 * ```
 */
export class Arrow extends Line {
    /** Which ends carry a head. */
    public head: ArrowHead;
    /** Head size in pixels. */
    public headSize: number;

    public constructor(props: IArrow, render: Render, id?: string) {
        super(props, render, id);
        this.head = props.head ?? "end";
        this.headSize = props.headSize ?? 10;
    }

    public override get type() {
        return "arrow" as const;
    }

    /** Draws a single arrow head (local coords) pointing from `fromPt` to `tip`. */
    private _drawHead(tipX: number, tipY: number, fromX: number, fromY: number): void {
        const angle = Math.atan2(tipY - fromY, tipX - fromX);
        const size = this.headSize;
        const a1 = angle - Math.PI / 6;
        const a2 = angle + Math.PI / 6;
        this._ctx.beginPath();
        this._ctx.moveTo(tipX, tipY);
        this._ctx.lineTo(tipX - size * Math.cos(a1), tipY - size * Math.sin(a1));
        this._ctx.lineTo(tipX - size * Math.cos(a2), tipY - size * Math.sin(a2));
        this._ctx.closePath();
        this._ctx.fillStyle = this.color;
        this._ctx.fill();
    }

    public override draw(): void {
        if (!this.visible) return;
        this._ctx.save();
        const offset = this._render.getOffset();
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);

        this._ctx.beginPath();
        this._ctx.moveTo(0, 0);
        this._ctx.lineTo(this.to.x, this.to.y);
        this._ctx.strokeStyle = this.color;
        this._ctx.lineWidth = this.width;
        this._ctx.stroke();
        this._ctx.closePath();

        if (this.head === "end" || this.head === "both") {
            this._drawHead(this.to.x, this.to.y, 0, 0);
        }
        if (this.head === "both") {
            this._drawHead(0, 0, this.to.x, this.to.y);
        }

        this._ctx.restore();
    }

    public override clone(): Arrow {
        const cloned = new Arrow({
            from: this.position.clone(),
            to: new Vector(this.position.x + this.to.x, this.position.y + this.to.y),
            color: this.color,
            width: this.width,
            head: this.head,
            headSize: this.headSize,
            rotation: this.rotation,
            visible: this.visible,
        }, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    /** Builds an SVG polygon for one head, pointing from `fromPt` to `tip`. */
    private _svgHead(tipX: number, tipY: number, fromX: number, fromY: number): string {
        const angle = Math.atan2(tipY - fromY, tipX - fromX);
        const size = this.headSize;
        const a1 = angle - Math.PI / 6;
        const a2 = angle + Math.PI / 6;
        const p1x = tipX - size * Math.cos(a1);
        const p1y = tipY - size * Math.sin(a1);
        const p2x = tipX - size * Math.cos(a2);
        const p2y = tipY - size * Math.sin(a2);
        return `<polygon points="${svgNum(tipX)},${svgNum(tipY)} ${svgNum(p1x)},${svgNum(p1y)} ${svgNum(p2x)},${svgNum(p2y)}" fill="${svgEscape(this.color)}" />`;
    }

    public override _toSVG(): string {
        if (!this.visible) return "";
        const line = `<line x1="0" y1="0" x2="${svgNum(this.to.x)}" y2="${svgNum(this.to.y)}" stroke="${svgEscape(this.color)}" stroke-width="${svgNum(this.width)}" />`;
        let heads = "";
        if (this.head === "end" || this.head === "both") heads += this._svgHead(this.to.x, this.to.y, 0, 0);
        if (this.head === "both") heads += this._svgHead(0, 0, this.to.x, this.to.y);
        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">${line}${heads}</g>`;
    }

    public override _rawData(): ArrowRawData {
        return {
            id: this.id,
            type: "arrow",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            to: { x: this.to.x, y: this.to.y },
            color: this.color,
            width: this.width,
            head: this.head,
            headSize: this.headSize,
        };
    }

    public static override _fromRawData(data: ArrowRawData, render: Render): Arrow {
        const arrow = new Arrow({
            from: new Vector(data.position.x, data.position.y),
            to: new Vector(data.position.x + data.to.x, data.position.y + data.to.y),
            color: data.color,
            width: data.width,
            head: data.head,
            headSize: data.headSize,
        }, render, data.id);
        arrow.rotation = data.rotation;
        arrow.zIndex = data.zIndex;
        arrow.dragging = data.dragging;
        arrow.visible = data.visible;

        render.emit("create", { shape: arrow });
        return arrow;
    }
}
