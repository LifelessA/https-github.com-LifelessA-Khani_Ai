
import { GoogleGenAI, Modality } from "@google/genai";
import { decodeBase64, decodeAudioData, concatenateAudioBuffers } from "./audioUtils";
import { ScriptLine, CharacterConfig, MALE_VOICES, FEMALE_VOICES } from "../types";

const API_KEY = process.env.API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Step 1: Translate raw novel text into a Structured Hinglish Script.
 */
export const translateToHinglishScript = async (rawText: string): Promise<string> => {
  if (!API_KEY) throw new Error("API Key is missing");

  const systemInstruction = `
    You are an EXPERT Voice Director for an ADULT Audio Drama series (Rated 18+).
    Adapt the Web Novel into a high-quality "Hinglish" script.
    
    ### TONE & AUDIENCE:
    1. **Strictly Adult/Mature**: The tone must be grounded, gritty, and realistic. 
    2. **NO Childish Narration**: Do NOT sound like a bedtime storyteller. 
    3. **Narration Style**: Cold, observant, cinematic, or intense depending on the scene.
    4. **Language**: Modern conversational Hinglish (Natural mix of Hindi & English). Use swear words if the context demands anger, but keep it classy.
    
    ### CHARACTER IDS:
    - You MUST use consistent character names.
    - If names are known (e.g., "Rohan", "Priya"), use them.
    - If names are unknown, use "Male_1", "Female_2", etc.
    - **Narrator**: Always use "Narrator".
    
    ### FORMATTING (STRICT):
    - Write EACH dialogue on a NEW LINE.
    - Format: "Speaker_Name: (Emotion) Dialogue text"
    - Keep stage directions in brackets (e.g., (Sighs), (Shouting)).
    
    ### EXAMPLE:
    Narrator: Raat gehri thi... hawa mein ek ajeeb si thandak thi.
    Rohan: (Whispering) Shh... awaaz mat karo.
    Killer: (Laughing darky) Tum bach nahi sakte...
    Priya: (Terrified) Please... jaane do mujhe!
    
    Convert the text now.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: rawText,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7, 
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
 * Parses the script to identify all unique speakers.
 */
export const extractUniqueSpeakers = (script: string): string[] => {
  const lines = script.split('\n');
  const speakers = new Set<string>();
  const regex = /^([A-Za-z0-9_\s]+)\s*:/;

  lines.forEach(line => {
    const match = line.match(regex);
    if (match) {
      const name = match[1].trim();
      if (name) speakers.add(name);
    }
  });

  return Array.from(speakers);
};

/**
 * Removes content in brackets/parentheses for clean TTS reading.
 */
const cleanTextForAudio = (text: string): string => {
  return text
    .replace(/\(.*?\)/g, '') // Remove (Angry)
    .replace(/\[.*?\]/g, '') // Remove [Silence]
    .replace(/\*.*?\*/g, '') // Remove *sigh*
    .trim();
};

/**
 * Parses script lines.
 */
const parseScript = (script: string): ScriptLine[] => {
  const lines = script.split('\n');
  const parsed: ScriptLine[] = [];
  const regex = /^([A-Za-z0-9_\s]+)\s*:\s*(.*)/;

  lines.forEach(line => {
    const match = line.match(regex);
    if (match) {
      parsed.push({ speaker: match[1].trim(), text: match[2] });
    } else if (line.trim().length > 0) {
      if (parsed.length > 0) {
        parsed[parsed.length - 1].text += ` ${line.trim()}`;
      }
    }
  });

  return parsed;
};

/**
 * Helper to find the actual Gemini Voice Name and Tone from our presets.
 */
const getVoiceDetails = (config: CharacterConfig) => {
  const allPresets = [...MALE_VOICES, ...FEMALE_VOICES];
  const preset = allPresets.find(v => v.id === config.voiceId);
  
  if (!preset) {
    // Fallback if ID invalid, strictly check gender
    return {
      baseVoice: config.gender === 'male' ? 'Zephyr' : 'Kore',
      defaultStyle: 'Neutral, Steady Pace'
    };
  }
  return {
    baseVoice: preset.baseVoice,
    defaultStyle: preset.defaultStyle
  };
};

/**
 * Helper to safely find config using Case-Insensitive lookup
 */
const findCharacterConfig = (speakerName: string, configs: Record<string, CharacterConfig>): CharacterConfig | undefined => {
  // 1. Try exact match
  if (configs[speakerName]) return configs[speakerName];
  
  // 2. Try case-insensitive match
  const lowerName = speakerName.trim().toLowerCase();
  const key = Object.keys(configs).find(k => k.toLowerCase() === lowerName);
  
  return key ? configs[key] : undefined;
};

/**
 * Step 2: Generate Audio using the User's Config.
 */
export const generateAudioFromScript = async (
  script: string, 
  characterConfigs: Record<string, CharacterConfig>
): Promise<AudioBuffer> => {
  
  if (!API_KEY) throw new Error("API Key is missing");

  const parsedScript = parseScript(script);
  if (parsedScript.length === 0) throw new Error("Script is empty or invalid format.");

  // Grouping logic
  const segments: ScriptLine[] = [];
  let currentSegment: ScriptLine | null = null;

  for (const line of parsedScript) {
    if (!currentSegment) {
      currentSegment = { ...line };
    } else if (currentSegment.speaker === line.speaker) {
      currentSegment.text += ` ... ${line.text}`;
    } else {
      segments.push(currentSegment);
      currentSegment = { ...line };
    }
  }
  if (currentSegment) segments.push(currentSegment);

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffers: AudioBuffer[] = [];

  try {
    for (const segment of segments) {
      // Robust lookup
      const config = findCharacterConfig(segment.speaker, characterConfigs);
      
      // Strict Gender Fallback logic
      const gender = config?.gender || 'male';
      const voiceDetails = config ? getVoiceDetails(config) : { 
        baseVoice: gender === 'male' ? 'Zephyr' : 'Kore', 
        defaultStyle: 'Narrator, Steady Pace' 
      };
      
      const userPersonality = config?.personality || "";

      // Clean Text
      let textToSpeak = cleanTextForAudio(segment.text);
      if (!textToSpeak) continue;

      // PROMPT ENGINEERING FOR FLOW AND CONSISTENCY
      const combinedStyle = userPersonality 
        ? `${voiceDetails.defaultStyle}, ${userPersonality}` 
        : voiceDetails.defaultStyle;
        
      // Ensure we DO NOT pass the speaker name to the audio engine to avoid AI confusion/hallucination of gender.
      const finalPromptText = `(Context: Adult Audio Drama. Tone: ${combinedStyle}. Pace: Natural/Steady): ${textToSpeak}`;

      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: finalPromptText }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceDetails.baseVoice }
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
