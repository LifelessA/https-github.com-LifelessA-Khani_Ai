
import React, { useState, useRef, useEffect } from 'react';
import { translateToHinglishScript, generateAudioFromScript, extractUniqueSpeakers } from './services/geminiService';
import { audioBufferToWav } from './services/audioUtils';
import { AppState, CharacterConfig, MALE_VOICES, FEMALE_VOICES } from './types';
import Spinner from './components/Spinner';
import AudioVisualizer from './components/AudioVisualizer';

// Icons
const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-secondary">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
  </svg>
);

const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [script, setScript] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Character Assignment State
  const [detectedSpeakers, setDetectedSpeakers] = useState<string[]>([]);
  const [characterConfigs, setCharacterConfigs] = useState<Record<string, CharacterConfig>>({});
  
  // Audio state
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) sourceNodeRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // --- Step 1: Generate Script ---
  const handleGenerateScript = async () => {
    if (!inputText.trim()) return;
    
    // Reset previous audio/data
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      setIsPlaying(false);
    }
    audioBufferRef.current = null;
    setErrorMsg(null);
    setAppState(AppState.TRANSLATING);

    try {
      const hinglishScript = await translateToHinglishScript(inputText);
      setScript(hinglishScript);
      
      // Auto-detect characters
      const speakers = extractUniqueSpeakers(hinglishScript);
      setDetectedSpeakers(speakers);
      
      // Initialize Configs
      const initialConfigs: Record<string, CharacterConfig> = {};
      
      speakers.forEach((speaker) => {
        const lower = speaker.toLowerCase();
        let gender: 'male' | 'female' = 'male';
        let voiceId = MALE_VOICES[0].id;
        let personality = '';

        if (lower.includes('narrator')) {
           gender = 'male';
           voiceId = 'm_02'; // Default Narrator preset (Zephyr)
        }
        else if (lower.includes('female') || lower.includes('girl') || lower.includes('woman') || lower.includes('mom') || lower.includes('priya') || lower.includes('lady')) {
           gender = 'female';
           voiceId = 'f_01';
        }
        else if (lower.includes('old') || lower.includes('grandpa')) {
           gender = 'male';
           voiceId = 'm_04'; // Elder
        }
        else {
           gender = 'male';
           voiceId = 'm_01';
        }

        initialConfigs[speaker] = {
          name: speaker,
          gender,
          voiceId,
          personality
        };
      });
      
      setCharacterConfigs(initialConfigs);
      setAppState(AppState.REVIEW_SCRIPT);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Script translation failed.");
      setAppState(AppState.ERROR);
    }
  };

  // --- Update Character Config ---
  const updateCharacter = (name: string, updates: Partial<CharacterConfig>) => {
    setCharacterConfigs(prev => {
      const current = prev[name];
      const newState = { ...current, ...updates };

      // CRITICAL FIX: Smart Voice Selection when Gender Changes
      if (updates.gender && updates.gender !== current.gender) {
        const isNarrator = name.toLowerCase().includes('narrator');
        
        if (updates.gender === 'male') {
          // If switching to Male, prioritize "Narrator" voice (m_02) if it's the narrator, else "Hero" (m_01)
          newState.voiceId = isNarrator ? 'm_02' : MALE_VOICES[0].id;
        } else {
          // If switching to Female, prioritize "Narrator" voice (f_02) if it's the narrator, else "Heroine" (f_01)
          newState.voiceId = isNarrator ? 'f_02' : FEMALE_VOICES[0].id; 
        }
      }

      return { ...prev, [name]: newState };
    });
  };

  const randomizeVoices = () => {
    setCharacterConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.toLowerCase().includes('narrator')) return; // Keep narrator stable

        // Randomize
        const isMale = Math.random() > 0.4;
        const gender = isMale ? 'male' : 'female';
        const list = isMale ? MALE_VOICES : FEMALE_VOICES;
        const randomVoice = list[Math.floor(Math.random() * list.length)];
        
        next[key] = {
          ...next[key],
          gender,
          voiceId: randomVoice.id,
          personality: ''
        };
      });
      return next;
    });
  };

  // --- Step 2: Generate Audio ---
  const handleGenerateAudio = async () => {
    if (!script) return;
    setAppState(AppState.GENERATING_AUDIO);

    try {
      const audioBuffer = await generateAudioFromScript(script, characterConfigs);
      audioBufferRef.current = audioBuffer;
      setAppState(AppState.IDLE);
      handlePlay();
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to generate audio. Please try again.");
      setAppState(AppState.ERROR);
    }
  };

  const handlePlay = () => {
    if (!audioBufferRef.current) return;
    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        setIsPlaying(false);
      }
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      setIsPlaying(false);
      sourceNodeRef.current = null;
    };

    source.start();
    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  const handleDownload = () => {
    if (!audioBufferRef.current) return;
    try {
      const wavBlob = audioBufferToWav(audioBufferRef.current);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'kahani_adult_audio_drama.wav';
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      setErrorMsg("Download failed.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-primary selection:text-white pb-24">
      {/* Header */}
      <header className="border-b border-white/10 bg-surface/50 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <BookIcon />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Kahani AI</h1>
            <p className="text-xs text-slate-400">Adult Audio Drama Creator</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* Intro */}
        {appState === AppState.IDLE && !script && (
          <section className="space-y-2 animate-fade-in">
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              Create immersive audio stories.
            </h2>
            <p className="text-slate-400 max-w-xl">
              Paste your web novel. We'll translate it, assign a cast, and produce a mature 18+ audio drama.
            </p>
          </section>
        )}

        {/* --- STEP 1: INPUT --- */}
        <section className={`bg-surface rounded-2xl border border-white/5 p-1 shadow-xl shadow-black/20 transition-all ${script ? 'opacity-80 hover:opacity-100' : ''}`}>
          <textarea
            className="w-full h-32 bg-background/50 text-slate-100 p-4 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder-slate-600"
            placeholder="Paste your novel text here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={appState === AppState.TRANSLATING || appState === AppState.GENERATING_AUDIO}
          />
          <div className="p-2 flex justify-end">
             {(!script || appState === AppState.IDLE) && (
               <button
                 onClick={handleGenerateScript}
                 disabled={!inputText || appState === AppState.TRANSLATING}
                 className="px-6 py-2 rounded-full font-semibold text-white bg-primary hover:bg-primary/80 transition-all flex items-center gap-2 text-sm disabled:opacity-50"
               >
                 {appState === AppState.TRANSLATING ? <Spinner /> : '1. Create Script'}
               </button>
             )}
          </div>
        </section>

        {/* --- STEP 2: CASTING --- */}
        {(appState === AppState.REVIEW_SCRIPT || appState === AppState.GENERATING_AUDIO || script) && (
          <section className="animate-fade-in space-y-6">
            
            <div className="flex items-center justify-between">
              <div>
                 <h3 className="text-xl font-bold text-white">Cast Your Characters</h3>
                 <p className="text-xs text-slate-400">Assign specific voices and personalities.</p>
              </div>
              <button onClick={randomizeVoices} className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-full">
                <RefreshIcon /> Randomize All
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {detectedSpeakers.map((speaker) => {
                const config = characterConfigs[speaker] || { name: speaker, gender: 'male', voiceId: 'm_01', personality: '' };
                const isMale = config.gender === 'male';
                const availableVoices = isMale ? MALE_VOICES : FEMALE_VOICES;

                return (
                  <div key={speaker} className="bg-surface border border-white/10 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4 hover:border-white/20 transition-colors">
                    
                    {/* Name */}
                    <div className="md:w-1/4 flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${speaker.toLowerCase().includes('narrator') ? 'bg-secondary' : 'bg-primary'}`}></div>
                       <span className={`font-semibold text-lg truncate ${speaker.toLowerCase().includes('narrator') ? 'text-secondary' : 'text-slate-100'}`}>
                        {speaker}
                      </span>
                    </div>

                    {/* Gender Switch */}
                    <div className="flex bg-black/40 rounded-lg p-1 text-xs font-bold border border-white/5">
                      <button 
                        onClick={() => updateCharacter(speaker, { gender: 'male' })}
                        className={`px-3 py-1.5 rounded ${isMale ? 'bg-primary text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        Male
                      </button>
                      <button 
                        onClick={() => updateCharacter(speaker, { gender: 'female' })}
                        className={`px-3 py-1.5 rounded ${!isMale ? 'bg-secondary text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        Female
                      </button>
                    </div>

                    {/* Voice Select */}
                    <div className="flex-1">
                      <select
                        className="w-full bg-black/40 text-sm text-slate-300 border border-white/10 rounded-lg px-3 py-2 focus:border-primary focus:outline-none transition-colors cursor-pointer hover:bg-black/60"
                        value={config.voiceId}
                        onChange={(e) => updateCharacter(speaker, { voiceId: e.target.value })}
                      >
                        {availableVoices.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Personality Input */}
                    <div className="flex-1">
                       <input 
                         type="text"
                         className="w-full bg-black/40 text-sm text-slate-300 border border-white/10 rounded-lg px-3 py-2 focus:border-primary focus:outline-none placeholder-slate-600 transition-colors hover:bg-black/60"
                         placeholder="Personality (e.g. Angry, Shy)"
                         value={config.personality}
                         onChange={(e) => updateCharacter(speaker, { personality: e.target.value })}
                       />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center pt-8 pb-4">
              <button
                onClick={handleGenerateAudio}
                disabled={appState === AppState.GENERATING_AUDIO}
                className="w-full sm:w-auto px-12 py-4 rounded-full font-bold text-lg text-white shadow-xl bg-gradient-to-r from-secondary via-pink-600 to-primary hover:scale-105 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100"
              >
                {appState === AppState.GENERATING_AUDIO ? <Spinner /> : '2. Generate Audio Drama'}
              </button>
            </div>
          </section>
        )}

        {/* --- AUDIO PLAYER --- */}
        {audioBufferRef.current && (
           <section className="bg-surface border border-white/10 rounded-2xl p-6 animate-slide-up sticky bottom-6 shadow-2xl shadow-black z-30">
             <div className="flex flex-col sm:flex-row items-center gap-6">
                <button 
                  onClick={handlePlay}
                  className="w-16 h-16 flex items-center justify-center bg-white text-background rounded-full hover:scale-110 transition-transform shadow-lg shrink-0"
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                
                <div className="flex-1 w-full space-y-2">
                  <div className="flex justify-between text-xs text-slate-400 uppercase tracking-widest">
                    <span>Now Playing</span>
                    <span className={isPlaying ? "text-primary animate-pulse" : ""}>{isPlaying ? "Active" : "Paused"}</span>
                  </div>
                  <AudioVisualizer isPlaying={isPlaying} />
                </div>

                <button
                 onClick={handleDownload}
                 className="p-4 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0"
                 title="Download .WAV"
               >
                 <DownloadIcon />
               </button>
             </div>
           </section>
        )}

        {/* --- SCRIPT DISPLAY --- */}
        {script && (
          <section className="bg-surface/50 rounded-xl border border-white/5 p-6 h-64 overflow-y-auto font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-white/10">
             <h4 className="text-xs font-bold text-slate-500 mb-4 sticky top-0 bg-surface/95 backdrop-blur py-2 uppercase">Script Preview</h4>
             {script.split('\n').map((line, idx) => {
               if (!line.trim()) return null;
               const speaker = line.split(':')[0];
               const isNarrator = speaker === 'Narrator';
               return (
                 <div key={idx} className="mb-2">
                   <span className={`font-bold ${isNarrator ? 'text-secondary' : 'text-primary'}`}>{speaker}:</span>
                   <span className="text-slate-300 ml-2">{line.replace(`${speaker}:`, '')}</span>
                 </div>
               )
             })}
          </section>
        )}

        {errorMsg && (
          <div className="fixed bottom-10 right-10 max-w-sm bg-red-900/90 border border-red-500/50 text-white p-4 rounded-xl shadow-2xl animate-bounce z-50">
            {errorMsg}
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
