import { Injectable } from '@angular/core';
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  GithubAuthProvider,
  getAuth,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { FIREBASE_CONFIG } from './auth.config';

export type OAuthProfile = {
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
};

@Injectable({ providedIn: 'root' })
export class GithubAuthService {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;

  constructor() {
    if (!this.isConfigured()) return;

    this.app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
    this.auth = getAuth(this.app);
  }

  isConfigured(): boolean {
    const cfg = FIREBASE_CONFIG;
    if (!cfg.apiKey || cfg.apiKey.includes('PUT_YOUR_')) return false;
    if (!cfg.authDomain || cfg.authDomain.includes('PUT_YOUR_')) return false;
    if (!cfg.projectId || cfg.projectId.includes('PUT_YOUR_')) return false;
    if (!cfg.appId || cfg.appId.includes('PUT_YOUR_')) return false;
    return true;
  }

  async signInWithGithub(): Promise<OAuthProfile | null> {
    if (!this.auth) return null;

    const credential = await signInWithPopup(this.auth, new GithubAuthProvider());
    const user = credential.user;
    if (!user.email) return null;

    const fullName = user.displayName ?? '';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);

    return {
      email: user.email,
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
      fullName,
    };
  }

  async signOut(): Promise<void> {
    if (!this.auth) return;
    await firebaseSignOut(this.auth);
  }
}
