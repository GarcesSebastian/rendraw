// ----------------------------------------------------------------------------
// Public classes
// ----------------------------------------------------------------------------
export { Vector } from "./library/instances/common/Vector";
export { Circle } from "./library/instances/_shapes/Circle";
export { Rect } from "./library/instances/_shapes/Rect";
export { Text } from "./library/instances/_shapes/Text";
export { Image } from "./library/instances/_shapes/Image";
export { Line } from "./library/instances/_shapes/Line";
export { Arrow } from "./library/instances/_shapes/Arrow";
export { Polygon } from "./library/instances/_shapes/Polygon";
export { Path } from "./library/instances/_shapes/Path";
export { Pen } from "./library/instances/_shapes/Pen";
export { Render } from "./library/Render";
export { RenderCreator } from "./library/helpers/Render.creator";

// Factory + environment guard (E6).
export { createRender, EnvironmentError, isBrowserEnvironment } from "./library/createRender";

// Classes consumers legitimately need to annotate against.
export { Shape } from "./library/instances/Shape";
export { Camera } from "./library/instances/common/Camera";
export { Transformer } from "./library/instances/common/Transformer";
export { Exporter } from "./library/instances/utils/Exporter";
export { SnapSmart } from "./library/instances/utils/SnapSmart";
export { History } from "./library/instances/utils/History";
export { Selection } from "./library/instances/utils/Selection";
export { Database } from "./library/database/Database";

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

// Shape interfaces and raw-data types.
export type { IShape, ShapeRawData, ShapeType } from "./library/instances/Shape";
export type { IRect, RectRawData } from "./library/instances/_shapes/Rect";
export type { ICircle, CircleRawData } from "./library/instances/_shapes/Circle";
export type { IText, TextRawData } from "./library/instances/_shapes/Text";
export type { IImage, ImageRawData } from "./library/instances/_shapes/Image";
export type { ILine, LineRawData } from "./library/instances/_shapes/Line";
export type { IArrow, ArrowRawData, ArrowHead } from "./library/instances/_shapes/Arrow";
export type { IPolygon, PolygonRawData } from "./library/instances/_shapes/Polygon";
export type { IPath, PathRawData } from "./library/instances/_shapes/Path";
export type { IPen, PenRawData } from "./library/instances/_shapes/Pen";

// Configuration types.
export type {
    RenderConfigurationProps,
    Keys,
    Properties,
    AutoSaveMethods,
    RenderKeywords,
} from "./library/helpers/Render.config";

// Render view-state properties.
export type { RenderProperties } from "./library/types/Properties";

// Event maps.
export type {
    RenderEventMap,
    RenderEventsType,
    ListenerCallback,
    RenderEventPointer,
    RenderEventPinch,
    PointerKind,
    Patch,
} from "./library/providers/Render.provider";
export type {
    ShapeEventsMap,
    ShapeEventsType,
    ShapeListenerCallback,
} from "./library/providers/Shape.provider";
export type {
    TransformerEventsMap,
    TransformerEventsType,
    TransformerListenerCallback,
} from "./library/providers/Transformer.provider";

// Export (serialization) types.
export type {
    ExportProps,
    ExportFormat,
    ExportQuality,
    ExportSVGProps,
} from "./library/instances/utils/Exporter";

// Transformer configuration type.
export type { ITransformer } from "./library/instances/common/Transformer";

// Database types.
export type {
    TableSchema,
    TableName,
    ITypedTable,
} from "./library/database/Database";
export { Table } from "./library/database/_common/Table";
export type { ITable } from "./library/database/_common/Table";
export type {
    NodeSchema,
    ConfigurationSchema,
    RenderDatabaseSchema,
} from "./library/types/Schemas";
