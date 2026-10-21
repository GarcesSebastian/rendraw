import { Table } from "./_common/Table";
import { ITable } from "./_common/Table";
import { getWorkerScript } from "./_common/WorkerScript";

/** Generic table schema type for type safety. */
export type TableSchema = Record<string, any>;

/** Type helper for extracting table names from schema. */
export type TableName<T extends Record<string, TableSchema>> = keyof T & string;

/** Typed table interface with schema support. */
export interface ITypedTable<T extends TableSchema = any> extends ITable {
    /** Name of the table/object store. */
    name: string;
    /** Primary key field name as a typed key of the schema. */
    primary: keyof T & string;
    /** Optional schema definition for type safety. */
    schema?: T;
}

/** Response structure for web worker operations. */
interface WorkerResponse {
    /** Unique identifier for the operation. */
    id: string;
    /** Whether the operation succeeded. */
    success: boolean;
    /** Operation result data. */
    data?: any;
    /** Error message if operation failed. */
    error?: string;
    /** Progress information for long-running operations. */
    progress?: { p: number; state: boolean };
}

/**
 * IndexedDB database wrapper with web worker support for high-performance operations.
 * Provides type-safe table management and bulk operations with progress tracking.
 * 
 * @template TSchema - Database schema defining table structures.
 * 
 * @example
 * ```ts
 * interface MySchema {
 *     users: { id: string; name: string; email: string };
 *     posts: { id: string; title: string; content: string };
 * }
 * 
 * const db = new Database<MySchema>('myapp', 1);
 * await db.open();
 * 
 * const userTable = db.table('users', { name: 'users', primary: 'id' });
 * await userTable.put({ id: '1', name: 'John', email: 'john@example.com' });
 * ```
 */
export class Database<TSchema extends Record<string, TableSchema> = {}> {
    /** The IndexedDB database instance. */
    private _db: IDBDatabase | null = null;
    /** Web worker for background operations. */
    private _worker: Worker | null = null;
    /** Map of pending worker operations with their promise resolvers. */
    private _workerPromises: Map<string, { resolve: (value: any) => void; reject: (error: any) => void; onProgress?: (progress: { p: number; state: boolean }) => void }> = new Map();

    /** Database name. */
    public name: string;
    /** Database version. */
    public version: number;
    /** Map of initialized tables. */
    public tables: Map<string, Table<any>> = new Map();
    /** Map of table configurations pending initialization. */
    private _pendingTables: Map<string, ITypedTable<any>> = new Map();

    /**
     * Creates a new Database instance.
     * @param name - Database name.
     * @param version - Database version (default: 1).
     */
    public constructor(name: string, version: number = 1) {
        this.name = name;
        this.version = version;
        this._initWorker();
    }

    /**
     * Initializes the web worker for background database operations.
     * Uses the external WorkerScript.ts file for better code organization.
     * @private
     */
    private _initWorker(): void {
        // Get the worker script content from the external file
        const workerScriptContent = getWorkerScript();
        
        // Create worker from the script content
        const blob = new Blob([workerScriptContent], { type: 'application/javascript' });
        this._worker = new Worker(URL.createObjectURL(blob));
        
        this._setupWorkerHandlers();
    }

    /**
     * Sets up worker message and error handlers.
     * @private
     */
    private _setupWorkerHandlers(): void {
        if (!this._worker) return;
        
        this._worker.onmessage = (event) => {
            const response: WorkerResponse = event.data;
            const promise = this._workerPromises.get(response.id);
            
            if (promise) {
                if (response.progress && promise.onProgress) {
                    promise.onProgress(response.progress);
                    return;
                }
                
                if (response.data !== undefined || response.error !== undefined) {
                    this._workerPromises.delete(response.id);
                    
                    if (response.success) {
                        promise.resolve(response.data);
                    } else {
                        promise.reject(new Error(response.error));
                    }
                }
            }
        };
        
        this._worker.onerror = (error) => {
            console.error('Worker error:', error);
        };
    }

    /**
     * Sends a message to the web worker and returns a promise for the result.
     * @private
     * @param type - The type of operation to perform.
     * @param payload - The data to send to the worker.
     * @param onProgress - Optional progress callback function.
     * @returns Promise resolving to the worker operation result.
     */
    private async _sendToWorker(type: string, payload: any, onProgress?: (progress: { p: number; state: boolean }) => void): Promise<any> {
        if (!this._worker) {
            throw new Error('Worker not initialized');
        }
        
        const id = Math.random().toString(36).substr(2, 9);
        
        return new Promise((resolve, reject) => {
            const promiseData: { resolve: (value: any) => void; reject: (error: any) => void; onProgress?: (progress: { p: number; state: boolean }) => void } = { resolve, reject };
            if (onProgress) {
                promiseData.onProgress = onProgress;
            }
            this._workerPromises.set(id, promiseData);
            
            this._worker!.postMessage({
                id,
                type,
                payload
            });
            
            setTimeout(() => {
                if (this._workerPromises.has(id)) {
                    this._workerPromises.delete(id);
                    reject(new Error('Worker operation timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Opens the IndexedDB database and handles version upgrades.
     * @private
     * @returns Promise resolving to the opened database instance.
     */
    private _open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onupgradeneeded = () => {
                this._db = request.result;
                console.log("onupgradeneeded fired, current version:", this.version);
                
                for (const [tableName, tableProps] of this._pendingTables) {
                    if (!this._db.objectStoreNames.contains(tableName)) {
                        this._db.createObjectStore(tableName, { 
                            keyPath: tableProps.primary,
                            autoIncrement: false 
                        });
                        console.log(`Created object store: ${tableName}`);
                    }
                }
            };

            request.onsuccess = () => {
                this._db = request.result;
                this.version = this._db.version;
                resolve(this._db);
            };

            request.onerror = () => {
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn("Database upgrade blocked. Close other tabs/windows using this database.");
            };
        });
    }

    /**
     * Initializes the database by opening it and setting up all pending tables.
     * @returns Promise that resolves when initialization is complete.
     */
    public async init(): Promise<void> {
        this._db = await this._open();
        
        await this._sendToWorker('INIT_DB', {
            name: this.name,
            version: this.version
        });
        
        for (const [tableName, tableProps] of this._pendingTables) {
            const table = new Table(tableProps, this);
            await table.init();
            this.tables.set(tableName, table);
        }
        this._pendingTables.clear();
    }

    /**
     * Creates a new table configuration (requires database reopen to take effect).
     * @template TName - The name type of the table.
     * @template TData - The schema type for the table.
     * @param props - Table configuration including name, primary key, and schema.
     * @returns Database instance with updated type schema.
     * @throws Error if table already exists.
     */
    public createTable<
        TName extends string,
        TData extends TableSchema
    >(
        props: ITypedTable<TData> & { name: TName }
    ): Database<TSchema & Record<TName, TData>> {
        if (this.tables.has(props.name)) {
            throw new Error(`Table '${props.name}' already exists`);
        }
        
        if (this._db && this._db.objectStoreNames.contains(props.name)) {
            throw new Error(`Object store '${props.name}' already exists in database`);
        }
        
        this._pendingTables.set(props.name, props);
        
        if (this._db) {
            this._db.close();
            this.version++;
            this._db = null;
        }

        return this as any;
    }

    /**
     * Adds a new table to the database and immediately initializes it.
     * @template TName - The name type of the table.
     * @template TData - The schema type for the table.
     * @param props - Table configuration including name, primary key, and schema.
     * @returns Promise resolving to database instance with updated type schema.
     * @throws Error if table already exists.
     */
    public async addTable<
        TName extends string,
        TData extends TableSchema
    >(
        props: ITypedTable<TData> & { name: TName }
    ): Promise<Database<TSchema & Record<TName, TData>>> {
        if (this.tables.has(props.name)) {
            throw new Error(`Table '${props.name}' already exists`);
        }
        
        if (this._db && this._db.objectStoreNames.contains(props.name)) {
            throw new Error(`Object store '${props.name}' already exists in database`);
        }
        
        this._pendingTables.set(props.name, props);
        
        if (this._db) {
            console.log(`Creating new table '${props.name}'. Database will be upgraded.`);
            this._db.close();
            this.version++;
            this._db = null;
            
            await this.init();
        }

        return this as any;
    }

    /**
     * Retrieves a table instance by name.
     * @template TName - The table name type.
     * @param tableName - The name of the table to retrieve.
     * @returns The table instance or null if not found.
     */
    public get<TName extends TableName<TSchema>>(
        tableName: TName
    ): Table<TSchema[TName]> | null {
        const table = this.tables.get(tableName);
        return table || null;
    }

    /**
     * Alias for get() method - retrieves a table instance by name.
     * @template TName - The table name type.
     * @param name - The name of the table to retrieve.
     * @returns The table instance or null if not found.
     */
    public getTable<TName extends TableName<TSchema>>(
        name: TName
    ): Table<TSchema[TName]> | null {
        return this.get(name);
    }

    /**
     * Checks if a table exists in the database.
     * @param name - The name of the table to check.
     * @returns True if the table exists, false otherwise.
     */
    public hasTable(name: string): boolean {
        return this.tables.has(name);
    }

    /**
     * Performs bulk insert operations on a table with optional progress tracking.
     * @template TName - The table name type.
     * @param tableName - The name of the table to insert into.
     * @param dataArray - Array of records to insert.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @param onProgress - Optional progress callback function.
     * @returns Promise resolving to array of primary keys for inserted records.
     */
    public async bulkInsert<TName extends TableName<TSchema>>(
        tableName: TName,
        dataArray: TSchema[TName][],
        useWorker: boolean = true,
        onProgress?: (progress: { p: number; state: boolean }) => void
    ): Promise<Array<TSchema[TName][keyof TSchema[TName] & string]>> {
        if (onProgress) {
            onProgress({ p: 0, state: true });
        }
        
        if (useWorker) {
            return this._sendToWorker('BULK_INSERT', {
                tableName,
                data: dataArray
            }, onProgress);
        }
        
        const table = this.get(tableName);
        if (!table) throw new Error(`Table '${tableName}' not found`);
        return table.putMany(dataArray, false, 100, onProgress);
    }

    /**
     * Performs bulk update operations on a table.
     * @template TName - The table name type.
     * @param tableName - The name of the table to update.
     * @param updates - Array of update operations with keys and partial data.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @returns Promise resolving to array of update results.
     */
    public async bulkUpdate<TName extends TableName<TSchema>>(
        tableName: TName,
        updates: Array<{
            key: TSchema[TName][keyof TSchema[TName] & string];
            data: Partial<TSchema[TName]>;
        }>,
        useWorker: boolean = true
    ): Promise<any[]> {
        if (useWorker) {
            return this._sendToWorker('BULK_UPDATE', {
                tableName,
                updates
            });
        }
        
        const table = this.get(tableName);
        if (!table) throw new Error(`Table '${tableName}' not found`);
        
        const results = [];
        for (const update of updates) {
            const result = await table.update(update.key, update.data);
            results.push(result);
        }
        return results;
    }

    /**
     * Performs bulk delete operations on a table.
     * @template TName - The table name type.
     * @param tableName - The name of the table to delete from.
     * @param keys - Array of primary keys to delete.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @returns Promise that resolves when all deletions are complete.
     */
    public async bulkDelete<TName extends TableName<TSchema>>(
        tableName: TName,
        keys: Array<TSchema[TName][keyof TSchema[TName] & string]>,
        useWorker: boolean = true
    ): Promise<void> {
        if (useWorker && keys.length > 50) {
            await this._sendToWorker('BULK_DELETE', {
                tableName,
                keys
            });
            return;
        }
        
        const table = this.get(tableName);
        if (!table) throw new Error(`Table '${tableName}' not found`);
        await table.deleteMany(keys);
    }

    /**
     * Calculates the total size of the database in megabytes.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @returns Promise resolving to the database size in MB.
     */
    public async getDatabaseSizeMB(useWorker: boolean = true): Promise<number> {
        if (useWorker) {
            return this._sendToWorker('GET_SIZE', {});
        }
        
        if (!this._db) {
            throw new Error("Database not initialized. Call init() first.");
        }

        let totalBytes = 0;
        const storeNames = Array.from(this._db.objectStoreNames);

        for (const storeName of storeNames) {
            totalBytes += await new Promise<number>((resolve, reject) => {
                const tx = this._db!.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    let bytes = 0;

                    for (const record of request.result) {
                        try {
                            if (record instanceof Blob) {
                                bytes += record.size;
                            } else if (typeof record === "object") {
                                bytes += new Blob([JSON.stringify(record)]).size;
                            } else {
                                bytes += new Blob([String(record)]).size;
                            }
                        } catch {
                            bytes += 0;
                        }
                    }

                    resolve(bytes);
                };

                request.onerror = () => reject(request.error);
            });
        }

        return totalBytes / (1024 * 1024);
    }

    /**
     * Gets the underlying IndexedDB database instance.
     * @returns The IndexedDB database instance.
     * @throws Error if database is not initialized.
     */
    public get db(): IDBDatabase {
        if (!this._db) {
            throw new Error("Database not initialized. Call init() first.");
        }
        return this._db;
    }

    /**
     * Closes the database connection and terminates the web worker.
     * @returns Promise that resolves when the database is closed.
     */
    public async close(): Promise<void> {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        
        if (this._db) {
            this._db.close();
            this._db = null;
        }
    }

    /**
     * Deletes the entire database from IndexedDB.
     * @returns Promise that resolves when the database is deleted.
     */
    public async deleteDatabase(): Promise<void> {
        await this.close();
        
        return new Promise((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase(this.name);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        });
    }

    /**
     * Retrieves all table instances as a typed object.
     * @returns Object containing all table instances keyed by table name.
     */
    public getAllTables(): { [K in TableName<TSchema>]: Table<TSchema[K]> } {
        const result: any = {};
        for (const [name, table] of this.tables) {
            result[name] = table;
        }
        return result;
    }

    /**
     * Retrieves the names of all tables in the database.
     * @returns Array of table names.
     */
    public getTableNames(): Array<TableName<TSchema>> {
        return Array.from(this.tables.keys()) as Array<TableName<TSchema>>;
    }
}