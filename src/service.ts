import { db, auth } from "./firebase";
import { Task, Goal } from "./types";
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

const currentTimeStr = "2026-06-23T00:14:41-07:00";

/**
 * Fetch all tasks belongs to active logged-in user
 */
export async function getTasksFromFirestore(): Promise<Task[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const q = query(
    collection(db, "tasks"),
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

  // Calculate local overdue status on-the-fly relative to current time 2026-06-23
  const now = new Date(currentTimeStr);
  let hasModified = false;

  const adjustedList = list.map(t => {
    if (t.status !== "done") {
      const deadlineDate = new Date(t.deadline);
      if (deadlineDate.getTime() < now.getTime() && t.status !== "overdue") {
        t.status = "overdue";
        hasModified = true;
      }
    }
    return t;
  });

  return adjustedList;
}

/**
 * Fetch all goals belongs to active logged-in user
 */
export async function getGoalsFromFirestore(): Promise<Goal[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const q = query(
    collection(db, "goals"),
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
  status?: "not_started" | "in_progress" | "done" | "overdue";
  priority_score?: number;
  calendarEventId?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No active authenticated session.");

  const now = new Date(currentTimeStr);
  const deadlineDate = new Date(taskData.deadline);
  
  // Decide initial status and completion timestamp
  let determinedStatus: "not_started" | "in_progress" | "done" | "overdue" = taskData.status || "not_started";
  let completedAtVal: string | null = null;

  if (determinedStatus === "done") {
    completedAtVal = now.toISOString();
  } else if (deadlineDate.getTime() < now.getTime()) {
    determinedStatus = "overdue";
  }

  // Check if updating or creating
  if (taskData.id) {
    const taskRef = doc(db, "tasks", taskData.id);
    
    // Clean fields update
    const updatePayload: any = {
      title: taskData.title,
      description: taskData.description,
      deadline: taskData.deadline,
      estimated_effort: taskData.estimated_effort,
      goal_id: taskData.goal_id,
      status: determinedStatus,
    };

    if (taskData.priority_score !== undefined) {
      updatePayload.priority_score = taskData.priority_score;
    }
    if (taskData.calendarEventId !== undefined) {
      updatePayload.calendarEventId = taskData.calendarEventId;
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
    };

    await setDoc(doc(db, "tasks", newDocId), newTaskPayload);
    return newDocId;
  }
}

/**
 * Create a new goal on Firestore
 */
export async function saveGoalToFirestore(title: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No active authenticated session.");

  const now = new Date(currentTimeStr);
  const newDocId = `goal_${Date.now()}`;
  
  const newGoalPayload: Omit<Goal, "id"> = {
    userId: user.uid,
    title,
    created_at: now.toISOString(),
  };

  await setDoc(doc(db, "goals", newDocId), newGoalPayload);
  return newDocId;
}

/**
 * Delete a Task from Firestore
 */
export async function deleteTaskFromFirestore(id: string): Promise<void> {
  await deleteDoc(doc(db, "tasks", id));
}

/**
 * Delete a Goal from Firestore
 * Also unlink any tasks dependent on this goal
 */
export async function deleteGoalFromFirestore(id: string, cascadeTasks: Task[]): Promise<void> {
  // 1. Delete Goal document
  await deleteDoc(doc(db, "goals", id));

  // 2. Unlink any tasks currently referencing this goal
  const linked = cascadeTasks.filter(t => t.goal_id === id);
  for (const t of linked) {
    const ref = doc(db, "tasks", t.id);
    await updateDoc(ref, { goal_id: null });
  }
}

/**
 * Submit all current tasks and goals to our Express endpoint for prioritization
 * Updates Firestore with optimized scores & estimates automatically
 */
export async function triggerAiPrioritization(
  allTasks: Task[],
  allGoals: Goal[]
): Promise<Task[]> {
  try {
    const res = await fetch("/api/prioritize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: allTasks, goals: allGoals }),
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
          estimated_effort: opt.estimated_effort,
          status: opt.status,
        };

        if (opt.status === "done" && !match.completed_at) {
          updatePayload.completed_at = new Date(currentTimeStr).toISOString();
        } else if (opt.status !== "done") {
          updatePayload.completed_at = null;
        }

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
