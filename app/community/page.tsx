"use client";

import React, { useEffect, useMemo, useState } from "react";

const KEY_PREFIX = "mc:";
const DIARY_PREFIX = `${KEY_PREFIX}diaryDraft:`;

const COMMUNITY_INDEX_KEY = `${KEY_PREFIX}community:index`;
const COMMUNITY_ITEM_PREFIX = `${KEY_PREFIX}community:item:`;

// ✅ Contact / Messages (localStorage)
const CONTACT_INDEX_KEY = `${KEY_PREFIX}contact:index`;
const CONTACT_THREAD_PREFIX = `${KEY_PREFIX}contact:thread:`; // + threadId

const LOCALE = "en-US";

type CommunityItem = {
  id: string;
  type: "diary" | "memo";
  dateISO?: string; // for diary
  title: string;
  body: string;
  tags: string[];
  mood?: number | null;
  intensity?: number | null;
  visibility?: "public" | "private";
  createdAt?: string;
  updatedAt?: string;
};

// diary draft (loose typing to stay compatible with your current storage.ts)
type DiaryDraftLike = {
  date?: string;
  tags?: string[];
  text?: string;
  mood?: number;
  intensity?: number;
  updatedAt?: string;
  fromSessionId?: string;
  visibility?: "public" | "private";
};

// ✅ messages schema
type ContactMessage = {
  id: string;
  role: "me" | "them";
  text: string;
  createdAt: string;
};

type ContactThread = {
  threadId: string;
  itemId: string; // CommunityItem.id
  itemTitle: string;
  createdAt: string;
  updatedAt: string;
  messages: ContactMessage[];
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampText(s: string, n: number) {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
}

function formatPretty(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(LOCALE, { weekday: "short" });
  const md = dt.toLocaleDateString(LOCALE, { month: "2-digit", day: "2-digit" });
  return `${weekday} ${md}`;
}

function badgeStyle(active: boolean) {
  return {
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 900 as const,
    opacity: 0.95,
    whiteSpace: "nowrap" as const,
  };
}

function pillStyle() {
  return {
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  };
}

function loadPublicDiariesFromLocalStorage(): CommunityItem[] {
  const items: CommunityItem[] = [];

  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (!k.startsWith(DIARY_PREFIX)) continue;

    const dateISO = k.slice(DIARY_PREFIX.length);
    const raw = window.localStorage.getItem(k);
    const d = safeParse<DiaryDraftLike>(raw);
    if (!d) continue;

    const visibility = d.visibility === "public" ? "public" : "private";
    if (visibility !== "public") continue;

    const tags = Array.isArray(d.tags) ? d.tags.filter(Boolean) : [];
    const body = (d.text ?? "").trim();

    items.push({
      id: `diary:${dateISO}`,
      type: "diary",
      dateISO,
      title: `Diary • ${dateISO}`,
      body,
      tags,
      mood: typeof d.mood === "number" ? d.mood : null,
      intensity: typeof d.intensity === "number" ? d.intensity : null,
      visibility,
      updatedAt: d.updatedAt,
    });
  }

  items.sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || ""));
  return items;
}

function loadMemosFromLocalStorage(): CommunityItem[] {
  const idxRaw = window.localStorage.getItem(COMMUNITY_INDEX_KEY);
  const ids = safeParse<string[]>(idxRaw) ?? [];
  const out: CommunityItem[] = [];

  for (const id of ids) {
    const raw = window.localStorage.getItem(`${COMMUNITY_ITEM_PREFIX}${id}`);
    const item = safeParse<any>(raw);
    if (!item?.id || !item?.title) continue;

    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const body = (item.body ?? "").toString();

    out.push({
      id: `memo:${item.id}`,
      type: "memo",
      title: item.title,
      body,
      tags,
      createdAt: item.createdAt,
    });
  }

  out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return out;
}

function matchesQuery(it: CommunityItem, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;

  const hay = [it.title, it.body, it.dateISO ?? "", ...(it.tags ?? [])].join(" ").toLowerCase();
  return hay.includes(s);
}

// -------------------- Contact thread helpers --------------------
function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadContactIndex(): string[] {
  const raw = window.localStorage.getItem(CONTACT_INDEX_KEY);
  const ids = safeParse<string[]>(raw) ?? [];
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function saveContactIndex(ids: string[]) {
  window.localStorage.setItem(CONTACT_INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function loadThread(threadId: string): ContactThread | null {
  const raw = window.localStorage.getItem(`${CONTACT_THREAD_PREFIX}${threadId}`);
  return safeParse<ContactThread>(raw);
}

function saveThread(t: ContactThread) {
  window.localStorage.setItem(`${CONTACT_THREAD_PREFIX}${t.threadId}`, JSON.stringify(t));
  const idx = loadContactIndex();
  if (!idx.includes(t.threadId)) {
    idx.unshift(t.threadId);
    saveContactIndex(idx);
  }
}

function findThreadByItemId(itemId: string): ContactThread | null {
  const ids = loadContactIndex();
  for (const tid of ids) {
    const t = loadThread(tid);
    if (t?.itemId === itemId) return t;
  }
  return null;
}

function ensureThreadForItem(item: CommunityItem): ContactThread {
  const existed = findThreadByItemId(item.id);
  if (existed) return existed;

  const t: ContactThread = {
    threadId: makeId("thread"),
    itemId: item.id,
    itemTitle: item.title,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    messages: [],
  };
  saveThread(t);
  return t;
}

function addMessageToThread(threadId: string, msg: Omit<ContactMessage, "id" | "createdAt">) {
  const t = loadThread(threadId);
  if (!t) return;

  const m: ContactMessage = {
    id: makeId("msg"),
    createdAt: nowISO(),
    ...msg,
  };

  const next: ContactThread = {
    ...t,
    updatedAt: nowISO(),
    messages: [...(t.messages ?? []), m],
  };

  saveThread(next);
  return next;
}

// -------------------- UI pieces --------------------
function inboxFabStyle() {
  return {
    position: "fixed" as const,
    right: 14,
    bottom: 86, // ✅ above tab bar
    width: 54,
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  };
}

function drawerShellStyle() {
  return {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 70,
    display: "flex",
    justifyContent: "flex-end",
  };
}

function drawerPanelStyle() {
  return {
    width: "min(420px, 92vw)",
    height: "100%",
    background: "rgba(16,16,16,0.98)",
    borderLeft: "1px solid rgba(255,255,255,0.12)",
    padding: 14,
    overflow: "auto" as const,
  };
}

// ✅ Chat (avatars + bubbles)
function avatarStyle(role: "me" | "them") {
  return {
    width: 34,
    height: 34,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.14)",
    background: role === "me" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
    fontSize: 12,
    fontWeight: 900 as const,
    color: "rgba(255,255,255,0.92)",
    flex: "0 0 auto",
  };
}

function bubbleStyle(role: "me" | "them") {
  return {
    maxWidth: "min(520px, 78%)",
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: role === "me" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
    position: "relative" as const,
    whiteSpace: "pre-wrap" as const,
    lineHeight: 1.45,
  };
}

function bubbleTailStyle(role: "me" | "them") {
  return {
    position: "absolute" as const,
    top: 14,
    width: 10,
    height: 10,
    transform: "rotate(45deg)",
    background: role === "me" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
    borderLeft: "1px solid rgba(255,255,255,0.12)",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    ...(role === "me" ? { right: -5 } : { left: -5 }),
  };
}

function HeaderAvatars() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ ...avatarStyle("them"), transform: "translateX(8px)" }}>T</div>
      <div style={{ ...avatarStyle("me"), boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>Y</div>
    </div>
  );
}

export default function CommunityPage() {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [allItems, setAllItems] = useState<CommunityItem[]>([]);
  const [active, setActive] = useState<CommunityItem | null>(null);

  // ✅ inbox + contact modal
  const [inboxOpen, setInboxOpen] = useState(false);
  const [threads, setThreads] = useState<ContactThread[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [contactText, setContactText] = useState("");

  useEffect(() => setMounted(true), []);

  // Load community data
  useEffect(() => {
    if (!mounted) return;
    try {
      const diaries = loadPublicDiariesFromLocalStorage();
      const memos = loadMemosFromLocalStorage();

      const combined = [...memos, ...diaries].sort((a, b) => {
        const aKey = a.type === "diary" ? (a.dateISO || "") : (a.createdAt || "");
        const bKey = b.type === "diary" ? (b.dateISO || "") : (b.createdAt || "");
        return bKey.localeCompare(aKey);
      });

      setAllItems(combined);
    } catch {
      setAllItems([]);
    }
  }, [mounted]);

  function refreshThreads() {
    try {
      const ids = loadContactIndex();
      const list: ContactThread[] = [];
      for (const tid of ids) {
        const t = loadThread(tid);
        if (t?.threadId) list.push(t);
      }
      list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      setThreads(list);
    } catch {
      setThreads([]);
    }
  }

  // Initial load threads
  useEffect(() => {
    if (!mounted) return;
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // refresh when opening inbox
  useEffect(() => {
    if (!mounted) return;
    if (inboxOpen) refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, inboxOpen]);

  const filtered = useMemo(() => {
    return allItems.filter((it) => matchesQuery(it, query));
  }, [allItems, query]);

  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return loadThread(activeThreadId);
  }, [activeThreadId, contactOpen]); // reopen -> reload

  function openContactForItem(item: CommunityItem) {
    const t = ensureThreadForItem(item);
    setActiveThreadId(t.threadId);
    setContactOpen(true);
    setInboxOpen(false);
    setContactText("");
    refreshThreads();
  }

  function openContactByThread(t: ContactThread) {
    setActiveThreadId(t.threadId);
    setContactOpen(true);
    setInboxOpen(false);
    setContactText("");
    refreshThreads();
  }

  function sendContactMessage() {
    if (!activeThreadId) return;
    const text = (contactText ?? "").trim();
    if (!text) return;

    const updated = addMessageToThread(activeThreadId, { role: "me", text });
    setContactText("");
    refreshThreads();
    if (updated?.threadId) setActiveThreadId(updated.threadId);
  }

  return (
    <main style={{ padding: 16, paddingBottom: 90 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Community</h1>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Public diaries & memos</div>
      </div>

      {/* Search bar */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.75 }}>Search</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by tags, date, title, or text…"
          style={{
            marginTop: 8,
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            outline: "none",
            fontSize: 13,
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Showing <b>{filtered.length}</b> / {allItems.length}
        </div>
      </div>

      {/* Feed */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {!mounted ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              opacity: 0.8,
              fontSize: 13,
            }}
          >
            No results. Try a different keyword or add more public diaries/memos.
          </div>
        ) : (
          filtered.map((it) => {
            const isDiary = it.type === "diary";
            const subtitle =
              isDiary && it.dateISO
                ? `${formatPretty(it.dateISO)} (${it.dateISO})`
                : it.createdAt
                ? new Date(it.createdAt).toLocaleDateString(LOCALE)
                : "";

            return (
              <div
                key={it.id}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setActive(it)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "block",
                      flex: 1,
                      minWidth: 220,
                    }}
                    title="Open"
                  >
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{it.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{subtitle}</div>
                  </button>

                  {/* ✅ Contact button */}
                  <button
                    onClick={() => openContactForItem(it)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                    title="Contact"
                  >
                    Contact
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                  <span style={badgeStyle(true)}>{it.type.toUpperCase()}</span>

                  {isDiary ? (
                    <>
                      <span style={badgeStyle(false)}>
                        Mood: <b>{typeof it.mood === "number" ? it.mood : "—"}</b>
                      </span>
                      <span style={badgeStyle(false)}>
                        Int: <b>{typeof it.intensity === "number" ? it.intensity : "—"}</b>
                      </span>
                      <span style={badgeStyle(false)}>{it.visibility ?? "public"}</span>
                    </>
                  ) : (
                    <span style={badgeStyle(false)}>MEMO</span>
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                  {clampText(it.body, 220) || <span style={{ opacity: 0.65 }}>—</span>}
                </div>

                {it.tags?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {it.tags.slice(0, 8).map((t) => (
                      <span key={t} style={pillStyle()}>
                        {t}
                      </span>
                    ))}
                    {it.tags.length > 8 ? <span style={{ fontSize: 12, opacity: 0.7 }}>+{it.tags.length - 8}</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* ✅ Inbox dialogue FAB (replaces triangle) */}
      <button onClick={() => setInboxOpen(true)} style={inboxFabStyle()} title="Messages" aria-label="Open messages">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 18l-3 3v-4a8 8 0 1 1 3 1z"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M8 10h8M8 13h6"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* ✅ Inbox drawer */}
      {inboxOpen ? (
        <div style={drawerShellStyle()} onClick={() => setInboxOpen(false)}>
          <div style={drawerPanelStyle()} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Inbox</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>Messages</div>
              </div>
              <button
                onClick={() => setInboxOpen(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              {threads.length ? `${threads.length} thread(s)` : "No threads yet. Tap Contact on any post to start."}
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {threads.map((t) => {
                const last = (t.messages ?? []).slice(-1)[0];
                const preview = last ? `${last.role === "me" ? "You: " : "Them: "}${last.text}` : "(No messages yet)";
                return (
                  <button
                    key={t.threadId}
                    onClick={() => openContactByThread(t)}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      cursor: "pointer",
                    }}
                    title="Open thread"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>{t.itemTitle || "Untitled"}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{t.updatedAt ? new Date(t.updatedAt).toLocaleString(LOCALE) : ""}</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>{clampText(preview, 120)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Detail modal (post content) */}
      {active ? (
        <div
          onClick={() => setActive(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            padding: 12,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 780,
              maxHeight: "85vh",
              overflow: "auto",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(20,20,20,0.96)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{active.title}</div>
              <button
                onClick={() => setActive(null)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={badgeStyle(true)}>{active.type.toUpperCase()}</span>

              {active.type === "diary" ? (
                <>
                  <span style={badgeStyle(false)}>
                    Date: <b>{active.dateISO}</b>
                  </span>
                  <span style={badgeStyle(false)}>
                    Mood: <b>{typeof active.mood === "number" ? active.mood : "—"}</b>
                  </span>
                  <span style={badgeStyle(false)}>
                    Intensity: <b>{typeof active.intensity === "number" ? active.intensity : "—"}</b>
                  </span>
                  <span style={badgeStyle(false)}>{active.visibility ?? "public"}</span>
                </>
              ) : active.createdAt ? (
                <span style={badgeStyle(false)}>{new Date(active.createdAt).toLocaleString(LOCALE)}</span>
              ) : null}
            </div>

            {active.tags?.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {active.tags.map((t) => (
                  <span key={t} style={pillStyle()}>
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 12, fontSize: 14, opacity: 0.92, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {active.body?.trim() ? active.body.trim() : <span style={{ opacity: 0.65 }}>—</span>}
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ Contact modal (thread chat) */}
      {contactOpen && activeThreadId ? (
        <div
          onClick={() => setContactOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            padding: 12,
            zIndex: 80,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 780,
              maxHeight: "85vh",
              overflow: "auto",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(20,20,20,0.98)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <HeaderAvatars />
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Contact</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{activeThread?.itemTitle || "Message thread"}</div>
                </div>
              </div>

              <button
                onClick={() => setContactOpen(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                minHeight: 220,
              }}
            >
              {(activeThread?.messages ?? []).length === 0 ? (
                <div style={{ opacity: 0.75, fontSize: 13 }}>No messages yet. Say hi to start.</div>
              ) : (
                (activeThread?.messages ?? []).map((m) => {
                  const isMe = m.role === "me";
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        justifyContent: isMe ? "flex-end" : "flex-start",
                        marginBottom: 12,
                      }}
                    >
                      {!isMe ? <div style={avatarStyle("them")}>T</div> : null}

                      <div style={bubbleStyle(m.role)}>
                        <div style={bubbleTailStyle(m.role)} />
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {isMe ? "You" : "Them"} • {new Date(m.createdAt).toLocaleString(LOCALE)}
                        </div>
                        <div style={{ marginTop: 6 }}>{m.text}</div>
                      </div>

                      {isMe ? <div style={avatarStyle("me")}>Y</div> : null}
                    </div>
                  );
                })
              )}
            </div>

            {/* composer */}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={contactText}
                onChange={(e) => setContactText(e.target.value)}
                placeholder="Write a message…"
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  outline: "none",
                  fontSize: 13,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendContactMessage();
                }}
              />
              <button
                onClick={sendContactMessage}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.10)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Send
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
              Saved locally as thread: <b>{activeThreadId}</b>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}