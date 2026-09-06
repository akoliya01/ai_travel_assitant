import { randomUUID } from "crypto";
import { config } from "../config";

type SessionState = {
  history: string[];
  preferences: {
    budget?: string;
    travelType?: string;
  };
  lastAccessedAt: number;
};

const sessionMap = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState {
  const existing = sessionMap.get(sessionId);
  const now = Date.now();
  if (existing && now - existing.lastAccessedAt < config.sessionTtlMinutes * 60_000) {
    existing.lastAccessedAt = now;
    return existing;
  }
  const created: SessionState = { history: [], preferences: {}, lastAccessedAt: now };
  sessionMap.set(sessionId, created);
  return created;
}

export function createSessionId(): string {
  return randomUUID();
}

export function updateSessionHistory(sessionId: string, userMessage: string, assistantMessage: string): void {
  const session = getSession(sessionId);
  session.history.push(`User: ${userMessage}`);
  session.history.push(`Assistant: ${assistantMessage}`);
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }
  session.lastAccessedAt = Date.now();
}

export function updatePreferences(sessionId: string, message: string): void {
  const session = getSession(sessionId);
  if (/budget/i.test(message)) {
    session.preferences.budget = message;
  }
  if (/family|children|kids/i.test(message)) {
    session.preferences.travelType = "family";
  }
  session.lastAccessedAt = Date.now();
}
