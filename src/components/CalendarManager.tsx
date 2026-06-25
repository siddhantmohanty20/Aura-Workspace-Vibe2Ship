import React, { useState, useEffect } from "react";
import { fetchCalendarEvents, CalendarEvent, createCalendarEvent } from "../workspace";
import { Calendar, RefreshCw, Plus, Clock, Users, ShieldAlert, Loader2, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CalendarManagerProps {
  isAuthenticated: boolean;
  onAuthenticate: () => void;
}

export function CalendarManager({ isAuthenticated, onAuthenticate }: CalendarManagerProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError("");
    try {
      // Fetch events starting from today
      const nowISO = new Date().toISOString();
      const items = await fetchCalendarEvents(nowISO);
      setEvents(items);
    } catch (err: any) {
      console.error(err);
      setError("Failed to sync Google Calendar. Your session may have expired.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadEvents();
    } else {
      setEvents([]);
    }
  }, [isAuthenticated]);

  const formatTime = (dateTimeStr: string) => {
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatDate = (dateTimeStr: string) => {
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="rounded-[28px] border border-[#E8E4DF] dark:border-zinc-800/60 dark:bg-zinc-900/40 bg-white/70 p-6 space-y-4 shadow-sm flex flex-col justify-stretch">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8E4DF] dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#D97757]" />
          <h3 className="text-sm font-bold font-display text-[#2D2C2A] dark:text-zinc-100">
            Google Calendar Sync
          </h3>
        </div>

        {isAuthenticated && (
          <button
            onClick={loadEvents}
            disabled={loading}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-[#D97757] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
            title="Refresh Core Events"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#D97757]" : ""}`} />
          </button>
        )}
      </div>

      {/* Body Content */}
      {!isAuthenticated ? (
        <div className="text-center py-6 px-4 space-y-3">
          <ShieldAlert className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[240px] mx-auto leading-relaxed">
            Calendar synchronization requires secure verification via Google Workspace APIs.
          </p>
          <button
            onClick={onAuthenticate}
            className="px-5 py-2.5 bg-[#D97757] hover:bg-[#D97757]/90 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all w-full"
          >
            Authenticate Calendar
          </button>
        </div>
      ) : loading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#D97757]" />
          <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold">Syncing Primary Feed</span>
        </div>
      ) : error ? (
        <div className="text-center py-6 px-4 space-y-3">
          <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-xs text-[#8C4F4F] dark:text-rose-400 leading-relaxed font-bold">
            {error}
          </p>
          <button
            onClick={onAuthenticate}
            className="px-4 py-2 bg-[#D97757] text-white rounded-xl text-xs font-bold hover:bg-[#D97757]/90 active:scale-95 transition-all w-full"
          >
            Reconnect Account
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            No upcoming events today.
          </p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
            Tasks you schedule in Aura will display here.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {events.map((event) => {
            const startTimeStr = event.start?.dateTime || event.start?.date || "";
            const endTimeStr = event.end?.dateTime || event.end?.date || "";

            return (
              <div
                key={event.id}
                className="p-3 rounded-2xl bg-white dark:bg-zinc-950 border border-[#E8E4DF]/50 dark:border-zinc-850/55 hover:border-[#D4DBCB] dark:hover:border-zinc-750 hover:shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all text-xs flex flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-[#2D2C2A] dark:text-zinc-200 truncate">
                    {event.summary}
                  </span>
                  <span className="text-[10px] bg-[#D4DBCB]/30 dark:bg-zinc-900 border border-transparent text-[#5A644D] dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold shrink-0 font-mono">
                    {formatDate(startTimeStr)}
                  </span>
                </div>

                {event.description && (
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 line-clamp-1">
                    {event.description}
                  </p>
                )}

                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5 font-mono">
                  <Clock className="w-3 h-3 text-zinc-400 mr-0.5 shrink-0" />
                  <span>
                    {formatTime(startTimeStr)} - {formatTime(endTimeStr)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
