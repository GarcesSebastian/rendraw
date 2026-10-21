import { describe, it, expect } from "vitest";
import { getWorkerScript } from "../src/library/database/_common/WorkerScript";

/**
 * B1 regression: the IndexedDB worker must never reconstruct code from a string.
 * The old `COMPLEX_QUERY` path built predicates with `new Function(...)` fed by
 * caller-supplied source. This asserts the generated worker source contains no
 * code-execution sink.
 */
describe("WorkerScript has no code-execution sink", () => {
    const source = getWorkerScript();

    it("contains no `new Function`", () => {
        expect(source).not.toMatch(/new\s+Function/);
    });

    it("contains no `eval(`", () => {
        expect(source).not.toMatch(/\beval\s*\(/);
    });

    it("no longer dispatches COMPLEX_QUERY", () => {
        expect(source).not.toContain("COMPLEX_QUERY");
        expect(source).not.toContain("FILTER_LARGE_DATASET");
        expect(source).not.toContain("AGGREGATE");
    });

    it("still handles the bulk operations the worker is for", () => {
        expect(source).toContain("BULK_INSERT");
        expect(source).toContain("BULK_UPDATE");
        expect(source).toContain("BULK_DELETE");
        expect(source).toContain("GET_SIZE");
    });
});
