import { Database, TableSchema } from "../Database";

/** Basic table interface defining essential properties. */
export interface ITable {
    /** Name of the table/object store. */
    name: string;
    /** Primary key field name. */
    primary: string;
}

/** Typed table interface with generic schema support. */
export interface ITypedTable<T extends TableSchema = any> extends ITable {
    /** Name of the table/object store. */
    name: string;
    /** Primary key field name as a typed key of the schema. */
    primary: keyof T & string;
    /** Optional schema definition for type safety. */
    schema?: T;
}

/**
 * IndexedDB table wrapper providing type-safe database operations.
 * Supports batch operations, worker-based processing, and comprehensive CRUD functionality.
 * 
 * @template TData - The schema type for records in this table.
 * 
 * @example
 * ```ts
 * interface UserSchema {
 *     id: string;
 *     name: string;
 *     email: string;
 * }
 * 
 * const userTable = new Table<UserSchema>({
 *     name: 'users',
 *     primary: 'id'
 * }, database);
 * 
 * await userTable.init();
 * await userTable.put({ id: '1', name: 'John', email: 'john@example.com' });
 * ```
 */
export class Table<TData extends TableSchema = any> implements ITable {
    /** Reference to the parent database instance. */
    public indexDB: Database<any>;
    /** Name of the table/object store. */
    public name: string;
    /** Primary key field name. */
    public primary: keyof TData & string;
    /** Whether the table has been initialized. */
    private _initialized: boolean = false;

    /**
     * Creates a new Table instance.
     * @param props - Table configuration including name and primary key.
     * @param indexDB - Parent database instance.
     */
    public constructor(props: ITypedTable<TData>, indexDB: Database<any>) {
        this.indexDB = indexDB;
        this.name = props.name;
        this.primary = props.primary;
    }

    /**
     * Initializes the table by verifying the object store exists.
     * Must be called before performing any operations.
     * @throws Error if the object store doesn't exist in the database.
     */
    public async init(): Promise<void> {
        if (!this.indexDB.db.objectStoreNames.contains(this.name)) {
            throw new Error(`Object store '${this.name}' does not exist in database`);
        }
        this._initialized = true;
    }

    /**
     * Ensures the table is initialized before operations.
     * @private
     * @throws Error if the table hasn't been initialized.
     */
    private _ensureInitialized(): void {
        if (!this._initialized) {
            throw new Error(`Table '${this.name}' not initialized. Call init() first.`);
        }
    }

    /**
     * Gets an IndexedDB object store for the specified transaction mode.
     * @private
     * @param mode - Transaction mode (readonly or readwrite).
     * @returns The object store instance.
     */
    private _getStore(mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
        this._ensureInitialized();
        const transaction = this.indexDB.db.transaction([this.name], mode);
        return transaction.objectStore(this.name);
    }

    /**
     * Retrieves a single record by its primary key.
     * @param key - The primary key value to search for.
     * @returns Promise resolving to the record or undefined if not found.
     */
    public async get(key: TData[keyof TData & string]): Promise<TData | undefined> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result as TData | undefined);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Retrieves multiple records by their primary keys.
     * Automatically batches large requests for better performance.
     * @param keys - Array of primary key values to retrieve.
     * @returns Promise resolving to array of records (undefined for missing keys).
     */
    public async getMany(keys: Array<TData[keyof TData & string]>): Promise<Array<TData | undefined>> {
        if (keys.length > 100) {
            const batchSize = 50;
            const results: Array<TData | undefined> = [];
            
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch.map(key => this.get(key)));
                results.push(...batchResults);
            }
            
            return results;
        }
        
        const promises = keys.map(key => this.get(key));
        return Promise.all(promises);
    }

    /**
     * Retrieves all records from the table.
     * @returns Promise resolving to array of all records.
     */
    public async getAll(): Promise<TData[]> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result as TData[]);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Retrieves records with an optional limit.
     * @param limit - Maximum number of records to retrieve.
     * @returns Promise resolving to array of records (up to limit).
     */
    public async getAllWithLimit(limit?: number): Promise<TData[]> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.getAll(undefined, limit);
            
            request.onsuccess = () => resolve(request.result as TData[]);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Inserts or updates a single record.
     * @param data - The record to insert or update.
     * @returns Promise resolving to the primary key of the saved record.
     */
    public async put(data: TData): Promise<TData[keyof TData & string]> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readwrite');
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result as TData[keyof TData & string]);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Inserts or updates multiple records efficiently.
     * Supports worker-based processing and progress callbacks for large datasets.
     * @param dataArray - Array of records to insert or update.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @param batchSize - Number of records per batch (default: 100).
     * @param onProgress - Optional progress callback function.
     * @returns Promise resolving to array of primary keys for saved records.
     */
    public async putMany(
        dataArray: TData[], 
        useWorker: boolean = true,
        batchSize: number = 100,
        onProgress?: (progress: { p: number; state: boolean }) => void
    ): Promise<Array<TData[keyof TData & string]>> {
        if (useWorker) {
            return this.indexDB.bulkInsert(this.name, dataArray, true, onProgress);
        }
        
        if (dataArray.length > batchSize) {
            const results: Array<TData[keyof TData & string]> = [];
            const total = dataArray.length;
            let processedCount = 0;
            
            for (let i = 0; i < dataArray.length; i += batchSize) {
                const batch = dataArray.slice(i, i + batchSize);
                
                const batchResults = await new Promise<Array<TData[keyof TData & string]>>((resolve, reject) => {
                    const transaction = this.indexDB.db.transaction([this.name], 'readwrite');
                    const store = transaction.objectStore(this.name);
                    const promises: Array<TData[keyof TData & string]> = [];
                    let completed = 0;
                    let hasError = false;
                    
                    transaction.onerror = () => {
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Transaction failed'));
                        }
                    };
                    
                    transaction.onabort = () => {
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Transaction aborted'));
                        }
                    };
                    
                    batch.forEach((data, index) => {
                        const request = store.put(data);
                        
                        request.onsuccess = () => {
                            promises[index] = request.result as TData[keyof TData & string];
                            completed++;
                            processedCount++;
                            
                            if (completed === batch.length && !hasError) {
                                resolve(promises);
                            }
                        };
                        
                        request.onerror = () => {
                            if (!hasError) {
                                hasError = true;
                                reject(request.error);
                            }
                        };
                    });
                });
                
                results.push(...batchResults);
                
                if (onProgress) {
                    const progress = processedCount / total;
                    onProgress({ p: progress, state: true });
                }
                
                if (i + batchSize < dataArray.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            if (onProgress) {
                onProgress({ p: 1, state: false });
            }
            
            return results;
        }
        
        const promises = dataArray.map(data => this.put(data));
        return Promise.all(promises);
    }

    /**
     * Adds a new record to the table (fails if key already exists).
     * @param data - The record to add.
     * @returns Promise resolving to the primary key of the added record.
     * @throws Error if a record with the same key already exists.
     */
    public async add(data: TData): Promise<TData[keyof TData & string]> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readwrite');
            const request = store.add(data);
            
            request.onsuccess = () => resolve(request.result as TData[keyof TData & string]);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Updates an existing record with partial data.
     * @param key - The primary key of the record to update.
     * @param updates - Partial data to merge with existing record.
     * @returns Promise resolving to the updated record or null if not found.
     */
    public async update(
        key: TData[keyof TData & string], 
        updates: Partial<TData>
    ): Promise<TData | null> {
        const existing = await this.get(key);
        if (!existing) return null;
        
        const updated = { ...existing, ...updates } as TData;
        await this.put(updated);
        return updated;
    }

    /**
     * Updates multiple records efficiently with partial data.
     * @param updates - Array of update operations with keys and partial data.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @param batchSize - Number of updates per batch (default: 50).
     * @returns Promise resolving to array of updated records (null for missing keys).
     */
    public async updateMany(
        updates: Array<{
            key: TData[keyof TData & string];
            data: Partial<TData>;
        }>,
        useWorker: boolean = true,
        batchSize: number = 50
    ): Promise<Array<TData | null>> {
        if (useWorker && updates.length > 50) {
            return this.indexDB.bulkUpdate(this.name, updates, true);
        }
        
        if (updates.length > batchSize) {
            const results: Array<TData | null> = [];
            
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map(update => this.update(update.key, update.data))
                );
                results.push(...batchResults);
                
                if (i + batchSize < updates.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
            
            return results;
        }
        
        const promises = updates.map(update => this.update(update.key, update.data));
        return Promise.all(promises);
    }

    /**
     * Deletes a single record by its primary key.
     * @param key - The primary key of the record to delete.
     * @returns Promise that resolves when deletion is complete.
     */
    public async delete(key: TData[keyof TData & string]): Promise<void> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readwrite');
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Deletes multiple records efficiently by their primary keys.
     * @param keys - Array of primary keys to delete.
     * @param useWorker - Whether to use web worker for processing (default: true).
     * @param batchSize - Number of deletions per batch (default: 50).
     * @returns Promise that resolves when all deletions are complete.
     */
    public async deleteMany(
        keys: Array<TData[keyof TData & string]>,
        useWorker: boolean = true,
        batchSize: number = 50
    ): Promise<void> {
        if (useWorker && keys.length > 50) {
            await this.indexDB.bulkDelete(this.name, keys, true);
            return;
        }
        
        if (keys.length > batchSize) {
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                
                await new Promise<void>((resolve, reject) => {
                    const transaction = this.indexDB.db.transaction([this.name], 'readwrite');
                    const store = transaction.objectStore(this.name);
                    let completed = 0;
                    let hasError = false;
                    
                    transaction.onerror = () => {
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Transaction failed'));
                        }
                    };
                    
                    transaction.onabort = () => {
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Transaction aborted'));
                        }
                    };
                    
                    batch.forEach(key => {
                        const request = store.delete(key);
                        
                        request.onsuccess = () => {
                            completed++;
                            if (completed === batch.length && !hasError) {
                                resolve();
                            }
                        };
                        
                        request.onerror = () => {
                            if (!hasError) {
                                hasError = true;
                                reject(request.error);
                            }
                        };
                    });
                });
                
                if (i + batchSize < keys.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            return;
        }
        
        const promises = keys.map(key => this.delete(key));
        await Promise.all(promises);
    }

    /**
     * Removes all records from the table.
     * @returns Promise that resolves when the table is cleared.
     */
    public async clear(): Promise<void> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readwrite');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Counts the total number of records in the table.
     * @returns Promise resolving to the record count.
     */
    public async count(): Promise<number> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Checks if a record exists with the given primary key.
     * @param key - The primary key to check.
     * @returns Promise resolving to true if record exists, false otherwise.
     */
    public async exists(key: TData[keyof TData & string]): Promise<boolean> {
        const result = await this.get(key);
        return result !== undefined;
    }

    /**
     * Finds records matching a predicate function.
     *
     * The predicate always runs on the main thread, streaming records through an
     * IndexedDB cursor. No function source is ever serialized or sent to the
     * worker, so closures are preserved and the library needs no CSP
     * `unsafe-eval`.
     *
     * @param predicate - Function to test each record.
     * @param _useWorker - Accepted for backwards compatibility and ignored; the
     *   predicate can only run on the main thread (see method description).
     * @param limit - Optional maximum number of results to return.
     * @returns Promise resolving to array of matching records.
     */
    public async find(
        predicate: (item: TData) => boolean,
        _useWorker: boolean = true,
        limit?: number
    ): Promise<TData[]> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.openCursor();
            const results: TData[] = [];
            let count = 0;
            
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor && (!limit || count < limit)) {
                    const item = cursor.value as TData;
                    
                    if (predicate(item)) {
                        results.push(item);
                        count++;
                    }
                    
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Finds the first record matching a predicate function.
     * @param predicate - Function to test each record.
     * @returns Promise resolving to the first matching record or undefined if none found.
     */
    public async findOne(
        predicate: (item: TData) => boolean,
    ): Promise<TData | undefined> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.openCursor();
            
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const item = cursor.value as TData;
                    
                    if (predicate(item)) {
                        resolve(item);
                        return;
                    }
                    
                    cursor.continue();
                } else {
                    resolve(undefined);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Retrieves all primary keys from the table.
     * @returns Promise resolving to array of all primary keys.
     */
    public async getAllKeys(): Promise<Array<TData[keyof TData & string]>> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.getAllKeys();
            
            request.onsuccess = () => resolve(request.result as Array<TData[keyof TData & string]>);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Iterates over all records in the table, calling a callback for each.
     * @param callback - Function to call for each record.
     * @param batchSize - Number of records to process before yielding (default: 1000).
     * @returns Promise that resolves when all records have been processed.
     */
    public async forEach(
        callback: (item: TData, key: TData[keyof TData & string]) => void | Promise<void>,
        batchSize: number = 1000
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const store = this._getStore('readonly');
            const request = store.openCursor();
            let processedCount = 0;
            
            request.onsuccess = async () => {
                const cursor = request.result;
                if (cursor) {
                    try {
                        await callback(cursor.value as TData, cursor.key as TData[keyof TData & string]);
                        processedCount++;
                        
                        if (processedCount % batchSize === 0) {
                            await new Promise(resolve => setTimeout(resolve, 1));
                        }
                        
                        cursor.continue();
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Performs aggregation operations on all records in the table.
     *
     * The aggregate function always runs on the main thread over the table's
     * `getAll()` result. No function source is serialized or sent to the worker,
     * so closures are preserved and the library needs no CSP `unsafe-eval`.
     *
     * @template TResult - The type of the aggregation result.
     * @param aggregateFunction - Function that performs the aggregation on all records.
     * @param _useWorker - Accepted for backwards compatibility and ignored; the
     *   aggregate function can only run on the main thread (see method description).
     * @returns Promise resolving to the aggregation result.
     */
    public async aggregate<TResult = any>(
        aggregateFunction: (records: TData[]) => TResult,
        _useWorker: boolean = true
    ): Promise<TResult> {
        const allRecords = await this.getAll();
        return aggregateFunction(allRecords);
    }

    /**
     * Calculates the storage size of all records in the table.
     * @returns Promise resolving to the size in megabytes.
     */
    public async getSize(): Promise<number> {
        const allRecords = await this.getAll();
        let totalBytes = 0;
        
        for (const record of allRecords) {
            try {
                if (record instanceof Blob) {
                    totalBytes += record.size;
                } else if (typeof record === "object") {
                    totalBytes += new Blob([JSON.stringify(record)]).size;
                } else {
                    totalBytes += new Blob([String(record)]).size;
                }
            } catch {
                totalBytes += 0;
            }
        }
        
        return totalBytes / (1024 * 1024);
    }

    /**
     * Retrieves comprehensive statistics about the table.
     * @returns Promise resolving to table statistics including count, size, keys, and sample data.
     */
    public async getStats(): Promise<{
        count: number;
        sizeMB: number;
        keys: Array<TData[keyof TData & string]>;
        sampleData?: TData;
    }> {
        const [count, sizeMB, keys, sampleData] = await Promise.all([
            this.count(),
            this.getSize(),
            this.getAllKeys(),
            this.getAllWithLimit(1)
        ]);
        
        return {
            count,
            sizeMB,
            keys,
            sampleData: sampleData[0] as TData
        };
    }

    /**
     * Imports data into the table with optional progress tracking.
     * @param data - Array of records to import.
     * @param options - Import configuration options.
     * @param options.batchSize - Number of records per batch (default: 1000).
     * @param options.useWorker - Whether to use web worker (default: true).
     * @param options.onProgress - Progress callback function.
     * @param options.clearBeforeImport - Whether to clear table before import (default: false).
     * @returns Promise that resolves when import is complete.
     */
    public async import(
        data: TData[],
        options: {
            batchSize?: number;
            useWorker?: boolean;
            onProgress?: (processed: number, total: number) => void;
            clearBeforeImport?: boolean;
        } = {}
    ): Promise<void> {
        const {
            batchSize = 1000,
            useWorker = true,
            onProgress,
            clearBeforeImport = false
        } = options;
        
        if (clearBeforeImport) {
            await this.clear();
        }
        
        if (useWorker && data.length > 100) {
            if (onProgress) onProgress(0, data.length);
            await this.putMany(data, true, batchSize);
            if (onProgress) onProgress(data.length, data.length);
        } else {
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                await this.putMany(batch, false, batchSize);
                
                if (onProgress) {
                    onProgress(Math.min(i + batchSize, data.length), data.length);
                }
            }
        }
    }

    /**
     * Exports table data in JSON or CSV format with optional filtering.
     * @param options - Export configuration options.
     * @param options.format - Export format: 'json' or 'csv' (default: 'json').
     * @param options.filter - Optional filter function to apply to records.
     * @param options.limit - Optional maximum number of records to export.
     * @returns Promise resolving to the exported data as a string.
     */
    public async export(
        options: {
            format?: 'json' | 'csv';
            filter?: (item: TData) => boolean;
            limit?: number;
        } = {}
    ): Promise<string> {
        const { format = 'json', filter, limit } = options;
        
        let records = filter ? await this.find(filter, true, limit) : await this.getAllWithLimit(limit);
        
        if (format === 'json') {
            return JSON.stringify(records, null, 2);
        } else if (format === 'csv') {
            if (records.length === 0) return '';
            
            const headers = Object.keys(records[0] ?? {});
            const csvRows = [
                headers.join(','),
                ...records.map(record =>
                    headers.map(header =>
                        JSON.stringify(record[header] ?? '')
                    ).join(',')
                )
            ];
            
            return csvRows.join('\n');
        }
        
        return JSON.stringify(records);
    }
}