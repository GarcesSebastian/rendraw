import { IShape, Shape, ShapeRawData } from "../Shape";
import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

export type RectRawData = ShapeRawData & {
    width: number;
    height: number;
    color: string;
    borderWidth: number;
    borderColor: string;
    borderRadius: number;
}

/**
 * Interface for rectangular shape properties.
 * 
 * @example
 * ```ts
 * const rect = new Rect({ width: 100, height: 50, color: 'red' }, render);
 * rect.update();
 * ```
 */
export interface IRect extends IShape {
    width: number;
    height: number;
    color?: string;
    borderWidth?: number;
    borderColor?: string;
    borderRadius?: number;
}

/**
 * Rectangular shape implementation for the rendering system.
 * Extends `Shape` to provide position, rotation, styling, and
 * collision detection for rectangle primitives.
 *
 * @example
 * ```ts
 * const rect = new Rect({ width: 100, height: 50, color: 'red' }, render);
 * rect.update();
 * ```
 */
export class Rect extends Shape {
    /** Canvas rendering context for drawing operations. */
    private _ctx: CanvasRenderingContext2D;

    /** Width of the rectangle in pixels. */
    public width: number;
    /** Height of the rectangle in pixels. */
    public height: number;
    /** Fill color of the rectangle (CSS color string). */
    public color: string;
    /** Width of the border in pixels. */
    public borderWidth: number;
    /** Color of the border (CSS color string). */
    public borderColor: string;
    /** Radius of the border in pixels. */
    public borderRadius: number;

    /**
     * Creates a new rectangular shape.
     * @param props - Configuration properties for the rectangle.
     * @param props.width - Width of the rectangle in pixels.
     * @param props.height - Height of the rectangle in pixels.
     * @param props.color - Fill color of the rectangle. Defaults to "white".
     * @param props.borderWidth - Border width in pixels. Defaults to 0.
     * @param props.borderColor - Border color. Defaults to "transparent".
     * @param render - The main `Render` context for drawing operations.
     */
    public constructor(props: IRect, render: Render, id?: string) {
        super(props, render, "rect", id);
        this._ctx = render.ctx;
        this.width = props.width;
        this.height = props.height;
        this.color = props.color ?? "white";
        this.borderWidth = props.borderWidth ?? 0;
        this.borderColor = props.borderColor ?? "transparent";
        this.borderRadius = props.borderRadius ?? 0;
    }

    /**
     * @internal
     * Checks whether this rectangle intersects with a specified rectangular boundary.
     * All coordinates and dimensions are in canvas pixels (top-left origin).
     *
     * @param boundaryX - X coordinate of the boundary's top-left corner (px).
     * @param boundaryY - Y coordinate of the boundary's top-left corner (px).
     * @param boundaryWidth - Width of the boundary area (px).
     * @param boundaryHeight - Height of the boundary area (px).
     * @returns `true` if this rectangle overlaps the boundary area, otherwise `false`.
     */
    public _isShapeInBoundary(boundaryX: number, boundaryY: number, boundaryWidth: number, boundaryHeight: number): boolean {
        const current = this.position.sub(this._render.getOffset());
        
        if (this.rotation === 0) {
            return !(current.x + this.width < boundaryX || 
                current.x > boundaryX + boundaryWidth ||
                current.y + this.height < boundaryY || 
                current.y > boundaryY + boundaryHeight);
        }
        
        const corners = [
            { x: 0, y: 0 },
            { x: this.width, y: 0 },
            { x: this.width, y: this.height },
            { x: 0, y: this.height }
        ];
        
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        
        for (const corner of corners) {
            const rotatedX = current.x + corner.x * cos - corner.y * sin;
            const rotatedY = current.y + corner.x * sin + corner.y * cos;
            
            if (rotatedX >= boundaryX && rotatedX <= boundaryX + boundaryWidth &&
                rotatedY >= boundaryY && rotatedY <= boundaryY + boundaryHeight) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * @internal
     * Determines if a point (usually the mouse cursor) is inside the rectangle.
     * This method correctly handles rotated rectangles by transforming the point
     * into the rectangle's local coordinate system.
     * @returns `true` if the point is inside the rectangle's bounds, otherwise `false`.
     */
    public _isClicked() : boolean {
        const mouseVector = this._render.worldPosition();
        const current = this.position.sub(this._render.getOffset());
        
        if (this.rotation === 0) {
            return mouseVector.x >= current.x && 
                   mouseVector.x <= current.x + this.width &&
                   mouseVector.y >= current.y && 
                   mouseVector.y <= current.y + this.height;
        }
        
        const dx = mouseVector.x - current.x;
        const dy = mouseVector.y - current.y;
        
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        
        return localX >= 0 && 
               localX <= this.width &&
               localY >= 0 && 
               localY <= this.height;
    }

    /**
     * Gets a property of the rectangle.
     * @param key - The property key to get.
     * @returns The value of the property.
     */
    public get<K extends keyof IRect>(key: K): this[K] {
        return this[key];
    }

    /**
     * Sets a property of the rectangle.
     * @param key - The property key to set.
     * @param value - The value to set.
     */
    public set<K extends keyof IRect>(key: K, value: this[K]): this {
        this[key] = value;
        return this;
    }

    /**
     * Checks if the rectangle has a specific property.
     * @param key - The property key to check.
     * @returns `true` if the rectangle has the property, otherwise `false`.
     */
    public has(key: keyof IRect): boolean {
        return key in this;
    }

    /**
     * Draws the rectangle on the canvas with its current properties.
     * This method applies position, rotation, and styling (fill and border).
     *
     * @example
     * ```ts
     * rect.draw(); // Manually render the rectangle on the canvas
     * ```
     */
    public draw(): void {
        if (!this.visible) return;
        this._ctx.save();
        const offset = this._render.getOffset();
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);
        this._ctx.rotate(this.rotation);

        this._ctx.beginPath();

        this._ctx.roundRect(0, 0, this.width, this.height, this.borderRadius);
        this._ctx.fillStyle = this.color;
        this._ctx.fill();

        if (this.borderWidth > 0) {
            this._ctx.lineWidth = this.borderWidth;
            this._ctx.strokeStyle = this.borderColor;
            this._ctx.stroke();
        }

        this._ctx.closePath();

        this._ctx.restore();
    }

    /**
     * Updates the rectangle's state and re-renders it on the canvas.
     * Calls the parent `update` method for physics and then draws the rectangle.
     */
    public update(): void {
        this.draw();
    }

    /**
     * Creates a deep copy of this rectangle.
     * @returns A new `Rect` instance with the same properties.
     */
    public clone() : Rect {
        const cloned = new Rect({
            ...this,
            position: this.position.clone(),
        }, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    /**
     * @internal
     * Returns the raw data of the rectangle.
     * @returns The raw data of the rectangle.
     */
    public _rawData() : RectRawData {
        return {
            id: this.id,
            type: "rect",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            width: this.width ?? 0,
            height: this.height ?? 0,
            color: this.color,
            borderWidth: this.borderWidth,
            borderColor: this.borderColor,
            borderRadius: this.borderRadius
        };
    }

    /**
     * @internal
     * Returns an SVG `<rect>` fragment for this rectangle in world coordinates.
     * @returns SVG markup for the rectangle.
     */
    public override _toSVG(): string {
        if (!this.visible) return "";
        const stroke = this.borderWidth > 0
            ? ` stroke="${svgEscape(this.borderColor)}" stroke-width="${svgNum(this.borderWidth)}"`
            : "";
        const rx = this.borderRadius > 0 ? ` rx="${svgNum(this.borderRadius)}"` : "";
        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">` +
            `<rect x="0" y="0" width="${svgNum(this.width)}" height="${svgNum(this.height)}"${rx} fill="${svgEscape(this.color)}"${stroke} /></g>`;
    }

    /**
     * @internal
     * Creates a new rectangle instance from raw data.
     * @param data - The raw data of the rectangle.
     * @returns A new `Rect` instance with identical properties.
     */
    public static _fromRawData(data: RectRawData, render: Render) : Rect {
        const rect = new Rect({ ...data, position: new Vector(data.position.x, data.position.y) }, render, data.id);
        rect.position = new Vector(data.position.x, data.position.y);
        rect.rotation = data.rotation;
        rect.zIndex = data.zIndex;
        rect.dragging = data.dragging;
        rect.visible = data.visible;
        rect.width = data.width;
        rect.height = data.height;
        rect.color = data.color;
        rect.borderWidth = data.borderWidth;
        rect.borderColor = data.borderColor;
        rect.borderRadius = data.borderRadius;

        render.emit("create", { shape: rect });
        
        return rect;
    }
}