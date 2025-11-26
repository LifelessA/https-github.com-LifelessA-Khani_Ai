
import { GoogleGenAI, Modality } from "@google/genai";
import { decodeBase64, decodeAudioData, concatenateAudioBuffers } from "./audioUtils";
import { CastConfig, VoiceName, AudioMode, MALE_VOICE_NAMES, FEMALE_VOICE_NAMES } from "../types";

const API_KEY = process.env.API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Step 1: Translate raw novel text into a Structured Hinglish Script.
 * Enhanced to detect Hero, Heroine, and side characters (Male_1, Female_2, etc).
 */
export const translateToHinglishScript = async (rawText: string): Promise<string> => {
  if (!API_KEY) throw new Error("API Key is missing");

  const systemInstruction = `
    You are a professional Voice Director for an ADULT Audio Drama series in India.
    Adapt the Web Novel into a high-quality "Hinglish" script for a MATURE audience (18+).
    
    ### TONE & STYLE GUIDELINES:
    1. **Audience**: Adult/Mature. 
    2. **Vibe**: Grounded, Realistic, Cinematic. 
    3. **AVOID**: Do NOT write or sound like a bedtime storyteller for children. Avoid exaggerated enthusiasm.
    4. **Language**: Modern conversational Hinglish (Natural mix of Hindi & English).
    
    ### CHARACTER ASSIGNMENT RULES (EXTREMELY STRICT):
    You MUST NOT use character names (e.g., "Rahul", "Priya", "Mom"). You MUST replace them with specific tags to ensure correct voice gender assignment.
    
    1. **Narrator**: Describes the scene. USE TAG: "Narrator"
    2. **Main Protagonist (Male)**: Assign strictly as **Hero**.
    3. **Main Protagonist (Female)**: Assign strictly as **Heroine**.
    4. **Side Males**: REPLACE names/roles with **Male_1**, **Male_2**, **Male_3**.
       - e.g., "Rahul" -> Male_1
       - e.g., "Shopkeeper" -> Male_2
       - e.g., "Father" -> Male_3
    5. **Side Females**: REPLACE names/roles with **Female_1**, **Female_2**, **Female_3**.
       - e.g., "Priya" -> Female_1
       - e.g., "Mom" -> Female_2
       - e.g., "Old Lady" -> Female_3
    
    ### FORMATTING (STRICT):
    - Write EACH dialogue or narration on a NEW LINE.
    - Format: "Speaker_ID: (Emotion) Dialogue text"
    - Example:
      Narrator: Raat ka waqt tha... sadak sunsaan thi.
      Hero: (Whispering) Shh... koi aa raha hai.
      Heroine: (Scared) Main dar rahi hu...
      Male_1: (Angry) Oye! Ruk wahi pe.
      Female_1: (Laughing) Dekho inko, kaise dar gaye.
    
    Now convert the following text:
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: rawText,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.6,
      }
    });

    const script = response.text;
    if (!script) throw new Error("Failed to generate script");
    return script;
  } catch (error) {
    console.error("Translation Error:", error);
    throw error;
  }
};

/**
 * Helper to identify if a speaker tag implies a male or female character.
 * Enhanced with keywords to catch cases where AI might fail to use Male_X/Female_X tags.
 */
const getSpeakerGender = (tag: string): 'MALE' | 'FEMALE' | 'NEUTRAL' => {
  const t = tag.toLowerCase().trim();
  
  if (t === 'hero') return 'MALE';
  if (t === 'heroine') return 'FEMALE';
  
  // Explicit Keywords
  const femaleKeywords = ['female', 'girl', 'woman', 'lady', 'mother', 'mom', 'sister', 'wife', 'aunt', 'grandma', 'daughter', 'queen', 'princess', 'madam', 'miss', 'she', 'her'];
  const maleKeywords = ['male', 'boy', 'man', 'guy', 'father', 'dad', 'brother', 'husband', 'uncle', 'grandpa', 'son', 'king', 'prince', 'sir', 'mr', 'he', 'him'];

  if (femaleKeywords.some(k => t.includes(k))) return 'FEMALE';
  if (maleKeywords.some(k => t.includes(k))) return 'MALE';

  return 'NEUTRAL'; // Narrator
};

/**
 * Determines which voice model to use based on the Mode (Solo vs Multi).
 */
const getVoiceForSpeaker = (speakerTag: string, cast: CastConfig): VoiceName => {
  // If Solo Mode, ALWAYS return the Narrator's voice.
  if (cast.mode === AudioMode.SOLO) {
    return cast.narrator;
  }

  // --- MULTI CAST LOGIC ---
  const tag = speakerTag.trim().replace(':', '').toLowerCase();

  // 1. Direct Cast Mapping
  if (tag === 'narrator') return cast.narrator;
  if (tag === 'hero') return cast.hero;
  if (tag === 'heroine') return cast.heroine;

  // 2. Identify Gender strictly
  const gender = getSpeakerGender(tag);
  
  const usedVoices = [cast.narrator, cast.hero, cast.heroine];

  // Helper to pick a voice that isn't used by main cast
  const pickVoice = (pool: VoiceName[], indexOffset: number): VoiceName => {
    // Filter out voices already used by Hero/Narrator if possible
    let available = pool.filter(v => !usedVoices.includes(v));
    if (available.length === 0) available = pool; // Recycle if full
    
    // Use modulo to cycle through available voices based on the "N" in Male_N
    return available[indexOffset % available.length];
  };

  // Extract number from tag if present (e.g. Male_2 -> 1)
  const numberMatch = tag.match(/\d+/);
  const index = numberMatch ? parseInt(numberMatch[0], 10) - 1 : 0; // Default to 0 index

  if (gender === 'MALE') {
    return pickVoice(MALE_VOICE_NAMES, index);
  }

  if (gender === 'FEMALE') {
    return pickVoice(FEMALE_VOICE_NAMES, index);
  }

  // Fallback: If absolutely unsure, default to Narrator.
  // Ideally this only happens for non-gendered things like "System" or "Announcement"
  return cast.narrator;
};

/**
 * Removes content in brackets/parentheses so the AI doesn't read instructions out loud.
 */
const cleanTextForAudio = (text: string): string => {
  return text
    .replace(/\(.*?\)/g, '') // Remove round brackets (Angry)
    .replace(/\[.*?\]/g, '') // Remove square brackets [Silence]
    .replace(/\*.*?\*/g, '') // Remove asterisks *sigh*
    .trim();
};

interface ScriptLine {
  speaker: string;
  text: string;
}

const parseScript = (script: string): ScriptLine[] => {
  const lines = script.split('\n');
  const parsed: ScriptLine[] = [];
  const regex = /^([A-Za-z0-9_]+)\s*:\s*(.*)/;

  lines.forEach(line => {
    const match = line.match(regex);
    if (match) {
      parsed.push({ speaker: match[1], text: match[2] });
    } else if (line.trim().length > 0) {
      if (parsed.length > 0) {
        parsed[parsed.length - 1].text += ` ${line.trim()}`;
      }
    }
  });
  return parsed;
};

/**
 * Step 2: Generate Audio by stitching segments.
 */
export const generateAudioFromScript = async (script: string, cast: CastConfig): Promise<AudioBuffer> => {
  if (!API_KEY) throw new Error("API Key is missing");

  const parsedScript = parseScript(script);
  if (parsedScript.length === 0) throw new Error("Script is empty or invalid format.");

  const segments: ScriptLine[] = [];
  let currentSegment: ScriptLine | null = null;

  // Grouping logic (simplified for accurate voice switching)
  for (const line of parsedScript) {
    // If Solo Mode, we DO NOT group strictly by speaker tag because we might need to 
    // change the prompt for modulation even if the voice name (Narrator) is the same.
    // However, to save API calls, we can group only if the Speaker Gender matches.
    if (!currentSegment) {
      currentSegment = { ...line };
    } else {
      if (cast.mode === AudioMode.SOLO) {
         // In Solo mode, verify if speaker gender changed. If yes, break segment to apply new prompt.
         const prevGender = getSpeakerGender(currentSegment.speaker);
         const currGender = getSpeakerGender(line.speaker);
         if (prevGender === currGender) {
            currentSegment.text += ` ... ${line.text}`;
         } else {
            segments.push(currentSegment);
            currentSegment = { ...line };
         }
      } else {
        // Multi Cast: Group by exact speaker tag
        if (currentSegment.speaker === line.speaker) {
          currentSegment.text += ` ... ${line.text}`;
        } else {
          segments.push(currentSegment);
          currentSegment = { ...line };
        }
      }
    }
  }
  if (currentSegment) segments.push(currentSegment);

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffers: AudioBuffer[] = [];

  try {
    for (const segment of segments) {
      const voiceName = getVoiceForSpeaker(segment.speaker, cast);
      const cleanedText = cleanTextForAudio(segment.text);
      if (!cleanedText) continue;

      let finalTextPrompt = cleanedText;

      // --- SOLO MODE MODULATION LOGIC ---
      if (cast.mode === AudioMode.SOLO) {
        const speakerGender = getSpeakerGender(segment.speaker);
        const narratorIsMale = MALE_VOICE_NAMES.includes(cast.narrator);
        
        if (speakerGender === 'FEMALE' && narratorIsMale) {
           // Male Narrator reading Female line
           finalTextPrompt = `Say the following line in a softer, slightly higher-pitched voice to mimic a woman: "${cleanedText}"`;
        } else if (speakerGender === 'MALE' && !narratorIsMale) {
           // Female Narrator reading Male line
           finalTextPrompt = `Say the following line in a deeper, rougher voice to mimic a man: "${cleanedText}"`;
        } else {
           // Normal narration or gender match
           finalTextPrompt = cleanedText;
        }
      }

      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: finalTextPrompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName }
              }
            }
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const buffer = await decodeAudioData(decodeBase64(base64Audio), audioContext, 24000, 1);
          audioBuffers.push(buffer);
        }
      } catch (e) {
        console.warn(`Failed to generate audio for segment: ${segment.text}`, e);
      }
    }

    if (audioBuffers.length === 0) throw new Error("Could not generate any audio.");

    const finalBuffer = concatenateAudioBuffers(audioBuffers, audioContext);
    
    await audioContext.close();
    return finalBuffer;

  } catch (error) {
    await audioContext.close();
    console.error("TTS Generation Error:", error);
    throw error;
  }
};
