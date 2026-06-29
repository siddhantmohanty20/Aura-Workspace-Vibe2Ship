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
  onCreateGoal?: (title: string) => Promise<void>;
  onDecomposeGoal?: (title: string) => Promise<void>;
  onDeleteTask?: (id: string) => Promise<void>;
  onDeleteGoal?: (id: string) => Promise<void>;
  onPrioritizeTasks?: () => Promise<void>;
  onCreateNote?: (content: string) => Promise<void>;
  onExtractNote?: (content: string) => Promise<void>;
}

export function AuraAssistant({ tasks, goals, onRefreshTasks, onSaveTask, onCreateGoal, onDecomposeGoal, onDeleteTask, onDeleteGoal, onPrioritizeTasks, onCreateNote, onExtractNote }: AuraAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
  const [isListening, setIsListening] = useState(false);

  // Speech Recognition (Web Speech API)
  const recognitionRef = useRef<any>(null);
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
    if (isExpanded) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isExpanded]);

  // Scroll to bottom on message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [textMessages]);

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
      const currentNow = new Date();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Pass complete chat hist, stripping ids/timestamps
        body: JSON.stringify({
          messages: [...textMessages, userMessage].map(m => ({
            role: m.role,
            text: m.text
          })),
          activeTasks: tasks.filter(t => t.status !== "archived"),
          activeGoals: goals.filter(g => g.status !== "archived"),
          currentTimeStr: currentNow.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
          } else if (data.action.type === "update_task") {
            if (onSaveTask) {
              await onSaveTask({
                id: data.action.params.id,
                title: data.action.params.title,
                description: data.action.params.description || "Updated via Aura Assistant",
                deadline: data.action.params.deadline,
                estimated_effort: data.action.params.estimated_effort || 30,
                goal_id: null
              });
            } else {
              await saveTaskToFirestore({
                id: data.action.params.id,
                title: data.action.params.title,
                description: data.action.params.description || "Updated via Aura Assistant",
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
          } else if (data.action.type === "create_goal" && onCreateGoal) {
            await onCreateGoal(data.action.params.title);
          } else if (data.action.type === "decompose_goal" && onDecomposeGoal) {
            await onDecomposeGoal(data.action.params.title);
          } else if (data.action.type === "delete_task" && onDeleteTask) {
            await onDeleteTask(data.action.params.id);
          } else if (data.action.type === "delete_goal" && onDeleteGoal) {
            await onDeleteGoal(data.action.params.id);
          } else if (data.action.type === "prioritize_tasks" && onPrioritizeTasks) {
            await onPrioritizeTasks();
          } else if (data.action.type === "create_note" && onCreateNote) {
            await onCreateNote(data.action.params.content);
          } else if (data.action.type === "extract_note" && onExtractNote) {
            await onExtractNote(data.action.params.content);
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

  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).speechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech Recognition not supported in this browser.");
      return;
    }

    setIsListening(true);
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim().length > 0) {
        setInputText(transcript);
        handleSendMessage(transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
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
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isListening
                ? "bg-rose-500 text-white animate-pulse"
                : "bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-[#D97757] dark:hover:text-zinc-300"
            }`}
            title="Voice Input"
            onClick={(e) => {
              e.stopPropagation();
              if (!isExpanded) setIsExpanded(true);
              toggleVoiceInput();
            }}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
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
          <div
            className="px-3 py-2 text-xs font-bold leading-tight font-display border-b-2 border-[#D97757] text-[#2D2C2A] dark:text-zinc-100 transition-all"
          >
            <span className="flex items-center gap-1.5">
              <MessagesSquare className="w-3.5 h-3.5 text-[#D97757]" /> Workspace Dialogue
            </span>
          </div>
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
                className="flex-1 pl-4 pr-[88px] py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all font-sans"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`p-2 rounded-lg transition-colors ${
                    isListening
                      ? "text-rose-500 bg-rose-500/10 animate-pulse"
                      : "text-zinc-400 hover:text-[#D97757] dark:hover:text-zinc-200"
                  }`}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  type="submit"
                  disabled={!inputText.trim() || loadingText}
                  className="p-2 text-zinc-400 hover:text-[#D97757] dark:hover:text-zinc-200 disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </>
      </div>
    </div>
  );
}
