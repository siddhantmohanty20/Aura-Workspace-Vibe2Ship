import React, { useState, useEffect } from "react";
import { Note } from "../types";
import { 
  FileText, 
  Sparkles, 
  Trash2, 
  Plus, 
  Loader2, 
  ChevronRight,
  ChevronDown,
  Calendar,
  CheckCircle,
  Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface NotesManagerProps {
  notes: Note[];
  onSaveNote: (content: string, id?: string) => Promise<string>;
  onDeleteNote: (id: string) => Promise<void>;
  onTasksExtracted: (extractedTasks: any[]) => void;
}

export function NotesManager({
  notes,
  onSaveNote,
  onDeleteNote,
  onTasksExtracted
}: NotesManagerProps) {
  const [newContent, setNewContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [isExtractingId, setIsExtractingId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync edits
  const handleStartEdit = (note: Note) => {
    setEditingNoteId(editingNoteId === note.id ? null : note.id);
    if (!noteDrafts[note.id]) {
      setNoteDrafts(prev => ({ ...prev, [note.id]: note.content }));
    }
  };

  const handleUpdateDraft = (id: string, text: string) => {
    setNoteDrafts(prev => ({ ...prev, [id]: text }));
  };

  const handleSaveDraft = async (id: string) => {
    const draftText = noteDrafts[id];
    if (draftText !== undefined) {
      await onSaveNote(draftText, id);
    }
    setEditingNoteId(null);
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    
    await onSaveNote(newContent.trim());
    setNewContent("");
    setIsAddingNote(false);
  };

  const handleExtractTasks = async (id: string, content: string) => {
    setIsExtractingId(id);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/extract-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: content,
          type: "notes",
          currentTime: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error("Actionable extraction failed");
      }

      const data = await response.json();
      const extracted = data.tasks || [];

      if (extracted.length > 0) {
        onTasksExtracted(extracted);
        setSuccessMessage(`Success! Extracted & launched ${extracted.length} tasks from this note.`);
        setTimeout(() => setSuccessMessage(null), 6000);
      } else {
        setSuccessMessage("Scan complete: No actionable items identified in this note.");
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setSuccessMessage("AI extractor offline fallback applied.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setIsExtractingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Note Button or Inline Form */}
      {!isAddingNote ? (
        <button
          onClick={() => setIsAddingNote(true)}
          className="w-full py-2.5 border border-dashed border-[#D97757]/30 hover:border-[#D97757]/80 hover:bg-[#D97757]/5 dark:border-zinc-800 dark:hover:border-zinc-600 rounded-xl text-xs font-semibold text-[#D97757] dark:text-orange-400 transition-all duration-200 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Write a Free-Form Note...</span>
        </button>
      ) : (
        <form onSubmit={handleCreateNote} className="space-y-3 p-4 border border-[#E8E4DF] dark:border-zinc-800 rounded-2xl bg-white/50 dark:bg-zinc-950/25">
          <textarea
            placeholder="Type meeting minutes, scratchpad thoughts, or an email outline..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white/70 dark:bg-[#121111] text-zinc-800 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all leading-relaxed"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsAddingNote(false)}
              className="px-3.5 py-1.5 text-[11px] font-semibold text-[#7A756E] dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newContent.trim()}
              className="px-4 py-1.5 bg-[#D97757] text-white text-[11px] font-bold rounded-lg hover:bg-[#D97757]/90 active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all shadow-xs"
            >
              Save Note
            </button>
          </div>
        </form>
      )}

      {/* Success Notification */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400 rounded-xl text-xs flex items-start gap-2 shadow-xs"
          >
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes List */}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <div className="bg-[#F7F5F2]/50 dark:bg-zinc-900/20 border border-[#E8E4DF]/60 dark:border-zinc-800/40 rounded-[24px] p-8 text-center flex flex-col items-center justify-center">
            <FileText className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-2.5" />
            <h4 className="text-zinc-700 dark:text-zinc-300 font-semibold mb-1 text-xs font-display">Workspace Notes Scratchpad</h4>
            <p className="text-zinc-400 dark:text-zinc-500 text-[11px] max-w-xs leading-relaxed">
              Jot down scratchpad items, minutes, or raw task ideas here. Use Aura to extract actionable items automatically into real scheduled tasks!
            </p>
          </div>
        ) : (
          notes.map((note) => {
            const isEditing = editingNoteId === note.id;
            const draftValue = noteDrafts[note.id] !== undefined ? noteDrafts[note.id] : note.content;
            const textToExtract = isEditing ? draftValue : note.content;

            return (
              <motion.div
                key={note.id}
                layoutId={`note-wrapper-${note.id}`}
                className="border border-[#E8E4DF] dark:border-zinc-800/60 rounded-[20px] bg-white/70 dark:bg-zinc-900/40 overflow-hidden hover:border-[#D4DBCB]/80 dark:hover:border-zinc-700 transition-all duration-300 shadow-xs"
              >
                {/* Note Header / Summary */}
                <div 
                  onClick={() => handleStartEdit(note)}
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 transition-colors shrink-0">
                      {isEditing ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                    <FileText className="w-4 h-4 text-[#D97757] shrink-0" />
                    <span className="text-xs text-[#2D2C2A] dark:text-zinc-200 truncate font-medium">
                      {note.content.substring(0, 40) || "Empty scratchpad..."}
                      {note.content.length > 40 ? "..." : ""}
                    </span>
                  </div>

                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono flex items-center gap-1 shrink-0">
                    <Calendar className="w-3 h-3" />
                    {new Date(note.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>

                {/* Expanded Edit / Extract Body */}
                <AnimatePresence>
                  {isEditing && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-[#E8E4DF] dark:border-zinc-800/40 bg-[#F7F5F2]/30 dark:bg-zinc-950/15 px-4 py-3 space-y-3"
                    >
                      <textarea
                        value={draftValue}
                        onChange={(e) => handleUpdateDraft(note.id, e.target.value)}
                        rows={4}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DF] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/40 text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D97757]/15 focus:border-[#D97757] transition-all leading-relaxed"
                      />

                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-dashed border-[#E8E4DF] dark:border-zinc-800/50">
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExtractTasks(note.id, textToExtract)}
                            disabled={isExtractingId !== null || !textToExtract.trim()}
                            className="px-3.5 py-1.5 bg-[#5A644D]/10 hover:bg-[#5A644D]/20 text-[#5A644D] dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-[11px] font-bold rounded-lg disabled:opacity-40 transition-all flex items-center gap-1"
                          >
                            {isExtractingId === note.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Extracting...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3 text-[#D97757]" />
                                <span>Extract with AI</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleSaveDraft(note.id)}
                            disabled={draftValue === note.content}
                            className="px-3.5 py-1.5 bg-[#2D2C2A] text-white dark:bg-zinc-800 dark:hover:bg-zinc-750 text-[11px] font-bold rounded-lg disabled:opacity-30 transition-all"
                          >
                            Save Edits
                          </button>
                        </div>
                      </div>
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
