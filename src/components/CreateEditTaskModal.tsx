import React, { useState, useEffect } from "react";
import { Task, Goal } from "../types";
import { X, Sparkles, AlertCircle, HelpCircle, Mic, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CreateEditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: {
    id?: string;
    title: string;
    description: string;
    deadline: string;
    estimated_effort: number;
    goal_id: string | null;
    recurrence?: 'none' | 'daily' | 'weekly';
  }) => void;
  task?: Task | null;
  goals: Goal[];
}

export function CreateEditTaskModal({
  isOpen,
  onClose,
  onSave,
  task,
  goals
}: CreateEditTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedEffort, setEstimatedEffort] = useState<number | "">("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>('none');
  const [error, setError] = useState("");

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

  // Populate data when task changes or modal opens
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      
      // format for datetime-local: YYYY-MM-DDTHH:MM in local time
      try {
        const d = new Date(task.deadline);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
        setDeadline(formatted);
      } catch {
        setDeadline(task.deadline);
      }
      
      setEstimatedEffort(task.estimated_effort);
      setGoalId(task.goal_id);
      setRecurrence(task.recurrence || 'none');
    } else {
      // Default new task fields
      setTitle("");
      setDescription("");
      
      // Default deadline to tomorrow at 9 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      try {
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const hours = String(tomorrow.getHours()).padStart(2, '0');
        const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
        setDeadline(`${year}-${month}-${day}T${hours}:${minutes}`);
      } catch {
        setDeadline("");
      }
      
      setEstimatedEffort("");
      setGoalId(null);
      setRecurrence('none');
    }
    setError("");
  }, [task, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please supply a task title.");
      return;
    }
    if (!deadline) {
      setError("Please specify a deadline date and time.");
      return;
    }

    let finalIsoString = "";
    let intermediateDate: Date;
    if (deadline.includes('T')) {
      const [datePart, timePart] = deadline.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      intermediateDate = new Date(year, month - 1, day, hours, minutes);
      finalIsoString = intermediateDate.toISOString();
    } else {
      intermediateDate = new Date(deadline);
      finalIsoString = intermediateDate.toISOString();
    }

    console.log(`[DEBUG deadline parsing]
      (1) Raw picker value: ${deadline}
      (2) Timezone offset (minutes): ${new Date().getTimezoneOffset()}
      (3) Intermediate Date object: ${intermediateDate.toString()}
      (4) Final stored UTC ISO string: ${finalIsoString}`);

    onSave({
      id: task?.id,
      title: title.trim(),
      description: description.trim(),
      deadline: finalIsoString,
      estimated_effort: estimatedEffort === "" ? 0 : Number(estimatedEffort),
      goal_id: goalId,
      recurrence: recurrence,
    });
    
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
          />

          {/* Slide-over Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="relative w-full max-w-md h-full bg-[#F7F5F2] dark:bg-zinc-950 shadow-2xl flex flex-col z-10 border-l border-[#E8E4DF] dark:border-zinc-800"
          >
            {/* Header */}
            <div className="h-16 px-6 border-b border-[#E8E4DF] dark:border-zinc-800 flex items-center justify-between bg-white/40">
              <h2 className="text-lg font-bold font-serif italic text-[#2D2C2A] dark:text-zinc-100 select-none">
                {task ? "Edit Task" : "Launch New Task"}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-650 hover:bg-neutral-200/50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Title Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E] dark:text-zinc-400">
                  Task Title *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Prepare Quarter Audit Draft"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all"
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
                          setTitle(transcriptionConfirm);
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
              </div>

              {/* Description textarea */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E] dark:text-zinc-400">
                  Task Description
                </label>
                <textarea
                  placeholder="Details of what needs to be achieved..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all resize-none"
                />
              </div>

              {/* Deadline Datetime picker */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E] dark:text-zinc-400">
                  Deadline *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-805 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all"
                />
              </div>

              {/* Effort input (Minutes) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E] dark:text-zinc-400">
                    Estimated Effort (Minutes)
                  </label>
                  <span className="text-[10px] text-zinc-550 dark:text-zinc-500 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#D97757] animate-pulse" /> Leave blank for AI estimate
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="e.g. 45"
                  value={estimatedEffort}
                  onChange={(e) => setEstimatedEffort(e.target.value === "" ? "" : Number(e.target.value))}
                  min={1}
                  className="w-full px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Linked Goal Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E] dark:text-zinc-400">
                  Link to Workspace Goal
                </label>
                <select
                  value={goalId || ""}
                  onChange={(e) => setGoalId(e.target.value === "" ? null : e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all"
                >
                  <option value="">(No Linked Goal - Standalone task)</option>
                  {goals.filter(g => g.status !== "archived").map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Recurrence Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E] dark:text-zinc-400">
                  Recurrence (Habit Cadence)
                </label>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as 'none' | 'daily' | 'weekly')}
                  className="w-full px-4 py-3 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all"
                >
                  <option value="none">One-time Task</option>
                  <option value="daily">Daily Habit / Task</option>
                  <option value="weekly">Weekly Habit / Task</option>
                </select>
              </div>

              <div className="bg-[#D4DBCB]/30 dark:bg-zinc-900/40 p-3.5 rounded-2xl flex items-start gap-2 border border-[#E8E4DF] dark:border-zinc-800/40">
                <HelpCircle className="w-4 h-4 text-[#5A644D] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-[#5A644D] dark:text-[#A4B594]">
                  When you save, <strong>Aura's workspace compiler</strong> evaluates your deadlines, estimates effort if necessary, and automatically recalibrates priority scores.
                </p>
              </div>
            </form>

            {/* Footer Buttons */}
            <div className="h-20 px-6 border-t border-[#E8E4DF] dark:border-zinc-800 flex items-center justify-end gap-3 flex-shrink-0 bg-white/40 dark:bg-zinc-950/20">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-neutral-200/50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D97757] hover:bg-[#D97757]/90 shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {estimatedEffort === "" && <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />}
                Save Task
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
