import { Render } from "../Render";
import { Shape } from "../instances/Shape";

/**
 * Manager class for handling render operations and child shape management
 * Manages the collection of shapes and transformers within a render context
 */
export class RenderManager {
    private _render: Render;

    /** Maximum zIndex value across all shapes. Owned solely by this manager. */
    private _maxZIndex: number = 0;
    /** Minimum zIndex value across all shapes. Owned solely by this manager. */
    private _minZIndex: number = 0;

    /**
     * Creates a new render manager for the given render context
     * @param render - The render instance to manage
     */
    public constructor(render: Render) {
        this._render = render;
    }

    /**
     * Adds a shape to the render context's children collection
     * @param child - The shape to add to the render
     */
    public addChild(child: Shape) : void {
        this._render.childrens.set(child.id, child);
        if (child.zIndex > this._maxZIndex) this._maxZIndex = child.zIndex;
        if (child.zIndex < this._minZIndex) this._minZIndex = child.zIndex;
        this._render.invalidateZOrder();
    }

    /**
     * Removes a shape from the render context's children collection
     * @param child - The shape to remove from the render
     */
    public removeChild(child: Shape) : void {
        this._render.childrens.delete(child.id);
        this._render.invalidateZOrder();
    }

    /**
     * Current maximum zIndex across all shapes.
     */
    public get maxZIndex(): number {
        return this._maxZIndex;
    }

    /**
     * Current minimum zIndex across all shapes.
     */
    public get minZIndex(): number {
        return this._minZIndex;
    }

    /**
     * Raises the top of the z-index range by one and returns the new maximum.
     * Used when promoting a shape to the front.
     */
    public bumpToFront(): number {
        this._maxZIndex += 1;
        return this._maxZIndex;
    }

    /**
     * Lowers the bottom of the z-index range by one and returns the new minimum.
     * Used when sending a shape to the back.
     */
    public bumpToBack(): number {
        this._minZIndex -= 1;
        return this._minZIndex;
    }
}
