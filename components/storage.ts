export type DiaryDraft = {
  date: string;            // YYYY-MM-DD (sleep-day)
  mood?: number;           // 1-5
  intensity?: number;      // 1-5
  tags: string[];
  text: string;            // diary draft text
  fromSessionId?: string;
  updatedAt: string;       // ISO
};

export type WorkspaceState = {
  date: string; // YYYY-MM-DD (sleep-day)
  messages: { role: "user" | "assistant"; content: string }[];
  cards: any[]; // keep flexible for now
  updatedAt: string; // ISO
};

const KEY_PREFIX = "mc:"; // menopause-companion

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * ✅ Sleep-Day 逻辑：换日阈值 cutoffHour（默认 6）
 * - 00:00 ~ 05:59 归到“昨天”
 * - 06:00 ~ 23:59 归到“今天”
 */
export function sleepDayISODate(cutoffHour: number = 6, now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < cutoffHour) {
    d.setDate(d.getDate() - 1);
  }
  return toISODate(d);
}

// 兼容保留（如果你其他地方还在用）
export function todayISODate(): string {
  return toISODate(new Date());
}

/* ---------------- Diary Draft ---------------- */

function diaryKeyFor(date: string) {
  return `${KEY_PREFIX}diaryDraft:${date}`;
}

export function loadDiaryDraft(date: string): DiaryDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(diaryKeyFor(date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DiaryDraft;
  } catch {
    return null;
  }
}

export function saveDiaryDraft(draft: DiaryDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(diaryKeyFor(draft.date), JSON.stringify(draft));
}

export function mergeDiaryDraft(date: string, patch: Partial<DiaryDraft>): DiaryDraft {
  const existing = loadDiaryDraft(date);
  const merged: DiaryDraft = {
    date,
    tags: [],
    text: "",
    updatedAt: new Date().toISOString(),
    ...(existing ?? {}),
    ...(patch ?? {}),
  };

  merged.tags = Array.from(new Set((merged.tags ?? []).filter(Boolean)));
  merged.updatedAt = new Date().toISOString();
  saveDiaryDraft(merged);
  return merged;
}

/**
 * ✅ 追加一段文本到当天 draft（不会覆盖原文）
 */
export function appendDiaryDraftText(date: string, extra: string): DiaryDraft {
  const clean = (extra ?? "").trim();
  if (!clean) return mergeDiaryDraft(date, {});
  const existing = loadDiaryDraft(date);
  const base = (existing?.text ?? "").trim();
  const nextText = base ? `${base}\n\n${clean}` : clean;
  return mergeDiaryDraft(date, { text: nextText });
}

/* ---------------- Workspace (Chat) ---------------- */

function workspaceKeyFor(date: string) {
  return `${KEY_PREFIX}workspace:${date}`;
}

export function loadWorkspace(date: string): WorkspaceState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(workspaceKeyFor(date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return null;
  }
}

export function saveWorkspace(ws: WorkspaceState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workspaceKeyFor(ws.date), JSON.stringify(ws));
}

export function mergeWorkspace(date: string, patch: Partial<WorkspaceState>): WorkspaceState {
  const existing = loadWorkspace(date);
  const merged: WorkspaceState = {
    date,
    messages: [],
    cards: [],
    updatedAt: new Date().toISOString(),
    ...(existing ?? {}),
    ...(patch ?? {}),
  };
  merged.updatedAt = new Date().toISOString();
  saveWorkspace(merged);
  return merged;
}

export function clearWorkspace(date: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(workspaceKeyFor(date));
}