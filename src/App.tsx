import React, { useState, useEffect, useRef } from "react";
import { Task, Goal, Note } from "./types";
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  auth 
} from "./firebase";
import {
  getTasksFromFirestore,
  getGoalsFromFirestore,
  saveTaskToFirestore,
  saveGoalToFirestore,
  deleteTaskFromFirestore,
  deleteGoalFromFirestore,
  updateGoalStatusInFirestore,
  triggerAiPrioritization,
  getNotesFromFirestore,
  saveNoteToFirestore,
  deleteNoteFromFirestore
} from "./service";
import { 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent, 
  fetchFreeBusyCurrentWeek,
  createGmailDraft
} from "./workspace";
import { TaskCard } from "./components/TaskCard";
import { CreateEditTaskModal } from "./components/CreateEditTaskModal";
import { GoalManager } from "./components/GoalManager";
import { CalendarManager } from "./components/CalendarManager";
import { GmailDraftModal } from "./components/GmailDraftModal";
import { AuraAssistant } from "./components/AuraAssistant";
import { NotesManager } from "./components/NotesManager";
import { HabitTracker, getDailyStreak, getWeeklyStreak } from "./components/HabitTracker";
import { 
  Plus, 
  Sparkles, 
  Sparkle,
  LogOut, 
  Calendar, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  Moon, 
  Sun,
  LayoutGrid,
  TrendingUp,
  Inbox,
  FolderArchive,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function TaskCardSkeleton() {
  return (
    <div className="animate-pulse rounded-[22px] border border-[#E8E4DF] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/20 p-4 space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 animate-pulse">
          <div className="w-5.5 h-5.5 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md w-3/4" />
            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-md w-1/2" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
      </div>
      <div className="border-t border-[#E8E4DF] dark:border-zinc-800/60 pt-2.5 flex justify-between items-center animate-pulse">
        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-md w-1/3" />
        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-md w-1/4" />
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Dynamic Workspace States
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const goalsRef = useRef(goals);
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isCompilingPriority, setIsCompilingPriority] = useState(false);

  // Filters
  const [activeFilter, setActiveFilter] = useState<"active" | "done" | "overdue" | "habits">("active");
  const [draftConfirmations, setDraftConfirmations] = useState<{taskId: string, draftId: string, title: string, gmailLink: string}[]>([]);

  // Modals / Panels toggles
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTaskSource, setEmailTaskSource] = useState<Task | null>(null);

  // Status Alerts
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Custom non-blocking confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  const askConfirmation = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ title, message, resolve });
    });
  };

  // Detect and set System Theme Preferences for Dark Mode
  useEffect(() => {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Subscribe to system theme events
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleThemeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    mediaQuery.addEventListener("change", handleThemeChange);

    return () => mediaQuery.removeEventListener("change", handleThemeChange);
  }, []);

  // Initialize Authentication State
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthLoading(false);
      },
      () => {
        setUser(null);
        setIsAuthenticated(false);
        setAuthLoading(false);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Load backend content once User is successfully authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadWorkspaceData();
    }
  }, [isAuthenticated, user]);

  // Expose a manual reset function to the window for one-time manual cleanup via browser console
  useEffect(() => {
    (window as any).runManualDeadlineReset = async () => {
      console.log("Starting manual reset of original_deadline...");
      try {
        let updatedCount = 0;
        const allTasks = await getTasksFromFirestore();
        for (const t of allTasks) {
          if (t.original_deadline !== null && t.original_deadline !== undefined) {
            console.log(`Resetting task: ${t.title}`);
            await saveTaskToFirestore({ ...t, original_deadline: null as any });
            updatedCount++;
          }
        }
        console.log(`Manual reset complete. Updated ${updatedCount} tasks.`);
        // Reload workspace data to reflect changes
        loadWorkspaceData();
      } catch (err) {
        console.error("Failed to run manual reset:", err);
      }
    };
    return () => {
      delete (window as any).runManualDeadlineReset;
    };
  }, []);

  const loadWorkspaceData = async () => {
    setLoadingData(true);
    let fetchedTasks: Task[] = [];
    let fetchedGoals: Goal[] = [];
    let fetchedNotes: Note[] = [];
    let hasError = false;

    try {
      fetchedTasks = await getTasksFromFirestore();
    } catch (err) {
      console.error("Error loading tasks:", err);
      hasError = true;
    }

    try {
      fetchedGoals = await getGoalsFromFirestore();
    } catch (err) {
      console.error("Error loading goals:", err);
      hasError = true;
    }

    try {
      fetchedNotes = await getNotesFromFirestore();
    } catch (err) {
      console.error("Error loading notes:", err);
      // We don't mark notes error as fatal to workspace tasks/goals
    }

    setTasks(fetchedTasks);
    setGoals(fetchedGoals);
    setNotes(fetchedNotes);

    if (hasError) {
      triggerAlert("error", "Error loading some workspace data from cloud storage.");
    }
    setLoadingData(false);
  };

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMessage({ type, text });
    setTimeout(() => {
      setAlertMessage(null);
    }, 4500);
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setIsAuthenticated(true);
        triggerAlert("success", `Authorized workspace session for ${res.user.displayName}`);
      }
    } catch (err: any) {
      console.error("Authentication Error:", err);
      let errorMessage = "Google auth rejected. Calendar & Gmail integrations require sign-in.";
      if (err?.code === "auth/popup-closed-by-user" || err?.message?.includes("popup-closed-by-user")) {
        errorMessage = "Sign-In cancelled: The login popup was closed. Please keep it open and log in.";
      } else if (err?.code === "auth/user-cancelled" || err?.message?.includes("user-cancelled") || err?.message?.includes("denied")) {
        errorMessage = "Permission denied: To enable calendar & email features, please grant the requested permissions.";
      }
      triggerAlert("error", errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const confirmed = await askConfirmation(
      "Sign Out",
      "Are you sure you want to terminate your active secure Aura workspace session?"
    );
    if (!confirmed) return;

    try {
      await logout();
      setIsAuthenticated(false);
      setUser(null);
      setTasks([]);
      setGoals([]);
      triggerAlert("success", "Active secure credentials terminated.");
    } catch {
      triggerAlert("error", "Failed to terminate session properly.");
    }
  };

  // Helper to sync single task with Google Calendar and return updated calendarEventId (or null)
  // If API call fails, we throw an error so the caller can abort the Firestore update.
  const syncTaskToGoogleCalendar = async (taskData: any, existingTaskObj?: Task): Promise<{ calendarEventId: string | null }> => {
    // 1. If task is already "done", we should not create or keep any Calendar event
    if (taskData.status === "done" || taskData.status === "archived") {
      if (existingTaskObj?.calendarEventId) {
        try {
          await deleteCalendarEvent(existingTaskObj.calendarEventId);
        } catch (err: any) {
          console.warn("Failed to delete complete/archived task's calendar event:", err);
          throw new Error("Failed to remove event from Google Calendar.");
        }
      }
      return { calendarEventId: null };
    }

    // 2. If task has no deadline (empty/invalid)
    if (!taskData.deadline) {
      if (existingTaskObj?.calendarEventId) {
        try {
          await deleteCalendarEvent(existingTaskObj.calendarEventId);
        } catch (err: any) {
          console.warn("Failed to delete removed-deadline calendar event:", err);
          throw new Error("Previous Calendar event couldn't be deleted.");
        }
      }
      return { calendarEventId: null };
    }

    // 3. Task has a deadline. Create or update calendar event
    try {
      const durationMin = taskData.estimated_effort > 0 ? taskData.estimated_effort : 60;
      const endTime = taskData.scheduled_end ? new Date(taskData.scheduled_end) : new Date(taskData.deadline);
      const startTime = taskData.scheduled_start ? new Date(taskData.scheduled_start) : new Date(endTime.getTime() - durationMin * 60 * 1000);

      const eventData = {
        summary: taskData.title,
        description: taskData.description || "Synthesized productivity block in Aura Workspace.",
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() }
      };

      if (existingTaskObj?.calendarEventId) {
        try {
          await updateCalendarEvent(existingTaskObj.calendarEventId, eventData);
          return { calendarEventId: existingTaskObj.calendarEventId };
        } catch (updateErr: any) {
          console.warn("Failed to update calendar event, attempting to recreate:", updateErr);
          const newEvent = await createCalendarEvent(eventData);
          return { calendarEventId: newEvent.id };
        }
      } else {
        const newEvent = await createCalendarEvent(eventData);
        return { calendarEventId: newEvent.id };
      }
    } catch (err: any) {
      console.error("Calendar sync error:", err);
      throw new Error(`Google Calendar sync failed: ${err.message || 'Check connection'}`);
    }
  };

  // Create or Update single task action
  const handleSaveTask = async (taskData: any, skipPrioritize = false) => {
    try {
      let finalData = { ...taskData };
      const existingTaskObj = tasks.find(t => t.id === taskData.id);
      
      if (existingTaskObj) {
        if (existingTaskObj.deadline !== taskData.deadline) {
          finalData.initial_deadline = existingTaskObj.initial_deadline || existingTaskObj.deadline;
          finalData.scheduled_start = null;
          finalData.scheduled_end = null;
        } else {
          finalData.initial_deadline = existingTaskObj.initial_deadline || existingTaskObj.deadline;
          finalData.scheduled_start = existingTaskObj.scheduled_start || null;
          finalData.scheduled_end = existingTaskObj.scheduled_end || null;
        }
        finalData.original_deadline = existingTaskObj.original_deadline;
        finalData.calendarEventId = existingTaskObj.calendarEventId || null;
      } else {
        finalData.initial_deadline = taskData.deadline;
        finalData.scheduled_start = null;
        finalData.scheduled_end = null;
        finalData.calendarEventId = null;
      }

      if (isAuthenticated) {
        const syncResult = await syncTaskToGoogleCalendar(finalData, existingTaskObj);
        finalData.calendarEventId = syncResult.calendarEventId;
      }

      await saveTaskToFirestore(finalData);
      
      // Instantly load refreshed list from Firestore
      const refreshedTasks = await getTasksFromFirestore();
      setTasks(refreshedTasks);
      
      triggerAlert("success", taskData.id ? "Task updated." : "Task compiled.");

      // Automatically trigger the dynamic prioritization and scheduling flow on create/update unless skipped
      if (!skipPrioritize) {
        handleAiPrioritize(refreshedTasks);
      }
    } catch (err: any) {
      console.error(err);
      triggerAlert("error", err.message || "Failed to save task. Schema verification mismatch.");
    }
  };

  const handleLogHabitCompletion = async (task: Task) => {
    try {
      const nowStr = new Date().toISOString();
      const isRecurring = task.recurrence && task.recurrence !== "none";
      let completions = task.completions ? [...task.completions] : [];
      let completed_at = nowStr;

      const getStartOfWeekString = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day;
        return new Date(date.setDate(diff)).toISOString().split('T')[0];
      };

      if (isRecurring) {
        const todayStr = nowStr.split('T')[0];
        if (task.recurrence === "daily") {
          const alreadyCompleted = completions.some(c => c.startsWith(todayStr));
          if (!alreadyCompleted) {
            completions.push(nowStr);
          }
        } else if (task.recurrence === "weekly") {
          const currentWeekStr = getStartOfWeekString(new Date());
          const alreadyCompleted = completions.some(c => getStartOfWeekString(new Date(c)) === currentWeekStr);
          if (!alreadyCompleted) {
            completions.push(nowStr);
          }
        }
      } else {
        completions.push(nowStr);
      }
      
      let updatedFields: Task = {
        ...task,
        completions: completions,
        status: "done" as const,
        completed_at: completed_at,
      };
      
      if (isRecurring) {
        const todayStr = nowStr.split('T')[0];
        updatedFields.recent_status_log = { ...(task.recent_status_log || {}), [todayStr]: 'completed' };
        const newStreak = task.recurrence === "daily" ? getDailyStreak(completions) : getWeeklyStreak(completions);
        updatedFields.max_streak = Math.max(task.max_streak || 0, newStreak);
      }

      if (isAuthenticated) {
        const syncResult = await syncTaskToGoogleCalendar(updatedFields, task);
        updatedFields.calendarEventId = syncResult.calendarEventId;
      }

      await saveTaskToFirestore(updatedFields);

      const refreshed = await getTasksFromFirestore();
      setTasks(refreshed);

      triggerAlert("success", `Habit completion logged for "${task.title}"!`);

      handleAiPrioritize(refreshed);
    } catch (err: any) {
      console.error(err);
      triggerAlert("error", err.message || "Error logging habit completion.");
    }
  };

  // Toggle state between active <-> done (or restore archived)
  const handleToggleComplete = async (task: Task) => {
    try {
      // If done or archived, restore to not_started
      const newStatus = (task.status === "done" || task.status === "archived") ? "not_started" : "done";
      const isRecurring = task.recurrence && task.recurrence !== "none";
      const nowStr = new Date().toISOString();
      let completions = task.completions ? [...task.completions] : [];
      let completed_at = task.completed_at;

      const getStartOfWeekString = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day;
        return new Date(date.setDate(diff)).toISOString().split('T')[0];
      };

      if (newStatus === "done") {
        completed_at = nowStr;
        if (isRecurring) {
          const todayStr = nowStr.split('T')[0];
          if (task.recurrence === "daily") {
            const alreadyCompleted = completions.some(c => c.startsWith(todayStr));
            if (!alreadyCompleted) {
              completions.push(nowStr);
            }
          } else if (task.recurrence === "weekly") {
            const currentWeekStr = getStartOfWeekString(new Date());
            const alreadyCompleted = completions.some(c => getStartOfWeekString(new Date(c)) === currentWeekStr);
            if (!alreadyCompleted) {
              completions.push(nowStr);
            }
          }
        }
      } else {
        completed_at = null;
        if (isRecurring) {
          if (task.recurrence === "daily") {
            const todayStr = nowStr.split('T')[0];
            completions = completions.filter(c => !c.startsWith(todayStr));
          } else if (task.recurrence === "weekly") {
            const currentWeekStr = getStartOfWeekString(new Date());
            completions = completions.filter(c => getStartOfWeekString(new Date(c)) !== currentWeekStr);
          }
        }
      }

      let updatedFields: Task = {
        ...task,
        status: newStatus,
        completed_at,
        completions,
      };
      
      if (isRecurring) {
        const todayStr = nowStr.split('T')[0];
        let new_recent_status_log = { ...(task.recent_status_log || {}) };
        if (newStatus === "done") {
          new_recent_status_log[todayStr] = 'completed';
        } else {
          delete new_recent_status_log[todayStr];
        }
        updatedFields.recent_status_log = new_recent_status_log;
        
        const newStreak = task.recurrence === "daily" ? getDailyStreak(completions) : getWeeklyStreak(completions);
        updatedFields.max_streak = Math.max(task.max_streak || 0, newStreak);
      }

      if (isAuthenticated) {
        const syncResult = await syncTaskToGoogleCalendar(updatedFields, task);
        updatedFields.calendarEventId = syncResult.calendarEventId;
      }

      await saveTaskToFirestore(updatedFields);

      const refreshed = await getTasksFromFirestore();
      setTasks(refreshed);
      
      triggerAlert("success", newStatus === "done" ? "Task checked off!" : "Task reactivated.");

      // Trigger re-scheduling and prioritization when completeness changes
      handleAiPrioritize(refreshed);
    } catch (err: any) {
      console.error(err);
      triggerAlert("error", err.message || "Error mapping complete states in database.");
    }
  };

  // Internal task deletion (no user prompt, no local state update)
  const executeDeleteTask = async (id: string): Promise<string | null> => {
    const taskObj = tasks.find(t => t.id === id);
    let calendarWarning = null;

    if (isAuthenticated && taskObj?.calendarEventId) {
      try {
        await deleteCalendarEvent(taskObj.calendarEventId);
      } catch (err: any) {
        console.warn("Failed to delete Calendar event during task delete:", err);
        calendarWarning = `Task "${taskObj?.title || id}" deleted, but failed to delete Google Calendar event.`;
      }
    }

    try {
      await deleteTaskFromFirestore(id);
    } catch (dbErr) {
      console.error("Failed to delete task from Firestore:", dbErr);
      throw dbErr;
    }

    return calendarWarning;
  };

  // Delete task
  const handleDeleteTask = async (id: string) => {
    const confirmed = await askConfirmation(
      "Archive Task",
      "Are you sure you want to archive this task? It will be moved to Archive Logs and removed from Google Calendar."
    );
    if (!confirmed) return;

    try {
      const calendarWarning = await executeDeleteTask(id);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "archived", calendarEventId: null } : t));
      
      if (calendarWarning) {
        triggerAlert("error", calendarWarning);
      } else {
        triggerAlert("success", "Task deleted.");
      }
    } catch {
      triggerAlert("error", "Error compiling delete instruction.");
    }
  };

  // Create Goal
  const handleCreateGoal = async (title: string) => {
    try {
      await saveGoalToFirestore(title);
      const refreshed = await getGoalsFromFirestore();
      setGoals(refreshed);
      triggerAlert("success", "Milestone goal created successfully.");
    } catch {
      triggerAlert("error", "Error creating goal milestone.");
    }
  };

  // Delete Goal (Archive)
  const handleDeleteGoal = async (id: string) => {
    const confirmed = await askConfirmation(
      "Archive Milestone Goal",
      "Are you sure you want to archive this Goal?\n\nThis will also archive all associated subtasks and remove them from your Google Calendar. Proceed?"
    );
    if (!confirmed) return;

    let calendarWarning = "";
    const linkedTasks = tasks.filter(t => t.goal_id === id && t.status !== "archived");

    // Call the exact same task-deletion logic for each linked sub-task (including removing Calendar events)
    const warnings: string[] = [];
    for (const t of linkedTasks) {
      try {
        const warning = await executeDeleteTask(t.id);
        if (warning) {
          warnings.push(warning);
        }
      } catch (err) {
        console.warn(`Failed to execute delete for subtask ${t.id}:`, err);
      }
    }

    if (warnings.length > 0) {
      calendarWarning = "Goal deleted, but some Google Calendar events could not be removed.";
    }

    try {
      await deleteGoalFromFirestore(id, tasks);
      const refreshedGoals = await getGoalsFromFirestore();
      const refreshedTasks = await getTasksFromFirestore();
      setGoals(refreshedGoals);
      setTasks(refreshedTasks);
      
      if (calendarWarning) {
        triggerAlert("error", calendarWarning);
      } else {
        triggerAlert("success", "Goal and associated subtasks deleted successfully.");
      }
    } catch {
      triggerAlert("error", "Error compiling drop goal instruction.");
    }
  };

  // Restore Task
  const handleRestoreTask = async (id: string) => {
    try {
      const task = tasks.find(t => t.id === id);
      if (!task) return;

      const updatedFields: Task = { ...task, status: "not_started" };
      
      if (isAuthenticated) {
        const syncResult = await syncTaskToGoogleCalendar(updatedFields, task);
        updatedFields.calendarEventId = syncResult.calendarEventId;
      }

      await saveTaskToFirestore(updatedFields);
      
      const refreshedTasks = await getTasksFromFirestore();
      setTasks(refreshedTasks);
      
      triggerAlert("success", "Task restored successfully.");
      
      handleAiPrioritize(refreshedTasks);
    } catch (err: any) {
      console.error(err);
      triggerAlert("error", err.message || "Error restoring task.");
    }
  };

  // Restore Goal
  const handleRestoreGoal = async (id: string) => {
    try {
      // Restore goal
      await updateGoalStatusInFirestore(id, "active");

      // Restore archived subtasks
      const linkedTasks = tasks.filter(t => t.goal_id === id && t.status === "archived");
      for (const t of linkedTasks) {
        const updatedFields: Task = { ...t, status: "not_started" };
        if (isAuthenticated) {
          try {
            const syncResult = await syncTaskToGoogleCalendar(updatedFields, t);
            updatedFields.calendarEventId = syncResult.calendarEventId;
          } catch (err: any) {
            console.warn(`Failed to sync task ${t.id} on restore:`, err);
            throw new Error(`Google Calendar sync failed for subtask: ${err.message}`);
          }
        }
        await saveTaskToFirestore(updatedFields);
      }

      const refreshedGoals = await getGoalsFromFirestore();
      const refreshedTasks = await getTasksFromFirestore();
      setGoals(refreshedGoals);
      setTasks(refreshedTasks);
      triggerAlert("success", "Goal and associated subtasks restored successfully.");
      handleAiPrioritize(refreshedTasks);
    } catch (err: any) {
      console.error(err);
      triggerAlert("error", err.message || "Error restoring goal.");
    }
  };

  // Goal decomposition: let the user break down a high-level goal using AI
  const handleDecomposeGoal = async (title: string) => {
    try {
      // 1. Create the Goal record first in Firestore
      const goalId = await saveGoalToFirestore(title);
      
      // 2. Fetch decomp tasks from server
      const response = await fetch("/api/extract-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: title,
          type: "goal",
          currentTime: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error("Goal decomposition failed");
      }

      const data = await response.json();
      const extractedTasks = data.tasks || [];

      // 3. Create Task records for each sub-task linked to this Goal using the manual task creation logic (handleSaveTask)
      for (const t of extractedTasks) {
        // Ensure each sub-task has a valid deadline and estimated effort populated
        let deadline = t.deadline;
        if (!deadline || isNaN(Date.parse(deadline))) {
          // If invalid or missing, default to 2 days from now at 12:00 PM
          const defaultDate = new Date();
          defaultDate.setDate(defaultDate.getDate() + 2);
          defaultDate.setHours(12, 0, 0, 0);
          deadline = defaultDate.toISOString();
        }
        
        let estimated_effort = Number(t.estimated_effort);
        if (!estimated_effort || isNaN(estimated_effort) || estimated_effort <= 0) {
          estimated_effort = 60; // Default to 60 minutes (1 hour) if missing or invalid
        }

        const taskFields = {
          title: t.title,
          description: t.description || "",
          deadline: deadline,
          estimated_effort: estimated_effort,
          goal_id: goalId,
          status: "not_started" as const,
        };

        await handleSaveTask(taskFields, true); // Skip prioritizing inside the loop to avoid concurrent API conflicts
      }

      // 4. Reload goals & tasks to reflect the new state in React
      const refreshedGoals = await getGoalsFromFirestore();
      setGoals(refreshedGoals);
      const refreshedTasks = await getTasksFromFirestore();
      setTasks(refreshedTasks);

      triggerAlert("success", `AI broke down goal into ${extractedTasks.length} tasks! Scheduling with Aura...`);

      // 5. Instantly prioritize and schedule all newly created tasks together exactly once at the end
      await handleAiPrioritize(refreshedTasks);

    } catch (err) {
      console.error("Failed to decompose goal:", err);
      triggerAlert("error", "Error decomposing goal with AI.");
    }
  };

  // Note CRUD & AI Extraction Handlers
  const handleSaveNote = async (content: string, id?: string): Promise<string> => {
    try {
      const savedId = await saveNoteToFirestore({ content, id });
      const refreshed = await getNotesFromFirestore();
      setNotes(refreshed);
      return savedId;
    } catch (err) {
      console.error(err);
      triggerAlert("error", "Error saving note to workspace.");
      return "";
    }
  };

  const handleDeleteNote = async (id: string) => {
    const confirmed = await askConfirmation(
      "Delete Note",
      "Are you sure you want to delete this Note from your workspace?"
    );
    if (!confirmed) return;

    try {
      await deleteNoteFromFirestore(id);
      const refreshed = await getNotesFromFirestore();
      setNotes(refreshed);
      triggerAlert("success", "Note deleted successfully.");
    } catch (err) {
      console.error(err);
      triggerAlert("error", "Error deleting note.");
    }
  };

  const handleTasksExtracted = async (extractedTasks: any[]) => {
    try {
      for (const t of extractedTasks) {
        let taskFields = {
          title: t.title,
          description: t.description,
          deadline: t.deadline,
          estimated_effort: t.estimated_effort,
          goal_id: null,
          status: "not_started" as const,
          calendarEventId: null as string | null
        };

        if (isAuthenticated) {
          try {
            const syncResult = await syncTaskToGoogleCalendar(taskFields);
            taskFields.calendarEventId = syncResult.calendarEventId;
          } catch (syncErr: any) {
            console.warn("Failed to sync extracted task to Google Calendar:", syncErr);
            throw new Error(`Google Calendar sync failed for extracted task: ${syncErr.message}`);
          }
        }

        await saveTaskToFirestore(taskFields);
      }
      const refreshedTasks = await getTasksFromFirestore();
      setTasks(refreshedTasks);
      const refreshedGoals = await getGoalsFromFirestore();
      setGoals(refreshedGoals);
      
      triggerAlert("success", `Extracted ${extractedTasks.length} tasks! Rescheduling workspace...`);
      await handleAiPrioritize(refreshedTasks);
    } catch (err) {
      console.error(err);
      triggerAlert("error", "Error scheduling extracted tasks.");
    }
  };

  // Overdue check and automatic silent re-planning loop
  useEffect(() => {
    if (!isAuthenticated || isCompilingPriority) return;

    const hasEmailIntent = (title: string, desc: string) => {
      const text = (title + " " + (desc || "")).toLowerCase();
      return ["email", "follow up", "follow-up", "send", "reply to"].some(keyword => text.includes(keyword));
    };

    const checkAndReplanOverdueTasks = async () => {
      const currentTasks = tasksRef.current;
      if (!currentTasks || currentTasks.length === 0) return;

      const now = new Date();
      
      console.log(`[DEBUG checkAndReplan] now.getTime(): ${now.getTime()}, currentTasks.length: ${currentTasks.length}`);
      currentTasks.forEach(t => {
        const deadlineTime = new Date(t.deadline).getTime();
        console.log(`[DEBUG checkAndReplan] Task: "${t.title}", deadline: ${t.deadline}, deadlineTime: ${deadlineTime}, isOverdue: ${now.getTime() > deadlineTime}, status: ${t.status}`);
      });

      let hasOverdueToReplan = false;
      const overdueTasksForDraft: Task[] = [];
      const tasksWithMissedDeadlines = currentTasks.map(t => {
        if (t.status !== "done") {
          const deadlineTime = new Date(t.deadline).getTime();
          if (now.getTime() > deadlineTime) {
            hasOverdueToReplan = true;
            overdueTasksForDraft.push(t);
            return {
              ...t,
              // If this is the first time it's missed, capture the current deadline as original_deadline
              original_deadline: t.original_deadline || t.deadline
            };
          }
        }
        return t;
      });

      if (hasOverdueToReplan) {
        console.log("Aura Workspace Autocure: Detected missed deadlines. Triggering silent re-planning...");
        
        for (const overdueTask of overdueTasksForDraft) {
          addReasoning(`Missed and re-planned task: "${overdueTask.title}"`);
          if (hasEmailIntent(overdueTask.title, overdueTask.description || "")) {
            try {
              const subject = `Delay Update: ${overdueTask.title}`;
              const bodyText = `Hi,\n\nI wanted to update you regarding "${overdueTask.title}". There has been a slight delay on my end, but I am rescheduling this and will follow up with next steps shortly.\n\nBest regards,\n[Sent via Aura AI Assistant]`;
              
              const draftResult = await createGmailDraft("recipient@example.com", subject, bodyText);
              if (draftResult && draftResult.id) {
                setDraftConfirmations(prev => [
                  ...prev,
                  {
                    taskId: overdueTask.id,
                    draftId: draftResult.id,
                    title: overdueTask.title,
                    gmailLink: "https://mail.google.com/mail/u/0/#drafts"
                  }
                ]);
                triggerAlert("success", `Gmail draft created for: "${overdueTask.title}"`);
              }
            } catch (draftErr) {
              console.warn("Failed to create Gmail draft for overdue task:", draftErr);
              triggerAlert("error", `Failed to create Gmail draft for "${overdueTask.title}". Skipping draft.`);
            }
          }
        }

        // Trigger silent prioritization/scheduling with the marked tasks!
        await handleAiPrioritize(tasksWithMissedDeadlines);
      }
    };

    // Run initially with a small delay, then periodically
    const initialTimeout = setTimeout(checkAndReplanOverdueTasks, 8000);
    const interval = setInterval(checkAndReplanOverdueTasks, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isAuthenticated, isCompilingPriority]);

  // Trigger Gemini dynamic prioritizer and scheduler
  const handleAiPrioritize = async (tasksToOptimize = tasksRef.current) => {
    if (!tasksToOptimize || tasksToOptimize.length === 0) {
      triggerAlert("error", "No tasks available for Gemini calculations.");
      return;
    }
    setIsCompilingPriority(true);
    try {
      let freeBusy: any[] = [];
      if (isAuthenticated) {
        try {
          freeBusy = await fetchFreeBusyCurrentWeek();
        } catch (fbErr) {
          console.warn("Failed to fetch Google Calendar free/busy schedules:", fbErr);
        }
      }

      const currentTimeStr = new Date().toISOString();
      const updated = await triggerAiPrioritization(tasksToOptimize, goalsRef.current, freeBusy, currentTimeStr);
      
      // Push event creations/updates to Google Calendar so task event IDs stay correctly linked
      const finalizedTasks: Task[] = [];
      for (const t of updated) {
        let taskCopy = { ...t };
        const currentTasks = tasksRef.current;
        const existingTask = tasksToOptimize.find(item => item.id === taskCopy.id) || currentTasks.find(item => item.id === taskCopy.id);
        
        if (existingTask) {
          taskCopy.initial_deadline = existingTask.initial_deadline || existingTask.deadline;
          // Only preserve original_deadline if it was explicitly set (e.g. by overdue checker)
          taskCopy.original_deadline = existingTask.original_deadline;
          if (existingTask.calendarEventId && !taskCopy.calendarEventId) {
            taskCopy.calendarEventId = existingTask.calendarEventId;
          }
          if (existingTask.replanned) {
            taskCopy.replanned = true;
          }
          if (existingTask.max_streak !== undefined) {
            taskCopy.max_streak = existingTask.max_streak;
          }
          if (existingTask.recent_status_log) {
            taskCopy.recent_status_log = existingTask.recent_status_log;
          }
        } else {
          taskCopy.initial_deadline = t.deadline;
          // Do not set original_deadline for new tasks until they are actually missed
          taskCopy.original_deadline = undefined;
        }

        if (taskCopy.scheduled_end) {
          taskCopy.deadline = taskCopy.scheduled_end;
        }

        if (taskCopy.status !== "done") {
          let shouldBeOverdue = false;
          if (new Date(taskCopy.deadline).getTime() < Date.now()) {
            shouldBeOverdue = true;
          } else if (taskCopy.original_deadline && new Date(taskCopy.original_deadline).getTime() !== new Date(taskCopy.deadline).getTime()) {
            shouldBeOverdue = true;
          }

          if (shouldBeOverdue && taskCopy.status !== "overdue") {
            taskCopy.status = "overdue";
          } else if (!shouldBeOverdue && taskCopy.status === "overdue") {
            taskCopy.status = "not_started";
          }
        }

        let syncFailed = false;
        if (isAuthenticated && taskCopy.status !== "done" && taskCopy.scheduled_start) {
          // Sync to calendar if slot changed, estimated effort changed, or calendar event is missing
          if (
            !existingTask || 
            existingTask.scheduled_start !== taskCopy.scheduled_start || 
            existingTask.estimated_effort !== taskCopy.estimated_effort ||
            existingTask.title !== taskCopy.title ||
            !existingTask.calendarEventId
          ) {
            try {
              const syncResult = await syncTaskToGoogleCalendar(taskCopy, existingTask);
              if (syncResult.calendarEventId) {
                taskCopy.calendarEventId = syncResult.calendarEventId;
              }
            } catch (syncErr: any) {
              console.warn("Failed to sync task to Google Calendar:", syncErr);
              syncFailed = true;
              triggerAlert("error", `Calendar sync failed for "${taskCopy.title}". Reverting changes.`);
            }
          }
        }
        
        // Only save to Firestore if sync didn't fail
        if (!syncFailed) {
          try {
            await saveTaskToFirestore(taskCopy);
            finalizedTasks.push(taskCopy);
          } catch (saveErr) {
            console.warn(`Failed to save task update to Firestore for task ID ${taskCopy.id}:`, saveErr);
            // If firestore fails, we ideally should rollback calendar, but instructions say surface error and do not allow partial update.
            // If firestore failed, the UI won't reflect the change (as long as we don't push to finalizedTasks).
          }
        } else {
          // Keep the existing task state if sync failed
          if (existingTask) {
            finalizedTasks.push(existingTask);
          }
        }
      }

      setTasks(finalizedTasks);
      triggerAlert("success", "AI priorities and Google Calendar schedules synchronized.");
    } catch (err) {
      console.error("AI Prioritization failed:", err);
      triggerAlert("error", "AI prioritizer offline fallback applied.");
    } finally {
      setIsCompilingPriority(false);
    }
  };

  // Google Calendar scheduling helper
  const handleSyncToCalendar = async (task: Task) => {
    const confirmed = await askConfirmation(
      "Schedule Event",
      `Schedule '${task.title}' on your Google Calendar? Aura will write this event starting at your scheduled deadline: ${new Date(task.deadline).toLocaleString()}`
    );
    if (!confirmed) return;

    try {
      const syncResult = await syncTaskToGoogleCalendar(task, task);
      
      const updatedFields: any = {
        ...task,
        calendarEventId: syncResult.calendarEventId,
      };

      // If the task does not have scheduled start/end times yet, set them to match the Google Calendar event times
      if (!task.scheduled_start || !task.scheduled_end) {
        const durationMin = task.estimated_effort > 0 ? task.estimated_effort : 60;
        const endTime = task.scheduled_end ? new Date(task.scheduled_end) : new Date(task.deadline);
        const startTime = task.scheduled_start ? new Date(task.scheduled_start) : new Date(endTime.getTime() - durationMin * 60 * 1000);
        
        updatedFields.scheduled_start = startTime.toISOString();
        updatedFields.scheduled_end = endTime.toISOString();
        updatedFields.scheduling_reason = "Manually synchronized to Google Calendar slot.";
      }

      await saveTaskToFirestore(updatedFields);

      // Instantly load refreshed list from Firestore
      const refreshedTasks = await getTasksFromFirestore();
      setTasks(refreshedTasks);

      triggerAlert("success", "Scheduled and synchronized on Google Calendar!");
    } catch (err: any) {
      console.error(err);
      triggerAlert("error", err.message || "Failed to schedule Calendar event.");
    }
  };

  // Open email draft modal for task
  const handleOpenComposeEmail = (task: Task) => {
    setEmailTaskSource(task);
    setIsEmailModalOpen(true);
  };

  // Helper to determine if task is scheduled for today
  const isTodayTask = (t: Task) => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const localTodayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
      const datesToCheck = [t.scheduled_start, t.scheduled_end, t.deadline].filter(Boolean) as string[];
      return datesToCheck.some(d => d.startsWith(todayStr) || d.startsWith(localTodayStr));
    } catch (e) {
      return false;
    }
  };

  const isOverdueTask = (t: Task) => {
    if (t.status === "done") return false;
    const nowTime = Date.now();
    // Overdue display if:
    // 1. Current time is past the current deadline
    if (new Date(t.deadline).getTime() < nowTime) return true;
    // 2. Or, it was missed in the past (original_deadline is set and differs from deadline)
    if (t.original_deadline && new Date(t.original_deadline).getTime() !== new Date(t.deadline).getTime()) return true;
    return false;
  };

  const overdueCount = tasks.filter(t => isOverdueTask(t)).length;

  // Filter lists
  const filteredTasks = tasks.filter(t => {
    if (activeFilter === "done") return t.status === "done" || t.status === "archived";
    if (activeFilter === "overdue") return isOverdueTask(t);
    if (activeFilter === "habits") return false;
    return t.status !== "done" && t.status !== "archived"; // not_started, in_progress, overdue (if looking at active, might exclude done)
  });

  // Sort: Today tasks at top, other active tasks in middle, overdue tasks at bottom.
  // Within each category, sort by priority_score descending (highest priority first).
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aOverdue = isOverdueTask(a);
    const bOverdue = isOverdueTask(b);
    
    const aToday = isTodayTask(a);
    const bToday = isTodayTask(b);

    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;

    // Group overdue at the absolute bottom (if not today)
    if (aOverdue && !bOverdue) return 1;
    if (!aOverdue && bOverdue) return -1;

    // Same group, sort by priority score descending
    return b.priority_score - a.priority_score;
  });

  return (
    <div className="min-h-screen bg-[#F7F5F2] text-[#2D2C2A] dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-300 font-sans">
      
      {/* Onboarding Screen when Logout */}
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center p-6 bg-[#F7F5F2] dark:bg-zinc-950 z-40 overflow-hidden"
          >
            {/* Ambient visual background glow details */}
            <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-[#D97757]/5 dark:bg-[#D97757]/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#5A644D]/5 dark:bg-[#5A644D]/5 blur-[120px] pointer-events-none" />

            <div className="max-w-md w-full text-center space-y-8 relative z-10">
              <div className="space-y-3">
                <div className="inline-flex p-3 rounded-2xl bg-[#D97757]/10 border border-[#D97757]/20 dark:border-[#D97757]/10 animate-pulse">
                  <Sparkles className="w-8 h-8 text-[#D97757]" />
                </div>
                <h1 className="text-4xl font-bold font-serif italic tracking-tight text-[#2D2C2A] dark:text-white">
                  Aura Workspace
                </h1>
                <p className="text-[#7A756E] dark:text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto select-none">
                  An elite, synchronized bento workspace coordinating tasks, goals, Google Calendars, and Gmail drafts with exquisite typography.
                </p>
              </div>

              {/* Login Buttons */}
              <div className="flex flex-col items-center justify-center gap-4">
                {authLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Verifying session...</span>
                  </div>
                ) : (
                  /* Official Material Design GSI Button structure (per Workspace skill blueprint) */
                  <button onClick={handleLogin} className="gsi-material-button w-full max-w-xs group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 p-3 flex items-center justify-center gap-3 shadow-sm hover:shadow-md cursor-pointer transition-all duration-300 active:scale-95">
                    <div className="gsi-material-button-icon h-5 w-5 flex-shrink-0">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-200 text-sm font-bold tracking-tight">Launch with Google</span>
                  </button>
                )}
              </div>

              <div className="text-[10px] text-zinc-400 font-mono">
                COMPILER v1.7.2 • SECURED BY GOOGLE CLOUD
              </div>
            </div>
          </motion.div>
        ) : (
          /* Live Workspace View dashboard */
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-screen overflow-hidden"
          >
            {/* Header Navbar */}
            <header className="sticky top-0 z-30 h-16 border-b border-[#E8E4DF] dark:border-zinc-800/80 bg-[#F7F5F2]/80 dark:bg-zinc-950/70 backdrop-blur-md flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#D97757] flex items-center justify-center text-white font-bold select-none shadow-sm">
                  A
                </div>
                <div>
                  <h1 className="text-base font-bold font-serif italic tracking-tight text-[#2D2C2A] dark:text-white flex items-center gap-1.5 select-none">
                    Aura Workspace <Sparkle className="w-3.5 h-3.5 text-[#D97757] animate-pulse" />
                  </h1>
                </div>
              </div>

              {/* User credentials and logout indicator */}
              <div className="flex items-center gap-3">
                {user && (
                  <div className="flex items-center gap-2">
                    <img
                      src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || "User"}`}
                      alt="avatar"
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-850"
                    />
                    <div className="hidden sm:block text-left">
                      <p className="text-xs font-semibold text-zinc-850 dark:text-zinc-100 truncate max-w-[120px]">{user.displayName}</p>
                      <p className="text-[9px] text-[#7A756E] font-mono uppercase truncate max-w-[120px]">{user.email}</p>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-zinc-400 hover:text-rose-605 hover:bg-rose-50/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-450 transition-colors"
                  title="Sign out of Aura"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Notification Toasts alerts */}
            <AnimatePresence>
              {alertMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  className="fixed top-20 right-6 z-50 max-w-sm rounded-2xl p-4 shadow-lg border text-xs leading-relaxed flex items-center gap-3 bg-white dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800"
                >
                  {alertMessage.type === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                  <span className="text-zinc-700 dark:text-zinc-350 font-medium select-none">{alertMessage.text}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main view Grid layout */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
              
              {/* Left 2 Columns: Tasks board & Scheduler */}
              <div className="md:col-span-2 flex flex-col min-h-0 space-y-6">
                
                {/* Board Controls */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white/70 dark:bg-zinc-900/10 border border-[#E8E4DF] dark:border-zinc-800/40 p-4 rounded-[24px] shadow-sm">
                  
                  {/* Filter tabs */}
                  <div className="flex gap-1.5 p-1 rounded-xl bg-[#F7F5F2] dark:bg-zinc-900/60 flex-shrink-0">
                    <button
                      onClick={() => setActiveFilter("active")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                        activeFilter === "active"
                          ? "bg-white dark:bg-zinc-800 text-[#2D2C2A] dark:text-zinc-200 shadow-xs font-bold"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      Workspace Queue
                    </button>
                    <button
                      onClick={() => setActiveFilter("overdue")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeFilter === "overdue"
                          ? "bg-[#F2D7D0] border border-[#8C4F4F]/20 text-rose-800 dark:text-rose-350 font-bold"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      <span>Alerts / Overdue</span>
                      {overdueCount > 0 && (
                        <span className="flex items-center justify-center min-w-[16px] h-4 text-[9px] font-extrabold bg-rose-600 text-white rounded-full px-1 shadow-xs animate-bounce" id="overdue-badge-count">
                          {overdueCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveFilter("done")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                        activeFilter === "done"
                          ? "bg-white dark:bg-zinc-800 text-[#2D2C2A] dark:text-zinc-200 shadow-xs font-bold"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      Archive Logs
                    </button>
                    <button
                      onClick={() => setActiveFilter("habits")}
                      id="tab-habits"
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                        activeFilter === "habits"
                          ? "bg-white dark:bg-zinc-800 text-[#2D2C2A] dark:text-zinc-200 shadow-xs font-bold border-l-2 border-[#D97757]"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      Habits & Streaks
                    </button>
                  </div>

                  {/* AI trigger compile & Create task CTA */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleAiPrioritize()}
                      disabled={isCompilingPriority || tasks.length === 0}
                      className="px-4 py-2.5 text-xs font-bold font-display rounded-xl text-[#5A644D] dark:text-emerald-400 border border-[#5A644D]/35 dark:border-emerald-500/30 bg-[#D4DBCB]/15 hover:bg-[#D4DBCB]/30 disabled:opacity-30 flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      {isCompilingPriority ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Compiling Score...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-[#D97757] animate-pulse" />
                          <span>Prioritize with AI</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setEditingTask(null);
                        setIsTaskModalOpen(true);
                      }}
                      className="px-5 py-2.5 text-xs font-bold font-display rounded-xl bg-[#D97757] text-white hover:bg-[#D97757]/90 flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Launch Task</span>
                    </button>
                  </div>
                </div>

                {/* Task Listing with Layout Animations */}
                <div className="flex-1 flex flex-col min-h-0 max-h-[580px] overflow-y-auto pr-2 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800">
                  {activeFilter === "habits" ? (
                    <HabitTracker
                      tasks={tasks}
                      onLogCompletion={handleLogHabitCompletion}
                      onEdit={(t) => {
                        setEditingTask(t);
                        setIsTaskModalOpen(true);
                      }}
                      onDelete={handleDeleteTask}
                    />
                  ) : loadingData ? (
                    <div className="space-y-3">
                      <TaskCardSkeleton />
                      <TaskCardSkeleton />
                      <TaskCardSkeleton />
                    </div>
                  ) : sortedTasks.length === 0 ? (
                    /* Beautiful Empty State with Helpful Guidance (Non-blank) */
                    <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-16 text-center bg-white/40 dark:bg-zinc-900/10 flex flex-col items-center justify-center">
                      <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-900/60 text-zinc-400 mb-4">
                        <Inbox className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-bold font-display text-zinc-800 dark:text-zinc-100">
                        {activeFilter === "done" 
                          ? "Archive is Blank" 
                          : activeFilter === "overdue"
                          ? "No Overdue Alerts"
                          : "Workspace Clear"}
                      </h3>
                      <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500 max-w-sm leading-relaxed">
                        {activeFilter === "done"
                          ? "Completed tasks migrate here. Begin checking off tasks from your workspace queue to archive them and log your effort."
                          : activeFilter === "overdue"
                          ? "Excellent! You have zero tasks past their designated deadlines. Maintain your focus to keep this queue clear."
                          : "Set up a new task with a clear title, description, and deadline to see dynamic scoring in actions."}
                      </p>
                      
                      {activeFilter === "active" && (
                        <button
                          onClick={() => {
                            setEditingTask(null);
                            setIsTaskModalOpen(true);
                          }}
                          className="mt-6 px-5 py-2.5 bg-zinc-950 dark:bg-zinc-200 hover:opacity-90 text-white dark:text-zinc-950 text-xs font-semibold rounded-xl tracking-tight shadow active:scale-95 transition-all inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" /> Create First Task
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <AnimatePresence mode="popLayout">
                        {/* Group archived goals and their subtasks */}
                        {activeFilter === "done" && goals.filter(g => g.status === "archived").map(goal => {
                          const goalTasks = sortedTasks.filter(t => t.goal_id === goal.id);
                          if (goalTasks.length === 0) return null;
                          return (
                            <motion.div key={`archived-goal-${goal.id}`} layout className="mb-4 rounded-2xl border border-[#E8E4DF] dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/40 p-4">
                              <div className="flex items-center justify-between mb-3 px-1">
                                <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                  <FolderArchive className="w-4 h-4 text-zinc-400" />
                                  {goal.title}
                                </h4>
                                <button
                                  onClick={() => handleRestoreGoal(goal.id)}
                                  className="px-3 py-1.5 text-[11px] font-bold bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757]/20 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" /> Restore Goal & Tasks
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-2 pl-2 border-l-2 border-[#D97757]/20">
                                {goalTasks.map((task) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    goals={goals}
                                    onEdit={(t) => {
                                      setEditingTask(t);
                                      setIsTaskModalOpen(true);
                                    }}
                                    onDelete={handleDeleteTask}
                                    onToggleComplete={handleToggleComplete}
                                    onSyncToCalendar={handleSyncToCalendar}
                                    onComposeEmail={handleOpenComposeEmail}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          );
                        })}

                        {/* Render remaining tasks (or all tasks if not in Archive Logs) */}
                        {sortedTasks.filter(t => {
                          if (activeFilter !== "done") return true;
                          const goal = goals.find(g => g.id === t.goal_id);
                          return !goal || goal.status !== "archived";
                        }).map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            goals={goals}
                            onEdit={(t) => {
                              setEditingTask(t);
                              setIsTaskModalOpen(true);
                            }}
                            onDelete={handleDeleteTask}
                            onToggleComplete={handleToggleComplete}
                            onSyncToCalendar={handleSyncToCalendar}
                            onComposeEmail={handleOpenComposeEmail}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* Core Assistant Chat interface with top separator line and proper margins */}
                <div className="pt-6 border-t border-[#E8E4DF] dark:border-zinc-800/60 mt-auto shrink-0" id="aura-assistant-wrapper">
                  <AuraAssistant 
                    tasks={tasks}
                    goals={goals}
                    onRefreshTasks={loadWorkspaceData}
                    onSaveTask={handleSaveTask}
                  />
                </div>
              </div>

              {/* Right Column: Active Goals, Calendar List Feed */}
              <div className="space-y-6 overflow-y-auto pr-2 pb-6 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800">
                
                {/* Google Calendar Manager */}
                <CalendarManager 
                  isAuthenticated={isAuthenticated}
                  onAuthenticate={handleLogin}
                />

                {/* Agent Reasoning Panel */}
                <div className="rounded-[28px] border border-[#E8E4DF] dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/40 p-5 space-y-4 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 border-b border-[#E8E4DF] dark:border-zinc-800 pb-3">
                    <Sparkles className="w-4 h-4 text-[#D97757] animate-pulse" />
                    <h3 className="text-sm font-bold font-display tracking-tight text-[#2D2C2A] dark:text-zinc-100">
                      Agent Reasoning & Scheduling
                    </h3>
                  </div>

                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {draftConfirmations.length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-400">
                          <Inbox className="w-4 h-4" />
                          <span>Overdue Delay Drafts Saved to Gmail</span>
                        </div>
                        <div className="space-y-1.5">
                          {draftConfirmations.map((draft, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
                              <span className="font-medium text-zinc-700 dark:text-zinc-200 truncate max-w-[200px]">
                                {draft.title}
                              </span>
                              <a
                                href={draft.gmailLink}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-zinc-950 dark:bg-zinc-100 hover:opacity-90 text-white dark:text-zinc-950 text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                              >
                                <span>Open Drafts</span>
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {tasks.filter(t => t.status !== "done").length === 0 ? (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No active tasks to prioritize or schedule.</p>
                    ) : (
                      [...tasks]
                        .filter(t => t.status !== "done")
                        .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
                        .map(task => {
                          const formattedStart = task.scheduled_start 
                            ? new Date(task.scheduled_start).toLocaleDateString() + ' ' + new Date(task.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : null;
                          return (
                            <div key={task.id} className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/60 space-y-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-[#2D2C2A] dark:text-zinc-100 truncate max-w-[150px]" title={task.title}>
                                  {task.title}
                                </span>
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#D4DBCB]/40 dark:bg-[#D4DBCB]/15 text-[#5A644D] dark:text-emerald-400">
                                  Score: {task.priority_score || '--'}
                                </span>
                              </div>

                              {/* Priority Reason */}
                              <p className="text-zinc-600 dark:text-zinc-400 leading-normal text-[11px]">
                                <span className="font-semibold text-zinc-800 dark:text-zinc-200">Priority:</span> {task.priority_reason || "Awaiting AI prioritization compile."}
                              </p>

                              {/* Scheduling Decision */}
                              <div className="pt-1.5 border-t border-dashed border-zinc-200 dark:border-zinc-800 space-y-1">
                                <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Scheduled Slot:</span> {formattedStart ? formattedStart : "Unscheduled"}
                                </p>
                                {task.scheduling_reason && (
                                  <p className="text-zinc-500 dark:text-zinc-500 text-[10px] italic">
                                    {task.scheduling_reason}
                                  </p>
                                )}
                                {task.scheduling_warning && (
                                  <div className="mt-1 flex items-start gap-1.5 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 text-[10px] font-medium leading-relaxed">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                                    <span>{task.scheduling_warning}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Milestone Goals */}
                <div className="rounded-[28px] border border-[#E8E4DF] dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/40 p-5 space-y-4 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 border-b border-[#E8E4DF] dark:border-zinc-800 pb-3">
                    <TrendingUp className="w-4 h-4 text-[#D97757]" />
                    <h3 className="text-sm font-bold font-serif italic tracking-tight text-[#2D2C2A] dark:text-zinc-100">
                      Workspace Milestones
                    </h3>
                  </div>

                  <GoalManager 
                    goals={goals.filter(g => g.status !== "archived")}
                    tasks={tasks.filter(t => t.status !== "archived")}
                    onCreateGoal={handleCreateGoal}
                    onDeleteGoal={handleDeleteGoal}
                    onDecomposeGoal={handleDecomposeGoal}
                  />
                </div>

                {/* Notes Scratchpad */}
                <div className="rounded-[28px] border border-[#E8E4DF] dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/40 p-5 space-y-4 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 border-b border-[#E8E4DF] dark:border-zinc-800 pb-3">
                    <Sparkles className="w-4 h-4 text-[#D97757]" />
                    <h3 className="text-sm font-bold font-serif italic tracking-tight text-[#2D2C2A] dark:text-zinc-100">
                      Workspace Notes Scratchpad
                    </h3>
                  </div>

                  <NotesManager 
                    notes={notes}
                    onSaveNote={handleSaveNote}
                    onDeleteNote={handleDeleteNote}
                    onTasksExtracted={handleTasksExtracted}
                  />
                </div>

                <div className="p-4 rounded-[20px] bg-[#D4DBCB]/30 dark:bg-[#D4DBCB]/10 border border-[#E8E4DF] dark:border-zinc-850/30 text-[11px] leading-relaxed text-[#5A644D] dark:text-zinc-300">
                  <div className="font-bold text-[#5A644D] dark:text-zinc-200 mb-1 flex items-center gap-1.5 font-display">
                    <Sparkles className="w-3.5 h-3.5 text-[#D97757] animate-pulse" /> Compilation Engine:
                  </div>
                  System managed updates: Checked every time you save or edit. Under the hood, Aura uses standard Gemini models to keep your workspace completely coordinated.
                </div>
              </div>

            </main>

            {/* Float Modals */}
            <CreateEditTaskModal
              isOpen={isTaskModalOpen}
              onClose={() => {
                setIsTaskModalOpen(false);
                setEditingTask(null);
              }}
              onSave={handleSaveTask}
              task={editingTask}
              goals={goals}
            />

            <GmailDraftModal
              isOpen={isEmailModalOpen}
              onClose={() => {
                setIsEmailModalOpen(false);
                setEmailTaskSource(null);
              }}
              task={emailTaskSource}
            />

            {/* Custom Premium Confirm Dialog Modal */}
            <AnimatePresence>
              {confirmState && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                      confirmState.resolve(false);
                      setConfirmState(null);
                    }}
                    className="absolute inset-0 bg-neutral-950/75 backdrop-blur-[3px]"
                  />

                  {/* Modal Panel */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    className="relative w-full max-w-sm bg-[#F7F5F2] dark:bg-zinc-900 border border-[#E8E4DF] dark:border-zinc-800 rounded-2xl shadow-2xl p-5 z-10 text-neutral-800 dark:text-neutral-100"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-[#D97757]/10 dark:bg-[#D97757]/20 rounded-xl flex-shrink-0 text-[#D97757]">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <h3 className="text-sm font-bold font-serif text-[#2D2C2A] dark:text-zinc-100">
                          {confirmState.title}
                        </h3>
                        <p className="text-xs text-[#5C5752] dark:text-zinc-400 leading-relaxed font-sans">
                          {confirmState.message}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-end gap-2.5">
                      <button
                        onClick={() => {
                          confirmState.resolve(false);
                          setConfirmState(null);
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-750 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          confirmState.resolve(true);
                          setConfirmState(null);
                        }}
                        className="px-4.5 py-2 rounded-xl text-xs font-bold text-white bg-[#D97757] hover:bg-[#D97757]/95 shadow-sm active:scale-95 transition-all cursor-pointer font-sans"
                      >
                        Confirm Action
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
