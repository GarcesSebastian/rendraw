import { IShape, Shape, ShapeRawData } from "../Shape";
import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

/** Serialized form of a {@link Line}. */
export type LineRawData = ShapeRawData & {
    /** End point, relative to {@link ShapeRawData.position}. */
    to: { x: number; y: number };
    color: string;
    width: number;
};

/**
 * Configuration for a straight line segment.
 *
 * `from` is the line's origin (becomes the shape's `position`) and `to` is the
 * segment's end point. Both are given in world coordinates; internally the end
 * point is stored relative to the origin so dragging the shape moves the whole
 * line.
 */
export interface ILine extends Omit<IShape, "position"> {
    /** Position is derived from {@link from}; optional for the line API. */
    position?: Vector;
    /** Start point in world coordinates. Becomes the shape position. */
    from: Vector;
    /** End point in world coordinates. */
    to: Vector;
    /** Stroke color. Defaults to "#000000". */
    color?: string;
    /** Stroke width in pixels. Defaults to 1. */
    width?: number;
}

/**
 * A straight line segment primitive.
 *
 * @example
 * ```ts
 * const line = render.creator.Line({ from: new Vector(0, 0), to: new Vector(100, 50) });
 * ```
 */
export class Line extends Shape {
    /** Canvas rendering context for drawing operations. */
    protected _ctx: CanvasRenderingContext2D;

    /** End point stored relative to {@link Shape.position}. */
    public to: Vector;
    /** Stroke color (CSS color string). */
    public color: string;
    /** Stroke width in pixels. */
    public width: number;
    /** Half-thickness (in px) added to the click tolerance band. */
    protected _hitTolerance: number = 6;

    /**
     * Creates a new line.
     * @param props - Line configuration (`from`, `to`, color, width).
     * @param render - The render context.
     * @param id - Optional identifier.
     */
    public constructor(props: ILine, render: Render, id?: string) {
        super({ ...props, position: props.from ?? props.position ?? new Vector(0, 0) }, render, "line", id);
        this._ctx = render.ctx;
        const from = props.from ?? this.position;
        const to = props.to ?? from;
        this.to = new Vector(to.x - from.x, to.y - from.y);
        this.color = props.color ?? "#000000";
        this.width = props.width ?? 1;
    }

    public get<K extends keyof IShape>(key: K): IShape[K] {
        return this[key as keyof this] as unknown as IShape[K];
    }

    public set<K extends keyof IShape>(key: K, value: IShape[K]): this {
        (this[key as keyof this] as unknown as IShape[K]) = value;
        return this;
    }

    public has(key: keyof IShape): boolean {
        return key in this;
    }

    /**
     * Minimum distance (in world px) from a point to the segment `a`→`b`.
     * @internal
     */
    protected static _distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        return Math.hypot(px - cx, py - cy);
    }

    public _isClicked(): boolean {
        const mouse = this._render.worldPosition();
        const origin = this.position.sub(this._render.getOffset());
        const distance = Line._distanceToSegment(
            mouse.x, mouse.y,
            origin.x, origin.y,
            origin.x + this.to.x, origin.y + this.to.y
        );
        return distance <= this._hitTolerance + this.width / 2;
    }

    public _isShapeInBoundary(boundaryX: number, boundaryY: number, boundaryWidth: number, boundaryHeight: number): boolean {
        const origin = this.position.sub(this._render.getOffset());
        const points = [
            { x: origin.x, y: origin.y },
            { x: origin.x + this.to.x, y: origin.y + this.to.y },
        ];
        return points.some((p) =>
            p.x >= boundaryX && p.x <= boundaryX + boundaryWidth &&
            p.y >= boundaryY && p.y <= boundaryY + boundaryHeight
        );
    }

    public draw(): void {
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
        this._ctx.restore();
    }

    public update(): void {
        this.draw();
    }

    public clone(): Line {
        const cloned = new Line({
            from: this.position.clone(),
            to: new Vector(this.position.x + this.to.x, this.position.y + this.to.y),
            color: this.color,
            width: this.width,
            rotation: this.rotation,
            visible: this.visible,
        }, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    public override _toSVG(): string {
        if (!this.visible) return "";
        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">` +
            `<line x1="0" y1="0" x2="${svgNum(this.to.x)}" y2="${svgNum(this.to.y)}" ` +
            `stroke="${svgEscape(this.color)}" stroke-width="${svgNum(this.width)}" /></g>`;
    }

    public _rawData(): LineRawData {
        return {
            id: this.id,
            type: "line",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            to: { x: this.to.x, y: this.to.y },
            color: this.color,
            width: this.width,
        };
    }

    public static _fromRawData(data: LineRawData, render: Render): Line {
        const line = new Line({
            from: new Vector(data.position.x, data.position.y),
            to: new Vector(data.position.x + data.to.x, data.position.y + data.to.y),
            color: data.color,
            width: data.width,
        }, render, data.id);
        line.rotation = data.rotation;
        line.zIndex = data.zIndex;
        line.dragging = data.dragging;
        line.visible = data.visible;

        render.emit("create", { shape: line });
        return line;
    }
}
