import { Injectable } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'theme_mode';
  private mediaQuery: MediaQueryList | null = null;
  private onMediaChange: ((e: MediaQueryListEvent) => void) | null = null;

  init(): ThemeMode {
    const saved = this.getSavedMode();
    this.applyMode(saved);
    this.attachSystemListener();
    return saved;
  }

  setMode(mode: ThemeMode): void {
    localStorage.setItem(this.STORAGE_KEY, mode);
    this.applyMode(mode);
  }

  getMode(): ThemeMode {
    return this.getSavedMode();
  }

  private getSavedMode(): ThemeMode {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    return 'system';
  }

  private attachSystemListener(): void {
    if (this.mediaQuery) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    this.onMediaChange = () => {
      const mode = this.getSavedMode();
      if (mode === 'system') this.applyMode('system');
    };

    this.mediaQuery.addEventListener('change', this.onMediaChange);
  }

  private applyMode(mode: ThemeMode): void {
    const theme = mode === 'system' ? (this.isSystemDark() ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', theme);
  }

  private isSystemDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}

