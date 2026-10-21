/**
 * Trust-boundary validation for externally-sourced data.
 *
 * Rendraw ingests shape data from several places it does not control:
 * `Render.deserialize()` / `Render.load()` (localStorage / IndexedDB) and the
 * clipboard via `RenderConfiguration.pasteNodes()`. Malformed input previously
 * flowed straight into the shape constructors and could produce `NaN` geometry
 * or `undefined` properties.
 *
 * This module parses that input with zod before it reaches a shape. The policy
 * is deliberate and matches the Phase B design:
 *   - **Repair** when a safe default exists (missing `rotation` -> 0,
 *     missing `visible` -> true, non-finite optional number -> default).
 *   - **Drop** (skip, with a `console.warn`) when a required field is missing or
 *     structurally invalid in a way no safe default can fix (unknown `type`,
 *     non-finite `position`, negative/NaN core geometry, invalid image `src`).
 *   - **Never throw** and **never emit `NaN` geometry**.
 *
 * The validators intentionally return plain data shaped like the existing
 * `*RawData` types; callers feed that into the unchanged `_fromRawData` paths,
 * so the on-disk format is untouched.
 */

import { z } from "zod";
import type { ShapeRawData, ShapeType } from "../instances/Shape";
import type { RectRawData } from "../instances/_shapes/Rect";
import type { CircleRawData } from "../instances/_shapes/Circle";
import type { TextRawData } from "../instances/_shapes/Text";
import type { ImageRawData } from "../instances/_shapes/Image";
import type { LineRawData } from "../instances/_shapes/Line";
import type { ArrowRawData } from "../instances/_shapes/Arrow";
import type { PolygonRawData } from "../instances/_shapes/Polygon";
import type { PathRawData } from "../instances/_shapes/Path";
import type { AutoSaveMethods } from "../helpers/Render.config";

/** Known shape type identifiers accepted by the loader. */
const SHAPE_TYPES: readonly ShapeType[] = [
    "circle",
    "rect",
    "text",
    "image",
    "line",
    "arrow",
    "polygon",
    "path",
    "pen",
];

/** A finite number (rejects NaN and +/-Infinity). */
const finite = z.number().finite();

/** A finite number that is also non-negative — used for sizes/radii. */
const finiteNonNegative = finite.min(0);

/** `{ x, y }` with both components finite. Rejects NaN/Infinity geometry. */
const positionSchema = z
    .object({ x: finite, y: finite })
    .transform((p) => ({ x: p.x, y: p.y }));

/**
 * Pattern an image `src` must match to be considered safe to keep: a data-image
 * URL or an http(s) URL. This blocks `javascript:` and `data:text/html` vectors.
 */
const IMAGE_SRC_PATTERN = /^(data:image\/|https?:\/\/)/i;

/** Base fields shared by every shape, with repair-friendly optionals. */
const baseShapeSchema = z.object({
    id: z.string().min(1).optional(),
    position: positionSchema,
    rotation: finite.optional().default(0),
    zIndex: finite.optional().default(0),
    dragging: z.boolean().optional().default(false),
    visible: z.boolean().optional().default(true),
});

/**
 * A color field. Any non-empty string passes through; anything else (missing,
 * empty, or a non-string) is repaired to `fallback` rather than failing the
 * shape. A color is never a reason to drop a shape and can never be `NaN`.
 */
function colorSchema(fallback: string) {
    return z
        .unknown()
        .optional()
        .transform((v) => (typeof v === "string" && v.length > 0 ? v : fallback));
}

const rectSchema = baseShapeSchema.extend({
    type: z.literal("rect"),
    width: finiteNonNegative,
    height: finiteNonNegative,
    color: colorSchema("#000000"),
    borderWidth: finiteNonNegative.optional().default(0),
    borderColor: colorSchema("black"),
    borderRadius: finiteNonNegative.optional().default(0),
});

const circleSchema = baseShapeSchema.extend({
    type: z.literal("circle"),
    radius: finiteNonNegative,
    color: colorSchema("#fff"),
});

const paddingSchema = z
    .object({
        top: finite.optional().default(0),
        right: finite.optional().default(0),
        bottom: finite.optional().default(0),
        left: finite.optional().default(0),
    })
    .optional()
    .default({ top: 0, right: 0, bottom: 0, left: 0 });

const textSchema = baseShapeSchema.extend({
    type: z.literal("text"),
    // Text is never dropped for its content: missing -> "", non-string -> String(v).
    text: z
        .unknown()
        .optional()
        .transform((v) => (v == null ? "" : String(v))),
    fontSize: finite.gt(0).optional().default(12),
    fontFamily: z.string().min(1).optional().default("Arial"),
    fontWeight: z.string().min(1).optional().default("normal"),
    fontStyle: z.string().min(1).optional().default("normal"),
    textAlign: z.string().min(1).optional().default("left"),
    color: colorSchema("black"),
    backgroundColor: colorSchema("transparent"),
    borderWidth: finiteNonNegative.optional().default(0),
    borderColor: colorSchema("black"),
    padding: paddingSchema,
    width: finiteNonNegative.optional().default(0),
    height: finiteNonNegative.optional().default(0),
});

const imageSchema = baseShapeSchema.extend({
    type: z.literal("image"),
    src: z.string().regex(IMAGE_SRC_PATTERN, "unsupported image src scheme"),
    width: finiteNonNegative.optional().default(0),
    height: finiteNonNegative.optional().default(0),
    borderWidth: finiteNonNegative.optional().default(0),
    borderColor: colorSchema("black"),
    borderRadius: finiteNonNegative.optional().default(0),
});

/** A relative point with both components finite (rejects NaN/Infinity). */
const relativePointSchema = z.object({ x: finite, y: finite });

const lineSchema = baseShapeSchema.extend({
    type: z.literal("line"),
    to: relativePointSchema,
    color: colorSchema("#000000"),
    width: finiteNonNegative.optional().default(1),
});

const arrowSchema = baseShapeSchema.extend({
    type: z.literal("arrow"),
    to: relativePointSchema,
    color: colorSchema("#000000"),
    width: finiteNonNegative.optional().default(1),
    head: z.enum(["end", "both", "none"]).optional().default("end"),
    headSize: finiteNonNegative.optional().default(10),
});

const polygonSchema = baseShapeSchema.extend({
    type: z.literal("polygon"),
    // A polygon with no finite points is meaningless; require at least one.
    points: z.array(relativePointSchema).min(1),
    closed: z.boolean().optional().default(true),
    fill: colorSchema("transparent"),
    stroke: colorSchema("#000000"),
    strokeWidth: finiteNonNegative.optional().default(1),
});

const pathPointsSchema = z.array(relativePointSchema).min(1);

const pathSchema = baseShapeSchema.extend({
    type: z.literal("path"),
    points: pathPointsSchema,
    color: colorSchema("#000000"),
    width: finiteNonNegative.optional().default(2),
    smoothing: finite.min(0).max(1).optional().default(0.5),
});

const penSchema = baseShapeSchema.extend({
    type: z.literal("pen"),
    points: pathPointsSchema,
    color: colorSchema("#000000"),
    width: finiteNonNegative.optional().default(2),
    smoothing: finite.min(0).max(1).optional().default(0.5),
});

/** Top-level serialized document. `schemaVersion` absent is treated as 1. */
export const documentSchema = z.object({
    schemaVersion: z.number().int().optional(),
    children: z.array(z.unknown()),
});

/**
 * Configuration object validated on load. Unknown keys are ignored; feature
 * flags are optional booleans; `save` must be a known method or absent.
 */
export const configSchema = z
    .object({
        history: z.boolean().optional(),
        pan: z.boolean().optional(),
        zoom: z.boolean().optional(),
        snap: z.boolean().optional(),
        transform: z.boolean().optional(),
        selection: z.boolean().optional(),
        save: z.enum(["localstorage", "indexeddb"]).nullable().optional(),
        allowRemoteImages: z.boolean().optional(),
    })
    .passthrough();

/**
 * View-state (`RenderProperties`) loaded from storage: zoom plus two vectors.
 * Each numeric component must be finite so a corrupt store can never set a
 * `NaN`/`Infinity` zoom or camera position.
 */
const vectorSchema = z.object({ x: finite, y: finite });
// `.catch(undefined)` makes each field independently resilient: a NaN zoom or a
// malformed vector is dropped to `undefined` instead of failing the whole parse,
// so one corrupt field never discards the valid ones.
export const propertiesSchema = z
    .object({
        zoom: finite.optional().catch(undefined),
        globalPosition: vectorSchema.optional().catch(undefined),
        offsetPan: vectorSchema.optional().catch(undefined),
    })
    .passthrough();

/**
 * Validates a stored view-state object. Returns only the finite, well-formed
 * fields; non-finite or malformed fields are dropped with a warning. Never
 * throws. The returned vectors are plain `{x,y}` objects — the caller wraps
 * them in `Vector` as needed.
 */
export function validateProperties(data: unknown): Partial<{
    zoom: number;
    globalPosition: { x: number; y: number };
    offsetPan: { x: number; y: number };
}> {
    const result = propertiesSchema.safeParse(data);
    if (!result.success) {
        console.warn("[rendraw] ignoring malformed view properties", result.error.issues);
        return {};
    }
    const out: Record<string, unknown> = {};
    if (result.data.zoom !== undefined) out.zoom = result.data.zoom;
    if (result.data.globalPosition !== undefined) {
        out.globalPosition = {
            x: result.data.globalPosition.x,
            y: result.data.globalPosition.y,
        };
    }
    if (result.data.offsetPan !== undefined) {
        out.offsetPan = { x: result.data.offsetPan.x, y: result.data.offsetPan.y };
    }
    return out;
}

/** Options controlling how a shape list is validated. */
export interface ValidateShapesOptions {
    /**
     * When false (the default), image shapes with a remote (`http(s)`) `src` are
     * dropped with a warning. Data-URL images are always allowed. See the
     * `allowRemoteImages` config flag (B3).
     */
    allowRemoteImages?: boolean;
    /**
     * When true, a shape missing an `id` is repaired with a freshly generated
     * UUID (used by clipboard paste, which assigns new ids anyway).
     */
    assignMissingIds?: boolean;
}

/**
 * Validates and repairs a single raw shape, returning clean data or `null` when
 * the shape must be dropped. Never throws.
 */
function validateShape(
    raw: unknown,
    options: ValidateShapesOptions
): ShapeRawData | null {
    if (raw == null || typeof raw !== "object") {
        console.warn("[rendraw] dropping shape: not an object", raw);
        return null;
    }

    const type = (raw as { type?: unknown }).type;
    if (typeof type !== "string" || !SHAPE_TYPES.includes(type as ShapeType)) {
        console.warn(`[rendraw] dropping shape: unknown type "${String(type)}"`);
        return null;
    }

    let result;
    switch (type as ShapeType) {
        case "rect":
            result = rectSchema.safeParse(raw);
            break;
        case "circle":
            result = circleSchema.safeParse(raw);
            break;
        case "text":
            result = textSchema.safeParse(raw);
            break;
        case "image":
            result = imageSchema.safeParse(raw);
            break;
        case "line":
            result = lineSchema.safeParse(raw);
            break;
        case "arrow":
            result = arrowSchema.safeParse(raw);
            break;
        case "polygon":
            result = polygonSchema.safeParse(raw);
            break;
        case "path":
            result = pathSchema.safeParse(raw);
            break;
        case "pen":
            result = penSchema.safeParse(raw);
            break;
        default:
            return null;
    }

    if (!result.success) {
        const id = (raw as { id?: unknown }).id;
        console.warn(
            `[rendraw] dropping ${type} shape${id != null ? ` "${String(id)}"` : ""}: ${result.error.issues
                .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
                .join("; ")}`
        );
        return null;
    }

    // The schema produces a plain `{x,y}` position. `ShapeRawData.position` is
    // currently typed as `Vector`, but every `_fromRawData` path only reads
    // `position.x`/`position.y` and re-wraps the value in `new Vector(...)`, so a
    // plain object is correct at runtime. Cast through `unknown` at this boundary.
    const data = result.data as unknown as ShapeRawData & { src?: string };

    // Remote-image gate (B3): drop http(s) images unless explicitly allowed.
    if (
        data.type === "image" &&
        typeof data.src === "string" &&
        /^https?:\/\//i.test(data.src) &&
        !options.allowRemoteImages
    ) {
        console.warn(
            `[rendraw] dropping image shape${
                data.id ? ` "${data.id}"` : ""
            }: remote images are disabled (set allowRemoteImages: true to load "${data.src}")`
        );
        return null;
    }

    if (options.assignMissingIds && !data.id) {
        data.id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    return data;
}

/**
 * Validates and repairs an array of raw shapes. Unknown/invalid shapes are
 * dropped (with a warning). The returned array only contains well-formed shapes
 * with finite geometry. Never throws.
 */
export function validateShapes(
    data: unknown,
    options: ValidateShapesOptions = {}
): ShapeRawData[] {
    if (!Array.isArray(data)) {
        console.warn("[rendraw] shape list is not an array; ignoring", data);
        return [];
    }

    const out: ShapeRawData[] = [];
    for (const raw of data) {
        const validated = validateShape(raw, options);
        if (validated) out.push(validated);
    }
    return out;
}

/** Narrowed, validated raw-data aliases for the typed `_fromRawData` paths. */
export type ValidatedRectRawData = RectRawData;
export type ValidatedCircleRawData = CircleRawData;
export type ValidatedTextRawData = TextRawData;
export type ValidatedImageRawData = ImageRawData;
export type ValidatedLineRawData = LineRawData;
export type ValidatedArrowRawData = ArrowRawData;
export type ValidatedPolygonRawData = PolygonRawData;
export type ValidatedPathRawData = PathRawData;

/**
 * Validates a configuration-like object pulled from storage. Returns a partial
 * configuration containing only recognized keys, or an empty object when the
 * input is unusable. Never throws.
 */
export function validateConfig(
    data: unknown
): Partial<{
    history: boolean;
    pan: boolean;
    zoom: boolean;
    snap: boolean;
    transform: boolean;
    selection: boolean;
    save: AutoSaveMethods;
    allowRemoteImages: boolean;
}> {
    const result = configSchema.safeParse(data);
    if (!result.success) {
        console.warn("[rendraw] ignoring malformed configuration", result.error.issues);
        return {};
    }
    const { history, pan, zoom, snap, transform, selection, save, allowRemoteImages } =
        result.data;
    const out: Record<string, unknown> = {};
    if (history !== undefined) out.history = history;
    if (pan !== undefined) out.pan = pan;
    if (zoom !== undefined) out.zoom = zoom;
    if (snap !== undefined) out.snap = snap;
    if (transform !== undefined) out.transform = transform;
    if (selection !== undefined) out.selection = selection;
    if (save !== undefined) out.save = save as AutoSaveMethods;
    if (allowRemoteImages !== undefined) out.allowRemoteImages = allowRemoteImages;
    return out;
}
