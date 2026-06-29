import { db, auth } from "./firebase";
import { Task, Goal, Note } from "./types";
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  setDoc
} from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Dynamic timestamp computed freshly on demand

/**
 * Fetch all tasks belongs to active logged-in user
 */
export async function getTasksFromFirestore(): Promise<Task[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = "tasks";
  try {
    const q = query(
      collection(db, path),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);
    const list: Task[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        ...data,
      } as Task);
    });

    // Calculate local overdue/recurring status on-the-fly relative to current real-world time
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const getStartOfWeekString = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day;
      return new Date(date.setDate(diff)).toISOString().split('T')[0];
    };

    const adjustedList = list.map(t => {
      if (t.recurrence && t.recurrence !== "none") {
        let completed = false;
        let lastComp: string | null = null;
        if (t.completions && t.completions.length > 0) {
          if (t.recurrence === "daily") {
            const matched = t.completions.filter(c => c.startsWith(todayStr));
            if (matched.length > 0) {
              completed = true;
              lastComp = matched[matched.length - 1];
            }
          } else if (t.recurrence === "weekly") {
            const currentWeekStr = getStartOfWeekString(now);
            const matched = t.completions.filter(c => getStartOfWeekString(new Date(c)) === currentWeekStr);
            if (matched.length > 0) {
              completed = true;
              lastComp = matched[matched.length - 1];
            }
          }
        }

        if (completed) {
          t.status = "done";
          t.completed_at = lastComp;
        } else {
          t.status = "not_started";
          t.completed_at = null;
        }
      } else {
        if (t.status !== "done") {
          let shouldBeOverdue = false;
          
          if (new Date(t.deadline).getTime() < now.getTime()) {
            shouldBeOverdue = true;
          } else if (t.original_deadline && new Date(t.original_deadline).getTime() !== new Date(t.deadline).getTime()) {
            shouldBeOverdue = true;
          }

          if (shouldBeOverdue && t.status !== "overdue") {
            t.status = "overdue";
          }
        }
      }
      return t;
    });

    return adjustedList;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

/**
 * Fetch all goals belongs to active logged-in user
 */
export async function getGoalsFromFirestore(): Promise<Goal[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = "goals";
  try {
    const q = query(
      collection(db, path),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);
    const list: Goal[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        ...data,
      } as Goal);
    });

    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

/**
 * Create or Update a task on Firestore
 */
export async function saveTaskToFirestore(taskData: {
  id?: string;
  title: string;
  description: string;
  deadline: string;
  estimated_effort: number;
  goal_id: string | null;
  status?: "not_started" | "in_progress" | "done" | "overdue" | "archived";
  priority_score?: number;
  calendarEventId?: string | null;
  priority_reason?: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  scheduling_reason?: string;
  scheduling_warning?: string;
  initial_deadline?: string | null;
  original_deadline?: string | null;
  replanned?: boolean | null;
  recurrence?: 'none' | 'daily' | 'weekly';
  completions?: string[];
  max_streak?: number;
  recent_status_log?: Record<string, "completed" | "missed">;
  completed_at?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No active authenticated session.");

  const now = new Date();
  const deadlineDate = new Date(taskData.deadline);
  
  // Decide initial status and completion timestamp
  let determinedStatus: "not_started" | "in_progress" | "done" | "overdue" | "archived" = taskData.status || "not_started";
  let completedAtVal: string | null = null;

  if (determinedStatus === "done") {
    completedAtVal = taskData.completed_at || now.toISOString();
  } else if (determinedStatus !== "archived" && deadlineDate.getTime() < now.getTime()) {
    determinedStatus = "overdue";
  }

  const path = "tasks";
  try {
    // Check if updating or creating
    if (taskData.id) {
      const taskRef = doc(db, path, taskData.id);
      
      // Clean fields update
      const updatePayload: any = {
        title: taskData.title,
        description: taskData.description,
        deadline: taskData.deadline,
        estimated_effort: taskData.estimated_effort,
        goal_id: taskData.goal_id,
        status: determinedStatus,
        recurrence: taskData.recurrence || "none",
      };

      if (taskData.priority_score !== undefined) {
        updatePayload.priority_score = taskData.priority_score;
      }
      if (taskData.calendarEventId !== undefined) {
        updatePayload.calendarEventId = taskData.calendarEventId;
      }
      if (taskData.priority_reason !== undefined) {
        updatePayload.priority_reason = taskData.priority_reason;
      }
      if (taskData.scheduled_start !== undefined) {
        updatePayload.scheduled_start = taskData.scheduled_start;
      }
      if (taskData.scheduled_end !== undefined) {
        updatePayload.scheduled_end = taskData.scheduled_end;
      }
      if (taskData.scheduling_reason !== undefined) {
        updatePayload.scheduling_reason = taskData.scheduling_reason;
      }
      if (taskData.scheduling_warning !== undefined) {
        updatePayload.scheduling_warning = taskData.scheduling_warning;
      }
      if (taskData.initial_deadline !== undefined) {
        updatePayload.initial_deadline = taskData.initial_deadline;
      }
      if (taskData.original_deadline !== undefined) {
        updatePayload.original_deadline = taskData.original_deadline;
      }
      if (taskData.replanned !== undefined) {
        updatePayload.replanned = taskData.replanned;
      }
      if (taskData.completions !== undefined) {
        updatePayload.completions = taskData.completions;
      }
      if (taskData.max_streak !== undefined) {
        updatePayload.max_streak = taskData.max_streak;
      }
      if (taskData.recent_status_log !== undefined) {
        updatePayload.recent_status_log = taskData.recent_status_log;
      }
      if (determinedStatus === "done") {
        updatePayload.completed_at = completedAtVal;
      } else {
        updatePayload.completed_at = null;
      }

      await updateDoc(taskRef, updatePayload);
      return taskData.id;
    } else {
      // Creating fresh task
      const newDocId = `task_${Date.now()}`;
      const newTaskPayload: Omit<Task, "id"> = {
        userId: user.uid,
        title: taskData.title,
        description: taskData.description,
        deadline: taskData.deadline,
        estimated_effort: taskData.estimated_effort,
        status: determinedStatus,
        priority_score: taskData.priority_score || 30, // base starter metric
        created_at: now.toISOString(),
        completed_at: completedAtVal,
        goal_id: taskData.goal_id,
        calendarEventId: taskData.calendarEventId || null,
        priority_reason: taskData.priority_reason || "",
        scheduled_start: taskData.scheduled_start || null,
        scheduled_end: taskData.scheduled_end || null,
        scheduling_reason: taskData.scheduling_reason || "",
        scheduling_warning: taskData.scheduling_warning || "",
        initial_deadline: taskData.initial_deadline || taskData.deadline,
        original_deadline: taskData.original_deadline !== undefined ? taskData.original_deadline : null,
        replanned: taskData.replanned || null,
        recurrence: taskData.recurrence || "none",
        completions: taskData.completions || [],
        max_streak: taskData.max_streak || 0,
        recent_status_log: taskData.recent_status_log || {},
      };

      await setDoc(doc(db, path, newDocId), newTaskPayload);
      return newDocId;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Create a new goal on Firestore
 */
export async function saveGoalToFirestore(title: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No active authenticated session.");

  const now = new Date();
  const newDocId = `goal_${Date.now()}`;
  
  const newGoalPayload: Omit<Goal, "id"> = {
    userId: user.uid,
    title,
    created_at: now.toISOString(),
  };

  const path = "goals";
  try {
    await setDoc(doc(db, path, newDocId), newGoalPayload);
    return newDocId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Delete a Task from Firestore
 */
export async function deleteTaskFromFirestore(id: string): Promise<void> {
  const path = "tasks";
  try {
    await updateDoc(doc(db, path, id), { status: "archived" });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Delete a Goal from Firestore
 * Also delete any tasks dependent on this goal
 */
export async function updateGoalStatusInFirestore(id: string, status: "active" | "archived"): Promise<void> {
  const path = "goals";
  try {
    await updateDoc(doc(db, path, id), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteGoalFromFirestore(id: string, cascadeTasks: Task[]): Promise<void> {
  const path = "goals";
  try {
    // 1. Soft delete Goal document (Archive)
    await updateDoc(doc(db, path, id), { status: "archived" });

    // 2. Soft delete any tasks currently referencing this goal
    const linked = cascadeTasks.filter(t => t.goal_id === id && t.status !== "archived");
    for (const t of linked) {
      const ref = doc(db, "tasks", t.id);
      await updateDoc(ref, { status: "archived" });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Fetch all notes belonging to the active logged-in user
 */
export async function getNotesFromFirestore(): Promise<Note[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = "notes";
  try {
    const q = query(
      collection(db, path),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);
    const list: Note[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        ...data,
      } as Note);
    });

    // Client-side sort to avoid needing an index immediately
    return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

/**
 * Create or Update a note on Firestore
 */
export async function saveNoteToFirestore(noteData: {
  id?: string;
  content: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No active authenticated session.");

  const now = new Date();
  const path = "notes";

  try {
    if (noteData.id) {
      const noteRef = doc(db, path, noteData.id);
      const updatePayload = {
        content: noteData.content,
        updated_at: now.toISOString(),
      };
      await updateDoc(noteRef, updatePayload);
      return noteData.id;
    } else {
      const newDocId = `note_${Date.now()}`;
      const newNotePayload: Omit<Note, "id"> = {
        userId: user.uid,
        content: noteData.content,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      await setDoc(doc(db, path, newDocId), newNotePayload);
      return newDocId;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Delete a Note from Firestore
 */
export async function deleteNoteFromFirestore(id: string): Promise<void> {
  const path = "notes";
  try {
    await deleteDoc(doc(db, path, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Submit all current tasks and goals to our Express endpoint for prioritization
 * Updates Firestore with optimized scores & estimates automatically
 */
export async function triggerAiPrioritization(
  allTasks: Task[],
  allGoals: Goal[],
  freeBusy: any[] = [],
  currentTime: string = new Date().toISOString()
): Promise<Task[]> {
  try {
    const res = await fetch("/api/prioritize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        tasks: allTasks, 
        goals: allGoals, 
        freeBusy, 
        currentTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }),
    });

    if (!res.ok) {
      throw new Error("Prioritization response was not successful");
    }

    const { tasks: optimizedTasks } = await res.json();
    
    // Write optimized fields back to Firestore dynamically
    const updatedTasks: Task[] = [];
    for (const opt of optimizedTasks) {
      const match = allTasks.find(t => t.id === opt.id);
      if (match) {
        const ref = doc(db, "tasks", opt.id);
        const updatePayload: any = {
          priority_score: opt.priority_score,
          priority_reason: opt.priority_reason || "",
          estimated_effort: opt.estimated_effort,
          status: opt.status,
          scheduled_start: opt.scheduled_start || null,
          scheduled_end: opt.scheduled_end || null,
          scheduling_reason: opt.scheduling_reason || "",
          scheduling_warning: opt.scheduling_warning || "",
        };

        if (opt.status === "done" && !match.completed_at) {
          updatePayload.completed_at = new Date(currentTime).toISOString();
        } else if (opt.status !== "done") {
          updatePayload.completed_at = null;
        }

        // Fix calendar sync bug: we used to overwrite deadline here. Now we rely on the App.tsx
        // Google Calendar sync logic to properly use scheduled_start and scheduled_end directly,
        // leaving the deadline field completely untouched.

        await updateDoc(ref, updatePayload);
        updatedTasks.push({
          ...match,
          ...updatePayload,
        });
      }
    }

    return updatedTasks;
  } catch (err) {
    console.error("AI Prioritization failed:", err);
    throw err;
  }
}
