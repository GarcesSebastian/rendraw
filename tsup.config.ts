import { defineConfig } from "tsup";

/**
 * Dual ESM + CJS build with type declarations.
 *
 * The CLI flags in the `build` script mirror this config; keeping the file lets
 * `tsup` pick up consistent options when invoked without flags and documents
 * the packaging intent. `tsc --noEmit` remains the strict type gate (run first
 * by the `build` script); tsup only bundles and emits `.d.ts`.
 */
export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
});
