/**
 * IndexedDB Web Worker Script for high-performance database operations.
 * Handles bulk insert/update/delete operations and database size calculations
 * in a separate thread.
 *
 * Security note: this worker never executes code transported as a string. The
 * previous `COMPLEX_QUERY` path built predicates with `new Function(...)` from
 * caller-supplied source; it was removed. `find`/`aggregate` now run their
 * predicate on the main thread (see Table.find / Table.aggregate), so no code
 * string ever crosses the worker boundary and the library works under a CSP
 * without `unsafe-eval`.
 */

/**
 * Returns the complete worker script as a string for creating blob workers.
 * @returns The worker script content as a string.
 */
export function getWorkerScript(): string {
    return `
var db = null;
var dbName = '';
var dbVersion = 1;

async function openDatabase(name, version) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onerror = () => reject(request.error);
    });
}

function bulkInsert(tableName, dataArray, messageId) {
    if (!db) throw new Error('Database not opened in worker');
    
    var total = dataArray.length;
    var completed = 0;
    var batchSize = 50;
    var results = [];
    
    return new Promise(function(resolve, reject) {
        var processedBatches = 0;
        var totalBatches = Math.ceil(dataArray.length / batchSize);
        
        function processBatch(i) {
            var batch = dataArray.slice(i, i + batchSize);
            
            var transaction = db.transaction([tableName], 'readwrite');
            var store = transaction.objectStore(tableName);
            var batchResults = [];
            var batchCompleted = 0;
            
            batch.forEach(function(data) {
                var request = store.put(data);
                request.onsuccess = function() {
                    completed++;
                    batchCompleted++;
                    batchResults.push(request.result);
                    
                    if (batchCompleted === batch.length) {
                        results = results.concat(batchResults);
                        processedBatches++;
                        
                        var progress = completed / total;
                        self.postMessage({
                            id: messageId,
                            success: true,
                            progress: { p: progress, state: true }
                        });
                        
                        if (processedBatches === totalBatches) {
                            self.postMessage({
                                id: messageId,
                                success: true,
                                progress: { p: 1, state: false }
                            });
                            resolve(results);
                        } else {
                            setTimeout(function() {
                                processBatch(i + batchSize);
                            }, 50);
                        }
                    }
                };
                request.onerror = function() {
                    reject(request.error);
                };
            });
        }
        
        processBatch(0);
    });
}

function bulkUpdate(tableName, updates) {
    if (!db) throw new Error('Database not opened in worker');
    
    var results = [];
    var batchSize = 50;
    
    return new Promise(function(resolve, reject) {
        var processedBatches = 0;
        var totalBatches = Math.ceil(updates.length / batchSize);
        
        function processBatch(i) {
            var batch = updates.slice(i, i + batchSize);
            var transaction = db.transaction([tableName], 'readwrite');
            var store = transaction.objectStore(tableName);
            var batchCompleted = 0;
            
            batch.forEach(function(update) {
                var getRequest = store.get(update.key);
                getRequest.onsuccess = function() {
                    if (getRequest.result) {
                        var updatedData = Object.assign({}, getRequest.result, update.data);
                        var putRequest = store.put(updatedData);
                        putRequest.onsuccess = function() {
                            results.push(putRequest.result);
                            batchCompleted++;
                            
                            if (batchCompleted === batch.length) {
                                processedBatches++;
                                if (processedBatches === totalBatches) {
                                    resolve(results);
                                } else {
                                    setTimeout(function() {
                                        processBatch(i + batchSize);
                                    }, 10);
                                }
                            }
                        };
                        putRequest.onerror = function() {
                            reject(putRequest.error);
                        };
                    } else {
                        batchCompleted++;
                        if (batchCompleted === batch.length) {
                            processedBatches++;
                            if (processedBatches === totalBatches) {
                                resolve(results);
                            } else {
                                setTimeout(function() {
                                    processBatch(i + batchSize);
                                }, 10);
                            }
                        }
                    }
                };
                getRequest.onerror = function() {
                    reject(getRequest.error);
                };
            });
        }
        
        processBatch(0);
    });
}

function bulkDelete(tableName, keys) {
    if (!db) throw new Error('Database not opened in worker');
    
    var batchSize = 50;
    var results = [];
    
    return new Promise(function(resolve, reject) {
        var processedBatches = 0;
        var totalBatches = Math.ceil(keys.length / batchSize);
        
        function processBatch(i) {
            var batch = keys.slice(i, i + batchSize);
            var transaction = db.transaction([tableName], 'readwrite');
            var store = transaction.objectStore(tableName);
            var batchCompleted = 0;
            
            batch.forEach(function(key) {
                var request = store.delete(key);
                request.onsuccess = function() {
                    results.push(key);
                    batchCompleted++;
                    
                    if (batchCompleted === batch.length) {
                        processedBatches++;
                        if (processedBatches === totalBatches) {
                            resolve(results);
                        } else {
                            setTimeout(function() {
                                processBatch(i + batchSize);
                            }, 10);
                        }
                    }
                };
                request.onerror = function() {
                    reject(request.error);
                };
            });
        }
        
        processBatch(0);
    });
}

function getDatabaseSize() {
    if (!db) throw new Error('Database not opened in worker');
    
    var totalBytes = 0;
    var storeNames = Array.from(db.objectStoreNames);
    
    return new Promise(function(resolve, reject) {
        var processedStores = 0;
        
        storeNames.forEach(function(storeName) {
            var transaction = db.transaction([storeName], 'readonly');
            var store = transaction.objectStore(storeName);
            
            var request = store.getAll();
            request.onsuccess = function() {
                var records = request.result;
                
                records.forEach(function(record) {
                    try {
                        if (record instanceof Blob) {
                            totalBytes += record.size;
                        } else if (typeof record === "object") {
                            totalBytes += new Blob([JSON.stringify(record)]).size;
                        } else {
                            totalBytes += new Blob([String(record)]).size;
                        }
                    } catch (e) {
                        totalBytes += 0;
                    }
                });
                
                processedStores++;
                if (processedStores === storeNames.length) {
                    resolve(totalBytes / (1024 * 1024));
                }
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    });
}

self.onmessage = async function(event) {
    const { id, type, payload } = event.data;
    
    try {
        let result;
        
        switch (type) {
            case 'INIT_DB':
                dbName = payload.name;
                dbVersion = payload.version;
                await openDatabase(dbName, dbVersion);
                result = 'Database initialized';
                break;
                
            case 'BULK_INSERT':
                result = await bulkInsert(payload.tableName, payload.data, id);
                break;
                
            case 'BULK_UPDATE':
                result = await bulkUpdate(payload.tableName, payload.updates);
                break;
                
            case 'BULK_DELETE':
                result = await bulkDelete(payload.tableName, payload.keys);
                break;
                
            case 'GET_SIZE':
                result = await getDatabaseSize();
                break;
                
            default:
                throw new Error('Unknown message type: ' + type);
        }
        
        self.postMessage({
            id,
            success: true,
            data: result
        });
        
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error.message
        });
    }
};
    `;
}
