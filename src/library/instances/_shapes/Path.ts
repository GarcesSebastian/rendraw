import { IShape, Shape, ShapeRawData } from "../Shape";
import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

/** Serialized form of a {@link Path}. */
export type PathRawData = ShapeRawData & {
    /** Points relative to {@link ShapeRawData.position}. */
    points: { x: number; y: number }[];
    color: string;
    width: number;
    smoothing: number;
};

/**
 * Configuration for a smoothed multi-point path.
 *
 * The first point becomes the shape `position`; the rest are stored relative to
 * it. `smoothing` in `(0, 1]` enables a quadratic-midpoint smoothing of the
 * stroke; `0` draws straight segments.
 */
export interface IPath extends Omit<IShape, "position"> {
    /** Position is derived from the first point; optional for the path API. */
    position?: Vector;
    /** Points in world coordinates (at least one). */
    points: Vector[];
    /** Stroke color. Defaults to "#000000". */
    color?: string;
    /** Stroke width in pixels. Defaults to 2. */
    width?: number;
    /** Smoothing factor in [0, 1]. Defaults to 0.5. */
    smoothing?: number;
}

/**
 * A smoothed open path through a list of points — the base for free-draw.
 *
 * @example
 * ```ts
 * const path = render.creator.Path({ points: [new Vector(0, 0), new Vector(10, 20), new Vector(40, 5)] });
 * ```
 */
export class Path extends Shape {
    protected _ctx: CanvasRenderingContext2D;

    /** Points stored relative to {@link Shape.position}. */
    public points: Vector[];
    /** Stroke color (CSS color string). */
    public color: string;
    /** Stroke width in pixels. */
    public width: number;
    /** Smoothing factor in [0, 1]. */
    public smoothing: number;
    /** Hit tolerance (px). */
    protected _hitTolerance: number = 6;

    public constructor(props: IPath, render: Render, id?: string) {
        const srcPoints = props.points && props.points.length > 0 ? props.points : [new Vector(0, 0)];
        const origin = props.position ?? srcPoints[0]!;
        super({ ...props, position: origin }, render, "path", id);
        this._ctx = render.ctx;
        this.points = srcPoints.map((p) => new Vector(p.x - origin.x, p.y - origin.y));
        this.color = props.color ?? "#000000";
        this.width = props.width ?? 2;
        this.smoothing = props.smoothing ?? 0.5;
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
     * Appends a world-coordinate point to the path (stored relative to origin).
     * Useful for streaming points from a pointer. Marks the scene dirty.
     * @param point - New point in world coordinates.
     * @returns This path for chaining.
     */
    public addPoint(point: Vector): this {
        this.points.push(new Vector(point.x - this.position.x, point.y - this.position.y));
        this._render.markDirty();
        return this;
    }

    protected static _distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
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
        const limit = this._hitTolerance + this.width / 2;
        if (this.points.length === 1) {
            const p = this.points[0]!;
            return Math.hypot(lx - p.x, ly - p.y) <= limit;
        }
        for (let i = 0; i < this.points.length - 1; i++) {
            const a = this.points[i]!;
            const b = this.points[i + 1]!;
            if (Path._distanceToSegment(lx, ly, a.x, a.y, b.x, b.y) <= limit) return true;
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

    /** Traces the path onto the current context (local coordinates). */
    protected _tracePath(): void {
        const pts = this.points;
        this._ctx.beginPath();
        this._ctx.moveTo(pts[0]!.x, pts[0]!.y);
        if (this.smoothing > 0 && pts.length > 2) {
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i]!.x + pts[i + 1]!.x) / 2;
                const midY = (pts[i]!.y + pts[i + 1]!.y) / 2;
                this._ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, midX, midY);
            }
            const last = pts[pts.length - 1]!;
            this._ctx.lineTo(last.x, last.y);
        } else {
            for (let i = 1; i < pts.length; i++) {
                this._ctx.lineTo(pts[i]!.x, pts[i]!.y);
            }
        }
    }

    public draw(): void {
        if (!this.visible || this.points.length === 0) return;
        this._ctx.save();
        const offset = this._render.getOffset();
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);
        this._ctx.rotate(this.rotation);
        this._tracePath();
        this._ctx.strokeStyle = this.color;
        this._ctx.lineWidth = this.width;
        this._ctx.lineJoin = "round";
        this._ctx.lineCap = "round";
        this._ctx.stroke();
        this._ctx.restore();
    }

    public update(): void {
        this.draw();
    }

    public clone(): Path {
        const cloned = new Path({
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

    /** Builds the SVG `d` attribute for this path (local coordinates). */
    protected _svgPathData(): string {
        const pts = this.points;
        let d = `M ${svgNum(pts[0]!.x)} ${svgNum(pts[0]!.y)}`;
        if (this.smoothing > 0 && pts.length > 2) {
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i]!.x + pts[i + 1]!.x) / 2;
                const midY = (pts[i]!.y + pts[i + 1]!.y) / 2;
                d += ` Q ${svgNum(pts[i]!.x)} ${svgNum(pts[i]!.y)} ${svgNum(midX)} ${svgNum(midY)}`;
            }
            const last = pts[pts.length - 1]!;
            d += ` L ${svgNum(last.x)} ${svgNum(last.y)}`;
        } else {
            for (let i = 1; i < pts.length; i++) {
                d += ` L ${svgNum(pts[i]!.x)} ${svgNum(pts[i]!.y)}`;
            }
        }
        return d;
    }

    public override _toSVG(): string {
        if (!this.visible || this.points.length === 0) return "";
        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">` +
            `<path d="${this._svgPathData()}" fill="none" stroke="${svgEscape(this.color)}" ` +
            `stroke-width="${svgNum(this.width)}" stroke-linejoin="round" stroke-linecap="round" /></g>`;
    }

    public _rawData(): PathRawData {
        return {
            id: this.id,
            type: this.type as "path" | "pen",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            points: this.points.map((p) => ({ x: p.x, y: p.y })),
            color: this.color,
            width: this.width,
            smoothing: this.smoothing,
        };
    }

    public static _fromRawData(data: PathRawData, render: Render): Path {
        const path = new Path({
            points: data.points.map((p) => new Vector(data.position.x + p.x, data.position.y + p.y)),
            color: data.color,
            width: data.width,
            smoothing: data.smoothing,
            position: new Vector(data.position.x, data.position.y),
        }, render, data.id);
        path.rotation = data.rotation;
        path.zIndex = data.zIndex;
        path.dragging = data.dragging;
        path.visible = data.visible;

        render.emit("create", { shape: path });
        return path;
    }
}
