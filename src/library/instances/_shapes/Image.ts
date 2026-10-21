import { IShape, Shape, ShapeRawData } from "../Shape";
import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

export type ImageRawData = ShapeRawData & {
    src: string;
    width: number;
    height: number;
    borderWidth: number;
    borderColor: string;
    borderRadius: number;
}

/** Interface for image shape properties. */
export interface IImage extends IShape {
    /** Source URL of the image. */
    src: string;
    /** Width of the image in pixels (optional, uses natural width if not specified). */
    width?: number;
    /** Height of the image in pixels (optional, uses natural height if not specified). */
    height?: number;
    /** Border width in pixels (default: 0). */
    borderWidth?: number;
    /** Border color (default: "black"). */
    borderColor?: string;
    /** Corner radius for rounded corners (default: 0). */
    borderRadius?: number;
}

/**
 * Image shape implementation for the rendering system.
 * Supports loading images from URLs with automatic dimension detection,
 * loading states, error handling, and styling options including borders and rounded corners.
 * 
 * @example
 * ```ts
 * const image = new Image({
 *     src: "https://example.com/image.jpg",
 *     position: new Vector(100, 100),
 *     width: 200,
 *     height: 150,
 *     borderRadius: 10,
 *     borderWidth: 2,
 *     borderColor: "blue"
 * }, render);
 * ```
 */
export class Image extends Shape {
    /** Canvas rendering context for drawing operations. */
    private _ctx: CanvasRenderingContext2D;

    /** Source URL of the image. */
    public src: string;
    /** Width of the image in pixels. */
    public width: number;
    /** Height of the image in pixels. */
    public height: number;
    /** Border width of the image. */
    public borderWidth: number;
    /** Border color of the image. */
    public borderColor: string;
    /** Border radius for rounded corners. */
    public borderRadius: number;

    /** Whether the image is currently loading. */
    private _isLoading: boolean = true;
    /** Whether the dimensions of the image are defined. */
    private _dimensionDefined: boolean = true;
    /** The HTML image element used for rendering. */
    private _image: HTMLImageElement;
    /** Original width of the image in pixels. */
    private _originalWidth: number | undefined;
    /** Original height of the image in pixels. */
    private _originalHeight: number | undefined;
    /** Whether the image has failed to load. */
    private _error: boolean = false;

    /** Rotation angle of the loading animation in radians. */
    private _rotationLoader: number = 0;
    
    /**
     * Creates a new Image shape instance.
     * @param props - Image configuration including src, dimensions, and styling.
     * @param render - The render context for drawing operations.
     * @param id - Optional unique identifier for the shape.
     */
    public constructor(props: IImage, render: Render, id?: string) {
        super(props, render, "image", id);

        this._ctx = render.ctx;
        this.src = props.src;
        this.width = props.width ?? 100;
        this.height = props.height ?? 100;
        this.borderWidth = props.borderWidth ?? 0;
        this.borderColor = props.borderColor ?? "black";
        this.borderRadius = props.borderRadius ?? 0;

        if (!props.width || !props.height) this._dimensionDefined = false;

        this._image = new globalThis.Image();
        this._setup();
    }

    /**
     * @internal
     * Sets up the image by loading it and setting up event listeners.
     */
    private _setup(): void {
        this._image.crossOrigin = "anonymous";
        this._image.onload = () => {
            this._originalWidth = this._image.naturalWidth;
            this._originalHeight = this._image.naturalHeight;

            if (!this._dimensionDefined) {
                this.width = this._originalWidth;
                this.height = this._originalHeight;
            }

            this._isLoading = false;
        };
        
        this._image.onerror = () => {
            console.error(`Failed to load image: ${this.src}`);
            this._error = true;
        };

        this._image.src = this.src;
    }

    /**
     * Draws the loading placeholder with pulsating effect.
     */
    private _drawLoadingPlaceholder(): void {
        this._rotationLoader += 0.1;
        this._ctx.save();
        
        const offset = this._render.getOffset();

        const alpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.2;
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);
        this._ctx.rotate(this.rotation);
        
        this._ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
        this._ctx.fillRect(0, 0, this.width, this.height);
        
        this._ctx.strokeStyle = `rgba(150, 150, 150, ${alpha * 0.5})`;
        this._ctx.lineWidth = 2;
        this._ctx.strokeRect(0, 0, this.width, this.height);
        
        this._drawLoadingIcon(alpha);
        
        this._ctx.restore();
    }

    /**
     * Draws a simple loading icon in the center of the placeholder.
     */
    private _drawLoadingIcon(alpha: number): void {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) * 0.1;
        
        this._ctx.save();
        this._ctx.translate(centerX, centerY);
        this._ctx.rotate(this._rotationLoader);
        this._ctx.strokeStyle = `rgba(100, 100, 100, ${alpha})`;
        this._ctx.lineWidth = 3;
        this._ctx.beginPath();
        this._ctx.arc(0, 0, radius, 0, Math.PI * 1.5);
        this._ctx.stroke();
        this._ctx.restore();
    }

    /**
     * Draws a simple error placeholder in the center of the image.
     */
    private _drawErrorPlaceholder(): void {
        this._ctx.save();
        this._ctx.translate(this.position.x, this.position.y);
        this._ctx.rotate(this.rotation);

        this._ctx.beginPath();
        this._ctx.moveTo(0, 0);
        this._ctx.lineTo(this.width, this.height);
        this._ctx.moveTo(this.width, 0);
        this._ctx.lineTo(0, this.height);
        this._ctx.strokeStyle = "red";
        this._ctx.lineWidth = 2;
        this._ctx.stroke();

        this._ctx.rect(0, 0, this.width, this.height);
        this._ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        this._ctx.fill();

        this._ctx.font = "48px Microsoft YaHei";
        this._ctx.textAlign = "center";
        this._ctx.textBaseline = "middle";
        this._ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this._ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        this._ctx.lineWidth = 2;
        this._ctx.strokeText("ERROR", this.width / 2, this.height / 2);
        this._ctx.fillText("ERROR", this.width / 2, this.height / 2);
        this._ctx.restore();
    }

    /**
     * @internal
     * Checks whether this image intersects with a specified rectangular boundary.
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
     * Determines if a point (usually the mouse cursor) is inside the image.
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
     * Gets a property of the image.
     * @param key - The property key to get.
     * @returns The value of the property.
     */
    public get<K extends keyof IImage>(key: K): this[K] {
        return this[key];
    }

    /**
     * Sets a property of the image.
     * @param key - The property key to set.
     * @param value - The value to set.
     */
    public set<K extends keyof IImage>(key: K, value: this[K]): this {
        this[key] = value;
        return this;
    }

    /**
     * Checks if the image has a specific property.
     * @param key - The property key to check.
     * @returns `true` if the image has the property, otherwise `false`.
     */
    public has(key: keyof IImage): boolean {
        return key in this;
    }

    /**
     * Draws the image on the canvas with its current properties.
     */
    public draw(): void {
        if (!this.visible) return;
    
        if (this._isLoading && !this._error) {
            this._drawLoadingPlaceholder();
            return;
        }

        if (this._error) {
            this._drawErrorPlaceholder();
            return;
        }
    
        this._ctx.save();
    
        const offset = this._render.getOffset();
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);
        this._ctx.rotate(this.rotation);
    
        const radius = this.borderRadius ?? 0;
        const w = this.width;
        const h = this.height;
    
        if (radius > 0) {
            this._ctx.beginPath();
            this._ctx.moveTo(radius, 0);
            this._ctx.lineTo(w - radius, 0);
            this._ctx.quadraticCurveTo(w, 0, w, radius);
            this._ctx.lineTo(w, h - radius);
            this._ctx.quadraticCurveTo(w, h, w - radius, h);
            this._ctx.lineTo(radius, h);
            this._ctx.quadraticCurveTo(0, h, 0, h - radius);
            this._ctx.lineTo(0, radius);
            this._ctx.quadraticCurveTo(0, 0, radius, 0);
            this._ctx.closePath();
    
            this._ctx.clip();
    
            this._ctx.drawImage(this._image, 0, 0, w, h);
    
            if (this.borderWidth > 0) {
                this._ctx.strokeStyle = this.borderColor;
                this._ctx.lineWidth = this.borderWidth;
                this._ctx.stroke();
            }
        } else {
            this._ctx.drawImage(this._image, 0, 0, w, h);
    
            if (this.borderWidth > 0) {
                this._ctx.strokeStyle = this.borderColor;
                this._ctx.lineWidth = this.borderWidth;
                this._ctx.strokeRect(0, 0, w, h);
            }
        }
    
        this._ctx.restore();
    }

    /**
     * Updates the image's state and re-renders it on the canvas.
     */
    public update(): void {
        this.draw();
    }

    /**
     * Creates a deep copy of this image.
     */
    public clone(): Image {
        const cloned = new Image({
            ...this,
            position: this.position.clone(),
        }, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    /**
     * @internal
     * Returns the raw data of the image.
     * @returns The raw data of the image.
     */
    public _rawData(): ImageRawData {
        return {
            id: this.id,
            type: "image",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            width: this.width ?? 0,
            height: this.height ?? 0,
            src: this.src,
            borderWidth: this.borderWidth,
            borderColor: this.borderColor,
            borderRadius: this.borderRadius,
        };
    }

    /**
     * @internal
     * Returns an SVG `<image>` fragment for this image in world coordinates.
     * @returns SVG markup for the image.
     */
    public override _toSVG(): string {
        if (!this.visible) return "";
        const stroke = this.borderWidth > 0
            ? ` stroke="${svgEscape(this.borderColor)}" stroke-width="${svgNum(this.borderWidth)}"`
            : "";
        const rx = this.borderRadius > 0 ? ` rx="${svgNum(this.borderRadius)}"` : "";
        const image = `<image href="${svgEscape(this.src)}" x="0" y="0" width="${svgNum(this.width)}" height="${svgNum(this.height)}"${rx} preserveAspectRatio="none" />`;
        const border = this.borderWidth > 0
            ? `<rect x="0" y="0" width="${svgNum(this.width)}" height="${svgNum(this.height)}"${rx} fill="none"${stroke} />`
            : "";
        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">${image}${border}</g>`;
    }

    /**
     * @internal
     * Creates a new image instance from raw data.
     */
    public static _fromRawData(data: ImageRawData, render: Render): Image {
        const image = new Image({ ...data, position: new Vector(data.position.x, data.position.y) }, render, data.id);
        image.position = new Vector(data.position.x, data.position.y);
        image.rotation = data.rotation;
        image.zIndex = data.zIndex;
        image.dragging = data.dragging;
        image.visible = data.visible;
        image.width = data.width;
        image.height = data.height;
        image.src = data.src;
        image.borderWidth = data.borderWidth;
        image.borderColor = data.borderColor;
        image.borderRadius = data.borderRadius;

        render.emit("create", { shape: image });
        
        return image;
    }
}