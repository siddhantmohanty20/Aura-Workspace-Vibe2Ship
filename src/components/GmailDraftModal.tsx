import React, { useState, useEffect } from "react";
import { Task } from "../types";
import { createGmailDraft } from "../workspace";
import { X, Mail, Sparkles, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GmailDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
}

export function GmailDraftModal({ isOpen, onClose, task }: GmailDraftModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (task) {
      setTo("");
      setSubject(`Aura Focus: Workspace Action Item - ${task.title}`);
      
      const deadlineText = new Date(task.deadline).toLocaleString();
      const bodyTemplate = `Hi Team,\n\nI am currently working on the following workspace task within Aura:\n\nTask: ${task.title}\nDescription: ${task.description || "No description provided."}\nDeadline: ${deadlineText}\nEstimated effort: ${task.estimated_effort} minutes\nPriority Score: ${task.priority_score}%\n\nPlease let me know if there are any roadblocks or adjustments required.\n\nBest regards,\nAura Workspace Compiler`;
      setBody(bodyTemplate);
    }
    setSuccess(false);
    setError("");
  }, [task, isOpen]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    if (!to.trim()) {
      setError("Please input a recipient email address.");
      return;
    }

    // Mandatory interaction confirmation
    const confirmed = window.confirm(
      `Confirm draft creation: Aura will write this draft email directly inside your Gmail account with your permission.\n\nTo: ${to}\nSubject: ${subject}\n\nProceed?`
    );
    if (!confirmed) return;

    setIsSending(true);
    setError("");
    try {
      await createGmailDraft(to.trim(), subject.trim(), body.trim());
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create Gmail draft. Please check your authorization.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-lg bg-[#F7F5F2] dark:bg-zinc-950 shadow-2xl rounded-[28px] overflow-hidden z-10 border border-[#E8E4DF] dark:border-zinc-800"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#E8E4DF] dark:border-zinc-800 flex items-center justify-between bg-[#D4DBCB]/30">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#5A644D]" />
                <h3 className="text-base font-bold font-serif italic text-[#2D2C2A] dark:text-zinc-100 select-none">
                  Compose Gmail Draft
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-650 hover:bg-neutral-200/40 dark:hover:bg-zinc-805 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success state */}
            {success ? (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
                <CheckCircle2 className="w-14 h-14 text-[#5A644D] animate-bounce" />
                <h4 className="text-lg font-bold font-serif italic text-[#2D2C2A] dark:text-zinc-200">
                  Draft Successfully Created!
                </h4>
                <p className="text-zinc-505 dark:text-zinc-400 text-xs max-w-sm">
                  We have saved a draft of this action item in your Gmail box. Open Gmail to review and send it.
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#5A644D] hover:bg-[#5A644D]/90"
                >
                  Close Panel
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateDraft} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-rose-55 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Recipient email */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E]">
                    Recipient Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="teammate@example.com"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E]">
                    Subject Line *
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all"
                  />
                </div>

                {/* HTML/Text Message Body */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#7A756E]">
                    Draft Email Content Preview
                  </label>
                  <textarea
                    required
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all resize-none"
                  />
                </div>

                {/* Confirmation Box guidance */}
                <div className="pt-3 flex items-center justify-between border-t border-[#E8E4DF] dark:border-zinc-800">
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#D97757] animate-pulse" /> Connected to secure Google Compose
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-700 hover:bg-neutral-200/40 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSending}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D97757] hover:bg-[#D97757]/95 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      <span>Save Draft</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
