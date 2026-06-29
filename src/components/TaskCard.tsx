import React, { useState } from "react";
import { Task, Goal } from "../types";
import { 
  Calendar, 
  Hourglass, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  Trash2, 
  Mail, 
  Sparkles,
  Bookmark,
  RotateCcw
} from "lucide-react";
import { motion } from "motion/react";

interface TaskCardProps {
  key?: string;
  task: Task;
  goals: Goal[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void | Promise<void>;
  onToggleComplete: (task: Task) => void | Promise<void>;
  onSyncToCalendar: (task: Task) => void | Promise<void>;
  onComposeEmail: (task: Task) => void;
}

export function TaskCard({
  task,
  goals,
  onEdit,
  onDelete,
  onToggleComplete,
  onSyncToCalendar,
  onComposeEmail
}: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Parse deadline Urgency and status
  const now = new Date();
  const deadlineDate = new Date(task.deadline);
  
  // Calculate calendar day difference in user's local timezone
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
  const diffDays = (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);

  const isDone = task.status === "done";
  
  let hasBeenMissed = false;
  if (task.original_deadline && new Date(task.original_deadline).getTime() !== new Date(task.deadline).getTime()) {
    hasBeenMissed = true;
  }
  
  let isOverdue = false;
  if (!isDone) {
    if (hasBeenMissed) {
      isOverdue = true; // Always show overdue badge if it was missed
    } else {
      isOverdue = now.getTime() > new Date(task.deadline).getTime();
    }
  }

  // Link Goal
  const linkedGoal = goals.find(g => g.id === task.goal_id);

  // Check if today
  const todayStr = new Date().toISOString().split("T")[0];
  const localTodayStr = new Date().toLocaleDateString('en-CA');
  const datesToCheck = [task.scheduled_start, task.scheduled_end, task.deadline].filter(Boolean) as string[];
  const isToday = datesToCheck.some(d => d.startsWith(todayStr) || d.startsWith(localTodayStr));

  // Decide card background, borders and badge colors based on urgency
  let cardClass = "";
  let textClass = "";
  let subTextClass = "";
  let badgeClass = "";
  let borderClass = "";

  if (isDone) {
    cardClass = "bg-white/40 dark:bg-zinc-900/10 border-[#E8E4DF]/60 dark:border-zinc-800/40 opacity-70";
    textClass = "text-[#7A756E] dark:text-zinc-500";
    subTextClass = "text-[#A8A29E] dark:text-zinc-600";
    badgeClass = "bg-zinc-200 border-zinc-300 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
    borderClass = "border-[#E8E4DF]/40 dark:border-zinc-800/40";
  } else if (isOverdue) {
    // Overdue: Red color
    cardClass = "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40 shadow-sm";
    textClass = "text-red-900 dark:text-red-200";
    subTextClass = "text-red-700 dark:text-red-300/70";
    badgeClass = "bg-red-500 text-white border-red-600";
    borderClass = "border-red-200 dark:border-red-900/40";
  } else if (isToday) {
    // Today: Green bg card
    cardClass = "bg-emerald-50 dark:bg-[#20271e] border-emerald-200 dark:border-emerald-900/30 shadow-sm";
    textClass = "text-emerald-900 dark:text-emerald-100";
    subTextClass = "text-emerald-700 dark:text-emerald-200/70";
    badgeClass = "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300";
    borderClass = "border-emerald-200 dark:border-emerald-900/30";
  } else {
    // Future: Brownish background (currently used for High Priority)
    cardClass = "bg-[#EBCFB2] dark:bg-[#3d2e24] border-[#8C6B4F]/25 dark:border-amber-700/30 shadow-sm";
    textClass = "text-[#2D2C2A] dark:text-amber-100";
    subTextClass = "text-[#8C6B4F] dark:text-amber-200/70";
    badgeClass = "bg-[#D97757] text-white";
    borderClass = "border-[#8C6B4F]/20 dark:border-amber-700/20";
  }

  // Set standard urgencyStatusText
  let urgencyStatusText = "Quiet Ahead";
  if (isDone) {
    urgencyStatusText = "Completed";
  } else if (isOverdue) {
    urgencyStatusText = "Overdue";
  } else if (diffDays === 0) {
    urgencyStatusText = "Due Today";
  } else if (diffDays === 1) {
    urgencyStatusText = "Due Tomorrow";
  } else if (diffDays <= 3) {
    urgencyStatusText = "Due Soon";
  }

  const formatDeadline = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { 
        month: "short", 
        day: "numeric", 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    } catch {
      return dateStr;
    }
  };

  const formatTimeRange = (startStr?: string | null, endStr?: string | null) => {
    if (!startStr || !endStr) return "";
    try {
      const start = new Date(startStr);
      const end = new Date(endStr);
      
      const datePart = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const startTimePart = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      const endTimePart = end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      
      return `${datePart}, ${startTimePart} - ${endTimePart}`;
    } catch {
      return "";
    }
  };

  return (
    <motion.div
      layout
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative rounded-[22px] border p-3.5 sm:p-4 transition-all duration-300 ${cardClass}`}
      id={`task-card-${task.id}`}
    >
      {/* Priority Glow Indicator */}
      {!isDone && task.priority_score >= 70 && (
        <div className="absolute top-0 left-12 right-12 h-[2px] bg-gradient-to-r from-transparent via-[#D97757] to-transparent blur-[1px]" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {/* Complete Checkbox Button */}
          <button
            onClick={() => onToggleComplete(task)}
            className="mt-0.5 flex-shrink-0 focus:outline-none transition-transform active:scale-95"
            aria-label="Toggle Complete"
            id={`task-complete-btn-${task.id}`}
          >
            {isDone ? (
              <CheckCircle2 className="w-5.5 h-5.5 text-emerald-600 dark:text-[#D4DBCB] fill-emerald-100 dark:fill-zinc-900 transition-all duration-300" />
            ) : (
              <div className={`w-5.5 h-5.5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${isOverdue ? "border-[#D97757] hover:border-[#D97757]/80" : "border-[#7A756E]/40 hover:border-[#2D2C2A] dark:border-zinc-650"}`}>
                <div className="w-3 h-3 rounded-full bg-transparent hover:bg-neutral-800/10 dark:hover:bg-white/10" />
              </div>
            )}
          </button>

          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className={`text-sm sm:text-base font-semibold tracking-tight font-display select-none transition-all duration-300 ${isDone ? "line-through text-zinc-400 dark:text-zinc-600 font-normal" : `${textClass}`}`}>
              {task.title}
            </h3>

            {/* Description */}
            {task.description && (
              <p className={`mt-1 text-xs sm:text-sm line-clamp-1 leading-relaxed select-none ${isDone ? "text-zinc-400 dark:text-zinc-600" : `${subTextClass}`}`}>
                {task.description}
              </p>
            )}

            {/* Linked Goal Badge */}
            {linkedGoal && (
              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 font-medium max-w-full">
                <Bookmark className="w-3 h-3 flex-shrink-0 text-[#2D2C2A]/60 dark:text-neutral-300" />
                <span className="truncate text-[#2D2C2A] dark:text-neutral-200">{linkedGoal.title}</span>
              </div>
            )}
          </div>
        </div>

        {/* Priority Score circular badge */}
        {!isDone && (
          <div 
            className={`flex-shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-xl border ${task.priority_score >= 80 ? "bg-[#D97757]/15 border-[#D97757]/30 text-[#D97757] dark:text-[#EBCFB2] font-bold" : task.priority_score >= 50 ? "bg-white/40 dark:bg-black/20 border-black/10 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-medium" : "bg-white/20 dark:bg-black/10 border-transparent text-zinc-600 dark:text-neutral-300 font-medium"}`}
            title="Priority Score (auto-prioritized by AI)"
          >
            <span className="text-[8px] uppercase tracking-wider opacity-60 text-[#2D2C2A] dark:text-neutral-400 leading-none">PRY</span>
            <span className="text-xs font-sans font-bold tracking-tight mt-0.5">{task.priority_score || "--"}</span>
          </div>
        )}
      </div>

      <div className={`mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-2 ${borderClass}`}>
        {/* Urgent State / Due Indicator */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-semibold select-none border ${badgeClass}`}>
            <span>{urgencyStatusText}</span>
          </div>

          <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${isDone ? "opacity-60 text-zinc-400" : "opacity-100 " + textClass}`} id={`task-time-info-${task.id}`}>
            {hasBeenMissed ? (
              <>
                <span className="inline-flex items-center gap-0.5 opacity-75" id={`task-original-deadline-${task.id}`}>
                  <Calendar className="w-3 h-3 opacity-60" />
                  Originally due: {formatDeadline(task.original_deadline!)}
                </span>
                <span className="inline-flex items-center gap-0.5 font-bold text-rose-600 dark:text-rose-400" id={`task-updated-deadline-${task.id}`}>
                  <Calendar className="w-3 h-3 opacity-80" />
                  Rescheduled to: {formatDeadline(task.deadline)}
                </span>
                {task.scheduled_start && task.scheduled_end && (
                  <span className="inline-flex items-center gap-0.5 opacity-75" id={`task-scheduled-time-${task.id}`}>
                    <Clock className="w-3 h-3 opacity-60" />
                    Slot: {formatTimeRange(task.scheduled_start, task.scheduled_end)}
                  </span>
                )}
              </>
            ) : (
              <>
                {task.scheduled_start && task.scheduled_end ? (
                  <>
                    <span className="inline-flex items-center gap-0.5" id={`task-scheduled-time-${task.id}`}>
                      <Clock className="w-3 h-3 opacity-60" />
                      Slot: {formatTimeRange(task.scheduled_start, task.scheduled_end)}
                    </span>
                    <span className="inline-flex items-center gap-0.5 font-semibold" id={`task-updated-deadline-${task.id}`}>
                      <Calendar className="w-3 h-3 opacity-60" />
                      Due: {formatDeadline(task.deadline)}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-0.5 font-semibold" id={`task-updated-deadline-${task.id}`}>
                    <Calendar className="w-3 h-3 opacity-60" />
                    Due: {formatDeadline(task.deadline)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Duration info */}
          <span className={`text-[11px] inline-flex items-center gap-0.5 bg-black/5 dark:bg-white/5 opacity-80 px-2 py-0.5 rounded-md ${isDone ? "text-zinc-400" : textClass}`}>
            <Hourglass className="w-3 h-3 opacity-60" />
            {task.estimated_effort}m
          </span>

          {/* Quick Tools popup on Hover */}
          <div className="flex items-center gap-0.5">
            {(isDone || task.status === "archived") && (
              <button
                onClick={() => onToggleComplete(task)}
                title="Restore Task"
                className="px-2 py-1 text-[10px] font-bold rounded-lg text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Restore
              </button>
            )}
            {!isDone && task.status !== "archived" && (
              <>
                {/* Sync to Calendar */}
                <button
                  onClick={() => onSyncToCalendar(task)}
                  title="Schedule on Google Calendar"
                  className="p-1 rounded-lg text-inherit hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 opacity-75" />
                </button>
                {/* Compose Email Draft */}
                <button
                  onClick={() => onComposeEmail(task)}
                  title="Compose Email draft"
                  className="p-1 rounded-lg text-inherit hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 opacity-75" />
                </button>
              </>
            )}
            
            {/* Edit */}
            <button
              onClick={() => onEdit(task)}
              title="Edit Task"
              className="p-1 rounded-lg text-inherit hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 opacity-75" />
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(task.id)}
              title="Delete Task"
              className="p-1 rounded-lg text-inherit hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-450 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 opacity-75" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
