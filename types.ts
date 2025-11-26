
export enum AppState {
  IDLE = 'IDLE',
  TRANSLATING = 'TRANSLATING',
  REVIEW_SCRIPT = 'REVIEW_SCRIPT',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface ScriptLine {
  speaker: string;
  text: string;
}

export interface CharacterConfig {
  name: string;
  gender: 'male' | 'female';
  voiceId: string; // ID from the presets (e.g. 'm_01')
  personality: string; // Custom user input, e.g. "Angry"
}

export interface VoicePreset {
  id: string;
  label: string; // Display name e.g. "Male 1 - Hero"
  baseVoice: string; // Actual Gemini API voice name
  defaultStyle: string; // Default personality prompt
}

// REDUCED TO 5 HIGH QUALITY STABLE VOICES PER GENDER TO FIX FLOW ISSUES
// We prioritize "Fenrir" and "Zephyr" for males, "Kore" for females as they are most stable.

export const MALE_VOICES: VoicePreset[] = [
  { id: 'm_01', label: 'Male 1 - Hero (Balanced)', baseVoice: 'Fenrir', defaultStyle: 'Confident, Heroic, Natural Pace' },
  { id: 'm_02', label: 'Male 2 - Narrator (Deep)', baseVoice: 'Zephyr', defaultStyle: 'Calm, Storyteller, Measured Pace' },
  { id: 'm_03', label: 'Male 3 - Young/Soft', baseVoice: 'Puck', defaultStyle: 'Soft, Youthful, Natural Pace' },
  { id: 'm_04', label: 'Male 4 - Elder/Grave', baseVoice: 'Charon', defaultStyle: 'Deep, Grave, Wise, Steady Pace' },
  { id: 'm_05', label: 'Male 5 - Intense/Villain', baseVoice: 'Fenrir', defaultStyle: 'Intense, Low Pitch, Serious' },
];

export const FEMALE_VOICES: VoicePreset[] = [
  { id: 'f_01', label: 'Female 1 - Heroine (Soothing)', baseVoice: 'Kore', defaultStyle: 'Calm, Soothing, Natural Pace' },
  { id: 'f_02', label: 'Female 2 - Narrator (Clear)', baseVoice: 'Kore', defaultStyle: 'Clear, Professional, Storyteller' },
  { id: 'f_03', label: 'Female 3 - Warm/Motherly', baseVoice: 'Kore', defaultStyle: 'Warm, Soft, Gentle, Steady Pace' },
  { id: 'f_04', label: 'Female 4 - Energetic', baseVoice: 'Kore', defaultStyle: 'Bright, Lively, Natural Pace' },
  { id: 'f_05', label: 'Female 5 - Mysterious', baseVoice: 'Kore', defaultStyle: 'Low Pitch, Whispery, Serious' },
];
