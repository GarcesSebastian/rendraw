import { IShape, Shape, ShapeRawData } from "../Shape";
import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

/** Serialized form of a {@link Polygon}. */
export type PolygonRawData = ShapeRawData & {
    /** Vertices relative to {@link ShapeRawData.position}. */
    points: { x: number; y: number }[];
    closed: boolean;
    fill: string;
    stroke: string;
    strokeWidth: number;
};

/**
 * Configuration for a polygon / polyline.
 *
 * The first point becomes the shape `position`; remaining points are stored
 * relative to it so dragging moves the whole shape.
 */
export interface IPolygon extends Omit<IShape, "position"> {
    /** Position is derived from the first point; optional for the polygon API. */
    position?: Vector;
    /** Vertices in world coordinates (at least one). */
    points: Vector[];
    /** Whether the outline is closed (filled). Defaults to true. */
    closed?: boolean;
    /** Fill color. Defaults to "transparent". */
    fill?: string;
    /** Stroke color. Defaults to "#000000". */
    stroke?: string;
    /** Stroke width in pixels. Defaults to 1. */
    strokeWidth?: number;
}

/**
 * A polygon (closed) or polyline (open) primitive defined by a list of points.
 *
 * @example
 * ```ts
 * const tri = render.creator.Polygon({
 *   points: [new Vector(0, 0), new Vector(50, 100), new Vector(100, 0)],
 *   fill: "#e74c3c",
 * });
 * ```
 */
export class Polygon extends Shape {
    protected _ctx: CanvasRenderingContext2D;

    /** Vertices stored relative to {@link Shape.position}. */
    public points: Vector[];
    /** Whether the outline is closed. */
    public closed: boolean;
    /** Fill color (CSS color string). */
    public fill: string;
    /** Stroke color (CSS color string). */
    public stroke: string;
    /** Stroke width in pixels. */
    public strokeWidth: number;
    /** Hit tolerance (px) used for open polylines. */
    protected _hitTolerance: number = 6;

    public constructor(props: IPolygon, render: Render, id?: string) {
        const srcPoints = props.points && props.points.length > 0 ? props.points : [new Vector(0, 0)];
        const origin = props.position ?? srcPoints[0]!;
        super({ ...props, position: origin }, render, "polygon", id);
        this._ctx = render.ctx;
        this.points = srcPoints.map((p) => new Vector(p.x - origin.x, p.y - origin.y));
        this.closed = props.closed ?? true;
        this.fill = props.fill ?? "transparent";
        this.stroke = props.stroke ?? "#000000";
        this.strokeWidth = props.strokeWidth ?? 1;
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

    /** Point-in-polygon ray cast for closed shapes (local coordinates). */
    private _pointInPolygon(x: number, y: number): boolean {
        const pts = this.points;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const pi = pts[i]!;
            const pj = pts[j]!;
            const intersect = pi.y > y !== pj.y > y &&
                x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private static _distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    public _isClicked(): boolean {
        const mouse = this._render.worldPosition();
        const origin = this.position.sub(this._render.getOffset());
        const lx = mouse.x - origin.x;
        const ly = mouse.y - origin.y;

        if (this.closed && this.points.length >= 3 && this._pointInPolygon(lx, ly)) {
            return true;
        }
        // Edge proximity (covers open polylines and thin closed outlines).
        const limit = this._hitTolerance + this.strokeWidth / 2;
        for (let i = 0; i < this.points.length - 1; i++) {
            const a = this.points[i]!;
            const b = this.points[i + 1]!;
            if (Polygon._distanceToSegment(lx, ly, a.x, a.y, b.x, b.y) <= limit) return true;
        }
        if (this.closed && this.points.length >= 2) {
            const a = this.points[this.points.length - 1]!;
            const b = this.points[0]!;
            if (Polygon._distanceToSegment(lx, ly, a.x, a.y, b.x, b.y) <= limit) return true;
        }
        return false;
    }

    public _isShapeInBoundary(boundaryX: number, boundaryY: number, boundaryWidth: number, boundaryHeight: number): boolean {
        const origin = this.position.sub(this._render.getOffset());
        return this.points.some((p) => {
            const x = origin.x + p.x;
            const y = origin.y + p.y;
            return x >= boundaryX && x <= boundaryX + boundaryWidth &&
                y >= boundaryY && y <= boundaryY + boundaryHeight;
        });
    }

    public draw(): void {
        if (!this.visible || this.points.length === 0) return;
        this._ctx.save();
        const offset = this._render.getOffset();
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);
        this._ctx.rotate(this.rotation);

        this._ctx.beginPath();
        this._ctx.moveTo(this.points[0]!.x, this.points[0]!.y);
        for (let i = 1; i < this.points.length; i++) {
            this._ctx.lineTo(this.points[i]!.x, this.points[i]!.y);
        }
        if (this.closed) {
            this._ctx.closePath();
            if (this.fill && this.fill !== "transparent") {
                this._ctx.fillStyle = this.fill;
                this._ctx.fill();
            }
        }
        if (this.strokeWidth > 0) {
            this._ctx.strokeStyle = this.stroke;
            this._ctx.lineWidth = this.strokeWidth;
            this._ctx.stroke();
        }
        this._ctx.restore();
    }

    public update(): void {
        this.draw();
    }

    public clone(): Polygon {
        const cloned = new Polygon({
            points: this.points.map((p) => new Vector(this.position.x + p.x, this.position.y + p.y)),
            closed: this.closed,
            fill: this.fill,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            rotation: this.rotation,
            visible: this.visible,
        }, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    public override _toSVG(): string {
        if (!this.visible || this.points.length === 0) return "";
        const pts = this.points.map((p) => `${svgNum(p.x)},${svgNum(p.y)}`).join(" ");
        const fill = this.closed && this.fill && this.fill !== "transparent"
            ? svgEscape(this.fill) : "none";
        const tag = this.closed ? "polygon" : "polyline";
        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">` +
            `<${tag} points="${pts}" fill="${fill}" stroke="${svgEscape(this.stroke)}" stroke-width="${svgNum(this.strokeWidth)}" /></g>`;
    }

    public _rawData(): PolygonRawData {
        return {
            id: this.id,
            type: "polygon",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            points: this.points.map((p) => ({ x: p.x, y: p.y })),
            closed: this.closed,
            fill: this.fill,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
        };
    }

    public static _fromRawData(data: PolygonRawData, render: Render): Polygon {
        const polygon = new Polygon({
            points: data.points.map((p) => new Vector(data.position.x + p.x, data.position.y + p.y)),
            closed: data.closed,
            fill: data.fill,
            stroke: data.stroke,
            strokeWidth: data.strokeWidth,
            position: new Vector(data.position.x, data.position.y),
        }, render, data.id);
        polygon.rotation = data.rotation;
        polygon.zIndex = data.zIndex;
        polygon.dragging = data.dragging;
        polygon.visible = data.visible;

        render.emit("create", { shape: polygon });
        return polygon;
    }
}
