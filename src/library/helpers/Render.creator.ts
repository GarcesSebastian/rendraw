import { Circle, type ICircle } from "../instances/_shapes/Circle";
import { Vector } from "../instances/common/Vector";
import { Render } from "../Render";
import { IRect, Rect } from "../instances/_shapes/Rect";
import { IText, Text } from "../instances/_shapes/Text";
import { IImage, Image } from "../instances/_shapes/Image";
import { ILine, Line } from "../instances/_shapes/Line";
import { IArrow, Arrow } from "../instances/_shapes/Arrow";
import { IPolygon, Polygon } from "../instances/_shapes/Polygon";
import { IPath, Path } from "../instances/_shapes/Path";
import { IPen, Pen } from "../instances/_shapes/Pen";

/**
 * Factory class for creating shapes and utility objects within a render context
 * Provides convenient methods to instantiate shapes with automatic event emission
 */
export class RenderCreator {
    private _render: Render;

    /**
     * Creates a new render creator for the given render context
     * @param render - The render instance to associate created objects with
     */
    public constructor(render: Render) {
        this._render = render;
    }
    
    /**
     * Creates a new rectangle shape and emits creation event
     * @param props - Configuration properties for the rectangle
     * @returns A new Rect instance
     */
    public Rect(props: IRect): Rect {
        const rect = new Rect(props, this._render);
        this._render.emit("create", { shape: rect })
        this._render.emitPatch({ op: "add", id: rect.id, type: "rect", delta: rect._rawData() });
        this._render.autoSave();
        return rect;
    }

    /**
     * Creates a new circle shape and emits creation event
     * @param props - Configuration properties for the circle
     * @returns A new Circle instance
     */
    public Circle(props: ICircle): Circle {
        const circle = new Circle(props, this._render);
        this._render.emit("create", { shape: circle });
        this._render.emitPatch({ op: "add", id: circle.id, type: "circle", delta: circle._rawData() });
        this._render.autoSave();
        return circle;
    }

    /**
     * Creates a new text shape and emits creation event
     * @param props - Configuration properties for the text
     * @returns A new Text instance
     */
    public Text(props: IText): Text {
        const text = new Text(props, this._render);
        this._render.emit("create", { shape: text });
        this._render.emitPatch({ op: "add", id: text.id, type: "text", delta: text._rawData() });
        this._render.autoSave();
        return text;
    }

    /**
     * Creates a new image shape and emits creation event
     * @param props - Configuration properties for the image
     * @returns A new Image instance
     */
    public Image(props: IImage): Image {
        const image = new Image(props, this._render);
        this._render.emit("create", { shape: image });
        this._render.emitPatch({ op: "add", id: image.id, type: "image", delta: image._rawData() });
        this._render.autoSave();
        return image;
    }

    /**
     * Creates a new straight line segment and emits a creation event.
     * @param props - Configuration properties for the line.
     * @returns A new Line instance.
     */
    public Line(props: ILine): Line {
        const line = new Line(props, this._render);
        this._render.emit("create", { shape: line });
        this._render.emitPatch({ op: "add", id: line.id, type: "line", delta: line._rawData() });
        this._render.autoSave();
        return line;
    }

    /**
     * Creates a new arrow and emits a creation event.
     * @param props - Configuration properties for the arrow.
     * @returns A new Arrow instance.
     */
    public Arrow(props: IArrow): Arrow {
        const arrow = new Arrow(props, this._render);
        this._render.emit("create", { shape: arrow });
        this._render.emitPatch({ op: "add", id: arrow.id, type: "arrow", delta: arrow._rawData() });
        this._render.autoSave();
        return arrow;
    }

    /**
     * Creates a new polygon / polyline and emits a creation event.
     * @param props - Configuration properties for the polygon.
     * @returns A new Polygon instance.
     */
    public Polygon(props: IPolygon): Polygon {
        const polygon = new Polygon(props, this._render);
        this._render.emit("create", { shape: polygon });
        this._render.emitPatch({ op: "add", id: polygon.id, type: "polygon", delta: polygon._rawData() });
        this._render.autoSave();
        return polygon;
    }

    /**
     * Creates a new smoothed path and emits a creation event.
     * @param props - Configuration properties for the path.
     * @returns A new Path instance.
     */
    public Path(props: IPath): Path {
        const path = new Path(props, this._render);
        this._render.emit("create", { shape: path });
        this._render.emitPatch({ op: "add", id: path.id, type: "path", delta: path._rawData() });
        this._render.autoSave();
        return path;
    }

    /**
     * Creates a new free-draw pen stroke and emits a creation event.
     * @param props - Configuration properties for the pen stroke.
     * @returns A new Pen instance.
     */
    public Pen(props: IPen): Pen {
        const pen = new Pen(props, this._render);
        this._render.emit("create", { shape: pen });
        this._render.emitPatch({ op: "add", id: pen.id, type: "pen", delta: pen._rawData() });
        this._render.autoSave();
        return pen;
    }

    /**
     * Creates a new 2D vector with the specified coordinates
     * @param x - The x component of the vector
     * @param y - The y component of the vector
     * @returns A new Vector instance
     */
    public Vector(x: number, y: number): Vector {
        return new Vector(x, y);
    }
}