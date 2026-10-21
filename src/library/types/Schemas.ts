import type { ShapeRawData } from "../instances/Shape";
import type { RenderProperties } from "./Properties";

export interface NodeSchema extends ShapeRawData {
    id: string;
}

export interface ConfigurationSchema extends RenderProperties {
    id: string;
}

/**
 * Concrete database schema used by the {@link Render} persistence layer.
 * Maps each object-store name to its record type so table access is typed
 * end-to-end without `as never`/`as any` casts.
 *
 * Expressed as a `Record` intersection (rather than a plain interface) so it
 * satisfies the `Database` generic constraint `Record<string, TableSchema>`.
 */
export type RenderDatabaseSchema = Record<"nodes", NodeSchema> &
    Record<"configurations", ConfigurationSchema>;
