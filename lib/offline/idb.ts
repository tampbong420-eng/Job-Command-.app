const DB_NAME = "job-command";
const DB_VERSION = 1;

export const STORE_KV = "kv";
export const STORE_QUEUE = "queue";
export const STORE_FILES = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        store.createIndex("byCreated", "createdAt");
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed."));
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

export async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(store, mode);
    const objectStore = tx.objectStore(store);
    const result = run(objectStore);
    return result instanceof Promise ? await result : await req(result);
  } finally {
    db.close();
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return withStore(STORE_KV, "readonly", (store) => store.get(key));
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await withStore(STORE_KV, "readwrite", (store) => store.put(value, key));
}

export async function fileGet(id: string): Promise<{ blob: Blob; name: string; mime: string } | undefined> {
  return withStore(STORE_FILES, "readonly", (store) => store.get(id));
}

export async function fileSet(id: string, value: { blob: Blob; name: string; mime: string }): Promise<void> {
  await withStore(STORE_FILES, "readwrite", (store) => store.put(value, id));
}

export async function fileDelete(id: string): Promise<void> {
  await withStore(STORE_FILES, "readwrite", (store) => store.delete(id));
}

export function uid(prefix = ""): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}${raw}` : raw;
}

export function isLocalId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith("local:"));
}

export function localEstimateId(jobId: string) {
  return `local:est:${jobId}`;
}
