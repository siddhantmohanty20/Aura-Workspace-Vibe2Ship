import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

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

// API: Prioritize Tasks & Estimate Effort
app.post("/api/prioritize", async (req, res) => {
  const { tasks = [], goals = [] } = req.body;

  if (tasks.length === 0) {
    return res.json({ tasks: [] });
  }

  // System local time supplied: 2026-06-23T00:14:41-07:00
  const currentTimeStr = "2026-06-23T00:14:41-07:00";
  const now = new Date(currentTimeStr);

  // Fallback / Basic priority scoring if Gemini is not configured
  const doFallbackScoring = () => {
    return tasks.map((t: any) => {
      // Calculate basic fields
      const deadlineDate = new Date(t.deadline);
      const isPast = deadlineDate.getTime() < now.getTime();
      let calculatedStatus = t.status;
      
      if (t.status !== "done") {
        if (isPast) {
          calculatedStatus = "overdue";
        } else if (t.status === "overdue") {
          calculatedStatus = "not_started";
        }
      }

      const hoursDiff = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      let calculatedPriority = 30; // default base

      if (t.status === "done") {
        calculatedPriority = 5;
      } else if (calculatedStatus === "overdue") {
        calculatedPriority = 95;
      } else if (hoursDiff <= 24) {
        calculatedPriority = 85; // extremely urgent
      } else if (hoursDiff <= 72) {
        calculatedPriority = 65; // urgent
      } else if (hoursDiff <= 168) {
        calculatedPriority = 45; // medium
      }

      // If estimated effort is 0 or missing, default to 30 mins
      const finalEffort = t.estimated_effort > 0 ? t.estimated_effort : 30;

      return {
        id: t.id,
        priority_score: calculatedPriority,
        estimated_effort: finalEffort,
        status: calculatedStatus,
      };
    });
  };

  if (!aiClient) {
    console.log("GEMINI_API_KEY not configured, using fallback calculation logic");
    return res.json({ tasks: doFallbackScoring() });
  }

  try {
    const prompt = `
You are a high-performance productivity assistant. The current workspace local datetime is: ${currentTimeStr}.
Analyze the following user tasks and goals, and perform three specific optimization steps:

1. Calculate a dynamic priority score (an integer from 1 to 100) for every task.
   - Tasks due sooner (proximity to ${currentTimeStr}) must get significantly higher priority scores. Overdue is highest priority (around 90-100).
   - Done tasks should receive an extremely low priority score (around 1-10).
   - Take into account if a task is linked to any Goal title. Give linked tasks a moderate priority weight boost.
   - Balance estimated effort: If a task has high effort and a tight deadline, prioritize it more, but avoid pushing quick 5-10 min tasks completely to the bottom.

2. Estimate effort (in minutes) for tasks where "estimated_effort" is currently 0 or blank. Use your knowledge to provide a realistic time estimate (e.g., "Draft welcome email" takes ~15 mins, "Prepare presentation" takes ~120 mins). If already provided (> 0), do NOT alter their value.

3. Evaluate task status:
   - If the task is completed ("done"), keep it as "done".
   - If the task has passed its deadline and is NOT "done", update status to "overdue".
   - Otherwise, preserve its current status ("not_started" or "in_progress").

Here is the input data:
Tasks:
${JSON.stringify(tasks.map((t: any) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  deadline: t.deadline,
  estimated_effort: t.estimated_effort,
  status: t.status,
  goal_id: t.goal_id
})), null, 2)}

Goals:
${JSON.stringify(goals, null, 2)}

Format your output STRICTLY as a valid JSON array of objects with the exact schema:
[{
  "id": "string (the task id)",
  "priority_score": number (integer 1-100),
  "estimated_effort": number (integer minutes),
  "status": "not_started" | "in_progress" | "done" | "overdue"
}]

Do not include any prose, explanations, or wrapper markers other than the pure JSON container.
`;

    const response = await generateContentWithRetry(aiClient, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "[]";
    const parsed = JSON.parse(text);
    return res.json({ tasks: parsed });
  } catch (error) {
    console.error("Error running AI prioritization, falling back:", error);
    return res.json({ tasks: doFallbackScoring() });
  }
});

// API: Active chat interface
app.post("/api/chat", async (req, res) => {
  const { messages = [], activeTasks = [], activeGoals = [] } = req.body;

  const systemInstruction = `
You are Aura, an elite, minimalist AI productivity partner built directly into the Aura Workspace.
The current local time is: 2026-06-23T00:14:41-07:00.

Style Guidelines:
- Express yourself with elegant, concise, clear, and reassuring vocabulary. Avoid excessive emoji usage (1 or 2 is fine for accentuation, keep them professional).
- Do not list internal path parameters, database structures, or technical variables. Keep your responses highly functional and user-centric.
- Help the user organize, break down tasks, draft perfect emails, schedule calendar events, and streamline their focus.

Current State of Workspace:
- Active Tasks: ${JSON.stringify(activeTasks.map((t: any) => `${t.title} (Status: ${t.status}, Due: ${t.deadline})`))}
- Active Goals: ${JSON.stringify(activeGoals.map((g: any) => g.title))}

Capabilities & Action Triggers:
You can direct the workspace to trigger physical actions on the user's behalf if they ask you to create a task, update/schedule an item on their calendar, or draft a Gmail.

To perform an action, you must specify it in your JSON response under the "action" key.

You MUST respond formatted in structured JSON matching this exact schema:
{
  "text": "Your elegant, conversational markdown response here explaining what you did.",
  "action": null | {
    "type": "create_task" | "create_calendar_event" | "create_gmail_draft",
    "params": {
      // If "create_task":
      "title": "string",
      "description": "string",
      "deadline": "ISO-8601 string (e.g. 2026-06-24T09:00:00.000Z)",
      "estimated_effort": number (minutes)
      
      // OR if "create_calendar_event":
      "summary": "string",
      "description": "string",
      "start": { "dateTime": "ISO-8601 string (e.g. 2026-06-23T15:00:00.000Z)" },
      "end": { "dateTime": "ISO-8601 string (e.g. 2026-06-23T16:00:00.000Z)" }
      
      // OR if "create_gmail_draft":
      "to": "string (recipient email)",
      "subject": "string",
      "bodyText": "string (the plain text body)"
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
