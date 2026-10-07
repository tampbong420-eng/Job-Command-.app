export const CREW_ALARM_KEY = "jc-crew-alarm-name";
const DB_NAME = "job-command-crew";
const STORE = "alarm";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCrewAlarm(file: File) {
  const buf = await file.arrayBuffer();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({ name: file.name, type: file.type || "audio/mpeg", buf }, "tone");
  });
  db.close();
  try {
    window.localStorage.setItem(CREW_ALARM_KEY, file.name);
  } catch {
    /* ignore */
  }
}

export async function clearCrewAlarm() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete("tone");
  });
  db.close();
  try {
    window.localStorage.removeItem(CREW_ALARM_KEY);
  } catch {
    /* ignore */
  }
}

export function crewAlarmName() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CREW_ALARM_KEY) || "";
  } catch {
    return "";
  }
}

export async function loadCrewAlarmBlob(): Promise<{ name: string; blob: Blob } | null> {
  const db = await openDb();
  const row = await new Promise<{ name: string; type: string; buf: ArrayBuffer } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("tone");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!row?.buf) return null;
  return { name: row.name, blob: new Blob([row.buf], { type: row.type || "audio/mpeg" }) };
}

export async function playCrewAlarm() {
  const saved = await loadCrewAlarmBlob();
  if (!saved) return false;
  const url = URL.createObjectURL(saved.blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  try {
    await audio.play();
    return true;
  } catch {
    URL.revokeObjectURL(url);
    return false;
  }
}
