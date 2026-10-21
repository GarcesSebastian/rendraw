import { RenderCreator } from "./helpers/Render.creator";
import { Vector } from "./instances/common/Vector";
import { RenderManager } from "./managers/Render.manager";
import { RenderProvider, type Patch, type PointerKind, type RenderEventPointer } from "./providers/Render.provider";
import { RenderConfiguration, type RenderConfigurationProps } from "./helpers/Render.config";
import { Camera } from "./instances/common/Camera";
import { History } from "./instances/utils/History";
import { SnapSmart } from "./instances/utils/SnapSmart";
import { Shape, type ShapeRawData } from "./instances/Shape";
import { Rect, type RectRawData } from "./instances/_shapes/Rect";
import { Circle, type CircleRawData } from "./instances/_shapes/Circle";
import { Text, type TextRawData } from "./instances/_shapes/Text";
import { Image, type ImageRawData } from "./instances/_shapes/Image";
import { Line, type LineRawData } from "./instances/_shapes/Line";
import { Arrow, type ArrowRawData } from "./instances/_shapes/Arrow";
import { Polygon, type PolygonRawData } from "./instances/_shapes/Polygon";
import { Path, type PathRawData } from "./instances/_shapes/Path";
import { Pen, type PenRawData } from "./instances/_shapes/Pen";
import { Selection } from "./instances/utils/Selection";
import { Transformer } from "./instances/common/Transformer";
import { Database } from "./database/Database";
import type { Table } from "./database/_common/Table";
import type { ConfigurationSchema, NodeSchema, RenderDatabaseSchema } from "./types/Schemas";
import { Exporter } from "./instances/utils/Exporter";
import type { RenderProperties } from "./types/Properties";
import { validateShapes, validateProperties } from "./validation/schemas";
import { EnvironmentError, isBrowserEnvironment } from "./environment";

export type { RenderProperties };

/**
 * Main rendering system class.
 * Manages the canvas, mouse events, zoom, panning, and drawn shapes.
 *
 * @example
 * ```ts
 * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
 * const render = new Render(canvas);
 * const rect = new Rect(render, { x: 100, y: 100, width: 200, height: 100 });
 * ```
 */
export class Render extends RenderProvider {
    /** HTML canvas element used for rendering. */
    public canvas: HTMLCanvasElement
    /** 2D canvas context for drawing operations. */
    public ctx: CanvasRenderingContext2D

    /** Current camera that controls the canvas view. */
    public currentCamera: Camera;
    /** Map of all shapes on the canvas, indexed by their ID. */
    public childrens: Map<string, Shape> = new Map();
    /** Rendering system configuration. */
    public configuration: RenderConfiguration;
    /** History system for undo/redo operations. */
    public history: History;
    /** Smart snapping system for shapes. */
    public snapSmart: SnapSmart;
    /** Transformer system for shapes. */
    public transformer: Transformer;
    /** Selection system for shapes. */
    public selection: Selection;
    /** Export system for shapes. */
    public exporter: Exporter;

    /** Database instance for data persistence. */
    private _database: Database<RenderDatabaseSchema> | null = null;
    /** Last serialized data string for comparison to avoid unnecessary saves. */
    private _lastSerializedData: string = "";
    /** Callback function for saving progress updates. */
    public onSavingProgress: ((progress: { p: number; state: boolean }) => void) | null = null;
    /** Callback function for loading progress updates. */
    public onLoadProgress: ((progress: { p: number; state: boolean }) => void) | null = null;
    /** Debounce timeout for configuration-only saves. */
    private _configSaveTimeout: number | null = null;

    /**
     * Single source of truth for every DOM listener this instance registers.
     * `events()` pushes into it and attaches from it; `destroy()`/`cleanup()`
     * iterate the SAME entries to detach, so add/remove can never drift apart.
     */
    private _domListeners: Array<{ target: EventTarget; type: string; handler: EventListener; opts: boolean | AddEventListenerOptions | undefined }> = [];

    /** Current animation frame ID. */
    private _frameId: number | null = null
    /** Bound rendering function to maintain the correct context. */
    private _renderBound: () => void = this._render.bind(this)
    /** Bound resize function to maintain the correct context. */
    private _resizeBound: () => void = this.resize.bind(this)
    /** Bound context menu function to maintain the correct context. */
    private _onContextmenuBound: (event: MouseEvent) => void = this._onContextmenu.bind(this);

    /** Bound mouse click function. */
    private _onMouseClickedBound: (event: MouseEvent) => void = this._onMouseClicked.bind(this);
    /** Bound mouse down function. */
    private _onMouseDownBound: (event: MouseEvent) => void = this._onMouseDown.bind(this);
    /** Bound mouse move function. */
    private _onMouseMovedBound: (event: MouseEvent) => void = this._onMouseMoved.bind(this);
    /** Bound mouse up function. */
    private _onMouseUpBound: (event: MouseEvent) => void = this._onMouseUp.bind(this);
    /** Bound mouse wheel function. */
    private _onMouseWheelBound: (event: WheelEvent) => void = this._onMouseWheel.bind(this);
    /** Bound key down function. */
    private _onKeyDownBound: (event: KeyboardEvent) => void = this._onKeyDown.bind(this);
    /** Bound key up function. */
    private _onKeyUpBound: (event: KeyboardEvent) => void = this._onKeyUp.bind(this);

    /** Bound pointer-down handler (E1). */
    private _onPointerDownBound: (event: PointerEvent) => void = this._onPointerDown.bind(this);
    /** Bound pointer-move handler (E1). */
    private _onPointerMoveBound: (event: PointerEvent) => void = this._onPointerMove.bind(this);
    /** Bound pointer-up handler (E1). */
    private _onPointerUpBound: (event: PointerEvent) => void = this._onPointerUp.bind(this);

    /**
     * Active pointers, keyed by `pointerId`, used for touch gesture recognition
     * (E1). Only touch/pen pointers are tracked here; mouse input keeps flowing
     * through the existing mouse handlers unchanged.
     */
    private _activePointers: Map<number, { x: number; y: number }> = new Map();
    /** Previous two-pointer distance, for computing the pinch scale delta. */
    private _lastPinchDistance: number | null = null;
    /** Previous one/two-pointer centroid, for computing the touch-pan delta. */
    private _lastTouchCenter: Vector | null = null;

    /** Shape currently being dragged. */
    private _draggingShape: Shape | null = null

    /** Current mouse position in absolute coordinates. */
    private _mousePosition: Vector = new Vector(0, 0)
    /** Last recorded mouse position. */
    private _lastMousePos: Vector = new Vector(0, 0)
    /** Offset for panning. */
    private _offsetPan: Vector = new Vector(0, 0)

    /** Indicates if zoom mode is active (Ctrl key pressed). */
    private _isZooming: boolean = false
    /** Indicates if pan mode is active. */
    private _isPan: boolean = false
    /** Indicates if a shape is being dragged. */
    private _isDragging: boolean = false
    /** Indicates if shift key is pressed for multi-selection. */
    private _isShiftPressed: boolean = false
    /** Indicates if dragging occurred during the current mouse interaction. */
    private _wasDragging: boolean = false
    /** Time when mouse down occurred. */
    private _mouseDownTime: number = 0
    /** Minimum time in milliseconds before dragging activates. */
    private _dragThreshold: number = 150

    /** Current zoom factor. */
    private _zoom: number = 1
    /** Timeout for wheel events. */
    private _wheelTimeout: number | null = null;

    /** Last recorded click time to detect double clicks. */
    private _lastTimeClick: number = performance.now();
    /** Last recorded time to calculate FPS. */
    private _lastFrameTime: number = performance.now()
    /** Frame counter for calculating FPS. */
    private _frameCount: number = 0
    /** Current frames per second. */
    private _fps: number = 0

    /** Indicates whether to show FPS counter. */
    public showFps: boolean = false;
    /** Global canvas position (for panning). Reach it via {@link globalPosition}. */
    private _globalPosition: Vector = new Vector(0, 0)

    /** Creator for shapes and elements. */
    public creator: RenderCreator;
    /** Manager for renderer elements. */
    public manager: RenderManager;

    /** Counter for save operations */
    private _saveCounter: number = 0;

    /**
     * True while {@link applyPatch} is applying a remote change. Guards the
     * `patch` emitters so applying an inbound patch does not echo a new `patch`
     * event back to the network (prevents sync feedback loops).
     */
    private _applyingRemote: boolean = false;

    /**
     * Cached shape list ordered by descending zIndex (top-most first), the same
     * order the old per-call `sort((a,b) => b.zIndex - a.zIndex)` produced. It is
     * rebuilt lazily by {@link _getChildrens} only when {@link _zOrderDirty} is
     * set, instead of sorting every frame and on every input event.
     */
    private _zOrderCache: Shape[] | null = null;
    /** Set whenever the shape set or any shape's zIndex changes. */
    private _zOrderDirty: boolean = true;

    /** True while an edit has happened since the last autosave serialization. */
    private _sceneDirty: boolean = true;

    /**
     * Cached `canvas.getBoundingClientRect()`. The hit-test / coordinate helpers
     * read this instead of forcing a layout read on every `mousemove`. It is
     * refreshed on resize/scroll/orientationchange and at drag start, which is
     * when the canvas's on-screen box can actually move.
     */
    private _canvasRect: DOMRect | null = null;
    /** Bound rect-refresh handler (scroll/resize), stored for clean teardown. */
    private _refreshRectBound: () => void = this._refreshCanvasRect.bind(this);

    /**
     * Creates a new renderer instance.
     * @param canvas - The HTML canvas element where rendering will be performed.
     */
    public constructor(canvas: HTMLCanvasElement) {
        super();

        // E6: fail fast and clearly under SSR/Node, before any canvas access,
        // listener registration, or worker is created.
        if (!isBrowserEnvironment()) {
            throw new EnvironmentError(
                "rendraw requires a browser environment (window, document and HTMLCanvasElement). " +
                "Construct Render (or call createRender) only in the browser."
            );
        }

        this.canvas = canvas
        this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D

        this.creator = new RenderCreator(this)
        this.manager = new RenderManager(this)
        this.configuration = new RenderConfiguration(this)
        this.currentCamera = new Camera(this)
        this.snapSmart = new SnapSmart(this)
        this.history = new History(this, {
            maxEntries: this.configuration.config.historyMaxEntries,
            maxBytes: this.configuration.config.historyMaxBytes,
        })
        this.transformer = new Transformer(this)
        this.selection = new Selection(this)
        this.exporter = new Exporter(this)

        this.setup()
        this.start()
    }

    /**
     * Sets up the renderer by initializing all necessary components.
     * @private
     */
    private setup(): void {
        this.config()
        this.events()
        this._customEvents()
    }

    /**
     * Applies the initial configuration to the renderer.
     * @private
     */
    private config(): void {
        this.resize()
    }

    /**
     * Sets up the browser events needed for interaction.
     * @private
     */
    private events(): void {
        this._addListener(window, "resize", this._resizeBound)
        this._addListener(window, "change", this._resizeBound)
        this._addListener(window, "orientationchange", this._resizeBound)
        this._addListener(window, "visibilitychange", this._resizeBound)

        // Refresh the cached canvas rect when the page scrolls (capture phase so
        // scrolls on any ancestor are seen); passive since we never preventDefault.
        this._addListener(window, "scroll", this._refreshRectBound, { capture: true, passive: true })

        this._addListener(window, "contextmenu", this._onContextmenuBound as EventListener)

        this._addListener(window, "keydown", this._onKeyDownBound as EventListener)
        this._addListener(window, "keyup", this._onKeyUpBound as EventListener)
        this._addListener(window, "wheel", this._onMouseWheelBound as EventListener, { passive: false })
        this._addListener(window, "mousedown", this._onMouseDownBound as EventListener)
        this._addListener(window, "mousemove", this._onMouseMovedBound as EventListener)
        this._addListener(window, "mouseup", this._onMouseUpBound as EventListener)
        this._addListener(window, "click", this._onMouseClickedBound as EventListener)

        // E1: Pointer Events for touch/pen input and gesture recognition. Bound
        // to the canvas so gestures are scoped to it. Mouse behaviour continues
        // to flow through the mouse handlers above; these emit the additive
        // pointer events and recognise pinch-zoom / touch-pan for touch/pen.
        if (this.configuration.config.touch !== false) {
            this._addListener(this.canvas, "pointerdown", this._onPointerDownBound as EventListener)
            this._addListener(this.canvas, "pointermove", this._onPointerMoveBound as EventListener)
            this._addListener(this.canvas, "pointerup", this._onPointerUpBound as EventListener)
            this._addListener(this.canvas, "pointercancel", this._onPointerUpBound as EventListener)
        }
    }

    /**
     * Registers a DOM listener and records it in {@link _listeners} so it can be
     * removed later from the exact same target/type/handler/options.
     * @private
     */
    private _addListener(target: EventTarget, type: string, handler: EventListener, opts?: boolean | AddEventListenerOptions): void {
        target.addEventListener(type, handler, opts);
        this._domListeners.push({ target, type, handler, opts });
    }

    /**
     * Removes every listener recorded in {@link _listeners} from the same target
     * it was added to, then empties the table.
     * @private
     */
    private _removeListeners(): void {
        for (const { target, type, handler, opts } of this._domListeners) {
            target.removeEventListener(type, handler, opts);
        }
        this._domListeners = [];
    }

    private _customEvents(): void {
        this.on("save", () => {
            this.forceSave();
        })
    }

    /**
     * Handles the key down event.
     * @param event - Keyboard event.
     * @private
     */
    private _onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Control") {
            this._isZooming = true;
        }
        if (event.key === "Shift") {
            this._isShiftPressed = true;
        }
    }

    /**
     * Handles the key up event.
     * @param event - Keyboard event.
     * @private
     */
    private _onKeyUp(event: KeyboardEvent): void {
        if (event.key === "Control") {
            this._isZooming = false;
        }
        if (event.key === "Shift") {
            this._isShiftPressed = false;
        }
    }

    /**
     * Builds the pointer-event payload shared by the pointer handlers.
     * @private
     */
    private _getPointerArgs(event: PointerEvent): RenderEventPointer {
        return {
            pointer: {
                absolute: this.mousePosition(),
                world: this.worldPosition(),
            },
            target: this,
            pointerType: (event.pointerType || "mouse") as PointerKind,
            pointerId: event.pointerId,
        };
    }

    /**
     * Handles a pointer-down (E1). Emits the additive `pointerdown` event and,
     * for touch/pen, starts tracking the pointer for gesture recognition.
     * @private
     */
    private _onPointerDown(event: PointerEvent): void {
        this._mousePosition.x = event.clientX;
        this._mousePosition.y = event.clientY;
        this.emit("pointerdown", this._getPointerArgs(event));

        if (event.pointerType === "touch" || event.pointerType === "pen") {
            this._activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            this._lastPinchDistance = null;
            this._lastTouchCenter = this._pointerCentroid();
        }
    }

    /**
     * Handles a pointer-move (E1). Emits `pointermove`, and for two touch
     * pointers recognises pinch-zoom (emitting `pinch`); for one/two touch
     * pointers recognises touch-pan.
     * @private
     */
    private _onPointerMove(event: PointerEvent): void {
        this._mousePosition.x = event.clientX;
        this._mousePosition.y = event.clientY;
        this.emit("pointermove", this._getPointerArgs(event));

        if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
        if (!this._activePointers.has(event.pointerId)) return;

        this._activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = Array.from(this._activePointers.values());

        // Pinch-zoom: exactly two active pointers.
        if (points.length === 2 && this.configuration.config.touch !== false) {
            const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }];
            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            const center = new Vector((a.x + b.x) / 2, (a.y + b.y) / 2);

            const pinchEnabled = this.configuration.config.pinchZoom ?? this.configuration.config.zoom;
            if (pinchEnabled && this._lastPinchDistance !== null && this._lastPinchDistance > 0 && distance > 0) {
                const scale = distance / this._lastPinchDistance;
                this._applyZoomAround(center, scale);
                this.emit("pinch", { scale, center });
            }
            this._lastPinchDistance = distance;
        } else {
            this._lastPinchDistance = null;
        }

        // Touch pan: track the centroid and pan by its delta.
        const touchPanEnabled = this.configuration.config.touchPan ?? this.configuration.config.pan;
        if (touchPanEnabled && this.configuration.config.pan) {
            const center = this._pointerCentroid();
            if (center && this._lastTouchCenter && points.length === 1) {
                const dx = (center.x - this._lastTouchCenter.x) / this._zoom;
                const dy = (center.y - this._lastTouchCenter.y) / this._zoom;
                this._offsetPan.x += dx;
                this._offsetPan.y += dy;
            }
            this._lastTouchCenter = center;
        }
    }

    /**
     * Handles a pointer-up / pointer-cancel (E1). Emits `pointerup` and clears
     * the pointer from gesture tracking.
     * @private
     */
    private _onPointerUp(event: PointerEvent): void {
        this.emit("pointerup", this._getPointerArgs(event));
        this._activePointers.delete(event.pointerId);
        if (this._activePointers.size < 2) this._lastPinchDistance = null;
        if (this._activePointers.size === 0) this._lastTouchCenter = null;
    }

    /** Centroid of all active pointers in absolute coordinates, or null. @private */
    private _pointerCentroid(): Vector | null {
        const points = Array.from(this._activePointers.values());
        if (points.length === 0) return null;
        let sx = 0;
        let sy = 0;
        for (const p of points) {
            sx += p.x;
            sy += p.y;
        }
        return new Vector(sx / points.length, sy / points.length);
    }

    /**
     * Applies a multiplicative zoom delta centered on an absolute screen point,
     * keeping that point stationary in world space (shared by pinch-zoom).
     * @private
     */
    private _applyZoomAround(center: Vector, scale: number): void {
        if (!this.configuration.config.zoom && !(this.configuration.config.pinchZoom ?? false)) return;
        const worldBefore = this.toWorldCoordinates(center);
        this._zoom *= scale;

        const properties = this.configuration.getProperties();
        if (properties.minZoom && this._zoom < properties.minZoom) this._zoom = properties.minZoom;
        if (properties.maxZoom && this._zoom > properties.maxZoom) this._zoom = properties.maxZoom;

        const worldAfter = this.toWorldCoordinates(center);
        this._globalPosition.x += (worldAfter.x - worldBefore.x) * this._zoom;
        this._globalPosition.y += (worldAfter.y - worldBefore.y) * this._zoom;
    }

    /**
     * Gives the canvas keyboard focus (making it focusable first if the consumer
     * has not set a `tabindex`). Useful for forwarding global shortcuts to a
     * specific instance (E1/§3 groundwork).
     */
    public focus(): void {
        if (!this.canvas.hasAttribute("tabindex")) {
            this.canvas.setAttribute("tabindex", "0");
        }
        this.canvas.focus();
    }

    /**
     * Handles the mouse wheel event for zoom and panning.
     * @param event - Mouse wheel event.
     * @private
     */
    private _onMouseWheel(event: WheelEvent): void {
        event.preventDefault();
    
        if (!this.pointerInWorld(this.mousePosition())) {
            event.stopPropagation();
            return;
        }
    
        if (this._isZooming && this.configuration.config.zoom) {
            const zoomFactor = this.configuration.getProperties().zoomFactor;
            const mouse = this.mousePosition();
            const worldBefore = this.toWorldCoordinates(mouse);
    
            if (event.deltaY < 0) {
                this._zoom *= zoomFactor;
            } else {
                this._zoom /= zoomFactor;
            }

            const properties = this.configuration.getProperties();
            if (properties.minZoom && this._zoom < properties.minZoom) this._zoom = properties.minZoom;
            if (properties.maxZoom && this._zoom > properties.maxZoom) this._zoom = properties.maxZoom;

            const worldAfter = this.toWorldCoordinates(mouse);
    
            this._globalPosition.x += (worldAfter.x - worldBefore.x) * this._zoom;
            this._globalPosition.y += (worldAfter.y - worldBefore.y) * this._zoom;
        } else {
            this._offsetPan.x -= event.deltaX / this._zoom;
            this._offsetPan.y -= event.deltaY / this._zoom;
        }
    
        if (this._wheelTimeout !== null) {
            clearTimeout(this._wheelTimeout);
        }
        this._wheelTimeout = window.setTimeout(() => {
            this._onMouseWheelEnd();
        }, 500);
    }

    /**
     * Handles the mouse wheel end event.
     * @private
     */
    private _onMouseWheelEnd(): void {
        this.autoSave(false);        
    }

    /**
     * Handles the mouse button down event.
     * Initiates shape dragging or canvas panning.
     * @param event - Mouse event.
     * @private
     */
    private _onMouseDown(event: MouseEvent): void {
        // A drag/pan is about to start: refresh the cached canvas rect once here
        // so the subsequent per-mousemove hit tests read a correct, layout-free
        // rect without forcing a layout on every move.
        this._refreshCanvasRect();

        const clickedSelectedShape = this._getChildrens().find((child: Shape) => child._isClicked());

        if (event.button == 1 && this.configuration.config.pan) {
            this._isPan = true;
            this._lastMousePos = this.worldPosition();
            return;
        }
        
        if (this.exporter.isCutting() || this.exporter.isResizing()) return;

        if (!clickedSelectedShape && this.configuration.config.selection) {
            this.emit("mousedown", this._getArgs(this))
            if (this.transformer.isClickedTransformer()) return;
            const worldPosition = this.worldPosition();
            this.selection.begin(worldPosition);
            return;
        }

        if (!clickedSelectedShape) return;

        this.emit("mousedown", this._getArgs(clickedSelectedShape))
        
        if (clickedSelectedShape && clickedSelectedShape.isSelected) {
            return;
        }

        if (clickedSelectedShape && !clickedSelectedShape.isSelected) {
            this._draggingShape = clickedSelectedShape;
            this._isDragging = false;
            this._wasDragging = false;
            this._mouseDownTime = performance.now();
            this._lastMousePos = this.worldPosition();
            return;
        }
    }

    /**
     * Handles the mouse move event.
     * Updates the mouse position and manages shape dragging and panning.
     * @param event - Mouse event.
     * @private
     */
    private _onMouseMoved(event: MouseEvent): void {
        this._mousePosition.x = event.clientX
        this._mousePosition.y = event.clientY
        if (!this.pointerInWorld(this.mousePosition())) return;

        if (this.selection.isSelecting) {
            this.selection.track(this.worldPosition());
            return;
        }

        if (this.transformer.isDragging || this.transformer.isMovingSelection) {
            this._isDragging = false;
            this._draggingShape = null;
        }

        if (this._draggingShape && !this._isDragging) {
            const currentTime = performance.now();
            const timeSinceMouseDown = currentTime - this._mouseDownTime;
            
            if (timeSinceMouseDown >= this._dragThreshold) {
                this._isDragging = true;
                if (this.configuration.config.snap) {
                    this.snapSmart.bind(this._draggingShape);
                }
            }
        }

        if (this._isDragging && this._draggingShape) {
            const current = this.worldPosition();
            const delta = current.sub(this._lastMousePos);
            this._draggingShape.position.x += delta.x;
            this._draggingShape.position.y += delta.y;
            this._lastMousePos = current;
            this._wasDragging = true;
            this._sceneDirty = true;

            if (this.configuration.config.snap) {
                this.snapSmart.update();
            }
        }

        if (this._isPan && this.configuration.config.pan) {
            const current = this.worldPosition();
            const delta = current.sub(this._lastMousePos);
            this._offsetPan.x += delta.x;
            this._offsetPan.y += delta.y;
            this._lastMousePos = current;
        }

        this.emit("mousemove", this._getArgs(this))
    }

    /**
     * Handles the mouse button up event.
     * Finalizes shape dragging and panning.
     * @private
     */
    private _onMouseUp(): void {
        this.emit("mouseup", this._getArgs(this))

        this.selection.finish();

        if (this._isDragging && this._draggingShape) {
            this._draggingShape.emit("dragend", this._getArgs(this._draggingShape))
            // E5: a completed drag is a user-visible update to the shape's
            // position; broadcast it as an update patch.
            this.emitPatch({
                op: "update",
                id: this._draggingShape.id,
                type: this._draggingShape.type,
                delta: { position: { x: this._draggingShape.position.x, y: this._draggingShape.position.y } },
            });
            this.autoSave(true);
        }

        if (this._isPan) {
            this.autoSave(false);
        }

        this._isDragging = false;
        this._isPan = false;
        this._draggingShape = null;
        this._lastMousePos = Vector.zero;
        this._mouseDownTime = 0;

        if (this.configuration.config.snap) {
            this.snapSmart.unbind();
        }
    }

    /**
     * Handles the mouse click event.
     * Detects single and double clicks on shapes or on the canvas.
     * @private
     */
    private _onMouseClicked(): void {
        if (this.exporter.isCutting() || this.exporter.isResizing()) return;
        let clicked: Shape | null = null

        this._getChildrens().forEach((child: Shape) => {
            if (!child.visible || !child._isClicked() || clicked) return

            child.emit("click", this._getArgs(child))
            clicked = child;
        })

        const now = performance.now();
        const diff = now - this._lastTimeClick;
        if (diff < 300) {
            if (clicked) {
                (clicked as Shape).emit("dblclick", this._getArgs(clicked))

                if (this.configuration.config.transform) {
                    this.transformer.clear();
                    this.transformer.add(clicked);
                }
            } else {
                this.emit("dblclick", this._getArgs(this))
            }
            return;
        }
        this._lastTimeClick = performance.now();

        if (clicked && !this._wasDragging && this.configuration.config.transform) {
            if ((clicked as Shape).isSelected) {
                return;
            }
            
            if (this._isShiftPressed) {
                this.transformer.add(clicked as Shape);
            } else {
                this.transformer.clear();
                this.transformer.add(clicked as Shape);
            }
        }

        this._wasDragging = false;

        this.emit("click", this._getArgs(clicked ?? this))
    }

    /**
     * Handles the context menu event (right click).
     * Prevents the browser's default behavior.
     * @param event - Mouse event.
     * @private
     */
    private _onContextmenu(event: MouseEvent): void {
        event.preventDefault();
    }

    /**
     * Gets the list of all shapes ordered by descending zIndex (top-most first).
     *
     * The sorted array is cached and only rebuilt when the z-order has been
     * invalidated (a shape added/removed, or a shape's zIndex changed), so the
     * render loop and input handlers no longer sort on every call. The returned
     * array is the shared cache — callers MUST NOT mutate it (do not `.reverse()`
     * or `.sort()` it in place); iterate a copy if mutation is needed.
     *
     * @returns Shared, cached list of shapes ordered by descending zIndex.
     * @private
     */
    private _getChildrens(): Shape[] {
        if (this._zOrderDirty || this._zOrderCache === null) {
            this._zOrderCache = Array.from(this.childrens.values()).sort((a, b) => b.zIndex - a.zIndex);
            this._zOrderDirty = false;
        }
        return this._zOrderCache;
    }

    /**
     * Marks the cached z-order (see {@link _getChildrens}) as stale so it is
     * rebuilt on the next read. Called by the {@link RenderManager} on
     * add/remove and by a shape whenever its `zIndex` changes.
     * @internal
     */
    public invalidateZOrder(): void {
        this._zOrderDirty = true;
        // Adding/removing shapes or reordering them is a scene edit, so the next
        // autosave must re-serialize.
        this._sceneDirty = true;
    }

    /**
     * Marks the scene as edited so the next autosave re-serializes instead of
     * skipping as a no-op. Mutations that do not flow through add/remove/z-order
     * (for example transformer moves/resizes) should call this.
     * @internal
     */
    public markDirty(): void {
        this._sceneDirty = true;
    }

    /**
     * Builds the arguments for events.
     * @param child - The shape or renderer associated with the event.
     * @returns Object with event information.
     * @private
     */
    private _getArgs<T>(child: Shape | Render): T {
        return {
            pointer: {
                absolute: this.mousePosition(),
                world: this.worldPosition(),
            },
            target: child,
        } as T
    }

    /**
     * Updates the FPS (frames per second) counter.
     * @private
     */
    private _updateFps() : void {
        const now = performance.now();
        const deltaTime = (now - this._lastFrameTime) / 1000;
        this._frameCount++;

        if (deltaTime >= 1) {
            this._fps = this._frameCount / deltaTime;
            this._frameCount = 0;   
            this._lastFrameTime = now;
        }
    }

    /**
     * Displays the FPS counter in the top-right corner of the canvas.
     * @private
     */
    private _showFps() : void {
        this.ctx.save()
        const measureText = this.ctx.measureText(`FPS: ${this._fps.toFixed(2)}`);
        const textWidth = measureText.width;
        const textHeight = measureText.fontBoundingBoxAscent + measureText.fontBoundingBoxDescent;
        
        // CSS units: the context is DPR-scaled, so position against the CSS size.
        this.ctx.translate(this._cssWidth - textWidth * 1.5 - 10, textHeight + 10);
        
        this.ctx.fillStyle = "white";
        this.ctx.font = "16px Arial";
        this.ctx.fillText(`FPS: ${this._fps.toFixed(2)}`, 0, 0);
        
        this.ctx.restore()
    }

    /**
     * Debounced configuration save to prevent FPS drops during pan/zoom
     * @private
     */
    private _debouncedConfigSave(): void {
        if (this._configSaveTimeout) {
            clearTimeout(this._configSaveTimeout);
        }
        
        this._configSaveTimeout = window.setTimeout(() => {
            this._executeConfigOnlySave();
            this._configSaveTimeout = null;
        }, 150);
    }

    /**
     * Executes configuration-only save without progress callbacks for better FPS
     * @private
     */
    private async _executeConfigOnlySave(): Promise<void> {
        try {
            if (!this.configuration.config.save) return;

            if (this.configuration.config.save === "indexeddb") {
                const configurationTable = this._database?.getTable("configurations");
                if (configurationTable) {
                    await this._saveConfiguration(configurationTable);
                }
            } else if (this.configuration.config.save === "localstorage") {
                localStorage.setItem("canvasConfiguration", JSON.stringify(this.getProperties()));
            }
        } catch (error) {
            console.error('Error in config-only save:', error);
        }
    }

    /**
     * Executes the save operation.
     * @private
     */
    private async _executeSave(history: boolean): Promise<void> {
        try {
            // Dirty-flag fast path: if nothing has changed since the last
            // serialization, skip the whole save — no serialize, no history
            // entry, no storage write. This removes the redundant full-scene
            // `JSON.stringify` on no-op edits. The very first save runs because
            // `_sceneDirty` starts true.
            if (!this._sceneDirty && this._lastSerializedData !== "") {
                return;
            }

            const newData = await this._serializeAsync();
            const serializedString = JSON.stringify(newData);

            const dataHasChanged = serializedString !== this._lastSerializedData;

            // A completed serialization means the scene is clean until the next
            // edit flips the flag again.
            this._sceneDirty = false;

            this._saveCounter++;

            if (history) {
                this.history.save(newData);
            }

            if (!this.configuration.config.save) {
                // Even with no storage backend, remember the serialized form so
                // the dirty-flag fast path can short-circuit future no-op saves.
                this._lastSerializedData = serializedString;
                return;
            }

            if (this.configuration.config.save === "localstorage") {
                await this._saveToLocalStorage(serializedString, dataHasChanged);
            } else if (this.configuration.config.save === "indexeddb") {
                await this._saveToIndexedDB(newData, dataHasChanged);
            }

            this._lastSerializedData = serializedString;

        } catch (error) {
            console.error('Error in _executeSave:', error);
        }
    }

    /**
     * Serializes the canvas data asynchronously.
     * @private
     */
    private async _serializeAsync(): Promise<ShapeRawData[]> {
        return new Promise((resolve) => {
            if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => {
                    resolve(this.serialize());
                });
            } else {
                setTimeout(() => {
                    resolve(this.serialize());
                }, 0);
            }
        });
    }

    /**
     * Save optimized for localStorage
     * @private
     */
    private async _saveToLocalStorage(serializedString: string, dataHasChanged: boolean): Promise<void> {
        const sizeKB = serializedString.length / 1024;
        
        if (this._saveCounter % 10 === 0) {
            console.log(`Save #${this._saveCounter} - Size: ${sizeKB.toFixed(2)} KB`);
        }

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                try {
                    if (dataHasChanged) {
                        localStorage.setItem("canvasData", serializedString);
                    }
                    localStorage.setItem("canvasConfiguration", JSON.stringify(this.getProperties()));
                    resolve();
                } catch (error) {
                    console.error('Error saving to localStorage:', error);
                    resolve();
                }
            }, 0);
        });
    }

    /**
     * Save optimized for IndexedDB using web workers
     * @private
     */
    private async _saveToIndexedDB(newData: ShapeRawData[], dataHasChanged: boolean): Promise<void> {
        try {
            const table = this._database?.getTable("nodes");
            const configurationTable = this._database?.getTable("configurations");
            
            if (!configurationTable || !table) {
                console.warn('Database tables not available');
                return;
            }

            const progressCallback = this.onSavingProgress;
            
            if (progressCallback) {
                progressCallback({ p: 0, state: true });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (dataHasChanged) {
                await table.putMany(newData, true, 50, progressCallback ? (progress) => {
                    progressCallback({ p: progress.p * 0.9, state: true });
                } : undefined);

                if (progressCallback) {
                    progressCallback({ p: 0.95, state: true });
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else if (progressCallback) {
                progressCallback({ p: 0.95, state: true });
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            await this._saveConfiguration(configurationTable);
            
            if (progressCallback) {
                await new Promise(resolve => setTimeout(resolve, 100));
                progressCallback({ p: 1, state: false });
            }

        } catch (error) {
            console.error('Error saving to IndexedDB:', error);
            if (this.onSavingProgress) {
                this.onSavingProgress({ p: 0, state: false });
            }
        }
    }

    /**
     * Save configuration optimized
     * @private
     */
    private async _saveConfiguration(configurationTable: Table<ConfigurationSchema>): Promise<void> {
        try {
            const configData: ConfigurationSchema = { id: "data", ...this.getProperties() };

            await configurationTable.put(configData);
        } catch (error) {
            console.error('Error saving configuration:', error);
        }
    }

    /**
     * Clears the canvas to prepare it for the next frame.
     * @private
     */
    private _clear(): void {
        // The context is scaled by the DPR (see `resize`), so clear in CSS units.
        this.ctx.clearRect(0, 0, this._cssWidth, this._cssHeight)
    }

    /**
     * Main rendering function called on each animation frame.
     * Updates the camera, renders all shapes, and displays the FPS.
     */
    public _render(): void {
        this._clear()

        this.ctx.save()
        this.ctx.translate(this._globalPosition.x, this._globalPosition.y)
        this.ctx.scale(this._zoom, this._zoom)

        this.currentCamera.update()

        // Draw back-to-front: iterate the descending-zIndex cache in reverse
        // WITHOUT mutating it (the array is shared — a `.reverse()` here would
        // corrupt the cache read by the input handlers).
        const ordered = this._getChildrens();
        for (let i = ordered.length - 1; i >= 0; i--) {
            ordered[i]!.update()
        }

        if (this.configuration.config.snap) {
            this.snapSmart.drawGuides()
        }

        this.transformer.update()
        this.selection.update()
        this.ctx.restore()

        this.ctx.save()

        if (this.showFps) {
            this._updateFps()
            this._showFps()
        }

        this.exporter.update()
        this.ctx.restore()

        this.emit("update", {})
        this._frameId = requestAnimationFrame(this._renderBound)
    }

    /**
     * Gets the currently dragged shape.
     * @returns The currently dragged shape, or null if no shape is being dragged.
     */
    public get draggingShape(): Shape | null {
        return this._draggingShape;
    }

    /**
     * Gets the current zoom factor.
     * @returns The zoom factor.
     */
    public get zoom(): number {
        return this._zoom;
    }

    /**
     * Gets the current offset pan.
     * @returns The offset pan.
     */
    public get offsetPan(): Vector {
        return this._offsetPan;
    }

    /**
     * Gets the list of all shapes present on the canvas.
     * @returns List of shapes ordered by zIndex.
     */
    public get childs(): Shape[] {
        // Return a copy so external callers cannot mutate the shared z-order cache.
        return [...this._getChildrens()];
    }

    /**
     * Gets the database instance associated with this render.
     * @returns The database instance.
     */
    public get database(): Database<RenderDatabaseSchema> | null {
        return this._database;
    }

    /**
     * Gets a copy of the current global canvas position used for panning.
     * Returns a copy so external callers cannot mutate internal state.
     * @returns A copied {@link Vector} of the global position.
     */
    public get globalPosition(): Vector {
        return this._globalPosition.copy();
    }

    /**
     * Gets the current z-index bounds across all shapes.
     * @returns A readonly object with the `min` and `max` z-index values.
     */
    public get zIndexRange(): { readonly min: number; readonly max: number } {
        return { min: this.manager.minZIndex, max: this.manager.maxZIndex };
    }
    
    /**
     * Allows the display of the FPS counter.
     */
    public allowFps(): void {
        this.showFps = true;
    }

    /**
     * Disallows the display of the FPS counter.
     */
    public disallowFps(): void {
        this.showFps = false;
    }

    /**
     * Sets the properties of the renderer.
     * @param properties - Object containing the properties to set.
     */
    public setProperties(props: Partial<RenderProperties>) {
        if (!props) return;

        // View-state is a trust boundary too (it comes from localStorage /
        // IndexedDB). Validate so a corrupt store can never set a NaN zoom or a
        // malformed camera position; invalid fields are dropped, not applied.
        const safe = validateProperties(props);

        if (safe.zoom !== undefined) {
            this._zoom = safe.zoom;
        }
        if (safe.globalPosition !== undefined) {
            this._globalPosition = new Vector(safe.globalPosition.x, safe.globalPosition.y);
        }
        if (safe.offsetPan !== undefined) {
            this._offsetPan = new Vector(safe.offsetPan.x, safe.offsetPan.y);
        }
    }

    /**
     * @internal
     * Prepares the renderer for export by hiding the transformer and disallowing the FPS counter.
     */
    public preExport(): void {
        this.transformer.hide();
        this.disallowFps();
        this.snapSmart.unbind();
        this.selection.reset();
        this._render();
    }

    /**
     * @internal
     * Restores the renderer after export by showing the transformer and allowing the FPS counter.
     */
    public postExport(): void {
        this.transformer.show();
        this.allowFps();
    }

    /**
     * Gets the current properties of the renderer.
     * @returns Object containing the current zoom, global position, and offset pan.
     */
    public getProperties(): RenderProperties {
        return {
            zoom: this._zoom,
            globalPosition: this._globalPosition,
            offsetPan: this._offsetPan
        };
    }

    /**
     * Adjusts the canvas backing store to match its on-screen (CSS) size,
     * accounting for the device pixel ratio so rendering stays crisp on HiDPI
     * displays and matches the DPR-scaled export path.
     *
     * The backing store is sized to `cssSize * devicePixelRatio`, the CSS size is
     * left untouched (the element still occupies the same box on screen), and the
     * context is scaled by the DPR so all drawing code keeps working in CSS
     * pixels. `pointerInWorld` therefore compares against the CSS size, not the
     * raw backing-store size.
     */
    public resize(): void {
        const rect = this._refreshCanvasRect();
        const { width, height } = rect;
        const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;

        // Backing store in device pixels for sharpness.
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);

        // Map CSS pixels -> device pixels so all drawing stays in CSS units.
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Returns the cached canvas bounding rect, computing it once if the cache is
     * empty. Callers in the hot path (hit tests, coordinate conversions) use this
     * instead of calling `getBoundingClientRect()` directly, which forces a
     * synchronous layout.
     * @returns The cached {@link DOMRect} for the canvas.
     * @private
     */
    private _getCanvasRect(): DOMRect {
        if (this._canvasRect === null) {
            this._canvasRect = this.canvas.getBoundingClientRect();
        }
        return this._canvasRect;
    }

    /**
     * Recomputes and stores the canvas bounding rect. Called on
     * resize/scroll/orientationchange and at drag start — the moments the
     * canvas's on-screen box can actually move.
     * @returns The freshly measured {@link DOMRect}.
     * @private
     */
    private _refreshCanvasRect(): DOMRect {
        this._canvasRect = this.canvas.getBoundingClientRect();
        return this._canvasRect;
    }

    /**
     * The on-screen (CSS) width of the canvas, independent of the DPR-scaled
     * backing store. All drawing/interaction math works in CSS pixels because
     * the context is scaled by the DPR in {@link resize}; use this instead of
     * `canvas.width` (which now holds device pixels).
     */
    public get cssWidth(): number {
        return this._getCanvasRect().width;
    }

    /**
     * The on-screen (CSS) height of the canvas, independent of the DPR-scaled
     * backing store. See {@link cssWidth}.
     */
    public get cssHeight(): number {
        return this._getCanvasRect().height;
    }

    /** Internal alias kept for the hot-path call sites. @private */
    private get _cssWidth(): number {
        return this.cssWidth;
    }

    /** Internal alias kept for the hot-path call sites. @private */
    private get _cssHeight(): number {
        return this.cssHeight;
    }

    /**
     * The device pixel ratio the backing store was scaled by in {@link resize}.
     * Export reads the backing store (device pixels), so it multiplies CSS crop
     * coordinates by this to address the correct source region.
     */
    public get devicePixelRatio(): number {
        return (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    }

    /**
     * Gets the current mouse position in absolute window coordinates.
     * @returns Vector with the mouse position.
     */
    public mousePosition(): Vector {
        return this._mousePosition;
    }

    /**
     * Gets the mouse position relative to the canvas.
     * @returns Vector with the relative mouse position.
     */
    public relativePosition(): Vector {
        const { left, top } = this._getCanvasRect()
        return this.mousePosition().sub(new Vector(left, top));
    }

    /**
     * Gets the mouse position in world coordinates (taking into account zoom and panning).
     * @returns Vector with the world position.
     */
    public worldPosition(): Vector {
        return this.toWorldCoordinates(this.mousePosition());
    }

    /**
     * Converts an absolute position to world coordinates.
     * @param vector - Vector with absolute coordinates.
     * @returns Vector with world coordinates.
     */
    public toWorldCoordinates(vector: Vector): Vector {
        const rect = this._getCanvasRect()
        const x = vector.x - rect.left
        const y = vector.y - rect.top
        return new Vector((x - this._globalPosition.x) / this._zoom, (y - this._globalPosition.y) / this._zoom)
    }

    /**
     * Converts a world position to screen coordinates.
     * @param vector - Vector with world coordinates.
     * @returns Vector with screen coordinates.
     */
    public toScreenCoordinates(vector: Vector): Vector {
        return new Vector(vector.x - this.currentCamera.offset.x, vector.y - this.currentCamera.offset.y);
    }

    /**
     * Converts a world position to absolute coordinates.
     * @param vector - Vector with world coordinates.
     * @returns Vector with absolute coordinates.
     */
    public toAbsoluteCoordinates(vector: Vector): Vector {
        const rect = this._getCanvasRect()
        const x = vector.x * this._zoom + this._globalPosition.x
        const y = vector.y * this._zoom + this._globalPosition.y
        return new Vector(x + rect.left, y + rect.top)
    }

    /**
     * Converts a world position to relative coordinates.
     * @param vector - Vector with world coordinates.
     * @returns Vector with relative coordinates.
     */
    public toRelativeCoordinates(vector: Vector): Vector {
        const rect = this._getCanvasRect()
        const x = vector.x
        const y = vector.y
        return new Vector(x - rect.left, y - rect.top)
    }

    /**
     * Determines if a point is within the visible area of the canvas.
     * @param pointer - Vector with the position to check.
     * @returns true if the point is inside the canvas, false otherwise.
     */
    public pointerInWorld(pointer: Vector): boolean {
        const { left, top } = this._getCanvasRect()
        const x = pointer.x - left
        const y = pointer.y - top
        // Compare against the on-screen (CSS) size. The backing store is now
        // DPR-scaled (see `resize`), so `canvas.width/height` are device pixels
        // and would over-report the hit region on HiDPI displays.
        return x >= 0 && x <= this._cssWidth && y >= 0 && y <= this._cssHeight
    }

    /**
     * Gets the offset pan.
     * @returns Vector with the offset pan.
     */
    public getOffset(): Vector {
        return this.currentCamera.offset.sub(this._offsetPan);
    }

    /**
     * Método para forzar save inmediato (útil para casos específicos)
     */
    public forceSave(): void {
        this.autoSave(true);
    }


    /**
     * Undoes the last operation in history.
     */
    public undo(): void {
        this.history.undo()
    }

    /**
     * Redoes the last undone operation.
     */
    public redo(): void {
        this.history.redo()
    }

    public async getSizeData(format: "mb" | "kb" | "bytes"): Promise<number | null> {
        let sizeMB = null;
        if (this.configuration.config.save === "localstorage") {
            sizeMB = new Blob([JSON.stringify(this.serialize())]).size / (1024 * 1024);
        } else if(this.configuration.config.save === "indexeddb") {
            sizeMB = await this.database?.getDatabaseSizeMB() ?? 0;
        }

        if (sizeMB && format === "mb") return sizeMB;
        if (sizeMB && format === "kb") return sizeMB * 1024;
        if (sizeMB && format === "bytes") return sizeMB * 1024 * 1024;

        return sizeMB
    }

    /**
     * Automatically saves the current state of the canvas.
     * @param history - If true, adds the save to history; otherwise just saves without adding to history.
     */
    public autoSave(history: boolean = true): void {
        if (!history) {
            this._debouncedConfigSave();
        } else {
            this._executeSave(history);
        }
    }

    /**
     * Loads the canvas state from serialized data.
     * @param defaultData - Serialized shape data.
     */
    public async load(defaultData?: ShapeRawData[]): Promise<void> {
        if (defaultData) {
            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 0, state: true });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this.emit("load", { data: defaultData });
            
            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 0.5, state: true });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this.deserialize(defaultData);
            
            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 0.9, state: true });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this._lastSerializedData = JSON.stringify(defaultData);
            
            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 1, state: false });
            }
            
            return;
        }

        if (!this.configuration.config.save) return;
        if (typeof window === "undefined") {
            console.warn("Render.load(): No browser environment (localStorage/cookies not available).");
            return;
        }
    
        let data: ShapeRawData[] | null = null;
    
        try {
            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 0, state: true });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (this.configuration.config.save === "localstorage") {
                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.2, state: true });
                }

                const localData = localStorage.getItem("canvasData");
                if (localData) {
                    data = JSON.parse(localData);
                }

                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.5, state: true });
                }

                const localConfiguration = localStorage.getItem("canvasConfiguration");
                if (localConfiguration) {
                    this.setProperties(JSON.parse(localConfiguration));
                }

                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.7, state: true });
                }
            } else if (this.configuration.config.save === "indexeddb" && this._database) {
                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.2, state: true });
                }

                const data0 = await this._database.get("nodes")?.getAll();
                
                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.5, state: true });
                }

                const data1 = await this._database.get("configurations")?.getAll();
                
                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.7, state: true });
                }

                if (data0) {
                    data = data0;
                }

                if (data1 && data1[0]) {
                    this.setProperties(data1[0]);
                }
            }
    
            if (data && Array.isArray(data)) {
                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.8, state: true });
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                this.emit("load", { data });
                this.deserialize(data);
                this.history.save(data);
                
                if (this.onLoadProgress) {
                    this.onLoadProgress({ p: 0.95, state: true });
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                this._lastSerializedData = JSON.stringify(data);
            }

            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 1, state: false });
            }
        } catch (error) {
            console.error("Error loading canvas data:", error);
            if (this.onLoadProgress) {
                this.onLoadProgress({ p: 0, state: false });
            }
        }
    }
    

    /**
     * Serializes all shapes on the canvas to JSON format.
     * @returns Array of serialized shape data.
     */
    public serialize(): ShapeRawData[] {
        return Array.from(this.childrens.values()).map((child: Shape) => child._rawData());
    }

    /**
     * Recreates shapes from serialized data.
     *
     * Input is validated at this trust boundary (localStorage / IndexedDB /
     * explicit `load(defaultData)`): malformed shapes are repaired when a safe
     * default exists and dropped (with a warning) otherwise, so a corrupt store
     * can never produce `NaN` geometry or brick the editor.
     *
     * @param data - Serialized shape data (untrusted).
     */
    public deserialize(data: ShapeRawData[]): void {
        this.childrens.clear();
        this.invalidateZOrder();
        this._sceneDirty = true;
        const validated = validateShapes(data, {
            allowRemoteImages: this.configuration.config.allowRemoteImages ?? false,
        });
        validated.forEach((child: ShapeRawData) => {
            if (child.type === "rect") {
                Rect._fromRawData(child as RectRawData, this);
            } else if (child.type === "circle") {
                Circle._fromRawData(child as CircleRawData, this);
            } else if (child.type === "text") {
                Text._fromRawData(child as TextRawData, this);
            } else if (child.type === "image") {
                Image._fromRawData(child as ImageRawData, this);
            } else if (child.type === "line") {
                Line._fromRawData(child as LineRawData, this);
            } else if (child.type === "arrow") {
                Arrow._fromRawData(child as ArrowRawData, this);
            } else if (child.type === "polygon") {
                Polygon._fromRawData(child as PolygonRawData, this);
            } else if (child.type === "path") {
                Path._fromRawData(child as PathRawData, this);
            } else if (child.type === "pen") {
                Pen._fromRawData(child as PenRawData, this);
            }
            // Unknown types never reach here: validateShapes drops them with a
            // warn (forward-compat — a future schema's type is skipped, not thrown).
        });
    }

    /**
     * The serialized document schema version this build writes. Bumped to `2`
     * for the E2 shape additions (line/arrow/polygon/path/pen). A loader treats
     * an absent version as `1`; unknown shape `type`s are skipped with a warn
     * rather than throwing, so newer documents degrade gracefully in older code.
     */
    public static readonly schemaVersion: number = 2;

    /**
     * @internal
     * Emits a granular `patch` event (E5) describing a single scene mutation,
     * unless a remote patch is currently being applied (in which case the change
     * is suppressed to avoid a sync feedback loop). Call from add/update/remove
     * sites that want to participate in the change-stream.
     *
     * @param patch - The change to broadcast.
     */
    public emitPatch(patch: Patch): void {
        if (this._applyingRemote) return;
        this.emit("patch", patch);
    }

    /**
     * Applies a remote {@link Patch} to the local scene without re-emitting a
     * `patch` event (loop-safe), so two peers exchanging patches do not ping-pong
     * forever. Supports `add`, `update`, and `remove` operations.
     *
     * - `add`: instantiates a shape from `delta` (which must carry enough raw
     *   data, including `type`). Untrusted deltas are validated the same way as
     *   `deserialize`.
     * - `update`: shallow-applies `delta` fields to the existing shape's raw data
     *   and rebuilds it in place (id preserved).
     * - `remove`: destroys the shape with the given id if present.
     *
     * @param patch - The remote change to apply.
     */
    public applyPatch(patch: Patch): void {
        this._applyingRemote = true;
        try {
            if (patch.op === "remove") {
                const existing = this.childrens.get(patch.id);
                if (existing) existing.destroy();
                return;
            }

            if (patch.op === "add") {
                if (!patch.delta) return;
                const raw = { ...patch.delta, id: patch.id, type: patch.type } as ShapeRawData;
                this._instantiateFromRaw(raw);
                return;
            }

            // update: merge delta onto the current raw data, then rebuild in place.
            const existing = this.childrens.get(patch.id);
            if (!existing) return;
            const merged = { ...existing._rawData(), ...(patch.delta ?? {}), id: patch.id } as ShapeRawData;
            existing.destroy();
            this._instantiateFromRaw(merged);
        } finally {
            this._applyingRemote = false;
            this.markDirty();
        }
    }

    /**
     * @internal
     * Validates a single raw shape (same trust-boundary policy as
     * {@link deserialize}) and instantiates it, dispatching on `type`. Used by
     * {@link applyPatch}.
     */
    private _instantiateFromRaw(raw: ShapeRawData): Shape | null {
        const [validated] = validateShapes([raw], {
            allowRemoteImages: this.configuration.config.allowRemoteImages ?? false,
        });
        if (!validated) return null;
        switch (validated.type) {
            case "rect": return Rect._fromRawData(validated as RectRawData, this);
            case "circle": return Circle._fromRawData(validated as CircleRawData, this);
            case "text": return Text._fromRawData(validated as TextRawData, this);
            case "image": return Image._fromRawData(validated as ImageRawData, this);
            case "line": return Line._fromRawData(validated as LineRawData, this);
            case "arrow": return Arrow._fromRawData(validated as ArrowRawData, this);
            case "polygon": return Polygon._fromRawData(validated as PolygonRawData, this);
            case "path": return Path._fromRawData(validated as PathRawData, this);
            case "pen": return Pen._fromRawData(validated as PenRawData, this);
            default: return null;
        }
    }

    /**
     * Loads a new configuration for the renderer.
     * @param config - Configuration object.
     */
    public async loadConfiguration(config: Partial<RenderConfigurationProps>): Promise<void> {
        this.configuration.load(config)
        
        if (this.configuration.config.save === "indexeddb") {
            const database = new Database<{}>('myDatabase', 1)
                .createTable<"nodes", NodeSchema>({
                    name: "nodes",
                    primary: "id",
                })
                .createTable<"configurations", ConfigurationSchema>({
                    name: "configurations",
                    primary: "id",
                });

            this._database = database;

            await this._database.init();
        }

        await this.load()
    }

    /**
     * Generates a random integer within a specified range.
     * @param min - Minimum value (inclusive).
     * @param max - Maximum value (inclusive).
     * @returns Random integer.
     */
    public static randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Generates a random float within a specified range.
     * @param min - Minimum value (inclusive).
     * @param max - Maximum value (exclusive).
     * @returns Random float.
     */
    public static randomFloat(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /**
     * Performs linear interpolation between two values.
     * @param start - Initial value.
     * @param end - Final value.
     * @param t - Interpolation factor (0-1).
     * @returns Interpolated value.
     */
    public static lerp(start: number, end: number, t: number): number {
        return start + (end - start) * t;
    }

    /**
     * Starts the rendering loop.
     */
    public start(): void {
        if (this._frameId !== null) return
        this._frameId = requestAnimationFrame(this._renderBound)
    }

    /**
     * Stops the rendering loop.
     */
    public stop(): void {
        if (this._frameId === null) return
        cancelAnimationFrame(this._frameId)
        this._frameId = null
    }

    /**
     * Tears down the renderer: cancels the animation frame, clears pending
     * timeouts, removes every DOM listener from the exact target it was added
     * to, destroys every sub-component, and closes the database (terminating its
     * worker). This is the real teardown; prefer `await render.destroy()`.
     *
     * @returns A promise that resolves once the database has been closed.
     */
    public async destroy(): Promise<void> {
        if (this._frameId !== null) {
            cancelAnimationFrame(this._frameId);
            this._frameId = null;
        }

        if (this._configSaveTimeout !== null) {
            clearTimeout(this._configSaveTimeout);
            this._configSaveTimeout = null;
        }

        if (this._wheelTimeout !== null) {
            clearTimeout(this._wheelTimeout);
            this._wheelTimeout = null;
        }

        this._removeListeners();

        this._activePointers.clear();
        this._lastPinchDistance = null;
        this._lastTouchCenter = null;

        this.transformer.destroy();
        this.exporter.destroy();
        this.configuration.destroy();

        if (this._database) {
            await this._database.close();
            this._database = null;
        }
    }

    /**
     * Cleans up all resources and removes event listeners.
     * Should be called before removing the renderer instance.
     *
     * @deprecated Synchronous alias for {@link destroy}. It kicks off teardown
     * (including the asynchronous database close) without awaiting it; call
     * `await render.destroy()` when you need to know teardown has finished.
     */
    public cleanup(): void {
        void this.destroy();
    }
}