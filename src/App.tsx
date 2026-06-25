import React, { useState, useEffect } from "react";
import { Task, Goal } from "./types";
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
  triggerAiPrioritization
} from "./service";
import { 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent, 
  fetchFreeBusyCurrentWeek 
} from "./workspace";
import { TaskCard } from "./components/TaskCard";
import { CreateEditTaskModal } from "./components/CreateEditTaskModal";
import { GoalManager } from "./components/GoalManager";
import { CalendarManager } from "./components/CalendarManager";
import { GmailDraftModal } from "./components/GmailDraftModal";
import { AuraAssistant } from "./components/AuraAssistant";
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
  Inbox
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Dynamic Workspace States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [isCompilingPriority, setIsCompilingPriority] = useState(false);

  // Filters
  const [activeFilter, setActiveFilter] = useState<"active" | "done" | "overdue">("active");

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

  const loadWorkspaceData = async () => {
    setLoadingData(true);
    try {
      const fetchedTasks = await getTasksFromFirestore();
      const fetchedGoals = await getGoalsFromFirestore();
      setTasks(fetchedTasks);
      setGoals(fetchedGoals);
    } catch (err) {
      console.error(err);
      triggerAlert("error", "Error loading tasks from cloud storage.");
    } finally {
      setLoadingData(false);
    }
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
  // If API call fails, we trigger a warning alert, but still let the task save locally.
  const syncTaskToGoogleCalendar = async (taskData: any, existingTaskObj?: Task): Promise<{ calendarEventId: string | null; warning?: string }> => {
    // 1. If task is already "done", we should not create or keep any Calendar event
    if (taskData.status === "done") {
      if (existingTaskObj?.calendarEventId) {
        try {
          await deleteCalendarEvent(existingTaskObj.calendarEventId);
        } catch (err: any) {
          console.warn("Failed to delete complete task's calendar event:", err);
          return { calendarEventId: null, warning: "Task saved, but couldn't remove event from Google Calendar." };
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
          return { calendarEventId: null, warning: "Task saved, but previous Calendar event couldn't be deleted." };
        }
      }
      return { calendarEventId: null };
    }

    // 3. Task has a deadline. Create or update calendar event
    try {
      const startTime = taskData.scheduled_start ? new Date(taskData.scheduled_start) : new Date(taskData.deadline);
      const durationMin = taskData.estimated_effort > 0 ? taskData.estimated_effort : 60;
      const endTime = taskData.scheduled_end ? new Date(taskData.scheduled_end) : new Date(startTime.getTime() + durationMin * 60 * 1000);

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
      return { 
        calendarEventId: existingTaskObj?.calendarEventId || null, 
        warning: `Task saved, but Google Calendar sync failed: ${err.message || 'Check connection'}` 
      };
    }
  };

  // Create or Update single task action
  const handleSaveTask = async (taskData: any) => {
    try {
      let finalData = { ...taskData };
      const existingTaskObj = tasks.find(t => t.id === taskData.id);
      
      let calendarWarning = "";
      if (isAuthenticated) {
        const syncResult = await syncTaskToGoogleCalendar(taskData, existingTaskObj);
        finalData.calendarEventId = syncResult.calendarEventId;
        if (syncResult.warning) {
          calendarWarning = syncResult.warning;
        }
      }

      await saveTaskToFirestore(finalData);
      
      // Instantly load refreshed list from Firestore
      const refreshedTasks = await getTasksFromFirestore();
      setTasks(refreshedTasks);
      
      if (calendarWarning) {
        triggerAlert("error", calendarWarning);
      } else {
        triggerAlert("success", taskData.id ? "Task updated." : "Task compiled.");
      }

      // Automatically trigger the dynamic prioritization and scheduling flow on create/update
      handleAiPrioritize(refreshedTasks);
    } catch (err) {
      console.error(err);
      triggerAlert("error", "Failed to save task. Schema verification mismatch.");
    }
  };

  // Toggle state between active <-> done
  const handleToggleComplete = async (task: Task) => {
    try {
      const newStatus = task.status === "done" ? "not_started" : "done";
      let updatedFields: any = {
        ...task,
        status: newStatus,
      };

      let calendarWarning = "";
      if (isAuthenticated) {
        const syncResult = await syncTaskToGoogleCalendar(updatedFields, task);
        updatedFields.calendarEventId = syncResult.calendarEventId;
        if (syncResult.warning) {
          calendarWarning = syncResult.warning;
        }
      }

      await saveTaskToFirestore(updatedFields);

      const refreshed = await getTasksFromFirestore();
      setTasks(refreshed);
      
      if (calendarWarning) {
        triggerAlert("error", calendarWarning);
      } else {
        triggerAlert("success", newStatus === "done" ? "Task checked off!" : "Task reactivated.");
      }

      // Trigger re-scheduling and prioritization when completeness changes
      handleAiPrioritize(refreshed);
    } catch (err) {
      console.error(err);
      triggerAlert("error", "Error mapping complete states in database.");
    }
  };

  // Delete task
  const handleDeleteTask = async (id: string) => {
    const confirmed = await askConfirmation(
      "Delete Task",
      "Are you sure you want to permanently delete this task? This action cannot be undone and will remove it from Google Calendar if synced."
    );
    if (!confirmed) return;

    const taskObj = tasks.find(t => t.id === id);
    let calendarWarning = "";

    if (isAuthenticated && taskObj?.calendarEventId) {
      try {
        await deleteCalendarEvent(taskObj.calendarEventId);
      } catch (err: any) {
        console.warn("Failed to delete Calendar event during task delete:", err);
        calendarWarning = "Task deleted, but failed to delete Google Calendar event.";
      }
    }

    try {
      await deleteTaskFromFirestore(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      
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

  // Delete Goal (cascades tasks that are linked to null)
  const handleDeleteGoal = async (id: string) => {
    const confirmed = await askConfirmation(
      "Delete Milestone Goal",
      "Are you sure you want to delete this Goal?\n\nLinked tasks will not be deleted, but they will be unlinked from this Goal. Proceed?"
    );
    if (!confirmed) return;

    try {
      await deleteGoalFromFirestore(id, tasks);
      const refreshedGoals = await getGoalsFromFirestore();
      const refreshedTasks = await getTasksFromFirestore();
      setGoals(refreshedGoals);
      setTasks(refreshedTasks);
      triggerAlert("success", "Goal deleted and dependent tasks unlinked.");
    } catch {
      triggerAlert("error", "Error compiling drop goal instruction.");
    }
  };

  // Trigger Gemini dynamic prioritizer and scheduler
  const handleAiPrioritize = async (tasksToOptimize = tasks) => {
    if (tasksToOptimize.length === 0) {
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
      const updated = await triggerAiPrioritization(tasksToOptimize, goals, freeBusy, currentTimeStr);
      
      // Push event creations/updates to Google Calendar so task event IDs stay correctly linked
      const finalizedTasks: Task[] = [];
      for (const t of updated) {
        let taskCopy = { ...t };
        if (isAuthenticated && taskCopy.status !== "done" && taskCopy.scheduled_start) {
          const existingTask = tasksToOptimize.find(item => item.id === taskCopy.id) || tasks.find(item => item.id === taskCopy.id);
          // Sync to calendar if slot changed, estimated effort changed, or calendar event is missing
          if (
            !existingTask || 
            existingTask.scheduled_start !== taskCopy.scheduled_start || 
            existingTask.estimated_effort !== taskCopy.estimated_effort ||
            existingTask.title !== taskCopy.title ||
            !existingTask.calendarEventId
          ) {
            const syncResult = await syncTaskToGoogleCalendar(taskCopy, existingTask);
            if (syncResult.calendarEventId) {
              taskCopy.calendarEventId = syncResult.calendarEventId;
              await saveTaskToFirestore(taskCopy);
            }
          }
        }
        finalizedTasks.push(taskCopy);
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
      const startTime = new Date(task.deadline);
      // Event lasts 1 hour by default
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      await createCalendarEvent({
        summary: task.title,
        description: task.description || "Synthesized productivity block in Aura Workspace.",
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() }
      });

      triggerAlert("success", "Scheduled on Google Calendar!");
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

  // Filter lists
  const filteredTasks = tasks.filter(t => {
    if (activeFilter === "done") return t.status === "done";
    if (activeFilter === "overdue") return t.status === "overdue";
    return t.status !== "done"; // not_started, in_progress, overdue (if looking at active, might exclude done)
  });

  // Sort: Overdue on top, then high priority descending
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (b.status === "overdue" && a.status !== "overdue") return 1;
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
            className="flex flex-col min-h-screen"
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
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left 2 Columns: Tasks board & Scheduler */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Board Controls */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white/70 dark:bg-zinc-900/10 border border-[#E8E4DF] dark:border-zinc-800/40 p-4 rounded-[24px] shadow-sm">
                  
                  {/* Filter tabs */}
                  <div className="flex gap-1.5 p-1 rounded-xl bg-[#F7F5F2] dark:bg-zinc-900/60 flex-shrink-0">
                    <button
                      onClick={() => setActiveFilter("active")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                        activeFilter === "active"
                          ? "bg-white dark:bg-zinc-850 text-[#2D2C2A] dark:text-zinc-150 shadow-xs font-bold"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      Workspace Queue
                    </button>
                    <button
                      onClick={() => setActiveFilter("overdue")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                        activeFilter === "overdue"
                          ? "bg-[#F2D7D0] border border-[#8C4F4F]/20 text-rose-800 dark:text-rose-350 font-bold"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      Alerts / Overdue
                    </button>
                    <button
                      onClick={() => setActiveFilter("done")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                        activeFilter === "done"
                          ? "bg-white dark:bg-zinc-850 text-[#2D2C2A] dark:text-zinc-150 shadow-xs font-bold"
                          : "text-[#7A756E] hover:text-[#2D2C2A] dark:text-zinc-400"
                      }`}
                    >
                      Archive Logs
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
                <div className="space-y-4">
                  {loadingData ? (
                    <div className="py-24 text-center space-y-3">
                      <Loader2 className="w-10 h-10 animate-spin text-zinc-400 mx-auto" />
                      <p className="text-xs text-zinc-400 font-mono uppercase tracking-widest">Compiling Workspace telemetry...</p>
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
                          className="mt-6 px-5 py-2.5 bg-zinc-950 dark:bg-zinc-150 hover:opacity-90 text-white dark:text-zinc-950 text-xs font-semibold rounded-xl tracking-tight shadow active:scale-95 transition-all inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" /> Create First Task
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      <AnimatePresence mode="popLayout">
                        {sortedTasks.map((task) => (
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

                {/* Core Assistant Chat interface */}
                <AuraAssistant 
                  tasks={tasks}
                  goals={goals}
                  onRefreshTasks={loadWorkspaceData}
                />
              </div>

              {/* Right Column: Active Goals, Calendar List Feed */}
              <div className="space-y-6">
                
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
                            <div key={task.id} className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-150/80 dark:border-zinc-800/60 space-y-2 text-xs">
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
                    goals={goals}
                    tasks={tasks}
                    onCreateGoal={handleCreateGoal}
                    onDeleteGoal={handleDeleteGoal}
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
