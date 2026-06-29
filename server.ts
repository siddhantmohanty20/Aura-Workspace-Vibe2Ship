import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

dotenv.config();

function convertLocalToUtc(timeStr: string, timeZone: string): string {
  if (!timeStr) return "";
  const cleaned = timeStr.replace(/(Z|[+-]\d{2}:\d{2})$/, ''); 
  try {
    return fromZonedTime(cleaned, timeZone).toISOString();
  } catch (e) {
    return timeStr;
  }
}

function convertUtcToLocal(utcStr: string, timeZone: string): string {
  if (!utcStr) return "";
  try {
    const d = new Date(utcStr);
    return format(toZonedTime(d, timeZone), "yyyy-MM-dd'T'HH:mm:00");
  } catch (e) {
    return utcStr;
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy load Google Gen AI
const getAiClient = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

const aiClient = getAiClient();

// Helper to generate content with exponential retries and model fallbacks
async function generateContentWithRetry(
  ai: any,
  params: { model?: string; contents: any; config?: any },
  maxRetries = 2
): Promise<any> {
  let lastError: any = null;
  const models = [params.model || "gemini-3.5-flash", "gemini-3.1-flash-lite"];

  for (const model of models) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        return response;
      } catch (error: any) {
        attempt++;
        lastError = error;
        console.warn(`Gemini attempt ${attempt} for model ${model} failed:`, error.message || error);

        const errorMsg = String(error.message || "");
        const errorStatus = String(error.status || "");
        const isTransient = errorStatus === "UNAVAILABLE" || errorStatus === "RESOURCE_EXHAUSTED" ||
                            errorMsg.includes("503") || errorMsg.includes("429") || errorMsg.includes("demand") || errorMsg.includes("spikes");

        if (isTransient && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          console.warn(`Transient error detected on Gemini. Retrying in ${delay.toFixed(0)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }
  }
  throw lastError || new Error("All Gemini models and retry attempts exhausted.");
}

// API: Health probe
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API: Get Firebase Configuration from Secrets/Environment
app.get("/api/firebase-config", (req, res) => {
  let fallbackConfig: any = {};
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      fallbackConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.warn("Error reading fallback firebase-applet-config.json:", e);
    }
  }

  // Support full JSON string in environment variable, or individual fields
  let envConfig: any = {};
  if (process.env.FIREBASE_CONFIG && process.env.FIREBASE_CONFIG.trim().startsWith('{')) {
    try {
      envConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (e) {
      console.warn("Error parsing FIREBASE_CONFIG env variable:", e);
    }
  }

  const config = {
    projectId: process.env.FIREBASE_PROJECT_ID || envConfig.projectId || fallbackConfig.projectId || "",
    appId: process.env.FIREBASE_APP_ID || envConfig.appId || fallbackConfig.appId || "",
    apiKey: process.env.FIREBASE_API_KEY || envConfig.apiKey || fallbackConfig.apiKey || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || envConfig.authDomain || fallbackConfig.authDomain || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || envConfig.storageBucket || fallbackConfig.storageBucket || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || envConfig.messagingSenderId || fallbackConfig.messagingSenderId || "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || envConfig.measurementId || fallbackConfig.measurementId || "",
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || envConfig.firestoreDatabaseId || fallbackConfig.firestoreDatabaseId || fallbackConfig.databaseId || ""
  };

  res.json(config);
});

// API: Prioritize Tasks & Estimate Effort with Calendar Slot Assignment
app.post("/api/prioritize", async (req, res) => {
  const { tasks = [], goals = [], freeBusy = [], currentTime, timeZone = "UTC" } = req.body;

  if (tasks.length === 0) {
    return res.json({ tasks: [] });
  }

  // System local time supplied or freshly computed
  const currentTimeStr = currentTime || new Date().toISOString();
  const now = new Date(currentTimeStr);

  // Identify tasks to protect: incomplete tasks whose scheduled end time is in the future relative to "now"
  // (This covers both currently active scheduled tasks and future scheduled tasks whose slots haven't ended yet)
  const protectedTasks = tasks.filter((t: any) => {
    if (t.status === "done") return false;
    if (!t.scheduled_start || !t.scheduled_end) return false;
    const end = new Date(t.scheduled_end);
    return now.getTime() < end.getTime();
  });

  const protectedIds = new Set(protectedTasks.map((t: any) => t.id));
  const tasksToProcess = tasks.filter((t: any) => !protectedIds.has(t.id));

  // If all tasks are protected or done, we can safely return the exact original task array without modification
  if (tasksToProcess.length === 0) {
    return res.json({ tasks });
  }

  // Fallback / Basic priority scoring & scheduling if Gemini is not configured
  const doFallbackScoring = () => {
    // Collect all busy intervals including protected tasks' slots so they are fully respected and never overlapped
    const busyIntervals = [
      ...freeBusy.map((fb: any) => ({
        start: new Date(fb.start).getTime(),
        end: new Date(fb.end).getTime()
      })),
      ...protectedTasks.map((t: any) => ({
        start: new Date(t.scheduled_start).getTime(),
        end: new Date(t.scheduled_end).getTime()
      }))
    ];

    const findOpenSlot = (startFrom: Date, durationMin: number) => {
      let currentStart = new Date(startFrom.getTime());
      
      while (true) {
        const currentEnd = new Date(currentStart.getTime() + durationMin * 60 * 1000);
        
        // Check daytime constraint (between 08:00 and 20:00 local time)
        const localStart = toZonedTime(currentStart, timeZone);
        const localEnd = toZonedTime(currentEnd, timeZone);
        const startHour = localStart.getHours();
        const endHour = localEnd.getHours();
        
        if (startHour < 8 || startHour >= 20 || endHour > 20 || localStart.getDate() !== localEnd.getDate()) {
          // Move currentStart forward to the next 08:00 local time
          localStart.setHours(8, 0, 0, 0);
          if (startHour >= 20 || localStart.getDate() !== localEnd.getDate()) {
            localStart.setDate(localStart.getDate() + 1);
          }
          currentStart = fromZonedTime(localStart, timeZone);
          continue;
        }
        
        const sTime = currentStart.getTime();
        const eTime = currentEnd.getTime();
        
        const conflict = busyIntervals.find(interval => {
          return sTime < interval.end && eTime > interval.start;
        });
        
        if (conflict) {
          currentStart = new Date(conflict.end + 5 * 60 * 1000); // 5 mins buffer
          continue;
        }
        
        return { start: currentStart, end: currentEnd };
      }
    };

    const localNow = toZonedTime(now, timeZone);
    // If it's already past 20:00, start tomorrow at 8:00, otherwise start from the next rounded 15-min mark today
    let startLocal = new Date(localNow.getTime());
    if (startLocal.getHours() >= 20) {
      startLocal.setDate(startLocal.getDate() + 1);
      startLocal.setHours(8, 0, 0, 0);
    } else if (startLocal.getHours() < 8) {
      startLocal.setHours(8, 0, 0, 0);
    } else {
      // round up to next 15 mins
      const mins = startLocal.getMinutes();
      const remainder = mins % 15;
      if (remainder !== 0) {
        startLocal.setMinutes(mins + (15 - remainder));
      }
    }
    let currentSearchStart = fromZonedTime(startLocal, timeZone);

    const processed = tasksToProcess.map((t: any) => {
      const deadlineDate = new Date(t.deadline);
      let calculatedStatus = t.status;
      
      if (t.status !== "done") {
        if (deadlineDate.getTime() < now.getTime()) {
          calculatedStatus = "overdue";
        } else if (t.status === "overdue") {
          calculatedStatus = "not_started";
        }
      }

      const hoursDiff = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      let calculatedPriority = 30;
      let reason = "Standard fallback priority score applied.";

      if (t.status === "done") {
        calculatedPriority = 5;
        reason = "Task is already completed.";
      } else if (calculatedStatus === "overdue") {
        calculatedPriority = 95;
        reason = "Task is overdue; critical attention required.";
      } else if (hoursDiff <= 24) {
        calculatedPriority = 85;
        reason = "Task deadline is in less than 24 hours.";
      } else if (hoursDiff <= 72) {
        calculatedPriority = 65;
        reason = "Task deadline is approaching in 3 days.";
      } else if (hoursDiff <= 168) {
        calculatedPriority = 45;
        reason = "Task deadline is in less than a week.";
      }

      const finalEffort = t.estimated_effort > 0 ? t.estimated_effort : 30;
      
      let scheduled_start: string | null = null;
      let scheduled_end: string | null = null;
      let scheduling_reason = "No calendar slot assigned for completed tasks.";
      let scheduling_warning = "";

      if (calculatedStatus !== "done") {
        const slot = findOpenSlot(currentSearchStart, finalEffort);
        scheduled_start = slot.start.toISOString();
        scheduled_end = slot.end.toISOString();
        
        const startString = `${slot.start.getUTCFullYear()}-${String(slot.start.getUTCMonth()+1).padStart(2,'0')}-${String(slot.start.getUTCDate()).padStart(2,'0')} ${String(slot.start.getUTCHours()).padStart(2,'0')}:${String(slot.start.getUTCMinutes()).padStart(2,'0')} UTC`;
        scheduling_reason = `Assigned to sequential slot starting ${startString}`;
        if (slot.end.getTime() > deadlineDate.getTime()) {
          scheduling_warning = `Warning: Scheduled slot ends after the deadline of ${deadlineDate.toISOString()}`;
        }
        
        busyIntervals.push({
          start: slot.start.getTime(),
          end: slot.end.getTime()
        });
        
        currentSearchStart = new Date(slot.end.getTime() + 30 * 60 * 1000);
      }

      return {
        id: t.id,
        priority_score: calculatedPriority,
        priority_reason: reason,
        estimated_effort: finalEffort,
        status: calculatedStatus,
        scheduled_start,
        scheduled_end,
        scheduling_reason,
        scheduling_warning,
      };
    });

    // Merge them back, ensuring protected tasks are exactly preserved
    const finalFallbackTasks = tasks.map((originalTask: any) => {
      const isProt = protectedTasks.some((pt: any) => pt.id === originalTask.id);
      if (isProt) {
        return originalTask;
      }
      const processedTask = processed.find((pt: any) => pt.id === originalTask.id);
      if (processedTask) {
        return {
          ...originalTask,
          ...processedTask
        };
      }
      return originalTask;
    });

    return finalFallbackTasks;
  };

  if (!aiClient) {
    console.log("GEMINI_API_KEY not configured, using fallback calculation and scheduling logic");
    return res.json({ tasks: doFallbackScoring() });
  }

  try {
    const protectedBusyBlocks = protectedTasks.map((t: any) => ({
      start: t.scheduled_start,
      end: t.scheduled_end
    }));
    const combinedFreeBusy = [...freeBusy, ...protectedBusyBlocks];

    const localizedTasksToProcess = tasksToProcess.map((t: any) => ({
      ...t,
      deadline: convertUtcToLocal(t.deadline, timeZone),
    }));

    const localizedCombinedFreeBusy = combinedFreeBusy.map((fb: any) => ({
      start: convertUtcToLocal(fb.start, timeZone),
      end: convertUtcToLocal(fb.end, timeZone)
    }));

    const localNow = format(toZonedTime(now, timeZone), "yyyy-MM-dd'T'HH:mm:00");

    const prompt = `
You are a high-performance productivity and calendar scheduling assistant. 

CRITICAL TIME GROUNDING REFERENCE:
- The user is in timezone ${timeZone}.
- The current date and time in the user's local timezone is exactly: ${localNow}
- All dates and times in the tasks and freeBusy data provided to you are already in the user's local timezone (${timeZone}). Reason about deadlines, urgency, and scheduling entirely in this local time. Output scheduled_start and any other time values as local time strings, matching the same format you received.
- Any incomplete task whose deadline is strictly before ${localNow} MUST be computed with status = "overdue".

Analyze the following user tasks, goals, and existing calendar commitments (busy blocks), and perform prioritization and schedule optimization.

Here are the inputs:
1. Tasks:
${JSON.stringify(localizedTasksToProcess.map((t: any) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  deadline: t.deadline,
  estimated_effort: t.estimated_effort,
  status: t.status,
  goal_id: t.goal_id
})), null, 2)}

2. Goals (linked tasks may have the goal_id matching a goal's ID):
${JSON.stringify(goals, null, 2)}

3. User's Google Calendar busy time intervals (freeBusy slots during the current week):
${JSON.stringify(localizedCombinedFreeBusy, null, 2)}

Please perform the following optimizations for each task:

1. COMPUTE PRIORITY SCORE:
   - Calculate a dynamic priority score (integer from 1 to 100) for every incomplete task.
   - Tasks due sooner relative to ${localNow} must get higher priority scores. Overdue is highest priority (90-100).
   - "done" tasks must receive a very low priority score (1-10).
   - Tasks connected to Goals should receive a moderate priority score boost.
   - Provide a concise, clear one-sentence "priority_reason" explaining exactly why the task received this rank (e.g. "moved up — deadline in 18 hours, 2 hours of work remaining").

2. ESTIMATE EFFORT:
   - If "estimated_effort" is currently 0, estimate the realistic effort in minutes based on its title and description.
   - If "estimated_effort" is already > 0, preserve its value.

3. DETECT OVERDUE:
   - If the task is completed ("done"), keep it as "done".
   - If the task's deadline has fully passed (is on or before ${localNow}) and is not "done", set status to "overdue".
   - Scheduled start/end times passing have NO impact on overdue classification.
   - Otherwise, preserve its current status.

4. ALLOCATE CALENDAR SLOTS (SCHEDULING):
   - For all incomplete tasks (status is not "done"), find an optimal open (non-conflicting) slot in the user's calendar this week.
   - A valid slot must start after ${localNow} and end before the end of the current week (7 days from now).
   - IMPORTANT: Always prefer scheduling the slot as EARLY as possible (e.g., today) rather than later in the week, as long as it does not conflict with busy blocks.
   - The slot must be during daytime hours (between 08:00 and 20:00 local time).
   - The slot duration must equal the task's "estimated_effort" (in minutes).
   - The slot must NOT overlap with any of the user's calendar busy blocks listed in freeBusy.
   - The slot must NOT overlap with slots allocated to other tasks! Each task must have its own separate, sequential time block.
   - The slot should ideally start and end BEFORE the task's deadline in local time.
   - If an open slot before the deadline cannot be found, schedule it in the next available open slot after the deadline (but within the current week), and set "scheduling_warning" to a clear warning explaining this (e.g., "No open slot found before deadline. Scheduled at Wednesday 14:00 after deadline due to busy calendar.").
   - If absolutely no open slot can be found for a task in the entire week, set "scheduled_start" and "scheduled_end" to null, and set "scheduling_warning" to "No suitable open slot of X minutes found on your calendar before the end of the week."
   - Provide a concise "scheduling_reason" explaining the slot placement decision (e.g. "Scheduled Tuesday 2 PM, first open non-conflicting slot before its Wednesday deadline").

Format your output STRICTLY as a JSON object containing a "tasks" list matching the required schema.
`;

    const response = await generateContentWithRetry(aiClient, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "The unique task ID" },
                  priority_score: { type: Type.INTEGER, description: "Calculated priority score from 1 to 100" },
                  priority_reason: { type: Type.STRING, description: "One-sentence reason for priority rank" },
                  estimated_effort: { type: Type.INTEGER, description: "Estimated effort in minutes" },
                  status: { type: Type.STRING, description: "Updated status: not_started, in_progress, done, overdue" },
                  scheduled_start: { type: Type.STRING, description: "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00') of scheduled start time, or null if none found" },
                  scheduled_end: { type: Type.STRING, description: "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00') of scheduled end time, or null if none found" },
                  scheduling_reason: { type: Type.STRING, description: "One-sentence reason for chosen slot" },
                  scheduling_warning: { type: Type.STRING, description: "Warning if no slot is found before deadline, empty if okay" }
                },
                required: ["id", "priority_score", "priority_reason", "estimated_effort", "status"]
              }
            }
          },
          required: ["tasks"]
        }
      },
    });

    const text = response.text || "{\"tasks\":[]}";
    const parsed = JSON.parse(text);
    const returnedTasks = parsed.tasks || [];
    
    const processedMap = new Map(returnedTasks.map((t: any) => {
      if (t.scheduled_start) t.scheduled_start = convertLocalToUtc(t.scheduled_start, timeZone);
      if (t.scheduled_end) t.scheduled_end = convertLocalToUtc(t.scheduled_end, timeZone);
      return [t.id, t];
    }));

    const finalTasks = tasks.map((originalTask: any) => {
      // If it's a protected task, keep it exactly as is
      const isProt = protectedTasks.some((pt: any) => pt.id === originalTask.id);
      if (isProt) {
        return originalTask;
      }
      // If it was processed by Gemini, return the Gemini output merged with original attributes
      const geminiTask = processedMap.get(originalTask.id);
      if (geminiTask) {
        return {
          ...originalTask,
          ...(geminiTask as any)
        };
      }
      // Fallback: return original if not found
      return originalTask;
    });

    return res.json({ tasks: finalTasks });
  } catch (error) {
    console.error("Error running AI prioritization and scheduling, falling back:", error);
    return res.json({ tasks: doFallbackScoring() });
  }
});

// API: Extract structured tasks from goals or free-form notes
app.post("/api/extract-tasks", async (req, res) => {
  const { text = "", type = "notes", currentTime, timeZone = "UTC" } = req.body;
  if (!text || !text.trim()) {
    return res.json({ tasks: [] });
  }

  const now = new Date(currentTime || new Date().toISOString());

  if (!aiClient) {
    console.log("GEMINI_API_KEY not configured, using offline fallback parsing for extract-tasks");
    // Direct deterministic fallback
    const lines = text.split("\n")
      .map((l: any) => l.trim())
      .filter((l: any) => l.length > 5 && !l.startsWith("#"));

    const count = type === "goal" ? Math.min(Math.max(lines.length, 4), 6) : Math.min(lines.length, 6);
    const fallbackTasks = [];
    
    for (let i = 0; i < (count || 4); i++) {
      const title = lines[i] ? lines[i].replace(/^[-*\s\d.]+(\s*)/, "").substring(0, 60) : `Step ${i + 1} for ${text.substring(0, 30)}`;
      const deadline = new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000).toISOString();
      fallbackTasks.push({
        title,
        description: `Auto-generated checklist item ${i + 1} extracted from input context.`,
        estimated_effort: 45,
        deadline
      });
    }
    return res.json({ tasks: fallbackTasks });
  }

  try {
    const localNow = format(toZonedTime(now, timeZone), "yyyy-MM-dd'T'HH:mm:00");
    let prompt = "";
    if (type === "goal") {
      prompt = `
You are an expert project manager and decomposition assistant.
Your task is to take the high-level goal and break it down into 4 to 6 concrete, sequential, and highly actionable sub-tasks.

HIGH-LEVEL GOAL: "${text}"

TIME GROUNDING REFERENCE:
- The user is in timezone ${timeZone}.
- The current date and time in the user's local timezone is exactly: ${localNow}
- All deadlines for sub-tasks MUST be strictly in the future relative to today's date in local time.
- Suggest realistic deadlines staggered sequentially over the coming days or weeks.
- Output deadlines as local time strings, matching the format 'YYYY-MM-DDTHH:mm:00'. Do NOT append 'Z' or offset.

For each sub-task, provide:
1. "title": A clear, action-oriented title.
2. "description": A short explanation of what is required.
3. "estimated_effort": A realistic estimated effort in minutes (between 30 and 180).
4. "deadline": A suggested deadline (Local date-time string WITHOUT 'Z').
`;
    } else {
      prompt = `
You are an advanced text analysis and task extraction assistant.
Your task is to analyze the following free-form written note, identify all actionable items, and convert each item into a structured task.

NOTE CONTENT:
"""
${text}
"""

TIME GROUNDING REFERENCE:
- The user is in timezone ${timeZone}.
- The current date and time in the user's local timezone is exactly: ${localNow}
- For each task, infer a realistic deadline:
  * If a deadline, day, or timeframe is mentioned in the text (e.g. "by tomorrow", "this Friday", "in 3 days", "due June 28"), calculate the precise date and time in local time.
  * If no deadline is mentioned, suggest a realistic deadline in the next 1 to 4 days relative to today.
- Output deadlines as local time strings, matching the format 'YYYY-MM-DDTHH:mm:00'. Do NOT append 'Z' or offset.

For each extracted task, provide:
1. "title": A clear, action-oriented title.
2. "description": Context extracted from the note about this action.
3. "estimated_effort": Estimated duration in minutes based on the action (between 15 and 240).
4. "deadline": The calculated/inferred deadline (Local date-time string WITHOUT 'Z').
`;
    }

    const response = await generateContentWithRetry(aiClient, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Clear, action-oriented task title" },
                  description: { type: Type.STRING, description: "Detailed description of what needs to be done" },
                  estimated_effort: { type: Type.INTEGER, description: "Estimated effort in minutes" },
                  deadline: { type: Type.STRING, description: "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00')" }
                },
                required: ["title", "description", "estimated_effort", "deadline"]
              }
            }
          },
          required: ["tasks"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{\"tasks\":[]}");
    const returnedTasks = parsed.tasks || [];
    returnedTasks.forEach((t: any) => {
      if (t.deadline) t.deadline = convertLocalToUtc(t.deadline, timeZone);
    });
    return res.json({ tasks: returnedTasks });
  } catch (error) {
    console.error("Error extracting tasks with Gemini:", error);
    return res.status(500).json({ error: "Failed to extract tasks" });
  }
});

// API: Generate Email Draft
app.post("/api/generate-email", async (req, res) => {
  const { task } = req.body;
  if (!task) {
    return res.status(400).json({ error: "Task data is required" });
  }

  if (!aiClient) {
    // Fallback if no API key
    const deadlineText = new Date(task.deadline).toLocaleString();
    const bodyTemplate = `Hi Team,\n\nI am currently working on the following workspace task within Aura:\n\nTask: ${task.title}\nDescription: ${task.description || "No description provided."}\nDeadline: ${deadlineText}\nEstimated effort: ${task.estimated_effort} minutes\nPriority Score: ${task.priority_score}%\n\nPlease let me know if there are any roadblocks or adjustments required.\n\nBest regards,\nAura Workspace Compiler`;
    return res.json({ subject: `Aura Focus: Workspace Action Item - ${task.title}`, body: bodyTemplate });
  }

  try {
    const prompt = `
You are an expert executive assistant drafting a professional email on behalf of a user.
Based on the following task context, generate a professional and concise email draft.
The user is working on this task and needs to communicate progress, ask for review, or inform stakeholders.

Task Context:
- Title: ${task.title}
- Description: ${task.description || "No specific details provided."}
- Scheduled: ${task.scheduled_start ? new Date(task.scheduled_start).toLocaleString() : "Not scheduled yet"} to ${task.scheduled_end ? new Date(task.scheduled_end).toLocaleString() : "Not scheduled yet"}
- Deadline: ${new Date(task.deadline).toLocaleString()}
- Status: ${task.status}

Format your output STRICTLY as a JSON object with two fields:
- "subject": The subject line of the email (concise, clear).
- "body": The full body of the email in plain text. Sign off as the user (or leave a generic placeholder like [Your Name]).

Make it sound highly professional, proactive, and clear.
    `;

    const response = await generateContentWithRetry(aiClient, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING, description: "Email subject line" },
            body: { type: Type.STRING, description: "Full email body content" }
          },
          required: ["subject", "body"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return res.json({ subject: result.subject, body: result.body });
  } catch (error) {
    console.error("Error generating email draft:", error);
    // Fallback
    const deadlineText = new Date(task.deadline).toLocaleString();
    const bodyTemplate = `Hi Team,\n\nI am currently working on the following workspace task within Aura:\n\nTask: ${task.title}\nDescription: ${task.description || "No description provided."}\nDeadline: ${deadlineText}\nEstimated effort: ${task.estimated_effort} minutes\nPriority Score: ${task.priority_score}%\n\nPlease let me know if there are any roadblocks or adjustments required.\n\nBest regards,\nAura Workspace Compiler`;
    return res.json({ subject: `Aura Focus: Workspace Action Item - ${task.title}`, body: bodyTemplate });
  }
});

// API: Active chat interface
app.post("/api/chat", async (req, res) => {
  const { messages = [], activeTasks = [], activeGoals = [], currentTimeStr, timeZone } = req.body;
  const currentNow = currentTimeStr ? new Date(currentTimeStr) : new Date();
  const tz = timeZone || "UTC";

  const systemInstruction = `
You are Aura, an elite, minimalist AI productivity partner built directly into the Aura Workspace.
The current reference time is exactly: ${currentNow.toISOString()}.
Today is ${currentNow.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })}, ${currentNow.toLocaleDateString('en-US', { timeZone: tz })} in the user's timezone (${tz}).
- When producing any ISO-8601 deadline or scheduled time, first reason about the correct local date and time. Then express your answer strictly in LOCAL time format as 'YYYY-MM-DDTHH:mm:00' (DO NOT append 'Z' or offset). We will handle the conversion to UTC in code.

Style Guidelines:
- Express yourself with elegant, concise, clear, and reassuring vocabulary. Avoid excessive emoji usage (1 or 2 is fine for accentuation, keep them professional).
- Do not list internal path parameters, database structures, or technical variables. Keep your responses highly functional and user-centric.
- Help the user organize, break down tasks, draft perfect emails, schedule calendar events, and streamline their focus.

Current State of Workspace:
- Active Tasks: ${JSON.stringify(activeTasks.map((t: any) => `${t.title} (Status: ${t.status}, Due: ${t.deadline})`))}
- Active Goals: ${JSON.stringify(activeGoals.map((g: any) => g.title))}

Capabilities & Action Triggers:
You can direct the workspace to trigger physical actions on the user's behalf if they ask you to create/update/delete a task, update/schedule an item on their calendar, draft a Gmail, create/delete a goal, decompose a goal into subtasks, prioritize tasks, or create/extract notes.

To perform an action, you must specify it in your JSON response under the "action" key.

You MUST respond formatted in structured JSON matching this exact schema:
{
  "text": "Your elegant, conversational markdown response here explaining what you did.",
  "action": null | {
    "type": "create_task" | "update_task" | "delete_task" | "create_calendar_event" | "create_gmail_draft" | "create_goal" | "delete_goal" | "decompose_goal" | "prioritize_tasks" | "create_note" | "extract_note",
    "params": {
      // If "create_task":
      "title": "string",
      "description": "string",
      "deadline": "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00')",
      "estimated_effort": number (minutes),

      // OR if "update_task":
      "id": "string",
      "title": "string",
      "description": "string",
      "deadline": "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00')",
      "estimated_effort": number,
      
      // OR if "delete_task":
      "id": "string (the task id from Active Tasks)",
      
      // OR if "create_calendar_event":
      "summary": "string",
      "description": "string",
      "start": { "dateTime": "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00')" },
      "end": { "dateTime": "Local date-time string WITHOUT 'Z' (e.g. 'YYYY-MM-DDTHH:mm:00')" },
      
      // OR if "create_gmail_draft":
      "to": "string (recipient email)",
      "subject": "string",
      "bodyText": "string (the plain text body)",

      // OR if "create_goal" or "decompose_goal":
      "title": "string (the title of the goal)",
      
      // OR if "delete_goal":
      "id": "string (the goal id from Active Goals)",
      
      // OR if "create_note" or "extract_note":
      "content": "string (the body of the note)"
      
      // For "prioritize_tasks", params can be empty {}
    }
  }
}

Do not output any wrappers, markdown blocks, or commentary outside of the valid JSON object.
`;

  if (!aiClient) {
    return res.json({
      text: "Hello! I am Aura, your workspace compiler. It seems your GEMINI_API_KEY is not defined in the workspace secrets or panel yet, so I am running in local offline mode. How can I assist you with planning your tasks manually?",
      action: null
    });
  }

  try {
    // Map messages payload to the Gemini SDK expected types: { role: 'user' | 'model', parts: [{ text: '...' }] }
    // Wait, the new @google/genai SDK expects 'user' or 'model' roles
    const contents = messages.map((m: any) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const response = await generateContentWithRetry(aiClient, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text || "{}");

    if (parsed.action && parsed.action.params) {
      const p = parsed.action.params;
      if (parsed.action.type === "create_task" || parsed.action.type === "update_task") {
        if (p.deadline) p.deadline = convertLocalToUtc(p.deadline, tz);
      } else if (parsed.action.type === "create_calendar_event") {
        if (p.start && p.start.dateTime) p.start.dateTime = convertLocalToUtc(p.start.dateTime, tz);
        if (p.end && p.end.dateTime) p.end.dateTime = convertLocalToUtc(p.end.dateTime, tz);
      }
    }

    res.json(parsed);
  } catch (error: any) {
    console.error("Chat error:", error);
    res.json({
      text: "I experienced a minor workspace compilation disconnect. How can I assist you manually?",
      action: null
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
