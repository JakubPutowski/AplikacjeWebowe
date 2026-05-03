import { inject, InjectionToken, Provider } from '@angular/core';
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, deleteDoc, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './auth.config';
import { STORAGE_MODE, type StorageMode } from './storage.config';

export interface AppStorage {
  readonly mode: StorageMode;
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

class LocalAppStorage implements AppStorage {
  readonly mode: StorageMode = 'local';

  async get<T>(key: string, fallback: T): Promise<T> {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}

class FirestoreAppStorage implements AppStorage {
  readonly mode: StorageMode = 'firestore';

  constructor(private readonly db: Firestore) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const snapshot = await getDoc(doc(this.db, 'app_state', key));
      if (!snapshot.exists()) return fallback;

      const data = snapshot.data() as { value?: unknown };
      if (!('value' in data)) return fallback;
      return data.value as T;
    } catch {
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await setDoc(doc(this.db, 'app_state', key), { value }, { merge: true });
  }

  async remove(key: string): Promise<void> {
    await deleteDoc(doc(this.db, 'app_state', key));
  }
}

function isFirebaseConfigured(): boolean {
  const cfg = FIREBASE_CONFIG;
  if (!cfg.apiKey || cfg.apiKey.includes('PUT_YOUR_')) return false;
  if (!cfg.authDomain || cfg.authDomain.includes('PUT_YOUR_')) return false;
  if (!cfg.projectId || cfg.projectId.includes('PUT_YOUR_')) return false;
  if (!cfg.appId || cfg.appId.includes('PUT_YOUR_')) return false;
  return true;
}

function resolveFirebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
}

function appStorageFactory(): AppStorage {
  if (STORAGE_MODE === 'firestore') {
    if (!isFirebaseConfigured()) {
      console.warn('STORAGE_MODE is firestore but FIREBASE_CONFIG is not configured. Falling back to local storage.');
      return new LocalAppStorage();
    }

    const app = resolveFirebaseApp();
    return new FirestoreAppStorage(getFirestore(app));
  }

  return new LocalAppStorage();
}

export const APP_STORAGE = new InjectionToken<AppStorage>('APP_STORAGE', {
  providedIn: 'root',
  factory: appStorageFactory,
});

export const APP_STORAGE_PROVIDER: Provider = {
  provide: APP_STORAGE,
  useFactory: appStorageFactory,
};

export function useAppStorage(): AppStorage {
  return inject(APP_STORAGE);
}
