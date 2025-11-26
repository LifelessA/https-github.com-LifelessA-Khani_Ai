
import React, { useState, useRef, useEffect } from 'react';
import { translateToHinglishScript, generateAudioFromScript } from './services/geminiService';
import { audioBufferToWav } from './services/audioUtils';
import { AppState, CastConfig, VoiceName, AudioMode, MALE_VOICE_NAMES, FEMALE_VOICE_NAMES } from './types';
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

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [script, setScript] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Cast Configuration
  const [cast, setCast] = useState<CastConfig>({
    mode: AudioMode.MULTI_CAST,
    narrator: 'Charon',
    hero: 'Fenrir',
    heroine: 'Kore'
  });

  // Audio state
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // Cleanup audio context on unmount
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleProcess = async () => {
    if (!inputText.trim()) return;
    
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      setIsPlaying(false);
    }
    
    setErrorMsg(null);
    setAppState(AppState.TRANSLATING);
    setScript('');
    audioBufferRef.current = null;

    try {
      const hinglishScript = await translateToHinglishScript(inputText);
      setScript(hinglishScript);
      setAppState(AppState.GENERATING_AUDIO);

      const audioBuffer = await generateAudioFromScript(hinglishScript, cast);
      audioBufferRef.current = audioBuffer;
      
      setAppState(AppState.IDLE); 
      handlePlay(); 
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong.");
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
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

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
      a.download = 'kahani_audiobook.wav';
      document.body.appendChild(a);
      a.click();
      
      window.setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.error("Download failed", e);
      setErrorMsg("Failed to download audio file.");
    }
  };

  const getStatusText = () => {
    switch(appState) {
      case AppState.TRANSLATING: return "Translating to Hinglish...";
      case AppState.GENERATING_AUDIO: return "Casting Voices & Recording...";
      case AppState.ERROR: return "Error Occurred";
      default: return "Create Audio Drama";
    }
  };

  const VoiceSelector = ({ label, value, onChange, options, disabled }: { label: string, value: VoiceName, onChange: (v: VoiceName) => void, options: {label: string, value: VoiceName}[], disabled?: boolean }) => (
    <div className={`flex flex-col gap-1 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value as VoiceName)}
        className="bg-background/50 border border-white/10 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-surface text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const maleVoices: {label: string, value: VoiceName}[] = [
    { label: 'Charon (Deep/Storyteller)', value: 'Charon' },
    { label: 'Fenrir (Intense/Heroic)', value: 'Fenrir' },
    { label: 'Puck (Light/Energetic)', value: 'Puck' },
    { label: 'Zephyr (Calm/Smooth)', value: 'Zephyr' },
  ];

  const femaleVoices: {label: string, value: VoiceName}[] = [
    { label: 'Kore (Balanced/Clear)', value: 'Kore' },
    { label: 'Aoede (Expressive)', value: 'Aoede' },
  ];

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-primary selection:text-white pb-12">
      {/* Header */}
      <header className="border-b border-white/10 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <BookIcon />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Kahani AI</h1>
            <p className="text-xs text-slate-400">Web Novel to Multi-Cast Audio Drama</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        
        {/* Intro */}
        <section className="space-y-2">
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Bring your stories to life.
          </h2>
          <p className="text-slate-400 max-w-xl">
            Paste your web novel below. AI will translate it into emotional Hinglish 
            and enact it using a full cast of characters.
          </p>
        </section>

        {/* Casting Studio */}
        <section className="bg-surface rounded-xl border border-white/5 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
             <h3 className="text-sm font-bold text-white">Audio Production Mode</h3>
             <div className="flex bg-background/50 p-1 rounded-lg border border-white/10">
               <button 
                 onClick={() => setCast({...cast, mode: AudioMode.MULTI_CAST})}
                 className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${cast.mode === AudioMode.MULTI_CAST ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
               >
                 Multi-Cast Drama
               </button>
               <button 
                 onClick={() => setCast({...cast, mode: AudioMode.SOLO})}
                 className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${cast.mode === AudioMode.SOLO ? 'bg-secondary text-white shadow' : 'text-slate-400 hover:text-white'}`}
               >
                 Solo Storyteller
               </button>
             </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            
            <VoiceSelector 
              label={cast.mode === AudioMode.SOLO ? "Solo Narrator Voice" : "Narrator"}
              value={cast.narrator} 
              onChange={(v) => setCast({...cast, narrator: v})}
              options={[...maleVoices, ...femaleVoices]}
            />

            {/* These are hidden in Solo Mode */}
            <div className={`col-span-1 sm:col-span-2 grid grid-cols-2 gap-6 transition-opacity duration-300 ${cast.mode === AudioMode.SOLO ? 'opacity-20 pointer-events-none blur-[1px]' : 'opacity-100'}`}>
              <VoiceSelector 
                label="Hero (Male Lead)" 
                value={cast.hero} 
                onChange={(v) => setCast({...cast, hero: v})}
                options={maleVoices}
              />

              <VoiceSelector 
                label="Heroine (Female Lead)" 
                value={cast.heroine} 
                onChange={(v) => setCast({...cast, heroine: v})}
                options={femaleVoices}
              />
            </div>

          </div>
          
          <div className="mt-4 pt-4 border-t border-white/5 text-xs text-slate-500 flex flex-wrap gap-2">
             {cast.mode === AudioMode.MULTI_CAST ? (
               <>
                <span className="bg-white/5 px-2 py-1 rounded">Side Males will use remaining male voices.</span>
                <span className="bg-white/5 px-2 py-1 rounded">Side Females will use remaining female voices.</span>
               </>
             ) : (
               <span className="bg-secondary/10 text-secondary px-2 py-1 rounded">Solo Mode: Narrator will automatically modulate voice pitch for Male/Female dialogues.</span>
             )}
          </div>
        </section>

        {/* Input Area */}
        <section className="bg-surface rounded-2xl border border-white/5 p-1 shadow-xl shadow-black/20">
          <textarea
            className="w-full h-48 bg-background/50 text-slate-100 p-4 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder-slate-600"
            placeholder="Paste your English novel text here... e.g., 'He looked at her with tears in his eyes...'"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={appState === AppState.TRANSLATING || appState === AppState.GENERATING_AUDIO}
          />
        </section>

        {/* Controls */}
        <section className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={handleProcess}
            disabled={!inputText || appState === AppState.TRANSLATING || appState === AppState.GENERATING_AUDIO}
            className={`
              w-full sm:w-auto px-8 py-3 rounded-full font-semibold text-white shadow-lg transition-all
              flex items-center justify-center gap-2
              ${!inputText || appState !== AppState.IDLE && appState !== AppState.ERROR && appState !== AppState.PLAYING
                ? 'bg-slate-700 cursor-not-allowed opacity-50' 
                : 'bg-gradient-to-r from-primary to-secondary hover:opacity-90 hover:scale-105'}
            `}
          >
            {(appState === AppState.TRANSLATING || appState === AppState.GENERATING_AUDIO) && <Spinner />}
            {getStatusText()}
          </button>

          {/* Audio Controller */}
          {audioBufferRef.current && (
             <div className="flex flex-wrap items-center gap-4 bg-surface px-6 py-2 rounded-full border border-white/10 animate-fade-in w-full sm:w-auto justify-center">
               <button 
                onClick={handlePlay}
                className="text-white hover:text-primary transition-colors focus:outline-none"
                title={isPlaying ? "Pause" : "Play"}
              >
                 {isPlaying ? <PauseIcon /> : <PlayIcon />}
               </button>
               
               <AudioVisualizer isPlaying={isPlaying} />
               
               <div className="w-[1px] h-8 bg-white/10 mx-2"></div>
               
               <button
                 onClick={handleDownload}
                 className="text-slate-400 hover:text-secondary transition-colors focus:outline-none flex items-center gap-2 text-sm font-medium"
                 title="Download Audiobook"
               >
                 <DownloadIcon />
                 <span className="hidden sm:inline">Download</span>
               </button>
             </div>
          )}
        </section>

        {/* Error Message */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl text-center">
            {errorMsg}
          </div>
        )}

        {/* Output Script Display */}
        {script && (
          <section className="space-y-4 animate-fade-in">
             <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Generated Hinglish Script</h3>
                <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-md border border-primary/20">Read along</span>
             </div>
             
             <div className="bg-surface rounded-xl border border-white/5 p-6 h-96 overflow-y-auto space-y-4 font-mono text-sm leading-relaxed">
                {script.split('\n').map((line, idx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  
                  let colorClass = "text-slate-300";
                  if (trimmed.startsWith('Hero:')) colorClass = "text-blue-400 font-bold";
                  else if (trimmed.startsWith('Heroine:')) colorClass = "text-pink-400 font-bold";
                  else if (trimmed.includes('Male_')) colorClass = "text-blue-200";
                  else if (trimmed.includes('Female_')) colorClass = "text-pink-200";
                  else if (trimmed.startsWith('Narrator:')) colorClass = "text-emerald-300 italic";

                  return (
                    <p key={idx} className={`${colorClass} transition-colors hover:bg-white/5 p-1 rounded`}>
                      {trimmed}
                    </p>
                  )
                })}
             </div>
          </section>
        )}

      </main>
    </div>
  );
};

export default App;
