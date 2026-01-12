
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { parseScript } from './utils/parser';
import { TTSService } from './services/tts';
import { ScriptData, AppState, RoleAssignment, VoiceName, ScriptLine } from './types';

// Constants
const VOICES: VoiceName[] = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
const ROLE_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
];

interface Toast {
  message: string;
  type: 'error' | 'info';
  id: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [script, setScript] = useState<ScriptData | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [assignments, setAssignments] = useState<RoleAssignment>({});
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingLine, setIsLoadingLine] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(true);
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  
  const isPlayingRef = useRef<boolean>(false);
  const ttsServiceRef = useRef<TTSService | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readingInProgressRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Refs to avoid stale closures in recognition callbacks
  const scriptRef = useRef<ScriptData | null>(null);
  const currentLineIndexRef = useRef<number>(-1);
  const userRoleRef = useRef<string>('');

  useEffect(() => { scriptRef.current = script; }, [script]);
  useEffect(() => { currentLineIndexRef.current = currentLineIndex; }, [currentLineIndex]);
  useEffect(() => { userRoleRef.current = userRole; }, [userRole]);

  // Initialize TTS
  useEffect(() => {
    ttsServiceRef.current = new TTSService();
  }, []);

  const handleNextTurn = useCallback(async () => {
    const nextIndex = currentLineIndexRef.current + 1;
    if (scriptRef.current && nextIndex < scriptRef.current.lines.length) {
      if (ttsServiceRef.current) {
        await ttsServiceRef.current.resumeContext();
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      readNext(nextIndex);
    } else if (scriptRef.current && nextIndex >= scriptRef.current.lines.length) {
      resetReading();
      addToast("End of script reached!", "info");
    }
  }, [currentLineIndex]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ru-RU'; 

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const transcript = (finalTranscript || interimTranscript).trim().toLowerCase();
        if (transcript) setLastTranscript(transcript);

        // Auto-advance logic
        if (scriptRef.current && currentLineIndexRef.current >= 0 && !isPlayingRef.current) {
          const currentLine = scriptRef.current.lines[currentLineIndexRef.current];
          const isUserLine = currentLine.role.trim().toLowerCase() === userRoleRef.current.trim().toLowerCase();
          
          if (isUserLine) {
            const expectedText = currentLine.text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
            const cleanedTranscript = transcript.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
            
            const wordsExpected = expectedText.split(/\s+/);
            const wordsSpoken = cleanedTranscript.split(/\s+/);
            
            const lastWordExpected = wordsExpected[wordsExpected.length - 1];
            const hasLastWord = wordsSpoken.includes(lastWordExpected);
            
            const matchThreshold = Math.min(wordsExpected.length, 3);
            const spokenCount = wordsSpoken.length;
            
            if (finalTranscript && (hasLastWord || spokenCount >= wordsExpected.length * 0.7)) {
              console.log("Speech match detected, advancing...");
              handleNextTurn();
            }
          }
        }
      };

      recognition.onstart = () => setIsRecognizing(true);
      recognition.onend = () => setIsRecognizing(false);
      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error('Recognition error:', event.error);
        }
      };

      recognitionRef.current = recognition;
    }
  }, [handleNextTurn]);

  // Sync ref with state for the reading loop
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const addToast = (message: string, type: 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Map roles to colors
  const roleColorMap = useMemo(() => {
    if (!script) return {};
    const map: Record<string, string> = {};
    script.roles.forEach((role, idx) => {
      map[role] = ROLE_COLORS[idx % ROLE_COLORS.length];
    });
    return map;
  }, [script]);

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseScript(text);
        if (parsed.lines.length === 0) {
          throw new Error("Could not detect any dialogue lines. Check formatting (Character: text).");
        }
        
        // Clear cache when new script is loaded
        ttsServiceRef.current?.clearCache();
        
        setScript(parsed);
        
        // Default assignments
        const initialAssignments: RoleAssignment = {};
        parsed.roles.forEach((role, idx) => {
          initialAssignments[role] = VOICES[idx % VOICES.length];
        });
        setAssignments(initialAssignments);
        setAppState(AppState.CONFIGURING);
      } catch (err) {
        addToast((err as Error).message, 'error');
      }
    };
    reader.onerror = () => addToast("Failed to read file", "error");
    reader.readAsText(file);
  };

  // Auto-scroll to current line
  useEffect(() => {
    if (currentLineIndex >= 0 && scrollRef.current) {
      const activeElement = document.getElementById(`line-${currentLineIndex}`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentLineIndex]);

  const isUserTurn = useMemo(() => {
    if (!script || currentLineIndex === -1) return false;
    return script.lines[currentLineIndex].role.trim().toLowerCase() === userRole.trim().toLowerCase();
  }, [script, currentLineIndex, userRole]);

  // Handle Voice Control Activation
  useEffect(() => {
    if (appState === AppState.READING && isUserTurn && !isPlaying && isMicEnabled) {
      try {
        recognitionRef.current?.start();
        setLastTranscript('');
      } catch (e) {
      }
    } else {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    }
  }, [appState, isUserTurn, isPlaying, isMicEnabled]);

  // Main Reading Loop
  const readNext = useCallback(async (index: number) => {
    if (!scriptRef.current) return;
    
    if (!isPlayingRef.current || index >= scriptRef.current.lines.length) {
      if (index >= scriptRef.current.lines.length) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        addToast("The script reading is complete!", "info");
      }
      readingInProgressRef.current = false;
      return;
    }

    readingInProgressRef.current = true;
    const line = scriptRef.current.lines[index];
    setCurrentLineIndex(index);
    
    // Stop if it's user's turn
    if (line.role.trim().toLowerCase() === userRoleRef.current.trim().toLowerCase()) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      readingInProgressRef.current = false;
      return;
    }

    // Play TTS
    const voice = assignments[line.role] || 'Kore';
    setIsLoadingLine(true);
    try {
      if (!ttsServiceRef.current) throw new Error("Audio Service not initialized");
      await ttsServiceRef.current.speak(line.text, voice);
    } catch (err) {
      addToast(`TTS Error: ${(err as Error).message}`, 'error');
      setIsPlaying(false);
      isPlayingRef.current = false;
      readingInProgressRef.current = false;
      return;
    } finally {
      setIsLoadingLine(false);
    }

    // Continue to next if still active
    if (isPlayingRef.current) {
      const nextIndex = index + 1;
      setTimeout(() => readNext(nextIndex), 150);
    } else {
      readingInProgressRef.current = false;
    }
  }, [assignments]);

  const handleStart = async () => {
    try {
      if (ttsServiceRef.current) {
        await ttsServiceRef.current.resumeContext();
      }
      
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      const startIndex = currentLineIndex === -1 ? 0 : currentLineIndex;
      
      if (!readingInProgressRef.current) {
        readNext(startIndex);
      }
    } catch (err) {
      addToast("Failed to start playback: " + (err as Error).message, 'error');
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
  };

  const resetReading = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentLineIndex(-1);
    readingInProgressRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-50 text-slate-900">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`px-6 py-4 rounded-xl shadow-2xl text-white font-medium animate-in slide-in-from-right pointer-events-auto flex items-center gap-3 ${
              toast.type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'
            }`}
          >
            {toast.type === 'error' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.message}
          </div>
        ))}
      </div>

      <header className="w-full bg-white border-b border-slate-200 py-6 px-4 shadow-sm z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { if(appState !== AppState.IDLE) setAppState(AppState.IDLE); }}>
            <div className="bg-indigo-600 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">DramaBuddy</h1>
          </div>
          {script && (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsMicEnabled(!isMicEnabled)} 
                className={`p-2 rounded-lg border transition-colors ${isMicEnabled ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-slate-400 bg-slate-50 border-slate-200'}`}
                title={isMicEnabled ? "Voice controls ON" : "Voice controls OFF"}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              <button 
                onClick={() => {
                  setAppState(AppState.IDLE);
                  resetReading();
                  setScript(null);
                }} 
                className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition"
              >
                New Script
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl px-4 py-8 overflow-hidden flex flex-col">
        {appState === AppState.IDLE && (
          <div className="flex flex-col items-center justify-center flex-1 space-y-6 text-center animate-in">
            <div className="p-12 bg-white rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 transition cursor-pointer relative group w-full max-w-lg shadow-sm">
              <input 
                type="file" 
                accept=".txt" 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center group-hover:bg-indigo-100 transition shadow-inner">
                  <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-semibold text-slate-800">Upload your script (.txt)</p>
                  <p className="text-sm text-slate-500 mt-1">Format: CHARACTER. Dialogue text</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {appState === AppState.CONFIGURING && script && (
          <div className="space-y-8 animate-in flex flex-col h-full">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-800 script-font line-clamp-2 px-4">{script.title}</h2>
              <p className="text-slate-500 mt-2">Identify your role and assign voices to others</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-shrink-0">
                  <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
                  Which role are you?
                </h3>
                <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-2 custom-scrollbar">
                  {script.roles.map(role => (
                    <button
                      key={role}
                      onClick={() => setUserRole(role)}
                      className={`px-4 py-3 text-sm rounded-xl border transition text-left truncate font-medium flex items-center gap-3 ${
                        userRole === role 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${userRole === role ? 'bg-white' : 'bg-emerald-500'}`} />
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-shrink-0">
                  <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
                  Configure AI Voices
                </h3>
                <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                  {script.roles.filter(r => r !== userRole).map(role => (
                    <div key={role} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50/50 border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${roleColorMap[role] || 'bg-slate-400'}`} />
                        <span className="text-sm font-bold text-slate-700 truncate uppercase tracking-tight">{role}</span>
                      </div>
                      <select
                        value={assignments[role]}
                        onChange={(e) => setAssignments({ ...assignments, [role]: e.target.value as VoiceName })}
                        className="text-sm border border-slate-200 rounded-lg py-1.5 px-2 focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white shadow-sm font-medium"
                      >
                        {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-6 flex-shrink-0">
              <button
                disabled={!userRole || script.lines.length === 0}
                onClick={() => setAppState(AppState.READING)}
                className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transform transition active:scale-95 flex items-center gap-3"
              >
                Go to Script Viewer
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {appState === AppState.READING && script && (
          <div className="flex flex-col h-full gap-4 relative animate-in fade-in">
            {/* Sticky Top Controls */}
            <div className="sticky top-0 z-40 w-full bg-slate-50/80 backdrop-blur pb-4 border-b border-slate-200 flex justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <span className={`block w-3 h-3 rounded-full ${isPlaying ? 'bg-indigo-600 animate-pulse' : isRecognizing ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`} />
                  {isRecognizing && <span className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">
                    Status
                  </span>
                  <span className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                    {isPlaying ? 'Reading in progress...' : isUserTurn ? (isRecognizing ? 'Listening for your line...' : 'Waiting for your line...') : 'Playback paused'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                 <button 
                  onClick={resetReading} 
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-rose-500 hover:border-rose-200 transition-all text-xs font-bold flex items-center gap-2 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  RESET
                </button>
                {!isPlaying && !isUserTurn && (
                  <button 
                    onClick={handleStart} 
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 transition-all"
                  >
                    RESUME
                  </button>
                )}
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 p-8 space-y-6 custom-scrollbar shadow-inner relative"
            >
              {script.lines.map((line, idx) => {
                const isUserLine = line.role.trim().toLowerCase() === userRole.trim().toLowerCase();
                const roleColor = isUserLine ? 'bg-emerald-500' : (roleColorMap[line.role] || 'bg-slate-400');
                const isActive = idx === currentLineIndex;
                
                return (
                  <div
                    key={line.id}
                    id={`line-${idx}`}
                    className={`relative p-6 rounded-2xl transition-all duration-500 border-2 flex gap-5 ${
                      isActive 
                      ? 'bg-indigo-50 border-indigo-200 shadow-lg scale-[1.01] z-10' 
                      : 'bg-transparent border-transparent opacity-40 grayscale-[0.3]'
                    } ${isUserLine ? 'ring-4 ring-emerald-500/10' : ''}`}
                  >
                    {/* Floating Stop Button inside active non-user line */}
                    {isActive && isPlaying && !isUserLine && (
                      <button
                        onClick={handleStop}
                        className="absolute -right-4 -top-4 z-20 bg-rose-600 text-white px-4 py-2 rounded-xl shadow-xl hover:bg-rose-700 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 font-bold text-sm ring-4 ring-white"
                      >
                        <div className="w-3 h-3 bg-white rounded-sm" />
                        STOP READING
                      </button>
                    )}

                    {/* Floating "I FINISHED MY LINE" Button inside active user line when paused */}
                    {isActive && !isPlaying && isUserLine && (
                      <div className="absolute -right-4 -top-8 z-30 flex flex-col items-end gap-2">
                        {isMicEnabled && isRecognizing && (
                           <div className="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full text-[10px] font-bold text-emerald-600 shadow-sm flex items-center gap-2">
                             <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                             Voice Detection Active
                           </div>
                        )}
                        <button
                          onClick={handleNextTurn}
                          className="bg-indigo-600 text-white px-8 py-4 rounded-2xl shadow-[0_15px_30px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 font-black text-lg ring-4 ring-white animate-pulse-slow"
                        >
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          I FINISHED MY LINE
                        </button>
                      </div>
                    )}

                    <div className="flex-shrink-0 pt-1.5">
                      <div className={`w-4 h-4 rounded-full shadow-sm ${roleColor} ${
                        isActive ? 'animate-pulse ring-4 ring-offset-2 ring-indigo-500/30' : ''
                      }`} />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className={`text-sm font-black uppercase tracking-widest ${
                          isUserLine ? 'text-emerald-600' : 'text-indigo-600'
                        }`}>
                          {line.role} {isUserLine && '(YOU)'}
                        </span>
                        {isActive && isLoadingLine && (
                          <span className="flex gap-1.5 items-center bg-indigo-100 px-3 py-1 rounded-full text-xs font-bold text-indigo-500 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                          </span>
                        )}
                      </div>
                      <p className={`script-font text-xl leading-relaxed ${
                        isUserLine ? 'text-slate-900 font-bold italic' : 'text-slate-700'
                      }`}>
                        {line.text}
                      </p>
                      
                      {isActive && isUserLine && lastTranscript && (
                        <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
                           <div className="p-1.5 bg-white rounded-lg shadow-sm">
                             <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                             </svg>
                           </div>
                           <div className="flex flex-col">
                             <span className="text-[10px] uppercase font-bold text-emerald-400 mb-0.5">I heard:</span>
                             <p className="text-sm text-emerald-700 italic">"{lastTranscript}..."</p>
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="h-64" />
            </div>

            {/* Global Bottom Button - Only for Start/Resume, not for user turns */}
            {!isPlaying && !isUserTurn && (
               <div className="w-full flex justify-center pb-6 mt-4 relative z-50">
                  <button
                    onClick={handleStart}
                    className="bg-indigo-600 text-white px-12 py-6 rounded-3xl flex items-center gap-4 font-black text-2xl shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all active:scale-95 animate-pulse-slow border-b-4 border-indigo-800"
                  >
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {currentLineIndex === -1 ? 'START READING' : 'RESUME READING'}
                  </button>
               </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; border: 2px solid #f1f5f9; }
        .animate-in { animation: animate-in 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes animate-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.02); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
