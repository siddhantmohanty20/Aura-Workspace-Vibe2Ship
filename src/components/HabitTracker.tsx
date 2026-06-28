import React from "react";
import { Task } from "../types";
import { Flame, CheckCircle2, Activity, Calendar, Edit3, Trash2, HelpCircle, Trophy } from "lucide-react";

interface HabitTrackerProps {
  tasks: Task[];
  onLogCompletion: (task: Task) => Promise<void>;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function getDailyStreak(completions: string[] = []): number {
  if (!completions || completions.length === 0) return 0;
  
  const dateStrings = completions.map(c => {
    try {
      return new Date(c).toISOString().split('T')[0];
    } catch {
      return '';
    }
  }).filter(Boolean);
  
  const uniqueDates = Array.from(new Set(dateStrings)).sort((a, b) => b.localeCompare(a));
  if (uniqueDates.length === 0) return 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // If the newest completion is older than yesterday, the streak is broken
  if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 0;
  const currentDate = new Date(uniqueDates[0]);

  while (true) {
    const dateStr = currentDate.toISOString().split('T')[0];
    if (uniqueDates.includes(dateStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export function getWeeklyStreak(completions: string[] = []): number {
  if (!completions || completions.length === 0) return 0;

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff)).toISOString().split('T')[0];
  };

  const weekStarts = completions.map(c => {
    try {
      return getStartOfWeek(new Date(c));
    } catch {
      return '';
    }
  }).filter(Boolean);

  const uniqueWeeks = Array.from(new Set(weekStarts)).sort((a, b) => b.localeCompare(a));
  if (uniqueWeeks.length === 0) return 0;

  const currentWeekStr = getStartOfWeek(new Date());
  const previousWeek = new Date();
  previousWeek.setDate(previousWeek.getDate() - 7);
  const previousWeekStr = getStartOfWeek(previousWeek);

  // If newest week completed is older than previous week, streak is broken
  if (uniqueWeeks[0] !== currentWeekStr && uniqueWeeks[0] !== previousWeekStr) {
    return 0;
  }

  let streak = 0;
  const currentWeekDate = new Date(uniqueWeeks[0]);

  while (true) {
    const weekStr = getStartOfWeek(currentWeekDate);
    if (uniqueWeeks.includes(weekStr)) {
      streak++;
      currentWeekDate.setDate(currentWeekDate.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

export function HabitTracker({ tasks, onLogCompletion, onEdit, onDelete }: HabitTrackerProps) {
  const recurringTasks = tasks.filter(t => t.recurrence && t.recurrence !== "none");
  const dailyHabits = recurringTasks.filter(t => t.recurrence === "daily");
  const weeklyHabits = recurringTasks.filter(t => t.recurrence === "weekly");

  const todayStr = new Date().toISOString().split('T')[0];

  const isCompletedToday = (task: Task) => {
    if (!task.completions) return false;
    return task.completions.some(c => c.startsWith(todayStr));
  };

  const isCompletedThisWeek = (task: Task) => {
    if (!task.completions || task.completions.length === 0) return false;
    const getStartOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day;
      return new Date(date.setDate(diff)).toISOString().split('T')[0];
    };
    const currentWeekStr = getStartOfWeek(new Date());
    return task.completions.some(c => getStartOfWeek(new Date(c)) === currentWeekStr);
  };

  const renderCompletionHistory = (task: Task, type: "daily" | "weekly") => {
    const completions = task.completions || [];
    
    if (type === "daily") {
      // Last 14 days
      const items = Array.from({ length: 14 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = d.toLocaleDateString("en-US", { weekday: "narrow" });
        const formattedDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const isCompleted = completions.some(c => {
          try {
            return new Date(c).toISOString().split("T")[0] === dateStr;
          } catch {
            return false;
          }
        });
        return { isCompleted, dayLabel, formattedDate };
      });

      return (
        <div className="space-y-1.5" id={`completion-history-${task.id}`}>
          <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 dark:text-zinc-500">
            Last 14 Days
          </p>
          <div className="flex justify-between items-center gap-1 bg-zinc-50/50 dark:bg-zinc-950/20 p-2.5 rounded-2xl border border-[#F0EDE9] dark:border-zinc-800/40">
            {items.map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500">{item.dayLabel}</span>
                <div
                  className={`w-3.5 h-3.5 rounded-[3px] transition-all duration-300 ${
                    item.isCompleted
                      ? "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                      : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                  title={`${item.formattedDate}: ${item.isCompleted ? "Completed" : "Missed"}`}
                />
              </div>
            ))}
          </div>
        </div>
      );
    } else {
      // Last 8 weeks
      const getStartOfWeek = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day;
        return new Date(date.setDate(diff)).toISOString().split('T')[0];
      };

      const items = Array.from({ length: 8 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (7 - i) * 7);
        const weekStr = getStartOfWeek(d);
        const formattedDate = `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        const isCompleted = completions.some(c => {
          try {
            return getStartOfWeek(new Date(c)) === weekStr;
          } catch {
            return false;
          }
        });
        return { isCompleted, label: `W${8-i}`, formattedDate };
      });

      return (
        <div className="space-y-1.5" id={`completion-history-${task.id}`}>
          <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 dark:text-zinc-500">
            Last 8 Weeks
          </p>
          <div className="flex justify-between items-center gap-1 bg-zinc-50/50 dark:bg-zinc-950/20 p-2.5 rounded-2xl border border-[#F0EDE9] dark:border-zinc-800/40">
            {items.map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500">{item.label}</span>
                <div
                  className={`w-4 h-4 rounded-[3px] transition-all duration-300 ${
                    item.isCompleted
                      ? "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                      : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                  title={`${item.formattedDate}: ${item.isCompleted ? "Completed" : "Missed"}`}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
  };

  const renderHabitCard = (task: Task, type: "daily" | "weekly") => {
    const streak = type === "daily" ? getDailyStreak(task.completions) : getWeeklyStreak(task.completions);
    const isCompleted = type === "daily" ? isCompletedToday(task) : isCompletedThisWeek(task);

    return (
      <div 
        key={task.id} 
        id={`habit-card-${task.id}`}
        className="p-5 rounded-3xl bg-white dark:bg-zinc-900/60 border border-[#E8E4DF] dark:border-zinc-800/80 shadow-xs space-y-4 hover:border-[#D97757]/40 dark:hover:border-emerald-500/20 transition-all duration-300 group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 max-w-[70%]">
            <h4 className="font-bold text-sm text-[#2D2C2A] dark:text-zinc-100 group-hover:text-[#D97757] dark:group-hover:text-emerald-400 transition-colors">
              {task.title}
            </h4>
            {task.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-normal line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEdit(task)}
              id={`edit-habit-${task.id}`}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-[#2D2C2A] dark:hover:text-zinc-200 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors"
              title="Edit Habit"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              id={`delete-habit-${task.id}`}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
              title="Delete Habit"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* LeetCode-style Streak Panel */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950/40 border border-[#F0EDE9] dark:border-zinc-800/40" id={`streak-panel-${task.id}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${streak > 0 ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-zinc-200/50 text-zinc-400 dark:bg-zinc-800/80'}`}>
              <Flame className={`w-5 h-5 ${streak > 0 ? 'animate-pulse fill-orange-500/10' : ''}`} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Current Streak</p>
              <p className="text-sm font-extrabold text-[#2D2C2A] dark:text-zinc-200">
                {streak} {type === "daily" ? (streak === 1 ? 'day' : 'days') : (streak === 1 ? 'week' : 'weeks')}
              </p>
            </div>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-amber-55/20 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-tight">
              <Trophy className="w-3.5 h-3.5" />
              <span>STREAK ACTIVE</span>
            </div>
          )}
        </div>

        {/* Beautiful visual history/sparkline strip */}
        {renderCompletionHistory(task, type)}

        {/* Check-in Actions */}
        <div className="pt-2">
          {isCompleted ? (
            <div className="w-full py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Completed {type === "daily" ? 'Today' : 'This Week'}</span>
            </div>
          ) : (
            <button
              onClick={() => onLogCompletion(task)}
              id={`log-habit-${task.id}`}
              className="w-full py-2.5 rounded-2xl border border-dashed border-[#D97757] text-[#D97757] hover:bg-[#D97757] hover:text-white dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500 dark:hover:text-zinc-950 transition-all font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Log {type === "daily" ? 'Today\'s' : 'This Week\'s'} Completion</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in" id="habit-tracker-container">
      {/* Daily Cadence Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E8E4DF] dark:border-zinc-800 pb-2">
          <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
          <h3 className="text-sm font-bold font-display text-[#2D2C2A] dark:text-zinc-100 uppercase tracking-wider">
            Daily Habits
          </h3>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400 font-bold">
            {dailyHabits.length} Active
          </span>
        </div>

        {dailyHabits.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center bg-white/40 dark:bg-zinc-900/10">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No daily habits scheduled. Edit any task to add a daily recurrence recurrence.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {dailyHabits.map(task => renderHabitCard(task, "daily"))}
          </div>
        )}
      </div>

      {/* Weekly Cadence Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E8E4DF] dark:border-zinc-800 pb-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold font-display text-[#2D2C2A] dark:text-zinc-100 uppercase tracking-wider">
            Weekly Habits
          </h3>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 font-bold">
            {weeklyHabits.length} Active
          </span>
        </div>

        {weeklyHabits.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center bg-white/40 dark:bg-zinc-900/10">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No weekly habits scheduled. Edit any task to add a weekly recurrence recurrence.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {weeklyHabits.map(task => renderHabitCard(task, "weekly"))}
          </div>
        )}
      </div>

      {recurringTasks.length === 0 && (
        <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/25 flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-xs text-amber-800 dark:text-amber-400">Streak Compilers Guidelines</h4>
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-500">
              Transform standard chores into structural streaks by opening any task, choosing a <strong>Daily</strong> or <strong>Weekly</strong> cadence, and checking in. Your streak metrics will populate automatically!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
