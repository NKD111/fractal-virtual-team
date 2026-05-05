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

type SoundKey =
  | 'ambient' | 'lounge' | 'notification' | 'success' | 'oracle' | 'teleport'
  | 'voice_male_1' | 'voice_male_2' | 'voice_male_3'
  | 'voice_female_1' | 'voice_female_2' | 'voice_female_3'
  | 'voice_bot';

const FILES: Record<SoundKey, string> = {
  ambient:        '/assets/audio/ambient.mp3',
  lounge:         '/assets/audio/lounge.mp3',          // hipster elevator loop
  notification:   '/assets/audio/notification.mp3',
  success:        '/assets/audio/success.mp3',
  oracle:         '/assets/audio/oracle.mp3',
  teleport:       '/assets/audio/teleport.mp3',
  voice_male_1:   '/assets/audio/voice_m1.mp3',
  voice_male_2:   '/assets/audio/voice_m2.mp3',
  voice_male_3:   '/assets/audio/voice_m3.mp3',
  voice_female_1: '/assets/audio/voice_f1.mp3',
  voice_female_2: '/assets/audio/voice_f2.mp3',
  voice_female_3: '/assets/audio/voice_f3.mp3',
  voice_bot:      '/assets/audio/voice_bot.mp3'
};

const DEFAULT_VOLUMES: Record<SoundKey, number> = {
  ambient:        0.10,
  lounge:         0.18,
  notification:   0.40,
  success:        0.40,
  oracle:         0.40,
  teleport:       0.30,
  voice_male_1:   0.55,
  voice_male_2:   0.55,
  voice_male_3:   0.55,
  voice_female_1: 0.55,
  voice_female_2: 0.55,
  voice_female_3: 0.55,
  voice_bot:      0.55
};

// Map agent slug → gender bucket so we can pick a fitting voice grunt
export const AGENT_VOICE: Record<string, 'male' | 'female' | 'bot'> = {
  mariana: 'female', diana: 'female', sofia: 'female', valentina: 'female',
  carlos: 'male', alex: 'male', lucas: 'male', diego: 'male', max: 'male', roberto: 'male',
  qcbot: 'bot', oracle: 'bot', nexus: 'bot', atlas: 'bot'
};

const VOICE_POOL: Record<'male' | 'female' | 'bot', SoundKey[]> = {
  male:   ['voice_male_1', 'voice_male_2', 'voice_male_3'],
  female: ['voice_female_1', 'voice_female_2', 'voice_female_3'],
  bot:    ['voice_bot']
};

class AudioManager {
  private sounds: Partial<Record<SoundKey, Howl>> = {};
  private ambientId: number | null = null;
  private loungeId: number | null = null;
  private muted = false;
  private loungePlaying = false;
  private listeners: Array<(muted: boolean) => void> = [];
  private loungeListeners: Array<(playing: boolean) => void> = [];

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
          loop: key === 'ambient' || key === 'lounge',
          preload: true,
          onloaderror: () => { this.sounds[key] = undefined; }
        });
      } catch {
        this.sounds[key] = undefined;
      }
    });
  }

  /** Play a random voice grunt for the agent (male/female/bot bucket). */
  playAgentVoice(slug: string) {
    const bucket = AGENT_VOICE[slug] || 'bot';
    const pool = VOICE_POOL[bucket];
    const key = pool[Math.floor(Math.random() * pool.length)];
    const s = this.sounds[key];
    if (s) { try { s.play(); } catch {} }
  }

  /** Toggle the lounge/elevator music loop. Returns new playing state. */
  toggleLounge() {
    const s = this.sounds.lounge;
    if (!s) return this.loungePlaying;
    if (this.loungePlaying) {
      try { s.stop(); } catch {}
      this.loungePlaying = false;
      this.loungeId = null;
    } else {
      try { this.loungeId = s.play(); this.loungePlaying = true; } catch {}
    }
    this.loungeListeners.forEach(fn => fn(this.loungePlaying));
    return this.loungePlaying;
  }

  isLoungePlaying() { return this.loungePlaying; }

  onLoungeChange(fn: (playing: boolean) => void) {
    this.loungeListeners.push(fn);
    return () => { this.loungeListeners = this.loungeListeners.filter(f => f !== fn); };
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
