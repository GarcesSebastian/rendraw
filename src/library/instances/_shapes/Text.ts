import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { Shape, IShape, ShapeRawData } from "../Shape";
import { svgEscape, svgNum, svgTransform } from "../utils/svg";

export type TextRawData = ShapeRawData & {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    fontStyle: string;
    textAlign: string;
    color: string;
    backgroundColor: string;
    borderWidth: number;
    borderColor: string;
    padding: { top: number; right: number; bottom: number; left: number };
    width: number;
    height: number;
}

/**
 * Interface for text shape properties.
 * 
 * @example
 * ```ts
 * const text = new Text({ text: 'Hello World', fontSize: 16, fontFamily: 'Arial' }, render);
 * text.update();
 * ```
 */
export interface IText extends IShape {
    text: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    textAlign?: CanvasTextAlign;
    color?: string;
    backgroundColor?: string;
    borderWidth?: number;
    borderColor?: string;
    padding?: { top: number; right: number; bottom: number; left: number };
}

/**
 * Text shape implementation for the rendering system.
 * Extends `Shape` to provide position, rotation, styling, and
 * collision detection for text elements with editing capabilities.
 *
 * @example
 * ```ts
 * const text = new Text({ text: 'Hello World', fontSize: 16, fontFamily: 'Arial' }, render);
 * text.update();
 * ```
 */
export class Text extends Shape {
    /** Canvas rendering context for drawing operations. */
    private _ctx: CanvasRenderingContext2D;

    /** Text content to be displayed. */
    public value: string;
    /** Size of the font in pixels. */
    public fontSize: number;
    /** Font family name (e.g. 'Arial', 'sans-serif'). */
    public fontFamily: string;
    /** Font weight (e.g. 'normal', 'bold', '700'). */
    public fontWeight: string;
    /** Font style (e.g. 'normal', 'italic'). */
    public fontStyle: string;
    /** Text alignment (e.g. 'left', 'center', 'right'). */
    public textAlign: CanvasTextAlign;
    /** Text color (CSS color string). */
    public color: string;
    /** Background color of text box (CSS color string). */
    public backgroundColor: string;
    /** Width of the border in pixels. */
    public borderWidth: number;
    /** Color of the border (CSS color string). */
    public borderColor: string;
    /** Padding around the text within the box in pixels. */
    public padding: { top: number; right: number; bottom: number; left: number };

    /** Calculated width of the text in pixels. */
    private _width: number;
    /** Calculated height of the text in pixels. */
    private _height: number;

    /** The ascent metric of the text for proper vertical alignment. */
    private _ascent: number;
    /** The descent metric of the text for proper vertical alignment. */
    private _descent: number;

    /** Flag indicating if the text is currently being edited. */
    private _editing: boolean = false;
    /** DOM textarea element used for in-place editing. */
    private _textarea: HTMLTextAreaElement | null = null;
    /** Stored dblclick handler so it can be removed on destroy. */
    private _onDblClick: () => void = () => {
        this._editing = !this._editing;
        this._setupEditor();
    };
    
    /**
     * Creates a new text shape.
     * @param DataText - Configuration properties for the text.
     * @param DataText.text - The text content to display.
     * @param DataText.fontSize - Font size in pixels.
     * @param DataText.fontFamily - Font family name.
     * @param DataText.fontWeight - Font weight value.
     * @param DataText.fontStyle - Font style.
     * @param DataText.textAlign - Text alignment.
     * @param DataText.color - Text color.
     * @param DataText.backgroundColor - Background color of the text box.
     * @param DataText.borderWidth - Border width in pixels.
     * @param DataText.borderColor - Border color.
     * @param DataText.padding - Padding values for each side of the text box.
     * @param render - The main `Render` context for drawing operations.
     * @param id - Optional unique identifier for the text element.
     */
    public constructor(DataText: IText, render: Render, id?: string) {
        super(DataText, render, "text", id);

        this.value = DataText.text;
        this.fontSize = DataText.fontSize ?? 12;
        this.fontFamily = DataText.fontFamily ?? "Arial";
        this.fontWeight = DataText.fontWeight ?? "normal";
        this.fontStyle = DataText.fontStyle ?? "normal";
        this.textAlign = DataText.textAlign ?? "left";
        this.color = DataText.color ?? "black";
        this.backgroundColor = DataText.backgroundColor ?? "transparent";
        this.borderWidth = DataText.borderWidth ?? 0;
        this.borderColor = DataText.borderColor ?? "black";
        this.padding = DataText.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };

        this._width = 0;
        this._height = 0;

        this._ascent = 0;
        this._descent = 0;

        this._ctx = this._render.ctx;
        this._setup();
    }

    /**
     * Initialize the text shape by calculating metrics and setting up event handlers.
     * @private
     */
    private _setup(): void {
        this._calculateTextMetrics();
        this._events();
    }

    /**
     * Set up event handlers for the text element.
     * Establishes double-click behavior for text editing.
     * @private
     */
    private _events(): void {
        this.on("dblclick", this._onDblClick);
    }

    /**
     * Removes the text element from the renderer and tears down its editor.
     * Detaches the persistent dblclick handler and removes the in-place
     * textarea from the DOM if it is still open, then runs the base cleanup.
     */
    public override destroy(): void {
        this.off("dblclick", this._onDblClick);
        if (this._textarea) {
            this._editing = false;
            this._disolveEditor();
        }
        super.destroy();
    }

    /**
     * Set up the text editor when text is double-clicked.
     * Creates and configures a textarea element for in-place editing.
     * @private
     */
    private _setupEditor(): void {
        if (this._editing && this._textarea) {
            this._disolveEditor();
            return;
        }
        
        if (!this._editing) return;

        const textarea = document.createElement("textarea");
        document.body.appendChild(textarea);
        this.visible = false;

        textarea.addEventListener('input', (e) => {
            this.value = (e.target as HTMLTextAreaElement).value;
            this.emit("input", { value: this.value });
            this._calculateTextMetrics();
            this._resizeTextarea();
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._editing = false;
                this._disolveEditor();
                e.preventDefault();
            } else if (e.key === 'Enter' && e.ctrlKey) {
                this._editing = false;
                this._disolveEditor();
                e.preventDefault();
            }
        });

        textarea.addEventListener('blur', () => {
            this._editing = false;
            this._disolveEditor();
        });

        this._textarea = textarea;
        this._updateEditor();
        
        setTimeout(() => {
            if (this._textarea) {
                this._textarea.focus();
                this._textarea.setSelectionRange(this._textarea.value.length, this._textarea.value.length);
            }
        }, 10);
    }

    /**
     * Update the position and styling of the text editor to match the text element.
     * @private
     */
    private _updateEditor(): void {
        if (!this._textarea) return;
        
        const worldPosition = this.position;
        
        const absolutePosition = this._render.toAbsoluteCoordinates(worldPosition)
            .sub(this._render.getOffset().scale(this._render.zoom));
        
        const offsetX = this._getTextOffsetX();
        const ascent = (this._ascent + this.padding.top + this.padding.bottom);

        const paddingLeft = this.padding.left * this._render.zoom;
        const paddingTop = this.padding.top * this._render.zoom;
        
        const rectX = offsetX - paddingLeft;
        const rectY = paddingTop;
        const rectW = this._width + this.padding.left + this.padding.right;
        const rectH = this._height + this.padding.top + this.padding.bottom;

        const scaledRectW = rectW * this._render.zoom;
        const scaledRectH = rectH * this._render.zoom;
        const scaledRectX = rectX;
        const scaledRectY = rectY;

        const finalPosition = new Vector(
            absolutePosition.x + scaledRectX,
            absolutePosition.y + scaledRectY
        );

        this._textarea.value = this.value;
        this._textarea.style.position = "absolute";
        this._textarea.style.left = `${finalPosition.x}px`;
        this._textarea.style.top = `${finalPosition.y - ascent * this._render.zoom}px`;
        this._textarea.style.width = `${scaledRectW}px`;
        this._textarea.style.minHeight = `${scaledRectH}px`;
        this._textarea.style.zIndex = "1000";
        this._textarea.style.border = `${this.borderWidth * this._render.zoom}px solid ${this.borderColor}`;
        this._textarea.style.outline = "none";
        this._textarea.style.resize = "none";
        this._textarea.style.fontSize = `${this.fontSize * this._render.zoom}px`;
        this._textarea.style.fontFamily = this.fontFamily;
        this._textarea.style.fontWeight = this.fontWeight;
        this._textarea.style.fontStyle = this.fontStyle;
        this._textarea.style.color = this.color;
        this._textarea.style.backgroundColor = this.backgroundColor;
        this._textarea.style.padding = `0px ${(this.padding.right * this._render.zoom) / 2}px 0px ${(this.padding.left * this._render.zoom) / 2}px`;
        this._textarea.style.boxSizing = "border-box";
        this._textarea.style.overflow = "hidden";
        this._textarea.style.scrollbarWidth = "none";
        this._textarea.style.textAlign = this.textAlign;
        this._textarea.style.lineHeight = "1.2";
        this._textarea.style.whiteSpace = "pre-wrap";
        this._textarea.style.margin = "0";
        this._textarea.style.verticalAlign = "top";
        this._resizeTextarea();
    }

    /**
     * Resize the textarea based on content to match text dimensions.
     * @private
     */
    private _resizeTextarea(): void {
        if (!this._textarea) return;
        this._textarea.style.height = "auto";
        
        const lines = this.value.split('\n');
        const lineCount = Math.max(1, lines.length);

        const scaledFontSize = this.fontSize * 1.2 * this._render.zoom;
        const scaledPaddingTop = this.padding.top * this._render.zoom;
        const scaledPaddingBottom = this.padding.bottom * this._render.zoom;
        
        if (lineCount === 1) {
            const singleLineHeight = scaledFontSize + scaledPaddingTop / 2 + scaledPaddingBottom / 2;
            this._textarea.style.height = `${singleLineHeight}px`;
        } else {
            this._textarea.style.height = `${this._textarea.scrollHeight + scaledPaddingTop / 2 + scaledPaddingBottom / 2}px`;
        }
    }

    /**
     * Remove the text editor and show the original text element.
     * @private
     */
    private _disolveEditor(): void {
        if (!this._textarea) return;
        this._textarea.remove();
        this._textarea = null;
        this.visible = true;
    }

    /**
     * Configure the canvas context with the current font settings.
     * @private
     */
    private _setupFont(): void {
        this._ctx.font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        this._ctx.textAlign = this.textAlign;
        this._ctx.textBaseline = "alphabetic";
    }

    /**
     * Calculate text dimensions and metrics for rendering.
     * Updates width, height, ascent, and descent properties.
     * @private
     */
    private _calculateTextMetrics(): void {
        this._ctx.save();
        this._setupFont();

        const lines = this.value.split("\n");
        this._ascent = 0;
        this._descent = 0;
        this._width = 0;
        this._height = 0;

        if (lines.length === 0) {
            this._ctx.restore();
            return;
        }

        const sampleMetrics = this._ctx.measureText("Mg");
        this._ascent = sampleMetrics.actualBoundingBoxAscent || this.fontSize * 0.8;
        this._descent = sampleMetrics.actualBoundingBoxDescent || this.fontSize * 0.2;

        lines.forEach((line: string) => {
            const metrics = this._ctx.measureText(line);
            this._width = Math.max(this._width, metrics.width);
        });

        const lineHeight = this.fontSize * 1.2;
        this._height = lines.length > 1 ? 
            this._ascent + this._descent + (lines.length - 1) * lineHeight :
            this._ascent + this._descent;

        this._ctx.restore();
    }

    /**
     * Calculate the horizontal offset based on text alignment.
     * @returns The x-offset in pixels for proper text alignment.
     */
    public _getTextOffsetX(): number {
        if (this.textAlign === "center") return -this._width / 2;
        if (this.textAlign === "right" || this.textAlign === "end") return -this._width;
        return 0;
    }

    /**
     * Calculate the vertical offset for proper text baseline alignment.
     * @returns The y-offset in pixels for proper text baseline alignment.
     */
    public _getTextOffsetY(): number {
        return -this._ascent;
    }

    /**
     * Draw the background and border of the text box.
     * @private
     */
    private _drawBackground(): void {
        const offsetX = this._getTextOffsetX();
        const rectX = offsetX - this.padding.left;
        const rectY = -this._ascent - this.padding.top;
        const rectW = this._width + this.padding.left + this.padding.right;
        const rectH = this._height + this.padding.top + this.padding.bottom;
    
        this._ctx.fillStyle = this.backgroundColor;
        this._ctx.fillRect(rectX, rectY, rectW, rectH);
    
        if (this.borderWidth > 0) {
            this._ctx.lineWidth = this.borderWidth;
            this._ctx.strokeStyle = this.borderColor;
            this._ctx.strokeRect(rectX, rectY, rectW, rectH);
        }
    }

    /**
     * Draw the text content, handling multiple lines if present.
     * @private
     */
    private _drawTextLines(): void {
        this._ctx.fillStyle = this.color;
        const lines = this.value.split("\n");
        const lineHeight = this.fontSize * 1.2;
        
        lines.forEach((line: string, index: number) => {
            const yPosition = index * lineHeight;
            this._ctx.fillText(line, 0, yPosition);
        });
    }

    /**
     * Get the calculated width of the text content.
     * @returns Width of the text in pixels.
     */
    public get width(): number {
        return this._width;
    }

    /**
     * Get the calculated height of the text content.
     * @returns Height of the text in pixels.
     */
    public get height(): number {
        return this._height;
    }

    /**
     * Set the calculated width of the text content.
     * @param v - Width of the text in pixels.
     */
    public set width(v: number) {
        this._width = v;
    }

    /**
     * Set the calculated height of the text content.
     * @param v - Height of the text in pixels.
     */
    public set height(v: number) {
        this._height = v;
    }

    /**
     * Get the ascent of the text for vertical positioning.
     * @returns The ascent value in pixels.
     */
    public get ascent(): number {
        return this._ascent;
    }

    /**
     * Get the descent of the text for vertical positioning.
     * @returns The descent value in pixels.
     */
    public get descent(): number {
        return this._descent;
    }

    /**
     * @internal
     * Check if the text is currently in edit mode.
     * @returns `true` if the text is being edited, otherwise `false`.
     */
    public _isEditing(): boolean {
        return this._editing;
    }

    /**
     * @internal
     * Determines if a point (usually the mouse cursor) is inside the text box.
     * This method correctly handles rotated text boxes by transforming the point
     * into the text's local coordinate system.
     * @returns `true` if the point is inside the text's bounds, otherwise `false`.
     */
    public _isClicked(): boolean {
        const mouseVector = this._render.worldPosition();
        const current = this.position.sub(this._render.getOffset());

        const offsetX = this._getTextOffsetX();
        const offsetY = this._getTextOffsetY();

        if (this.rotation === 0) {
            const boundingX = current.x + offsetX;
            const boundingY = current.y + offsetY;
            const x = boundingX - this.padding.left - this.borderWidth / 2;
            const y = boundingY - this.padding.top - this.borderWidth / 2;
            const width = this._width + this.padding.left + this.padding.right + this.borderWidth;
            const height = this._height + this.padding.top + this.padding.bottom + this.borderWidth;

            return mouseVector.x >= x && 
                   mouseVector.x <= x + width &&
                   mouseVector.y >= y && 
                   mouseVector.y <= y + height;
        }
        
        const dx = mouseVector.x - current.x;
        const dy = mouseVector.y - current.y;
        
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        
        return localX >= offsetX && 
               localX <= offsetX + this._width &&
               localY >= offsetY && 
               localY <= offsetY + this._height;
    }

    /**
     * @internal
     * Checks whether this text intersects with a specified rectangular boundary.
     * All coordinates and dimensions are in canvas pixels (top-left origin).
     *
     * @param _boundaryX - X coordinate of the boundary's top-left corner (px).
     * @param _boundaryY - Y coordinate of the boundary's top-left corner (px).
     * @param _boundaryWidth - Width of the boundary area (px).
     * @param _boundaryHeight - Height of the boundary area (px).
     * @returns `true` if this text overlaps the boundary area, otherwise `false`.
     */
    public _isShapeInBoundary(boundaryX: number, boundaryY: number, boundaryWidth: number, boundaryHeight: number): boolean {
        const current = this.position.sub(this._render.getOffset());
        const offsetX = this._getTextOffsetX();
        const offsetY = this._getTextOffsetY();
        
        const textX = current.x + offsetX - this.padding.left;
        const textY = current.y + offsetY - this.padding.top;
        const textWidth = this._width + this.padding.left + this.padding.right;
        const textHeight = this._height + this.padding.top + this.padding.bottom;
        
        if (this.rotation === 0) {
            return !(textX + textWidth < boundaryX || 
                textX > boundaryX + boundaryWidth ||
                textY + textHeight < boundaryY || 
                textY > boundaryY + boundaryHeight);
        }
        
        const corners = [
            { x: textX, y: textY },
            { x: textX + textWidth, y: textY },
            { x: textX + textWidth, y: textY + textHeight },
            { x: textX, y: textY + textHeight }
        ];
        
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const centerX = current.x;
        const centerY = current.y;
        
        for (const corner of corners) {
            const dx = corner.x - centerX;
            const dy = corner.y - centerY;
            const rotatedX = centerX + dx * cos - dy * sin;
            const rotatedY = centerY + dx * sin + dy * cos;
            
            if (rotatedX >= boundaryX && rotatedX <= boundaryX + boundaryWidth &&
                rotatedY >= boundaryY && rotatedY <= boundaryY + boundaryHeight) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Gets a property of the text.
     * @param key - The property key to get.
     * @returns The value of the property.
     */
    public get<K extends keyof IText>(key: K): IText[K] {
        return this[key as keyof this] as unknown as IText[K];
    }

    /**
     * Sets a property of the text.
     * @param key - The property key to set.
     * @param value - The value to set.
     */
    public set<K extends keyof IText>(key: K, value: IText[K]): this {
        (this[key as keyof this] as unknown as IText[K]) = value;
        return this;
    }

    /**
     * Checks if the text has a specific property.
     * @param key - The property key to check.
     * @returns `true` if the text has the property, otherwise `false`.
     */
    public has(key: keyof IText): boolean {
        return key in this;
    }

    /**
     * Draws the text on the canvas with its current properties.
     * This method applies position, rotation, and styling (text, background, border).
     *
     * @example
     * ```ts
     * text.draw(); // Manually render the text on the canvas
     * ```
     */
    public draw(): void {
        if (!this.visible) return;
        this._calculateTextMetrics();
        
        this._ctx.save();
        const offset = this._render.getOffset();
        this._ctx.translate(this.position.x - offset.x, this.position.y - offset.y);
        this._ctx.rotate(this.rotation);
    
        this._setupFont();
        this._drawBackground();
        this._drawTextLines();
    
        this._ctx.restore();
    }

    /**
     * Updates the text's state and re-renders it on the canvas.
     * Also updates the editor if it's active.
     */
    public update() {
        this.draw();
        this._updateEditor();
    }

    /**
     * Creates a deep copy of this text element.
     * @returns A new `Text` instance with the same properties.
     */
    public clone(): Shape {
        const payload: IText = {
            text: this.value,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            color: this.color,
            position: this.position.clone(),
            rotation: this.rotation,
            visible: this.visible,
            textAlign: this.textAlign,
            fontWeight: this.fontWeight,
            fontStyle: this.fontStyle,
            padding: this.padding,
            backgroundColor: this.backgroundColor,
            borderWidth: this.borderWidth,
            borderColor: this.borderColor,
        };
        const cloned = new Text(payload, this._render);
        this._render.manager.addChild(cloned);
        return cloned;
    }

    /**
     * @internal
     * Returns the raw data representation of the text.
     * @returns The raw data of the text element.
     */
    public _rawData(): TextRawData {
        return {
            id: this.id,
            type: "text",
            position: { x: this.position.x, y: this.position.y },
            rotation: this.rotation,
            zIndex: this.zIndex,
            dragging: this.dragging,
            visible: this.visible,
            text: this.value,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            fontWeight: this.fontWeight,
            fontStyle: this.fontStyle,
            textAlign: this.textAlign,
            color: this.color,
            backgroundColor: this.backgroundColor,
            borderWidth: this.borderWidth,
            borderColor: this.borderColor,
            padding: this.padding,
            width: this.width,
            height: this.height
        }
    }

    /**
     * @internal
     * Returns an SVG `<text>` fragment (with an optional background rect) for
     * this text element in world coordinates. Multiple lines become `<tspan>`s.
     * @returns SVG markup for the text.
     */
    public override _toSVG(): string {
        if (!this.visible) return "";
        this._calculateTextMetrics();

        const offsetX = this._getTextOffsetX();
        const lineHeight = this.fontSize * 1.2;
        const lines = this.value.split("\n");

        let background = "";
        const hasBg = this.backgroundColor && this.backgroundColor !== "transparent";
        if (hasBg || this.borderWidth > 0) {
            const rectX = offsetX - this.padding.left;
            const rectY = -this._ascent - this.padding.top;
            const rectW = this._width + this.padding.left + this.padding.right;
            const rectH = this._height + this.padding.top + this.padding.bottom;
            const fill = hasBg ? svgEscape(this.backgroundColor) : "none";
            const stroke = this.borderWidth > 0
                ? ` stroke="${svgEscape(this.borderColor)}" stroke-width="${svgNum(this.borderWidth)}"`
                : "";
            background = `<rect x="${svgNum(rectX)}" y="${svgNum(rectY)}" width="${svgNum(rectW)}" height="${svgNum(rectH)}" fill="${fill}"${stroke} />`;
        }

        const anchor = this.textAlign === "center"
            ? "middle"
            : this.textAlign === "right" || this.textAlign === "end"
                ? "end"
                : "start";

        const tspans = lines
            .map((line, index) =>
                `<tspan x="0" y="${svgNum(index * lineHeight)}">${svgEscape(line)}</tspan>`
            )
            .join("");

        const text =
            `<text x="0" y="0" fill="${svgEscape(this.color)}" ` +
            `font-family="${svgEscape(this.fontFamily)}" font-size="${svgNum(this.fontSize)}" ` +
            `font-weight="${svgEscape(this.fontWeight)}" font-style="${svgEscape(this.fontStyle)}" ` +
            `text-anchor="${anchor}">${tspans}</text>`;

        return `<g transform="${svgTransform(this.position.x, this.position.y, this.rotation)}">${background}${text}</g>`;
    }

    /**
     * @internal
     * Creates a new text instance from raw data.
     * @param data - The raw data of the text element.
     * @param render - The render context.
     * @returns A new `Text` instance with identical properties.
     */
    public static _fromRawData(data: TextRawData, render: Render): Text {
        const text = new Text(data as unknown as IText, render, data.id);
        text.position = new Vector(data.position.x, data.position.y);
        text.rotation = data.rotation;
        text.zIndex = data.zIndex;
        text.dragging = data.dragging;
        text.visible = data.visible;
        text.value = data.text;
        text.fontSize = data.fontSize;
        text.fontFamily = data.fontFamily;
        text.fontWeight = data.fontWeight;
        text.fontStyle = data.fontStyle;
        text.textAlign = data.textAlign as CanvasTextAlign;
        text.color = data.color;
        text.backgroundColor = data.backgroundColor;
        text.borderWidth = data.borderWidth;
        text.borderColor = data.borderColor;
        text.padding = data.padding;
        text.width = data.width;
        text.height = data.height;

        render.emit("create", { shape: text });
        
        return text;
    }
}