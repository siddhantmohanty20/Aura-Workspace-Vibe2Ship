export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  deadline: string; // ISO Datetime string
  estimated_effort: number; // in minutes
  status: 'not_started' | 'in_progress' | 'done' | 'overdue';
  priority_score: number; // calculated by AI
  created_at: string;
  completed_at: string | null;
  goal_id: string | null;
  calendarEventId?: string | null;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}
