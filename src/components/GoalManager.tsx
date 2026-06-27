import React, { useState } from "react";
import { Goal, Task } from "../types";
import { 
  Plus, 
  Trash2, 
  CheckSquare, 
  ChevronRight, 
  ChevronDown, 
  Target,
  Sparkles,
  ClipboardList,
  Loader2,
  Mic,
  MicOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GoalManagerProps {
  goals: Goal[];
  tasks: Task[];
  onCreateGoal: (title: string) => void;
  onDeleteGoal: (id: string) => void;
  onDecomposeGoal?: (title: string) => Promise<void>;
}

export function GoalManager({
  goals,
  tasks,
  onCreateGoal,
  onDeleteGoal,
  onDecomposeGoal
}: GoalManagerProps) {
  const [newTitle, setNewTitle] = useState("");
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceAlert, setVoiceAlert] = useState("");
  const [transcriptionConfirm, setTranscriptionConfirm] = useState<string | null>(null);

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).speechRecognition;
    if (!SpeechRecognition) {
      setVoiceAlert("Speech Recognition not supported in this browser.");
      return;
    }

    setIsListening(true);
    setVoiceAlert("");
    setTranscriptionConfirm(null);
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (!transcript || transcript.trim().length === 0) {
        setVoiceAlert("Could not hear anything clearly. Please try again.");
      } else {
        setTranscriptionConfirm(transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error(event);
      setVoiceAlert("Voice error: " + event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateGoal(newTitle.trim());
    setNewTitle("");
  };

  const handleDecompose = async () => {
    if (!newTitle.trim() || !onDecomposeGoal) return;
    setIsDecomposing(true);
    try {
      await onDecomposeGoal(newTitle.trim());
      setNewTitle("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsDecomposing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedGoalId(expandedGoalId === id ? null : id);
  };

  return (
    <div className="space-y-6 flex flex-col justify-stretch">
      {/* Create Goal Form */}
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex flex-col gap-2 w-full">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Design a major business goal..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all font-display"
            />
            <button
              type="button"
              onClick={startVoiceInput}
              disabled={isListening}
              className={`p-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 transition-all ${
                isListening 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : 'bg-white/70 dark:bg-zinc-900/50 text-zinc-500 hover:text-[#D97757] hover:border-[#D97757] cursor-pointer'
              }`}
              title="Voice Dictation"
            >
              {isListening ? <MicOff className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {voiceAlert && (
            <p className="text-[10px] text-rose-500 font-mono italic px-1">{voiceAlert}</p>
          )}

          {transcriptionConfirm && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-150 dark:border-emerald-900/40 space-y-2.5 text-xs">
              <p className="font-bold text-emerald-800 dark:text-emerald-400">Speech Transcribed:</p>
              <p className="italic text-zinc-700 dark:text-zinc-200 bg-white/80 dark:bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-850">
                "{transcriptionConfirm}"
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewTitle(transcriptionConfirm);
                    setTranscriptionConfirm(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer text-[11px]"
                >
                  Confirm & Use
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptionConfirm(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer text-[11px]"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-stretch">
            <button
              type="submit"
              disabled={!newTitle.trim() || isDecomposing}
              className="flex-1 py-2.5 bg-[#2D2C2A] text-white dark:bg-zinc-800 rounded-xl text-xs font-bold hover:bg-neutral-800 hover:dark:bg-zinc-700 shadow-sm active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Goal</span>
            </button>
            {onDecomposeGoal && (
              <button
                type="button"
                onClick={handleDecompose}
                disabled={!newTitle.trim() || isDecomposing}
                className="flex-1 py-2.5 bg-[#D4DBCB]/30 hover:bg-[#D4DBCB]/50 dark:bg-zinc-800 text-[#5A644D] dark:text-emerald-400 rounded-xl text-xs font-bold hover:bg-opacity-95 shadow-sm active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
              >
                {isDecomposing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Decomposing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[#D97757]" />
                    <span>AI Decompose</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Goal Listing */}
      <div className="space-y-3">
        {goals.length === 0 ? (
          <div className="bg-[#F7F5F2]/50 dark:bg-zinc-900/20 border border-[#E8E4DF]/60 dark:border-zinc-800/40 rounded-[24px] p-8 text-center flex flex-col items-center justify-center">
            <Target className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
            <h4 className="text-zinc-700 dark:text-zinc-300 font-semibold mb-1 text-sm font-display">No Workspace Goals Defined</h4>
            <p className="text-zinc-400 dark:text-zinc-500 text-xs max-w-xs leading-relaxed">
              Create a goal to organize sub-tasks. Organizing your goals enhances priority scoring metrics.
            </p>
          </div>
        ) : (
          goals.map((goal) => {
            const linkedTasks = tasks.filter((t) => t.goal_id === goal.id);
            const completedCount = linkedTasks.filter((t) => t.status === "done").length;
            const totalCount = linkedTasks.length;
            const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isExpanded = expandedGoalId === goal.id;

            return (
              <motion.div
                key={goal.id}
                layoutId={`goal-wrapper-${goal.id}`}
                className="border border-[#E8E4DF] dark:border-zinc-800/60 rounded-[22px] dark:bg-zinc-900/40 bg-white/70 overflow-hidden transition-all duration-300 hover:border-[#D4DBCB]/80 dark:hover:border-zinc-700"
              >
                {/* Goal Header Row */}
                <div 
                  onClick={() => toggleExpand(goal.id)}
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 transition-colors">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <Target className="w-5 h-5 text-[#D97757] flex-shrink-0" />
                    <span className="text-sm font-semibold tracking-tight text-[#2D2C2A] dark:text-zinc-150 truncate font-display">
                      {goal.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Goal Progress Bar & Ratio info */}
                    <div className="text-right">
                      <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 font-bold">
                        {completedCount}/{totalCount} tasks
                      </span>
                      {totalCount > 0 && (
                        <div className="w-20 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="bg-[#5A644D] dark:bg-emerald-600 h-full rounded-full"
                          />
                        </div>
                      )}
                    </div>

                    {/* Delete goal */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteGoal(goal.id);
                      }}
                      className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-450 transition-all duration-200"
                      title="Delete Goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Goal Sub-tasks List */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-[#E8E4DF] dark:border-zinc-800/40 bg-[#F7F5F2]/40 dark:bg-zinc-950/20 px-4 py-3"
                    >
                      {linkedTasks.length === 0 ? (
                        <div className="py-4 text-center">
                          <ClipboardList className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-1.5" />
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            No sub-tasks currently linked.
                          </p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                            Use the Edit Task menu to link tasks to this goal.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {linkedTasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 border border-transparent transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <CheckSquare className={`w-4 h-4 shrink-0 ${task.status === "done" ? "text-emerald-600" : "text-[#7A756E]"}`} />
                                <span className={`text-xs truncate ${task.status === "done" ? "line-through text-zinc-400 dark:text-zinc-500 font-normal" : "text-zinc-800 dark:text-zinc-300"}`}>
                                  {task.title}
                                </span>
                              </div>
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium border uppercase tracking-wider ${
                                task.status === "done" 
                                  ? "bg-zinc-100 border-transparent text-zinc-500 dark:bg-zinc-900 dark:text-zinc-600"
                                  : task.status === "overdue"
                                  ? "bg-[#F2D7D0] border-rose-500/10 text-rose-850 dark:bg-rose-950/20 dark:border-rose-900/20"
                                  : "bg-[#D4DBCB]/30 border-transparent text-[#5A644D] dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400"
                              }`}>
                                {task.status.replace("_", " ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
