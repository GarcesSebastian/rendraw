import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { Database } from "../src/library/database/Database";
import type { Table } from "../src/library/database/_common/Table";

/**
 * De-stringed find/aggregate equivalence (B1).
 *
 * `Table.find`/`aggregate` no longer serialize predicates into the worker via
 * `new Function`. They run on the main thread, which means the predicate keeps
 * its closures. These tests prove:
 *   1. `find` returns exactly the records the predicate accepts, honoring the
 *      optional `limit`, regardless of the (now-ignored) `useWorker` argument.
 *   2. `aggregate` folds over all records on the main thread.
 *   3. A predicate that closes over an outer variable works (the string path
 *      silently lost closures; the main-thread path keeps them).
 */

interface Item {
    id: string;
    n: number;
    tag: string;
}

// The Database constructor spins up a Web Worker from a blob URL. jsdom has
// neither Worker nor URL.createObjectURL, and find/aggregate never use the
// worker anymore, so a no-op stub is enough to construct the Database.
class WorkerStub {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    // Echo a success response so Database.init()'s INIT_DB handshake resolves.
    // find/aggregate never reach the worker (B1), so no query handling is needed.
    postMessage(msg: { id: string }): void {
        queueMicrotask(() => {
            this.onmessage?.({ data: { id: msg.id, success: true, data: "ok" } } as MessageEvent);
        });
    }
    terminate(): void {}
}

let db: Database<{ items: Item }>;
let table: Table<Item>;

beforeEach(async () => {
    vi.stubGlobal("Worker", WorkerStub as unknown as typeof Worker);
    vi.stubGlobal("URL", {
        ...globalThis.URL,
        createObjectURL: () => "blob:stub",
        revokeObjectURL: () => {},
    });

    db = new Database<{ items: Item }>("test-db-" + Math.random().toString(36).slice(2), 1);
    db.createTable<"items", Item>({ name: "items", primary: "id" });
    await db.init();

    table = db.get("items") as unknown as Table<Item>;

    const records: Item[] = [
        { id: "a", n: 1, tag: "x" },
        { id: "b", n: 2, tag: "y" },
        { id: "c", n: 3, tag: "x" },
        { id: "d", n: 4, tag: "y" },
        { id: "e", n: 5, tag: "x" },
    ];
    // useWorker=false to write synchronously via the main-thread batch path.
    await table.putMany(records, false);
});

afterEach(async () => {
    await db.deleteDatabase();
    vi.unstubAllGlobals();
});

describe("Table.find (de-stringed, main thread)", () => {
    it("returns records matching the predicate", async () => {
        const result = await table.find((item) => item.tag === "x");
        expect(result.map((r) => r.id).sort()).toEqual(["a", "c", "e"]);
    });

    it("honors the limit argument", async () => {
        const result = await table.find((item) => item.n > 0, true, 2);
        expect(result).toHaveLength(2);
    });

    it("gives the same result whether useWorker is true or false", async () => {
        const viaWorkerArg = await table.find((item) => item.n >= 3, true);
        const viaMainArg = await table.find((item) => item.n >= 3, false);
        expect(viaWorkerArg.map((r) => r.id).sort()).toEqual(
            viaMainArg.map((r) => r.id).sort()
        );
        expect(viaWorkerArg.map((r) => r.id).sort()).toEqual(["c", "d", "e"]);
    });

    it("preserves closures (the old string path could not)", async () => {
        const threshold = 3; // captured by the predicate's closure
        const result = await table.find((item) => item.n >= threshold);
        expect(result.map((r) => r.id).sort()).toEqual(["c", "d", "e"]);
    });
});

describe("Table.aggregate (de-stringed, main thread)", () => {
    it("folds over all records", async () => {
        const sum = await table.aggregate((records) =>
            records.reduce((acc, r) => acc + r.n, 0)
        );
        expect(sum).toBe(15);
    });

    it("preserves closures in the aggregate function", async () => {
        const weight = 2; // captured by closure
        const weighted = await table.aggregate((records) =>
            records.reduce((acc, r) => acc + r.n * weight, 0)
        );
        expect(weighted).toBe(30);
    });

    it("gives the same result whether useWorker is true or false", async () => {
        const a = await table.aggregate((records) => records.length, true);
        const b = await table.aggregate((records) => records.length, false);
        expect(a).toBe(b);
        expect(a).toBe(5);
    });
});
