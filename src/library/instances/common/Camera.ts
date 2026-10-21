import { Render } from "../../Render";
import { Vector } from "../common/Vector";
import { Shape } from "../Shape";

/**
 * Camera class for controlling view position within the canvas.
 * Handles smooth camera movement and position binding.
 *
 * @example
 * ```ts
 * const camera = new Camera(render);
 * camera.bind(new Vector(100, 100));
 * ```
 */
export class Camera {
    /** Reference to the main render context. */
    private _render: Render;   
    
    /** Current camera offset position. */
    public offset: Vector;
    /** Target offset position when camera is bound. */
    public maxOffset: Vector;

    /** Flag indicating whether camera is bound to a position. */
    private _binded: boolean = false;
    /** The instance that the camera is bound to. */
    private _instance: Shape | null = null;
    /** Interpolation speed for smooth camera movement. */
    private _speed: number = 0.1;
    
    /**
     * Creates a new Camera instance.
     * @param render - The main Render context.
     */
    public constructor(render: Render) {
        this.offset = Vector.zero;
        this.maxOffset = Vector.zero;
        this._render = render;
    }

    /**
     * Gets the instance that the camera is bound to.
     * @returns The instance that the camera is bound to, or `null` if not bound.
     */
    public get instance(): Shape | null {
        return this._instance;
    }

    /**
     * Updates camera position using linear interpolation if bound to a position.
     * Should be called on each animation frame.
     */
    public update(): void {
        if (this._binded) {
            this.offset.x = Render.lerp(this.offset.x, this.maxOffset.x, this._speed);
            this.offset.y = Render.lerp(this.offset.y, this.maxOffset.y, this._speed);
        } else {
            this.offset.x = Render.lerp(this.offset.x, Vector.zero.x, this._speed);
            this.offset.y = Render.lerp(this.offset.y, Vector.zero.y, this._speed);
        }

        if (this._instance) {
            this.bind(this._instance.position);
        }
    }

    /**
     * Binds camera to a specific world position.
     * Calculates offset to keep the bound position centered in view.
     * 
     * @param pointer - The world position to bind to.
     */
    public bind(pointer: Vector): void {
        this.maxOffset.x = pointer.x - this._render.cssWidth / 2;
        this.maxOffset.y = pointer.y - this._render.cssHeight / 2;
        this._binded = true;
    }

    /**
     * Binds camera to a specific shape.
     * Calculates offset to keep the shape centered in view.
     * 
     * @param instance - The shape to bind to.
     */
    public bindForce(instance: Shape): void {
        this._instance = instance;
        this.bind(instance.position);
    }

    /**
     * Unbinds camera from its currently bound position.
     * Camera will maintain its current offset but stop following any point.
     */
    public unbind(): void {
        this._binded = false;
        this._instance = null;
        this.maxOffset = Vector.zero;
    }
}