// frontend/office/audio/audioManager.ts
// Howler-based audio singleton. Gracefully no-ops if mp3 files missing.
//
// Place files at:
//   /public/assets/audio/ambient.mp3   (loop, low vol)
//   /public/assets/audio/notification.mp3
//   /public/assets/audio/success.mp3
//   /public/assets/audio/oracle.mp3
//   /public/assets/audio/teleport.mp3
//
// Recommended source: mixkit.co — search the names from the brief and rename.

import { Howl, Howler } from 'howler';

type SoundKey = 'ambient' | 'notification' | 'success' | 'oracle' | 'teleport';

const FILES: Record<SoundKey, string> = {
  ambient:      '/assets/audio/ambient.mp3',
  notification: '/assets/audio/notification.mp3',
  success:      '/assets/audio/success.mp3',
  oracle:       '/assets/audio/oracle.mp3',
  teleport:     '/assets/audio/teleport.mp3'
};

const DEFAULT_VOLUMES: Record<SoundKey, number> = {
  ambient:      0.10,
  notification: 0.40,
  success:      0.40,
  oracle:       0.40,
  teleport:     0.30
};

class AudioManager {
  private sounds: Partial<Record<SoundKey, Howl>> = {};
  private ambientId: number | null = null;
  private muted = false;
  private listeners: Array<(muted: boolean) => void> = [];

  init() {
    // Restore mute state from localStorage
    if (typeof window !== 'undefined') {
      this.muted = localStorage.getItem('fractal-mute') === '1';
      Howler.mute(this.muted);
    }
    // Pre-load each sound — failures are silent (graceful fallback)
    (Object.keys(FILES) as SoundKey[]).forEach(key => {
      try {
        this.sounds[key] = new Howl({
          src: [FILES[key]],
          volume: DEFAULT_VOLUMES[key],
          loop: key === 'ambient',
          preload: true,
          onloaderror: () => {
            // file missing — drop reference so play() is no-op
            this.sounds[key] = undefined;
          }
        });
      } catch {
        this.sounds[key] = undefined;
      }
    });
  }

  startAmbient() {
    const s = this.sounds.ambient;
    if (s && this.ambientId === null) {
      try { this.ambientId = s.play(); } catch {}
    }
  }

  play(key: Exclude<SoundKey, 'ambient'>) {
    const s = this.sounds[key];
    if (s) { try { s.play(); } catch {} }
  }

  toggleMute() {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fractal-mute', this.muted ? '1' : '0');
    }
    this.listeners.forEach(fn => fn(this.muted));
    return this.muted;
  }

  isMuted() { return this.muted; }

  onMuteChange(fn: (muted: boolean) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(f => f !== fn); };
  }
}

export const audio = new AudioManager();
