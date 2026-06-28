import React, { useState, useEffect, useRef } from "react";
import { ChatMessage, Task, Goal } from "../types";
import { saveTaskToFirestore } from "../service";
import { createCalendarEvent, createGmailDraft } from "../workspace";
import { 
  Sparkles, 
  Send, 
  Mic, 
  MicOff, 
  Loader2, 
  MessagesSquare, 
  CornerDownLeft, 
  Volume2, 
  VolumeX, 
  RefreshCw,
  Minimize2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AuraAssistantProps {
  tasks: Task[];
  goals: Goal[];
  onRefreshTasks: () => void;
  onSaveTask?: (taskData: any) => Promise<void>;
}

export function AuraAssistant({ tasks, goals, onRefreshTasks, onSaveTask }: AuraAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"text" | "live">("text");
  const [textMessages, setTextMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "model",
      text: "Hello! I am Aura, your workspace compiler. I can help you prioritize tasks, estimate effort, write Gmail drafts, or create calendar items. What would you like to achieve today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [loadingText, setLoadingText] = useState(false);

  // Live dialogue states
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<{ id: string; speaker: "user" | "aura"; text: string }[]>([]);
  const [isAuraSpeaking, setIsAuraSpeaking] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [waveHeights, setWaveHeights] = useState<number[]>([15, 15, 15, 15, 15, 15, 15, 15]);

  // Speech Recognition (Web Speech API)
  const recognitionRef = useRef<any>(null);
  const audioIntervalRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside listener to collapse
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded]);

  // Focus input when expanding
  useEffect(() => {
    if (isExpanded && activeTab === "text") {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isExpanded, activeTab]);

  // Scroll to bottom on message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [textMessages, liveTranscript]);

  // Audio wave animation
  useEffect(() => {
    if (isLiveActive) {
      audioIntervalRef.current = setInterval(() => {
        setWaveHeights(prev => {
          return prev.map(() => {
            const base = isAuraSpeaking ? 50 : micActive ? 30 : 15;
            return Math.floor(Math.random() * base) + 12;
          });
        });
      }, 100);
    } else {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
      }
      setWaveHeights([15, 15, 15, 15, 15, 15, 15, 15]);
    }
    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [isLiveActive, isAuraSpeaking, micActive]);

  // Send message to Express backend chat API
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loadingText) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setTextMessages(prev => [...prev, userMessage]);
    setInputText("");
    setLoadingText(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Pass complete chat hist, stripping ids/timestamps
        body: JSON.stringify({
          messages: [...textMessages, userMessage].map(m => ({
            role: m.role,
            text: m.text
          })),
          activeTasks: tasks,
          activeGoals: goals
        })
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with Aura API server");
      }

      const data = await response.json();

      // Execute AI directed workspace action if present
      if (data.action) {
        try {
          if (data.action.type === "create_task") {
            if (onSaveTask) {
              await onSaveTask({
                title: data.action.params.title,
                description: data.action.params.description || "Created via Aura Assistant",
                deadline: data.action.params.deadline,
                estimated_effort: data.action.params.estimated_effort || 30,
                goal_id: null
              });
            } else {
              await saveTaskToFirestore({
                title: data.action.params.title,
                description: data.action.params.description || "Created via Aura Assistant",
                deadline: data.action.params.deadline,
                estimated_effort: data.action.params.estimated_effort || 30,
                goal_id: null
              });
              onRefreshTasks();
            }
          } else if (data.action.type === "create_calendar_event") {
            await createCalendarEvent({
              summary: data.action.params.summary,
              description: data.action.params.description || "Scheduled via Aura Assistant",
              start: data.action.params.start,
              end: data.action.params.end
            });
          } else if (data.action.type === "create_gmail_draft") {
            await createGmailDraft(
              data.action.params.to,
              data.action.params.subject,
              data.action.params.bodyText
            );
          }
        } catch (actErr) {
          console.error("Workspace action execution failure:", actErr);
        }
      }

      const modelMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "model",
        text: data.text || "I was unable to compile a response. Please double-check our workspace parameters.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTextMessages(prev => [...prev, modelMessage]);

      // If user asks about priority or tasks, trigger refresh
      if (textToSend.toLowerCase().includes("prioriti") || textToSend.toLowerCase().includes("recalc") || textToSend.toLowerCase().includes("estimate") || data.action?.type === "create_task") {
        onRefreshTasks();
      }

    } catch (err: any) {
      console.error(err);
      setTextMessages(prev => [...prev, {
        id: `msg-err-${Date.now()}`,
        role: "model",
        text: "Encountered workspace compilation disconnect. Offline mode is fallback.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setLoadingText(false);
    }
  };

  // Speaks aloud via client synthesis for Voice Conversations
  const speakAloud = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    // Clean up markdown markers for natural speech
    const cleanText = text
      .replace(/[*_#`\-+]/g, "")
      .replace(/\[.*?\]/g, "")
      .substring(0, 150); // limit spoken feedback longevity

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onstart = () => setIsAuraSpeaking(true);
    utterance.onend = () => {
      setIsAuraSpeaking(false);
      // Restart mic listening if dialogue is still active
      if (isLiveActive) {
        startMicRecognition();
      }
    };
    utterance.onerror = () => setIsAuraSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startMicRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
      setLiveTranscript(prev => [...prev, { id: `err-${Date.now()}`, speaker: "aura", text: "Voice synthesis and microphone tracking are not supported in your browser context. Please write using text mode instead." }]);
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).speechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => {
      setMicActive(true);
    };

    rec.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      if (!text.trim()) return;

      setLiveTranscript(prev => [...prev, { id: `usr-${Date.now()}`, speaker: "user", text }]);
      setMicActive(false);

      // Call assistant
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", text }],
            activeTasks: tasks,
            activeGoals: goals
          })
        });

        if (!response.ok) throw new Error();
        const data = await response.json();

        // Process live voice guided workspace action if available
        if (data.action) {
          try {
            if (data.action.type === "create_task") {
              if (onSaveTask) {
                await onSaveTask({
                  title: data.action.params.title,
                  description: data.action.params.description || "Created via Aura Voice Assistant",
                  deadline: data.action.params.deadline,
                  estimated_effort: data.action.params.estimated_effort || 30,
                  goal_id: null
                });
              } else {
                await saveTaskToFirestore({
                  title: data.action.params.title,
                  description: data.action.params.description || "Created via Aura Voice Assistant",
                  deadline: data.action.params.deadline,
                  estimated_effort: data.action.params.estimated_effort || 30,
                  goal_id: null
                });
                onRefreshTasks();
              }
            } else if (data.action.type === "create_calendar_event") {
              await createCalendarEvent({
                summary: data.action.params.summary,
                description: data.action.params.description || "Scheduled via Aura Voice Assistant",
                start: data.action.params.start,
                end: data.action.params.end
              });
            } else if (data.action.type === "create_gmail_draft") {
              await createGmailDraft(
                data.action.params.to,
                data.action.params.subject,
                data.action.params.bodyText
              );
            }
          } catch (actErr) {
            console.error("Workspace voice action execution failure:", actErr);
          }
        }
        
        setLiveTranscript(prev => [...prev, { id: `aur-${Date.now()}`, speaker: "aura", text: data.text }]);
        speakAloud(data.text);
      } catch {
        const fallback = "System compilation error. I couldn't transmit voice telemetry.";
        setLiveTranscript(prev => [...prev, { id: `aur-${Date.now()}`, speaker: "aura", text: fallback }]);
        speakAloud(fallback);
      }
    };

    rec.onerror = () => {
      setMicActive(false);
    };

    rec.onend = () => {
      setMicActive(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const handleToggleLiveMode = () => {
    if (isLiveActive) {
      setIsLiveActive(false);
      setMicActive(false);
      setIsAuraSpeaking(false);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } else {
      setIsLiveActive(true);
      setLiveTranscript([
        { id: "init-live", speaker: "aura", text: "Deep dialogue initialized. I'm connected to the workspace server. Aura Live API ready. Speak whenever you are ready." }
      ]);
      speakAloud("Dialogue connection active. Ready to coordinate.");
    }
  };

  if (!isExpanded) {
    return (
      <div 
        ref={containerRef}
        onClick={() => setIsExpanded(true)}
        className="rounded-[24px] border border-[#E8E4DF] dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/40 shadow-sm hover:shadow-md hover:border-[#D97757]/40 transition-all duration-300 flex items-center justify-between p-3.5 cursor-pointer group"
        id="aura-collapsed-launcher"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#D97757]/10 dark:bg-zinc-800/80 flex items-center justify-center border border-[#D97757]/20 group-hover:scale-105 transition-transform duration-300">
              <MessagesSquare className="w-5 h-5 text-[#D97757]" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold font-display text-[#2D2C2A] dark:text-zinc-200">
                Aura Assistant
              </h4>
              <span className="text-[8px] uppercase font-mono tracking-widest text-zinc-500 font-bold bg-[#D4DBCB]/40 dark:bg-zinc-800/55 px-1.5 py-0.5 rounded">
                Online
              </span>
            </div>
            <input
              type="text"
              placeholder="Ask Aura anything or start typing..."
              value=""
              onChange={(e) => {
                setInputText(e.target.value);
                setIsExpanded(true);
              }}
              onFocus={() => {
                setIsExpanded(true);
              }}
              className="w-full bg-transparent border-none p-0 text-xs text-zinc-450 dark:text-zinc-400 focus:outline-none mt-0.5 placeholder-zinc-400 dark:placeholder-zinc-500 truncate cursor-pointer"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button 
            className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-[#D97757] dark:hover:text-zinc-300 transition-all cursor-pointer"
            title="Open Voice Chat"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab("live");
              setIsExpanded(true);
            }}
          >
            <Mic className="w-4 h-4" />
          </button>
          <div className="p-2 rounded-xl bg-[#D97757]/10 text-[#D97757] font-bold text-xs flex items-center gap-1 group-hover:bg-[#D97757]/15 transition-all">
            <span>Open</span>
            <Sparkles className="w-3 h-3 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-[28px] border border-[#E8E4DF] dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/40 shadow-sm flex flex-col h-[524px] overflow-hidden relative">
      {/* Tab Switcher Headers */}
      <div className="flex px-4 pt-3 border-b border-[#E8E4DF] dark:border-zinc-800/60 justify-between items-center bg-[#F7F5F2]/60 dark:bg-zinc-900/20 rounded-t-[28px]">
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab("text")}
            className={`px-3 py-2 text-xs font-bold leading-tight font-display border-b-2 transition-all ${
              activeTab === "text" 
                ? "border-[#D97757] text-[#2D2C2A] dark:text-zinc-100" 
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <MessagesSquare className="w-3.5 h-3.5 text-[#D97757]" /> Workspace Dialogue
            </span>
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`px-3 py-2 text-xs font-bold leading-tight font-display border-b-2 transition-all ${
              activeTab === "live" 
                ? "border-[#D97757] text-[#2D2C2A] dark:text-zinc-100" 
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D97757] animate-pulse" /> Live Voice API
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] uppercase font-mono tracking-widest text-zinc-500 font-bold bg-[#D4DBCB]/40 dark:bg-zinc-800/55 px-2.5 py-1 rounded-full">
            Co-Compiler
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 hover:bg-zinc-250/50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer"
            title="Minimize Chat"
            id="aura-minimize-btn"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Container Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col h-full bg-transparent">
        {activeTab === "text" ? (
          <>
            {/* Scrollable messages thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {textMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#D97757] text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-sm animate-fade-in"
                      : "bg-white/80 dark:bg-zinc-900/60 text-[#2D2C2A] dark:text-zinc-300 border border-[#E8E4DF] dark:border-zinc-800"
                  }`}>
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-line select-text font-sans text-white dark:text-zinc-950 font-medium leading-relaxed">
                        {msg.text}
                      </p>
                    ) : (
                      <p className="whitespace-pre-line select-text font-serif italic text-[#2D2C2A]/95 dark:text-neutral-100 font-medium leading-relaxed">
                        "{msg.text}"
                      </p>
                    )}
                    <span className="block text-[9px] mt-1.5 opacity-50 text-right font-mono">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {loadingText && (
                <div className="flex justify-start">
                  <div className="bg-white/80 dark:bg-zinc-900/60 rounded-2xl px-4 py-3 flex items-center gap-2 border border-[#E8E4DF] dark:border-zinc-800/40">
                    <Loader2 className="w-4 h-4 animate-spin text-[#D97757]" />
                    <span className="text-xs text-[#5A644D] dark:text-zinc-400 font-mono tracking-widest uppercase font-bold">Consulting Core Brain...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Footer Form */}
            <div className="p-3 border-t border-[#E8E4DF] dark:border-zinc-800/60 bg-white/40 dark:bg-transparent flex-shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(inputText);
                }}
                className="flex items-center gap-2 relative"
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask Aura: 'Prioritize my day' or 'Draft a review mail'..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 pl-4 pr-12 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all font-sans"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || loadingText}
                  className="absolute right-2 p-2 text-zinc-400 hover:text-[#D97757] dark:hover:text-zinc-200 disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Live Voice Dialog tab */
          <div className="p-4 flex flex-col h-full space-y-4 bg-transparent">
            {!isLiveActive ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                {/* Glowing AI Orb Visualizer */}
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-[#D97757]/10 dark:bg-indigo-500/5 flex items-center justify-center border border-[#D97757]/30">
                    <Mic className="w-6 h-6 text-[#D97757]" />
                  </div>
                  <div className="absolute inset-0 w-16 h-16 rounded-full border border-[#D97757]/20 animate-ping" />
                </div>

                <div className="space-y-1.5 max-w-[260px]">
                  <h4 className="text-sm font-bold font-display text-[#2D2C2A] dark:text-zinc-200">
                    Start Voice Stream
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">
                    Direct voice processing simulation connected to Gemini models. Speak whenever you are ready.
                  </p>
                </div>

                <button
                  onClick={handleToggleLiveMode}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D97757] hover:bg-[#D97757]/90 active:scale-95 transition-all w-44 shadow-sm cursor-pointer"
                >
                  Connect Dialogue
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Transcript feed */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto mb-4 border border-[#E8E4DF] dark:border-zinc-800/40 rounded-[20px] p-3.5 bg-[#F7F5F2]/50 dark:bg-zinc-950/20 space-y-2">
                  {liveTranscript.map((tr) => (
                    <div key={tr.id} className="text-xs">
                      <span className={`font-semibold uppercase tracking-wider text-[9px] mr-1 ${tr.speaker === "aura" ? "text-[#5A644D]" : "text-[#D97757]"}`}>
                        {tr.speaker === "aura" ? "AURA >>" : "USER >>"}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300 font-sans">{tr.text}</span>
                    </div>
                  ))}
                </div>

                {/* Live sound Wave animation and controls */}
                <div className="bg-[#F7F5F2] dark:bg-zinc-900/30 rounded-[22px] p-4 flex flex-col items-center justify-center space-y-4 border border-[#E8E4DF] dark:border-zinc-800/30 flex-shrink-0">
                  <div className="flex items-center gap-1.5 h-12 justify-center w-full">
                    {waveHeights.map((h, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: h }}
                        transition={{ duration: 0.1 }}
                        className={`w-1 rounded-full ${isAuraSpeaking ? "bg-[#5A644D] shadow-[0_0_8px_rgba(90,100,77,0.5)]" : micActive ? "bg-[#D97757]" : "bg-zinc-300 dark:bg-zinc-700"}`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between w-full border-t border-[#E8E4DF] dark:border-zinc-800/40 pt-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${micActive || isAuraSpeaking ? "bg-[#5A644D] animate-pulse" : "bg-zinc-400"}`} />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-550 dark:text-zinc-400 font-mono">
                        {isAuraSpeaking ? "Voice Synthesis" : micActive ? "Listening" : "Coordinated"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Manual Push-To-Talk / listen icon */}
                      {!isAuraSpeaking && (
                        <button
                          onClick={startMicRecognition}
                          disabled={micActive}
                          className={`p-2 rounded-full transition-all ${micActive ? "bg-[#5A644D] text-white" : "bg-white/80 hover:bg-neutral-200/50 dark:bg-zinc-800 dark:text-zinc-300 border border-[#E8E4DF] dark:border-zinc-750"}`}
                          title="Trigger Listen Session"
                        >
                          <Mic className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={handleToggleLiveMode}
                        className="px-4 py-1.5 rounded-xl text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        Disconnect Stream
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
