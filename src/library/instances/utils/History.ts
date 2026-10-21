import { Render } from "../../Render";
import { ShapeRawData } from "../Shape";

/** Default maximum number of snapshots kept in the history stack. */
export const DEFAULT_HISTORY_MAX_ENTRIES = 100;

/**
 * History management class for undo/redo operations.
 * Keeps track of canvas state changes and allows reverting to previous states.
 *
 * The stack is bounded: at most {@link maxEntries} snapshots are retained (and,
 * when configured, at most {@link maxBytes} of serialized snapshot data). When a
 * new snapshot would exceed a cap, the oldest snapshots are evicted and the
 * current index is shifted so undo/redo stay consistent.
 *
 * @example
 * ```ts
 * const history = new History(render);
 * history.start();
 * ```
 */
export class History {
    /** Reference to the main render context. */
    private _render: Render;

    /** Array of serialized canvas states (snapshots). */
    private _history: ShapeRawData[][] = [];
    /** Current position in history stack. */
    private _index: number = -1;

    /** Maximum number of snapshots retained. Oldest are evicted past this. */
    private _maxEntries: number;
    /**
     * Optional cap on the total serialized size (in bytes) of all retained
     * snapshots. `null` disables the size cap. Each snapshot's byte size is
     * tracked alongside it so eviction does not re-serialize.
     */
    private _maxBytes: number | null;
    /** Per-snapshot serialized byte sizes, parallel to {@link _history}. */
    private _sizes: number[] = [];
    /** Running total of {@link _sizes}. */
    private _totalBytes: number = 0;

    /**
     * Creates a new History instance.
     * @param render - The main Render context to track history for.
     * @param options - Optional caps for the history stack.
     * @param options.maxEntries - Max snapshots to retain (default 100).
     * @param options.maxBytes - Optional cap on total serialized bytes.
     */
    public constructor (
        render: Render,
        options?: { maxEntries?: number | undefined; maxBytes?: number | null | undefined }
    ) {
        this._render = render;

        const requested = options?.maxEntries ?? DEFAULT_HISTORY_MAX_ENTRIES;
        // A cap below 1 would make undo/redo meaningless; clamp to at least 1.
        this._maxEntries = Number.isFinite(requested) && requested >= 1
            ? Math.floor(requested)
            : DEFAULT_HISTORY_MAX_ENTRIES;

        const bytes = options?.maxBytes;
        this._maxBytes = typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0
            ? bytes
            : null;

        this.start();
    }

    /**
     * The maximum number of snapshots this history retains.
     */
    public get maxEntries(): number {
        return this._maxEntries;
    }

    /**
     * The configured maximum total serialized size in bytes, or `null` if the
     * size cap is disabled.
     */
    public get maxBytes(): number | null {
        return this._maxBytes;
    }

    /**
     * The current number of snapshots retained in the stack.
     */
    public get length(): number {
        return this._history.length;
    }

    /**
     * The current position in the history stack.
     */
    public get index(): number {
        return this._index;
    }

    /**
     * Initializes history tracking by setting up event listeners.
     * Listens for save, undo, and redo events from the renderer.
     */
    public start(): void {
        this._render.on("undo", () => {
            this.undo();
        })

        this._render.on("redo", () => {
            this.redo();
        })
    }

    /**
     * Saves the current canvas state to the history stack.
     * Clears any future history if saving from a point in the past, then applies
     * the entry/byte caps by evicting the oldest snapshots.
     * @param data - Array of shape raw data representing the current canvas state.
     */
    public save(data: ShapeRawData[]): void {
        this._index++;

        // Saving from a point in the past discards the redo future.
        if (this._index < this._history.length) {
            this._truncateFrom(this._index);
        }

        const serialized = JSON.stringify(data);
        const snapshot = JSON.parse(serialized) as ShapeRawData[];
        const size = serialized.length;

        this._history[this._index] = snapshot;
        this._sizes[this._index] = size;
        this._totalBytes += size;

        this._enforceCaps();
    }

    /**
     * Reverts to the previous canvas state.
     * Does nothing if at the beginning of the history stack.
     */
    public undo(): void {
        if (this._index <= 0) return;
        this._index--;
        const historyState = JSON.parse(JSON.stringify(this._history[this._index]));
        this._render.deserialize(historyState);
    }

    /**
     * Advances to the next canvas state if available.
     * Does nothing if at the end of the history stack.
     */
    public redo(): void {
        if (this._index >= this._history.length - 1) return;
        this._index++;
        const historyState = JSON.parse(JSON.stringify(this._history[this._index]));
        this._render.deserialize(historyState);
    }

    /**
     * Drops every snapshot from `index` (inclusive) to the end, keeping the byte
     * accounting in sync.
     * @private
     */
    private _truncateFrom(index: number): void {
        for (let i = index; i < this._history.length; i++) {
            this._totalBytes -= this._sizes[i] ?? 0;
        }
        this._history = this._history.slice(0, index);
        this._sizes = this._sizes.slice(0, index);
    }

    /**
     * Evicts the oldest snapshots until both the entry-count cap and the
     * optional byte cap are satisfied, shifting {@link _index} by the number
     * evicted so it keeps pointing at the same snapshot. At least one snapshot
     * (the current one) is always retained.
     * @private
     */
    private _enforceCaps(): void {
        let evicted = 0;

        // Entry-count cap.
        while (this._history.length - evicted > this._maxEntries) {
            this._totalBytes -= this._sizes[evicted] ?? 0;
            evicted++;
        }

        // Byte cap (never evict the final/current snapshot).
        if (this._maxBytes !== null) {
            while (
                this._totalBytes > this._maxBytes &&
                this._history.length - evicted > 1
            ) {
                this._totalBytes -= this._sizes[evicted] ?? 0;
                evicted++;
            }
        }

        if (evicted === 0) return;

        this._history = this._history.slice(evicted);
        this._sizes = this._sizes.slice(evicted);
        // Shift the cursor so it still references the same logical snapshot,
        // clamped to the surviving range.
        this._index = Math.max(0, this._index - evicted);
    }
}
