import { openDB, DBSchema } from 'idb';

interface MusicDB extends DBSchema {
  audioFiles: {
    key: string;
    value: Blob;
  };
}

const dbPromise = openDB<MusicDB>('music-player-db', 1, {
  upgrade(db) {
    db.createObjectStore('audioFiles');
  },
});

export async function saveAudioFile(id: string, file: Blob) {
  const db = await dbPromise;
  await db.put('audioFiles', file, id);
}

export async function getAudioFile(id: string): Promise<Blob | undefined> {
  const db = await dbPromise;
  return db.get('audioFiles', id);
}

export async function deleteAudioFile(id: string) {
  const db = await dbPromise;
  await db.delete('audioFiles', id);
}

export async function saveImageFile(id: string, file: Blob) {
  const db = await dbPromise;
  await db.put('audioFiles', file, id); // Reuse the same store for simplicity
}

export async function getImageFile(id: string): Promise<Blob | undefined> {
  const db = await dbPromise;
  return db.get('audioFiles', id);
}

export async function deleteImageFile(id: string) {
  const db = await dbPromise;
  await db.delete('audioFiles', id);
}
