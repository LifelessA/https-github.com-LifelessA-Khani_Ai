
export enum AppState {
  IDLE = 'IDLE',
  TRANSLATING = 'TRANSLATING',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export enum AudioMode {
  MULTI_CAST = 'MULTI_CAST',
  SOLO = 'SOLO'
}

export interface GeneratedScript {
  originalText: string;
  hinglishScript: string;
}

export interface AudioData {
  buffer: AudioBuffer;
  duration: number;
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede';

// Strict lists for validation
export const MALE_VOICE_NAMES: VoiceName[] = ['Charon', 'Fenrir', 'Puck', 'Zephyr'];
export const FEMALE_VOICE_NAMES: VoiceName[] = ['Kore', 'Aoede'];

export interface CastConfig {
  mode: AudioMode;
  narrator: VoiceName;
  hero: VoiceName;
  heroine: VoiceName;
}
