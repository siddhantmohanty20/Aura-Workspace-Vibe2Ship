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

  const getRecentCompletionRate = (completions: string[] = [], type: "daily" | "weekly") => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = (completions || []).filter(c => new Date(c) >= thirtyDaysAgo);
    
    if (type === "daily") {
      // max 30 completions
      const uniqueDays = new Set(recent.map(c => c.split('T')[0])).size;
      return Math.min(100, Math.round((uniqueDays / 30) * 100));
    } else {
      // max 4 completions
      const getStartOfWeek = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day;
        return new Date(date.setDate(diff)).toISOString().split('T')[0];
      };
      const uniqueWeeks = new Set(recent.map(c => getStartOfWeek(new Date(c)))).size;
      return Math.min(100, Math.round((uniqueWeeks / 4) * 100));
    }
  };

  const renderSparkline = (completions: string[] = []) => {
    const thirtyDays = Array.from({ length: 30 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split('T')[0];
    });
    
    const completionDates = (completions || []).map(c => {
      try {
        return new Date(c).toISOString().split('T')[0];
      } catch {
        return '';
      }
    });

    return (
      <div className="flex gap-0.5 items-end h-6 mt-1" id="sparkline-container">
        {thirtyDays.map((dateStr, i) => {
          const isCompleted = completionDates.includes(dateStr);
          return (
            <div
              key={i}
              id={`spark-bar-${i}`}
              title={`${dateStr}: ${isCompleted ? 'Completed' : 'No completion'}`}
              className={`w-2 rounded-[2px] transition-all hover:scale-y-125 ${
                isCompleted 
                  ? 'h-4 bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.3)]' 
                  : 'h-1.5 bg-zinc-200 dark:bg-zinc-800'
              }`}
            />
          );
        })}
      </div>
    );
  };

  const renderHabitCard = (task: Task, type: "daily" | "weekly") => {
    const streak = type === "daily" ? getDailyStreak(task.completions) : getWeeklyStreak(task.completions);
    const rate = getRecentCompletionRate(task.completions, type);
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

        {/* Streak and Completion Rate stats */}
        <div className="grid grid-cols-2 gap-4 py-2 border-y border-[#F7F5F2] dark:border-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-2xl ${streak > 0 ? 'bg-orange-55/20 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}>
              <Flame className={`w-4 h-4 ${streak > 0 ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Streak</p>
              <p className="text-sm font-bold font-display text-zinc-850 dark:text-zinc-200">
                {streak} {type === "daily" ? 'days' : 'weeks'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-2xl ${rate > 40 ? 'bg-emerald-55/20 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-55/20 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'}`}>
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 dark:text-zinc-500">30d Rate</p>
              <p className="text-sm font-bold font-display text-zinc-850 dark:text-zinc-200">
                {rate}%
              </p>
            </div>
          </div>
        </div>

        {/* Sparkline visualization */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500">
            <span className="font-medium">30-Day Activity Sparkline</span>
            <span className="font-mono">{task.completions?.length || 0} completions</span>
          </div>
          {renderSparkline(task.completions)}
        </div>

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
              Transform standard chores into structural streaks by opening any task, choosing a <strong>Daily</strong> or <strong>Weekly</strong> cadence, and checking in. Your streak metrics and 30-day sparklines will populate automatically!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
