"use client";
import "./chat.css";

import React, { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  appendDiaryDraftText,
  clearWorkspace,
  loadWorkspace,
  mergeDiaryDraft,
  mergeWorkspace,
  sleepDayISODate,
} from "../../components/storage";
import { Toast, type ToastItem } from "../../components/Toast";

type Message = { role: "user" | "assistant"; content: string };

type UICard =
  | { type: "trend_delta"; window: "30d"; delta: number; text: string }
  | { type: "exercise"; id: string; title: string; duration_min: number }
  | { type: "tip"; id: string; title: string; text: string };

type CompanionStructured = {
  assistant_text: string;
  tags: string[];
  mood: number; // 1-5
  intensity: number; // 1-5
  diary_text: string;
  cards: UICard[];
};

/** (保留：本地 summary fallback，可删) */
function generateDiarySummaryFromMessages(messages: Message[]) {
  const userLines = messages
    .filter((m) => m.role === "user")
    .map((m) => (m.content ?? "").trim())
    .filter(Boolean);

  const joined = userLines.join(" ").toLowerCase();

  const tags: string[] = [];
  if (joined.includes("sleep") || joined.includes("insomnia")) tags.push("sleep_disruption");
  if (joined.includes("itch") || joined.includes("crawl")) tags.push("formication");
  if (joined.includes("hot") || joined.includes("sweat")) tags.push("hot_flash");
  if (joined.includes("joint") || joined.includes("ache")) tags.push("joint_ache");
  if (joined.includes("anx") || joined.includes("panic") || joined.includes("worry")) tags.push("anxiety");

  const bullets = userLines.slice(-5).map((t) => `- ${t.replace(/\s+/g, " ")}`);

  const summary =
    `Diary summary (from chat)\n` +
    `What happened:\n${bullets.length ? bullets.join("\n") : "- (No user notes yet)"}\n\n` +
    `What I tried / what helped:\n- (add later)\n\n` +
    `What I want to remember:\n- (add later)\n`;

  return { summary, tags };
}

function cardBox(): CSSProperties {
  return {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
  };
}
function miniButton(): CSSProperties {
  return {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    cursor: "pointer",
  };
}

function CardView({ card, date, toast }: { card: UICard; date: string; toast: (msg: string) => void }) {
  if (card.type === "trend_delta") {
    return (
      <div style={cardBox()}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>30-day comparison</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{Math.round(card.delta * 100)}% change</div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{card.text}</div>
      </div>
    );
  }

  if (card.type === "exercise") {
    return (
      <div style={cardBox()}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Instant relief</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{card.title}</div>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>{card.duration_min} min • low effort</div>

        <button
          style={miniButton()}
          onClick={() => {
            appendDiaryDraftText(date, `Tried exercise: ${card.title} (${card.duration_min} min). It helped me regulate a bit.`);
            toast("✅ Exercise logged to diary");
          }}
        >
          Start
        </button>
      </div>
    );
  }

  return (
    <div style={cardBox()}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>Tip</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{card.title}</div>
      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{card.text}</div>

      <button
        style={miniButton()}
        onClick={() => {
          appendDiaryDraftText(date, `Applied tip: ${card.title}. ${card.text}`);
          toast("✅ Tip added to diary");
        }}
      >
        Log this tip
      </button>
    </div>
  );
}

async function callStructuredFromAPI(date: string, nextMessages: Message[]) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "companion_chat",
      sleepDay: date,
      messages: nextMessages, // system 在后端加
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as CompanionStructured;
}

export default function ChatPage() {
  const date = useMemo(() => sleepDayISODate(6), []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [cards, setCards] = useState<UICard[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((message: string) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message }]);
  }, []);
  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  useEffect(() => {
    const ws = loadWorkspace(date);
    if (ws) {
      setMessages(ws.messages ?? []);
      setCards((ws.cards ?? []) as UICard[]);
    }
    setHydrated(true);
  }, [date]);

  useEffect(() => {
    if (!hydrated) return;
    mergeWorkspace(date, { messages, cards });
  }, [hydrated, date, messages, cards]);

  async function send() {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const data = await callStructuredFromAPI(date, nextMessages);

      // assistant message
      const assistantMessage: Message = { role: "assistant", content: (data.assistant_text ?? "").toString() };
      setMessages((prev) => [...prev, assistantMessage]);

      // cards
      setCards(Array.isArray(data.cards) ? data.cards : []);

      // diary draft
      mergeDiaryDraft(date, {
        tags: Array.isArray(data.tags) ? data.tags : [],
        mood: typeof data.mood === "number" ? data.mood : 3,
        intensity: typeof data.intensity === "number" ? data.intensity : 3,
        text: (data.diary_text ?? "").toString(),
        fromSessionId: "workspace",
      });

      pushToast("Draft updated ✅");
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ API error: ${e?.message || "unknown"}` }]);
      pushToast("API error ❌");
    } finally {
      setLoading(false);
    }
  }

  // ✅ NEW: Generate & Check Diary -> call API to polish diary from full chat, then go /diary
  async function generateAndGoDiary() {
    if (loading) return;

    if (messages.length === 0) {
      pushToast("No chat messages to summarize yet.");
      return;
    }

    setLoading(true);
    try {
      // 用完整 messages 再跑一次结构化（得到更完整的 polished diary）
      const data = await callStructuredFromAPI(date, messages);

      mergeDiaryDraft(date, {
        tags: Array.isArray(data.tags) ? data.tags : [],
        mood: typeof data.mood === "number" ? data.mood : 3,
        intensity: typeof data.intensity === "number" ? data.intensity : 3,
        text: (data.diary_text ?? "").toString(),
        fromSessionId: "workspace",
      });

      pushToast("✅ Diary polished from chat");
      window.location.href = "/diary";
    } catch (e: any) {
      pushToast("Diary polish failed ❌");
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ Diary polish error: ${e?.message || "unknown"}` }]);

      // （可选 fallback：本地 summary，想保留就取消注释）
      // const { summary, tags } = generateDiarySummaryFromMessages(messages);
      // appendDiaryDraftText(date, `\n\n---\n${summary}`);
      // if (tags.length > 0) mergeDiaryDraft(date, { tags });
      // pushToast("Fallback diary summary generated ✅");
      // window.location.href = "/diary";
    } finally {
      setLoading(false);
    }
  }

  function clearTodayChat() {
    clearWorkspace(date);
    setMessages([]);
    setCards([]);
    pushToast("Cleared workspace ✅");
  }

  return (
    <main style={{ padding: 16, paddingBottom: 90 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Companion Chat</h2>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Sleep-day: {date} (cutoff 06:00)</div>
      </div>

      <div className="chatGrid" style={{ marginTop: 12 }}>
        {/* Chat */}
        <div style={{ minHeight: 420 }}>
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              minHeight: 320,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            {messages.length === 0 ? (
              <div style={{ opacity: 0.75 }}>Try: “I can’t sleep and my skin feels itchy and I feel anxious”</div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 10,
                    padding: 12,
                    borderRadius: 14,
                    background: m.role === "assistant" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.14)",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{m.role === "assistant" ? "Companion" : "You"}</div>
                  <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              ))
            )}

            {loading ? <div style={{ opacity: 0.7, fontSize: 13 }}>Companion is typing…</div> : null}
          </div>

          {/* Input + actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message…"
              style={{
                flex: 1,
                minWidth: 220,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "..." : "Send"}
            </button>

            <button
              onClick={clearTodayChat}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                opacity: 0.9,
              }}
              title="Clear today workspace"
              disabled={loading}
            >
              Clear
            </button>
          </div>
        </div>

        {/* AI Panel */}
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Support Network (AI panel)</div>

          {cards.length === 0 ? (
            <div style={{ ...cardBox(), opacity: 0.75 }}>Send a message to see trend + relief cards here.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cards.map((c, idx) => (
                <CardView key={idx} card={c} date={date} toast={pushToast} />
              ))}

              {/* ✅ Combined CTA */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={miniButton()} onClick={generateAndGoDiary} disabled={loading}>
                  Generate & Check Diary
                </button>

                <button
                  style={miniButton()}
                  onClick={() => {
                    appendDiaryDraftText(date, "Why it matters: I want to feel supported and track patterns over time.");
                    pushToast("✅ Added to diary");
                  }}
                  disabled={loading}
                >
                  Add ‘Why’ to Memo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toast items={toasts} onRemove={removeToast} />
    </main>
  );
}