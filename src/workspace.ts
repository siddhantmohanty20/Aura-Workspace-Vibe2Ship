import { getAccessToken } from "./firebase";

// Google Calendar Event Schema
export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
}

/**
 * Fetch calendar events from primary calendar
 */
export async function fetchCalendarEvents(timeMinISOString: string): Promise<any[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Access Token found. Please re-authenticate.");
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    timeMinISOString
  )}&singleEvents=true&orderBy=startTime&maxResults=100`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar Fetch error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Create a new event on user's primary calendar
 */
export async function createCalendarEvent(event: CalendarEvent): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Access Token found. Please re-authenticate.");
  }

  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar Event Creation error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a draft in user's Gmail box
 */
export async function createGmailDraft(
  to: string,
  subject: string,
  bodyText: string
): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Access Token found. Please re-authenticate.");
  }

  const url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

  // Build basic raw mime email string
  const rawEmailMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
  ].join("\r\n");

  // Base64url encode with support for UTF-8
  const base64UrlSafe = btoa(unescape(encodeURIComponent(rawEmailMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        raw: base64UrlSafe,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gmail draft error response:", errText);
    throw new Error(`Gmail Draft Creation error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Update an existing event on user's primary calendar
 */
export async function updateCalendarEvent(eventId: string, event: CalendarEvent): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Access Token found. Please re-authenticate.");
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar Event Update error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete an event from user's primary calendar
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Access Token found. Please re-authenticate.");
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Google Calendar Event Deletion error: ${response.statusText}`);
  }
}

/**
 * Query free/busy times for the primary calendar
 */
export async function queryFreeBusy(timeMinISOString: string, timeMaxISOString: string): Promise<any[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Access Token found. Please re-authenticate.");
  }

  const url = "https://www.googleapis.com/calendar/v3/freeBusy";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinISOString,
      timeMax: timeMaxISOString,
      items: [{ id: "primary" }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar Free/busy query error: ${response.statusText}`);
  }

  const data = await response.json();
  const busySlots = data.calendars?.primary?.busy || [];
  return busySlots;
}

/**
 * Fetch user's free/busy time blocks for the current week.
 * Assumes a week starting Sunday and ending Saturday.
 */
export async function fetchFreeBusyCurrentWeek(): Promise<any[]> {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay(); // 0 is Sunday, 1 is Monday ...
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return queryFreeBusy(startOfWeek.toISOString(), endOfWeek.toISOString());
}


