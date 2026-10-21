import { Render } from "../../Render";
import { IShape, Shape } from "../Shape";
import { Rect } from "../_shapes/Rect";
import { Circle } from "../_shapes/Circle";
import { Text } from "../_shapes/Text";
import { Image } from "../_shapes/Image";
import { Vector } from "../common/Vector";
import { TransformerProvider } from "../../providers/Transformer.provider";

/** Padding configuration for transformer boundaries. */
export type Padding = { top: number; right: number; bottom: number; left: number };
/** Node box configuration containing position and size vectors. */
export type NodeBox = { position: Vector; size: Vector };

/** Interface defining transformer configuration options. */
export interface ITransformer {
    borderWidth?: number;
    borderColor?: string;
    nodeColor?: string;
    nodeBorderWidth?: number;
    nodeBorderColor?: string;
    nodeSize?: number;
    padding?: Padding;
    rotation?: number;
    target?: boolean;
    targetColor?: string;
    targetBackgroundColor?: string;
    targetBorderWidth?: number;
    targetBorderColor?: string;
    targetRadius?: number;
    targetFontSize?: number;
    targetFontFamily?: string;
    targetFontWeight?: string;
    targetFontStyle?: string;
}

/**
 * Multi-selection transformer for manipulating multiple shapes simultaneously.
 * Provides visual handles for resizing, moving, and transforming groups of shapes.
 * Handles both individual shape transformations and group operations with proper scaling.
 *
 * @example
 * ```ts
 * const transformer = new Transformer(render);
 * transformer.add(shape1);
 * transformer.add(shape2);
 * // Now both shapes can be transformed together
 * ```
 */
export class Transformer extends TransformerProvider {
    /** The rendering engine instance for drawing operations. */
    public _render: Render;

    /** Map of selected shapes indexed by their ID. Exposed via {@link childs}. */
    private _childs: Map<string, Shape> = new Map();
    /** Padding around the transformer boundary for visual spacing. */
    public padding: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
    /** Configuration for the transformer's appearance. */
    public borderWidth: number;
    /** Configuration for the transformer's appearance. */
    public borderColor: string;
    /** Configuration for the transformer's appearance. */
    public nodeColor: string;
    /** Configuration for the transformer's appearance. */
    public nodeBorderWidth: number;
    /** Configuration for the transformer's appearance. */
    public nodeBorderColor: string;
    /** Configuration for the transformer's appearance. */
    public nodeSize: number;
    /** Configuration for the transformer's appearance. */
    public rotation: number;
    /** Configuration for the transformer's appearance. */
    public target: boolean;
    /** Configuration for the transformer's appearance. */
    public targetColor: string;
    /** Configuration for the transformer's appearance. */
    public targetBackgroundColor: string;
    /** Configuration for the transformer's appearance. */
    public targetBorderWidth: number;
    /** Configuration for the transformer's appearance. */
    public targetBorderColor: string;
    /** Configuration for the transformer's appearance. */
    public targetRadius: number;
    /** Configuration for the transformer's appearance. */
    public targetFontSize: number;
    /** Configuration for the transformer's appearance. */
    public targetFontFamily: string;
    /** Configuration for the transformer's appearance. */
    public targetFontWeight: string;
    /** Configuration for the transformer's appearance. */
    public targetFontStyle: string;

    /** Current position of the transformer's top-left corner. */
    private _position: Vector = new Vector(0, 0);
    /** Current width of the transformer boundary. */
    private _width: number = 0;
    /** Current height of the transformer boundary. */
    private _height: number = 0;
    /** Minimum width of the transformer boundary. */
    private _minWidth: number = 100;
    /** Minimum height of the transformer boundary. */
    private _minHeight: number = 100;
    /** Minimum radius for transformation nodes. */
    private _minRadius: number = 0;
    /** Maximum radius for transformation nodes. */
    private _maxRadius: number = 50;

    /** Template positions for transformation nodes (0-1 normalized coordinates). */
    private _nodesBoxTemplate: Map<string, Vector> = new Map();
    /** Template positions for transformation nodes (0-1 normalized coordinates). */
    private _nodesBoxTemplateRadius: Map<string, Vector> = new Map();
    /** Actual screen positions and sizes of transformation nodes. */
    private _nodesBox: Map<string, NodeBox> = new Map();
    /** Actual screen positions and sizes of transformation nodes. */
    private _nodesBoxRadius: Map<string, Vector> = new Map();

    /** Indicates if currently resizing via transformation nodes. */
    private _isDragging: boolean = false;
    /** Indicates if currently moving the entire selection. */
    private _isMovingSelection: boolean = false;
    /** The currently active transformation node being dragged. */
    private _activeNode: string | null = null;
    /** The currently active transformation node radius being dragged. */
    private _activeNodeRadius: string | null = null;
    /** Last recorded mouse position for delta calculations. */
    private _lastMousePos: Vector = new Vector(0, 0);
    /** Original shape data before transformation for proper scaling calculations. */
    private _originalData: Map<string, { position: Vector; width?: number; height?: number; radius?: number; fontSize?: number }> = new Map();
    /** Original transformer bounds before transformation. */
    private _originalBounds: { width: number; height: number; position: Vector } = { width: 0, height: 0, position: new Vector(0, 0) };
    /** Indicates if the transformer is currently hidden. */
    private _isHidden: boolean = false;

    /** Bound keydown handler, stored once so it can be removed on destroy. */
    private _onKeyDownBound: (event: KeyboardEvent) => void = this._onKeyDown.bind(this);
    /** Bound mousemove handler, stored once so it can be removed on destroy. */
    private _onMouseMoveBound: (event: MouseEvent) => void = this._onMouseMove.bind(this);
    /** Bound mouseup handler, stored once so it can be removed on destroy. */
    private _onMouseUpBound: (event: MouseEvent) => void = this._onMouseUp.bind(this);

    /**
     * Creates a new Transformer instance.
     * @param render - The main Render context for drawing operations.
     * @param DataTransformer - Optional configuration for transformer properties.
     */
    public constructor(render: Render, DataTransformer?: ITransformer) {
        super();
        this._render = render;
        this.padding = DataTransformer?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
        this.borderWidth = DataTransformer?.borderWidth ?? 2;
        this.borderColor = DataTransformer?.borderColor ?? "#00ff00";
        this.nodeColor = DataTransformer?.nodeColor ?? "#00ff00";
        this.nodeBorderWidth = DataTransformer?.nodeBorderWidth ?? 2;
        this.nodeBorderColor = DataTransformer?.nodeBorderColor ?? "#00ff00";
        this.nodeSize = DataTransformer?.nodeSize ?? 10;
        this.rotation = DataTransformer?.rotation ?? 0;
        this.target = DataTransformer?.target ?? false;
        this.targetColor = DataTransformer?.targetColor ?? "#00ff00";
        this.targetBackgroundColor = DataTransformer?.targetBackgroundColor ?? "#00ff00";
        this.targetBorderWidth = DataTransformer?.targetBorderWidth ?? 2;
        this.targetBorderColor = DataTransformer?.targetBorderColor ?? "#00ff00";
        this.targetRadius = DataTransformer?.targetRadius ?? 10;
        this.targetFontSize = DataTransformer?.targetFontSize ?? 10;
        this.targetFontFamily = DataTransformer?.targetFontFamily ?? "sans-serif";
        this.targetFontWeight = DataTransformer?.targetFontWeight ?? "bold";
        this.targetFontStyle = DataTransformer?.targetFontStyle ?? "normal";

        this._setup();
    }

    /**
     * Initializes the transformer by setting up configuration and events.
     * @private
     */
    private _setup(): void {
        this._config();
        this._events();
    }

    /**
     * Configures the transformation node positions using normalized coordinates (0-1).
     * Sets up 8 resize handles around the transformer boundary.
     * @private
     */
    private _config(): void {
        this._nodesBoxTemplate.set("top-left", new Vector(0, 0));
        this._nodesBoxTemplate.set("top-center", new Vector(0.5, 0));
        this._nodesBoxTemplate.set("top-right", new Vector(1, 0));
        this._nodesBoxTemplate.set("middle-left", new Vector(0, 0.5));
        this._nodesBoxTemplate.set("middle-right", new Vector(1, 0.5));
        this._nodesBoxTemplate.set("bottom-left", new Vector(0, 1));
        this._nodesBoxTemplate.set("bottom-center", new Vector(0.5, 1));
        this._nodesBoxTemplate.set("bottom-right", new Vector(1, 1));

        this._nodesBoxTemplateRadius.set("top-left", new Vector(0, 0));
        this._nodesBoxTemplateRadius.set("top-right", new Vector(1, 0));
        this._nodesBoxTemplateRadius.set("bottom-left", new Vector(0, 1));
        this._nodesBoxTemplateRadius.set("bottom-right", new Vector(1, 1));
    }

    /**
     * Sets up event listeners for mouse interactions.
     * Handles mousedown, mousemove, mouseup, and click events.
     * @private
     */
    private _events(): void {
        this._render.on("mousedown", this._onMouseDown.bind(this));
        this._render.on("click", this._onCanvasClick.bind(this));
        window.addEventListener("keydown", this._onKeyDownBound);
        window.addEventListener("mousemove", this._onMouseMoveBound);
        window.addEventListener("mouseup", this._onMouseUpBound);
    }

    /**
     * Removes the window listeners this transformer registered.
     * Call before discarding the transformer to avoid leaking handlers.
     */
    public destroy(): void {
        window.removeEventListener("keydown", this._onKeyDownBound);
        window.removeEventListener("mousemove", this._onMouseMoveBound);
        window.removeEventListener("mouseup", this._onMouseUpBound);
    }

    /**
     * Handles keydown events for transformer-specific actions.
     * Currently supports only the Escape key to clear the transformer.
     * @private
     */
    private _onKeyDown(e: KeyboardEvent): void {
        if (this._childs.size === 0 || !this._render.configuration.config.transform) return;

        if (e.key === "Escape") {
            this.clear();
        }
    }

    /**
     * Handles mouse down events for starting transformations.
     * Determines if user clicked on a resize node or the transformer area.
     * @private
     */
    private _onMouseDown(): void {
        if (this._childs.size === 0 || !this._render.configuration.config.transform) return;

        const activeNode = this._isClickedAnyNode();
        if (activeNode) {
            this._isDragging = true;
            this._isMovingSelection = false;
            this._activeNode = activeNode;
            this._activeNodeRadius = null;
            this._lastMousePos = this._render.worldPosition();

            this._originalData.clear();
            this._childs.forEach(child => {
                const data: any = { position: child.position.copy() };
                if (child instanceof Rect) {
                    data.width = child.width;
                    data.height = child.height;
                } else if (child instanceof Circle) {
                    data.radius = child.radius;
                } else if (child instanceof Text) {
                    data.width = child.width;
                    data.height = child.height;
                    data.fontSize = child.fontSize;
                } else if (child instanceof Image) {
                    data.width = child.width;
                    data.height = child.height;
                }
                this._originalData.set(child.id, data);
            });

            this._originalBounds = {
                width: this._width,
                height: this._height,
                position: this._position.copy()
            };

            this.emit("resizestart", { childs: Array.from(this._childs.values()) })
            return;
        }

        const nodeRadiusActive = this._isClickedAnyNodeRadius();
        if (nodeRadiusActive) {
            this._isDragging = true;
            this._isMovingSelection = false;
            this._activeNode = null;
            this._activeNodeRadius = nodeRadiusActive;
            this._lastMousePos = this._render.worldPosition();
            return;
        }

        if (this._isClicked()) {
            this._isMovingSelection = true;
            this._isDragging = false;
            this._activeNode = null;
            this._activeNodeRadius = null;
            this._lastMousePos = this._render.worldPosition();
            this.emit("movestart", { childs: Array.from(this._childs.values()) })
        }
    }

    /**
     * Handles mouse move events during transformations.
     * Manages both selection movement and resize operations with proper scaling.
     * @private
     */
    private _onMouseMove(): void {
        if (!this._render.configuration.config.transform) return;
        const currentMousePos = this._render.worldPosition();

        // Any move/resize below mutates shape geometry; flag the scene so the
        // autosave on mouse-up re-serializes instead of skipping as a no-op.
        if (this._isMovingSelection || this._isDragging) {
            this._render.markDirty();
        }

        if (this._isMovingSelection && !this._isDragging) {
            const delta = currentMousePos.sub(this._lastMousePos);
            this._childs.forEach(child => {
                child.position = child.position.add(delta);
            });
            this.emit("move", { childs: Array.from(this._childs.values()) })
            this._lastMousePos = currentMousePos;
            return;
        }

        if (this._isDragging && this._activeNodeRadius && !this._isMovingSelection) {
            const nodePosition = this._getNodeCoordinates(this._activeNodeRadius);
            const offset = this._render.getOffset();
            const nodePositionScreen = nodePosition.sub(offset);
            
            const deltaFromNode = currentMousePos.sub(nodePositionScreen);
            
            let expectedDirection = new Vector(0, 0);
            if (this._activeNodeRadius.includes("top")) {
                expectedDirection.y = 1;
            }
            if (this._activeNodeRadius.includes("bottom")) {
                expectedDirection.y = -1;
            }
            if (this._activeNodeRadius.includes("left")) {
                expectedDirection.x = 1;
            }
            if (this._activeNodeRadius.includes("right")) {
                expectedDirection.x = -1;
            }
            
            const projectedDistance = deltaFromNode.x * expectedDirection.x + deltaFromNode.y * expectedDirection.y;
            
            const baseSensitivity = 0.5;
            const sensitivity = baseSensitivity / this._render.zoom;
            let newRadius = Math.max(this._minRadius, Math.min(this._maxRadius, projectedDistance * sensitivity));
            
            if (projectedDistance < 0) {
                newRadius = this._minRadius;
            } else if (projectedDistance > this._maxRadius / sensitivity) {
                newRadius = this._maxRadius;
            }

            this._childs.forEach(child => {
                if (child instanceof Rect || child instanceof Image) {
                    child.borderRadius = newRadius;
                }
            })
            return;
        }

        if (this._isDragging && this._activeNode && !this._isMovingSelection) {
            const anchor = this._nodesBoxTemplate.get(this._activeNode)!;
            const anchorOpposite = new Vector(1 - anchor.x, 1 - anchor.y);

            const originalWidth = this._originalBounds.width;
            const originalHeight = this._originalBounds.height;
            const minSize = 10;

            const totalDelta = currentMousePos.sub(this._lastMousePos);

            let newWidth = originalWidth;
            let newHeight = originalHeight;
            
            if (this._activeNode.includes("right")) {
                newWidth = originalWidth + totalDelta.x;
            } else if (this._activeNode.includes("left")) {
                newWidth = originalWidth - totalDelta.x;
            }

            if (this._activeNode.includes("bottom")) {
                newHeight = originalHeight + totalDelta.y;
            } else if (this._activeNode.includes("top")) {
                newHeight = originalHeight - totalDelta.y;
            }

            newWidth = Math.max(minSize, newWidth);
            newHeight = Math.max(minSize, newHeight);

            const scaleX = Math.max(minSize / originalWidth, newWidth / originalWidth);
            const scaleY = Math.max(minSize / originalHeight, newHeight / originalHeight);

            const originalAnchorPoint = new Vector(
                this._originalBounds.position.x + anchorOpposite.x * this._originalBounds.width,
                this._originalBounds.position.y + anchorOpposite.y * this._originalBounds.height
            );

            this._childs.forEach(child => {
                const original = this._originalData.get(child.id)!;
                const relativePos = original.position.sub(originalAnchorPoint);

                const newRelativePos = new Vector(relativePos.x * scaleX, relativePos.y * scaleY);
                child.position = originalAnchorPoint.add(newRelativePos);

                if (child instanceof Rect) {
                    child.width = original.width! * scaleX;
                    child.height = original.height! * scaleY;
                } else if (child instanceof Circle) {
                    child.radius = original.radius! * Math.max(scaleX, scaleY);
                } else if (child instanceof Text) {
                    child.fontSize = original.fontSize! * Math.max(scaleX, scaleY);
                } else if (child instanceof Image) {
                    child.width = original.width! * scaleX;
                    child.height = original.height! * scaleY;
                }
            });

            this.emit("resize", { childs: Array.from(this._childs.values()) })
        }
    }

    /**
     * Handles mouse up events to finalize transformations.
     * Resets all transformation states and clears temporary data.
     * @private
     */
    private _onMouseUp(): void {
        if (!this._render.configuration.config.transform) return;
        if (this._isDragging || this._isMovingSelection || this._activeNode) {
            this._render.autoSave();
        }
        this._isDragging = false;
        this._isMovingSelection = false;
        this._activeNode = null;
        this._originalData.clear();
        this.emit("moveend", { childs: Array.from(this._childs.values()) })
        this.emit("resizeend", { childs: Array.from(this._childs.values()) })
    }

    /**
     * Handles canvas click events for selection management.
     * Clears selection if clicking outside transformer or selected shapes.
     * @private
     */
    private _onCanvasClick(): void {
        if (this._childs.size === 0 || !this._render.configuration.config.transform) return;

        const clickedOnTransformer = this._isClicked();
        const clickedOnNode = this._isClickedAnyNode();
        const clickedOnSelectedShape = this._isClickedOnSelectedShape();

        if (!clickedOnTransformer && !clickedOnNode && !clickedOnSelectedShape && !this._render.selection._justFinishedSelecting) {
            this.clear();
        }

        this._render.selection._justFinishedSelecting = false;
    }

    /**
     * Checks if the mouse pointer is over any currently selected shape.
     * @returns True if clicking on a selected shape, false otherwise.
     * @private
     */
    private _isClickedOnSelectedShape(): boolean {
        if (!this._render.configuration.config.transform) return false;
        for (const shape of this._render.childrens.values()) {
            if (shape.isSelected && shape._isClicked()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determines if the mouse pointer is within the transformer boundary.
     * Excludes clicks on transformation nodes.
     * @returns True if clicking within transformer area, false otherwise.
     * @private
     */
    private _isClicked(): boolean {
        if (this._childs.size === 0) return false;

        const pointer = this._render.worldPosition();
        const offset = this._render.getOffset();
        const position = this._position.sub(offset);

        const boxX = position.x - this.padding.left;
        const boxY = position.y - this.padding.top;
        const boxWidth = this._width + this.padding.left + this.padding.right;
        const boxHeight = this._height + this.padding.top + this.padding.bottom;

        const isInBox = (
            pointer.x >= boxX &&
            pointer.x <= boxX + boxWidth &&
            pointer.y >= boxY &&
            pointer.y <= boxY + boxHeight
        );

        const nodeClicked = this._isClickedAnyNode();

        return isInBox && !nodeClicked;
    }

    /**
     * Checks if the mouse pointer is over any transformation node.
     * @returns The name of the clicked node, or null if no node was clicked.
     * @private
     */
    private _isClickedAnyNode(): string | null {
        if (this._childs.size === 0) return null;
        const pointer = this._render.worldPosition();
        const offset = this._render.getOffset();

        for (const [key, node] of this._nodesBox.entries()) {
            const nodePosition = node.position.sub(offset);
            const nodeX = nodePosition.x - (node.size.x / this._render.zoom) / 2;
            const nodeY = nodePosition.y - (node.size.y / this._render.zoom) / 2;
            const nodeWidth = node.size.x / this._render.zoom;
            const nodeHeight = node.size.y / this._render.zoom;

            if (
                pointer.x >= nodeX &&
                pointer.x <= nodeX + nodeWidth &&
                pointer.y >= nodeY &&
                pointer.y <= nodeY + nodeHeight
            ) {
                return key;
            }
        }

        return null;
    }

    /**
     * Checks if the mouse pointer is over any radius node.
     * @returns The name of the clicked node, or null if no node was clicked.
     * @private
     */
    private _isClickedAnyNodeRadius(): string | null {
        if (this._childs.size === 0) return null;
        const pointer = this._render.worldPosition();
        const offset = this._render.getOffset();

        for (const key of this._nodesBoxRadius.keys()) {
            const nodePosition = this._getNodeCoordinates(key);
            const nodePositionScreen = nodePosition.sub(offset);
            const nodeX = nodePositionScreen.x - (this.nodeSize / this._render.zoom) / 2;
            const nodeY = nodePositionScreen.y - (this.nodeSize / this._render.zoom) / 2;
            const nodeWidth = this.nodeSize / this._render.zoom;
            const nodeHeight = this.nodeSize / this._render.zoom;

            if (
                pointer.x >= nodeX &&
                pointer.x <= nodeX + nodeWidth &&
                pointer.y >= nodeY &&
                pointer.y <= nodeY + nodeHeight
            ) {
                return key;
            }
        }

        return null;
    }

    /**
     * @internal
     * Returns the coordinates of a transformation node based on the node name.
     * @param node - The name of the node to retrieve coordinates for.
     * @returns The coordinates of the node as a `Vector` object.
     */
    private _getNodeCoordinates(node: string): Vector {
        const boxX = this._position.x - this.padding.left;
        const boxY = this._position.y - this.padding.top;
        const boxWidth = this._width + this.padding.left + this.padding.right;
        const boxHeight = this._height + this.padding.top + this.padding.bottom;
        const borderRadiusNode = Array.from(this.childs.values()).map((child) => {
            if (child instanceof Rect || child instanceof Image) {
                return child.borderRadius;
            }
            return 0;
        })[0] ?? 0;
        
        const baseMargin = 15 / this._render.zoom;
        const radiusDisplacement = borderRadiusNode * 0.5;
        const margin = baseMargin + radiusDisplacement;

        switch (node) {
            case "top-left":
                return new Vector(boxX + margin, boxY + margin);
            case "top-right":
                return new Vector(boxX + boxWidth - margin, boxY + margin);
            case "bottom-left":
                return new Vector(boxX + margin, boxY + boxHeight - margin);
            case "bottom-right":
                return new Vector(boxX + boxWidth - margin, boxY + boxHeight - margin);
            default:
                return new Vector(boxX + margin, boxY + margin);
        }
    }

    /**
     * Calculates the bounding box that encompasses all selected shapes.
     * Updates the transformer's position, width, and height based on shape bounds.
     * @private
     */
    private _calculateBox(): void {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        if (this._childs.size === 0) return;

        this._childs.forEach((child: Shape) => {
            let sizeX = 0;
            let sizeY = 0;
            let currentX = child.position.x;
            let currentY = child.position.y;

            if (child instanceof Rect) {
                sizeX = child.width;
                sizeY = child.height;
            } else if (child instanceof Circle) {
                sizeX = child.radius * 2;
                sizeY = child.radius * 2;
                currentX = child.position.x - child.radius;
                currentY = child.position.y - child.radius;
            } else if (child instanceof Text) {
                sizeX = child.width + child.padding.left + child.padding.right + child.borderWidth;
                sizeY = child.height + child.padding.top + child.padding.bottom + child.borderWidth;
                currentX = child.position.x + child._getTextOffsetX() - child.padding.left - child.borderWidth / 2;
                currentY = child.position.y - child.ascent - child.padding.top - child.borderWidth / 2;
            } else if (child instanceof Image) {
                sizeX = child.width;
                sizeY = child.height;
                currentX = child.position.x;
                currentY = child.position.y;
            }

            minX = Math.min(minX, currentX);
            maxX = Math.max(maxX, currentX + sizeX);
            minY = Math.min(minY, currentY);
            maxY = Math.max(maxY, currentY + sizeY);
        })

        this._position = new Vector(minX, minY);
        this._width = maxX - minX;
        this._height = maxY - minY;
    }

    /**
     * Calculates the screen positions of all transformation nodes.
     * Updates node positions based on current transformer bounds and zoom level.
     * @private
     */
    private _calculateNodesBox(): void {
        this._nodesBox.clear();

        const boxX = this._position.x - this.padding.left;
        const boxY = this._position.y - this.padding.top;
        const boxWidth = this._width + this.padding.left + this.padding.right;
        const boxHeight = this._height + this.padding.top + this.padding.bottom;

        this._nodesBoxTemplate.forEach((node: Vector, key: string) => {
            const posX = boxX + node.x * boxWidth;
            const posY = boxY + node.y * boxHeight;
            this._nodesBox.set(key, { position: new Vector(posX, posY), size: new Vector(this.nodeSize, this.nodeSize) });
        })
    }

    /**
     * Calculates the screen positions of all transformation nodes.
     * Updates node positions based on current transformer bounds and zoom level.
     * @private
     */
    private _calculateNodesBoxRadius(): void {
        this._nodesBoxRadius.clear();
        this._nodesBoxTemplateRadius.forEach((_: Vector, key: string) => {
            this._nodesBoxRadius.set(key, this._getNodeCoordinates(key));
        })
    }

    /**
     * Renders the transformer boundary box.
     * Draws a green outline around the selected shapes.
     * @private
     */
    private _updateBox(): void {
        if (this._childs.size === 0 || this._isHidden) return;

        const posX = this._position.x - this.padding.left;
        const posY = this._position.y - this.padding.top;
        const width = this._width + this.padding.left + this.padding.right;
        const height = this._height + this.padding.top + this.padding.bottom;
        const offset = this._render.getOffset();

        const posFinal = new Vector(posX - offset.x, posY - offset.y);

        this._render.ctx.save()
        this._render.ctx.translate(posFinal.x, posFinal.y);
        this._render.ctx.rotate(this._render.transformer.rotation);

        this._render.ctx.beginPath()
        this._render.ctx.rect(0, 0, width, height)
        this._render.ctx.strokeStyle = this.borderColor
        this._render.ctx.lineWidth = this.borderWidth / this._render.zoom
        this._render.ctx.stroke()
        this._render.ctx.closePath()

        if (!this.target) {
            this._render.ctx.restore();
            return;
        }

        const text = `${this._width.toFixed(0)} x ${this._height.toFixed(0)}`;
        const scaledFontSize = this.targetFontSize / this._render.zoom;
        
        this._render.ctx.save();
        this._render.ctx.font = `${this.targetFontStyle} ${this.targetFontWeight} ${scaledFontSize}px ${this.targetFontFamily}`;
        
        const metrics = this._render.ctx.measureText(text);
        const textWidth = metrics.width;
        
        const ascent = scaledFontSize * 0.8;
        const descent = scaledFontSize * 0.2;
        const textHeight = ascent + descent;
        
        this._render.ctx.restore();
        
        const marginTop = 10 / this._render.zoom;
        const padding = 2 / this._render.zoom;
        
        const rectW = textWidth + padding * 2;
        const rectH = textHeight + padding * 2;
        const rectX = width / 2 - rectW / 2;
        const rectY = height + marginTop;
        
        const textX = rectX + padding;
        const textY = rectY + padding + ascent;
        
        this._render.ctx.beginPath();
        this._render.ctx.roundRect(rectX, rectY, rectW, rectH, 3 / this._render.zoom);
        this._render.ctx.fillStyle = this.targetBackgroundColor;
        this._render.ctx.strokeStyle = this.targetBorderColor;
        this._render.ctx.lineWidth = this.targetBorderWidth / this._render.zoom;
        this._render.ctx.fill();
        this._render.ctx.stroke();
        this._render.ctx.closePath();
        
        this._render.ctx.beginPath();
        this._render.ctx.fillStyle = this.targetColor;
        this._render.ctx.font = `${this.targetFontStyle} ${this.targetFontWeight} ${scaledFontSize}px ${this.targetFontFamily}`;
        this._render.ctx.textAlign = "left";
        this._render.ctx.textBaseline = "alphabetic";
        this._render.ctx.fillText(text, textX, textY);
        this._render.ctx.closePath();

        this._render.ctx.restore()
    }

    /**
     * Renders all transformation nodes (resize handles).
     * Draws white squares with red borders at each transformation point.
     * @private
     */
    private _updateNodes(): void {
        if (this._childs.size === 0 || this._isHidden) return;

        const offset = this._render.getOffset();

        this._nodesBox.forEach((node: NodeBox) => {
            this._render.ctx.save()

            this._render.ctx.beginPath()
            this._render.ctx.rect(
                node.position.x - (node.size.x / this._render.zoom) / 2 - offset.x,
                node.position.y - (node.size.y / this._render.zoom) / 2 - offset.y,
                node.size.x / this._render.zoom,
                node.size.y / this._render.zoom
            )
            this._render.ctx.fillStyle = this.nodeColor
            this._render.ctx.strokeStyle = this.nodeBorderColor
            this._render.ctx.lineWidth = this.nodeBorderWidth / this._render.zoom
            this._render.ctx.fill()
            this._render.ctx.stroke()
            this._render.ctx.closePath()

            this._render.ctx.restore()
        })
    }

    /**
     * Updates the radius nodes of the transformer.
     * @private
     */
    private _updateNodesRadius(): void {
        const child = this._childs.values().next().value;
        const widthScaled = this._width * this._render.zoom;
        const heightScaled = this._height * this._render.zoom;
        if (this._childs.size !== 1 || this._isHidden || !child?.has("borderRadius" as keyof IShape) || widthScaled < this._minWidth || heightScaled < this._minHeight) return;
        
        const offset = this._render.getOffset();
        const radius = 5 / this._render.zoom;

        this._nodesBoxRadius.forEach((node: Vector) => {
            this._render.ctx.save()

            this._render.ctx.beginPath()
            this._render.ctx.arc(
                node.x - offset.x,
                node.y - offset.y,
                radius,
                0,
                Math.PI * 2
            )
            this._render.ctx.fillStyle = this.nodeColor
            this._render.ctx.strokeStyle = this.nodeBorderColor
            this._render.ctx.lineWidth = this.nodeBorderWidth / this._render.zoom
            this._render.ctx.fill()
            this._render.ctx.stroke()
            this._render.ctx.closePath()

            this._render.ctx.restore()
        })
    }

    /**
     * Gets a property of the transformer.
     * @param key - The property key to get.
     * @returns The value of the property.
     */
    public get<K extends keyof ITransformer>(key: K): ITransformer[K] {
        return this[key as keyof this] as unknown as ITransformer[K];
    }

    /**
     * Sets a property of the transformer.
     * @param key - The property key to set.
     * @param value - The value to set.
     */
    public set<K extends keyof ITransformer>(key: K, value: ITransformer[K]): this {
        (this[key as keyof this] as unknown as ITransformer[K]) = value;
        return this;
    }

    /**
     * Gets the current position of the transformer's top-left corner.
     * @returns The position as a Vector.
     */
    public get position(): Vector {
        return this._position;
    }

    /**
     * Gets the current width of the transformer boundary.
     * @returns The width in pixels.
     */
    public get width(): number {
        return this._width;
    }

    /**
     * Gets the current height of the transformer boundary.
     * @returns The height in pixels.
     */
    public get height(): number {
        return this._height;
    }

    /**
     * Checks if the transformer is empty (no shapes selected).
     * @returns True if the transformer is empty, false otherwise.
     */
    public isEmpty(): boolean {
        return this._childs.size === 0;
    }

    /**
     * Checks if a shape is currently selected.
     * @param shape - The shape to check.
     * @returns True if the shape is selected, false otherwise.
     */
    public inTransformer(shape: Shape): boolean {
        return this._childs.has(shape.id);
    }

    /**
     * Checks if the mouse pointer is within the transformer boundary.
     * Excludes clicks on transformation nodes.
     * @returns True if clicking within transformer area, false otherwise.
     */
    public isClickedTransformer(): boolean {
        return this._isClicked() || this._isClickedAnyNode() !== null;
    }

    /**
     * Updates and renders the transformer.
     * Recalculates bounds, node positions, and draws the transformer UI.
     * Should be called every frame when shapes are selected.
     */
    public update(): void {
        if (this._childs.size === 0 || this._isHidden) return;

        this._calculateBox();
        this._calculateNodesBox();
        this._calculateNodesBoxRadius();
        this._updateBox();
        this._updateNodes();
        this._updateNodesRadius();
    }

    /**
     * Sets the configuration for the transformer.
     * @param DataTransformer - The configuration object.
     */
    public setConfig(DataTransformer: ITransformer): void {
        this.padding = DataTransformer?.padding ?? this.padding;
        this.borderWidth = DataTransformer?.borderWidth ?? this.borderWidth;
        this.borderColor = DataTransformer?.borderColor ?? this.borderColor;
        this.nodeColor = DataTransformer?.nodeColor ?? this.nodeColor;
        this.nodeSize = DataTransformer?.nodeSize ?? this.nodeSize;
        this.nodeBorderWidth = DataTransformer?.nodeBorderWidth ?? this.nodeBorderWidth;
        this.nodeBorderColor = DataTransformer?.nodeBorderColor ?? this.nodeBorderColor;
        this.target = DataTransformer?.target ?? this.target;
        this.targetColor = DataTransformer?.targetColor ?? this.targetColor;
        this.targetBackgroundColor = DataTransformer?.targetBackgroundColor ?? this.targetBackgroundColor;
        this.targetBorderWidth = DataTransformer?.targetBorderWidth ?? this.targetBorderWidth;
        this.targetBorderColor = DataTransformer?.targetBorderColor ?? this.targetBorderColor;
        this.targetRadius = DataTransformer?.targetRadius ?? this.targetRadius;
        this.targetFontSize = DataTransformer?.targetFontSize ?? this.targetFontSize;
        this.targetFontFamily = DataTransformer?.targetFontFamily ?? this.targetFontFamily;
        this.targetFontWeight = DataTransformer?.targetFontWeight ?? this.targetFontWeight;
        this.targetFontStyle = DataTransformer?.targetFontStyle ?? this.targetFontStyle;
    }

    public hide(): void {
        this._isHidden = true;
    }

    public show(): void {
        this._isHidden = false;
    }

    /**
     * Selects all shapes in the transformer selection.
     */
    public selectAll(): void {
        this.clear();
        this._render.childs.forEach(child => this.add(child));
    }

    /**
     * Adds a shape to the transformer selection.
     * @param child - The shape to add to the selection.
     */
    public add(child: Shape): void {
        this._childs.set(child.id, child);
        child.isSelected = true;
    }

    /**
     * Removes a shape from the transformer selection.
     * @param child - The shape to remove from the selection.
     */
    public remove(child: Shape): void {
        this._childs.delete(child.id);
        child.isSelected = false;
    }

    /**
     * Clears all shapes from the transformer selection.
     * Deselects all currently selected shapes.
     */
    public clear(): void {
        this._childs.forEach(child => child.isSelected = false);
        this._childs.clear();
    }

    /**
     * Gets the map of currently selected shapes.
     * @returns Map of shapes indexed by their ID.
     */
    public get childs(): Map<string, Shape> {
        return this._childs;
    }

    /**
     * Indicates if the transformer is currently in resize mode.
     * @returns True if actively resizing via transformation nodes.
     */
    get isDragging(): boolean {
        return this._isDragging;
    }

    /**
     * Indicates if the transformer is currently moving the selection.
     * @returns True if actively moving all selected shapes together.
     */
    get isMovingSelection(): boolean {
        return this._isMovingSelection;
    }
}