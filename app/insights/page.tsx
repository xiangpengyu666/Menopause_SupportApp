"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiaryDraft } from "../../components/storage";

const KEY_PREFIX = "mc:";
const DIARY_PREFIX = `${KEY_PREFIX}diaryDraft:`;
const LOCALE = "en-US";

// ===== CommunityHub localStorage schema (MVP) =====
type CommunityItem = {
  id: string;
  type: "story" | "memo";
  title: string;
  body: string;
  tags?: string[];
  createdAt: string;
};

const COMMUNITY_INDEX_KEY = `${KEY_PREFIX}community:index`;
const COMMUNITY_ITEM_PREFIX = `${KEY_PREFIX}community:item:`;

// ===== date helpers =====
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoDateDaysAgo(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toISODate(d);
}

function lastNDates(n: number, offsetDaysAgo: number = 0) {
  return Array.from({ length: n }, (_, i) => isoDateDaysAgo(i + offsetDaysAgo));
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatPretty(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(LOCALE, { weekday: "short" });
  const md = dt.toLocaleDateString(LOCALE, { month: "2-digit", day: "2-digit" });
  return `${weekday} ${md}`;
}

function formatMonthTitle(year: number, monthIndex: number) {
  const dt = new Date(year, monthIndex, 1);
  return dt.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

function average(nums: number[]) {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

function topSymptomsFromDraft(draft: DiaryDraft | null) {
  const tags = (draft?.tags ?? []).filter(Boolean);
  if (tags.length === 0) return [];
  const freq: Record<string, number> = {};
  for (const t of tags) freq[t] = (freq[t] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

function deltaArrow(delta: number) {
  if (delta > 0.001) return "↑";
  if (delta < -0.001) return "↓";
  return "→";
}

function fmtSigned(delta: number) {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}

function draftVisibility(draft: DiaryDraft | null): "private" | "public" {
  const v = (draft as any)?.visibility;
  return v === "public" ? "public" : "private";
}

// ===== calendar helpers =====
function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Monday-first calendar (Mon..Sun)
function mondayFirstIndexOfJSWeekday(jsDay: number) {
  // JS: 0 Sun, 1 Mon, ... 6 Sat -> Mon=0..Sun=6
  return (jsDay + 6) % 7;
}

function buildMonthGrid(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const firstIdx = mondayFirstIndexOfJSWeekday(first.getDay());
  const dim = daysInMonth(year, monthIndex);

  const cells: Array<{ dateISO: string | null; dayNum: number | null }> = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstIdx + 1;
    if (dayNum < 1 || dayNum > dim) {
      cells.push({ dateISO: null, dayNum: null });
    } else {
      const dt = new Date(year, monthIndex, dayNum);
      cells.push({ dateISO: toISODate(dt), dayNum });
    }
  }
  return cells;
}

// ===== CommunityHub helpers =====
function pickTopTags(drafts: DiaryDraft[], limit = 6) {
  const freq: Record<string, number> = {};
  for (const d of drafts) {
    for (const t of d.tags ?? []) {
      if (!t) continue;
      freq[t] = (freq[t] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

function loadCommunityItems(): CommunityItem[] {
  const idxRaw = window.localStorage.getItem(COMMUNITY_INDEX_KEY);
  const ids = safeParse<string[]>(idxRaw) ?? [];
  const items: CommunityItem[] = [];
  for (const id of ids) {
    const raw = window.localStorage.getItem(`${COMMUNITY_ITEM_PREFIX}${id}`);
    const item = safeParse<CommunityItem>(raw);
    if (item?.id && item?.title) items.push(item);
  }
  items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return items;
}

function recommendCommunity(items: CommunityItem[], interestTags: string[], take = 6) {
  const tagSet = new Set(interestTags);
  const scored = items.map((it) => {
    const tags = it.tags ?? [];
    const score = tags.reduce((acc, t) => acc + (tagSet.has(t) ? 1 : 0), 0);
    return { it, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((x) => x.it);
}

// ===== AI summary (LLM optional, safe fallback) =====
function localFallbackSummaryWeekly(drafts: DiaryDraft[], interestTags: string[]) {
  const moods = drafts.map((d) => d.mood).filter((x): x is number => typeof x === "number");
  const intens = drafts.map((d) => d.intensity).filter((x): x is number => typeof x === "number");
  const moodAvg = average(moods);
  const intensityAvg = average(intens);

  const top = interestTags.slice(0, 4);
  const topLine = top.length ? `Most frequent symptoms: ${top.join(", ")}.` : `No symptom tags logged yet.`;

  const lines: string[] = [];
  lines.push(
    `In the last 7 days, your average mood is ${moodAvg == null ? "—" : moodAvg.toFixed(2)} and average intensity is ${
      intensityAvg == null ? "—" : intensityAvg.toFixed(2)
    }.`
  );
  lines.push(topLine);
  lines.push(`Tip: logging consistently makes weekly/monthly comparisons more reliable.`);
  return lines.join(" ");
}

function localFallbackSummaryMonthly(monthDrafts: DiaryDraft[], year: number, monthIndex: number) {
  const moods = monthDrafts.map((d) => d.mood).filter((x): x is number => typeof x === "number");
  const intens = monthDrafts.map((d) => d.intensity).filter((x): x is number => typeof x === "number");
  const moodAvg = average(moods);
  const intensityAvg = average(intens);

  const title = formatMonthTitle(year, monthIndex);
  const lines: string[] = [];
  lines.push(`${title}: ${monthDrafts.length} day(s) logged.`);
  lines.push(
    `Average mood: ${moodAvg == null ? "—" : moodAvg.toFixed(2)} • Average intensity: ${
      intensityAvg == null ? "—" : intensityAvg.toFixed(2)
    }.`
  );
  lines.push(`Tip: add tags to get better recommendations.`);
  return lines.join(" ");
}

async function tryLLMSummary(payload: any) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "insights_summary",
      input: payload,
      prompt:
        payload?.mode === "monthly"
          ? `Summarize the user's current month diary into 3-5 bullet points. Focus on mood, intensity, patterns, and 1 gentle suggestion. Keep it empathetic and concise.`
          : `Summarize the user's last 7 days of diary into 3-5 bullet points. Focus on mood, intensity, symptom patterns, and 1 gentle suggestion. Keep it empathetic and concise.`,
    }),
  });
  if (!res.ok) throw new Error(`LLM route failed: ${res.status}`);
  const data = await res.json();
  const text =
    data?.text ?? data?.message ?? data?.output ?? data?.choices?.[0]?.message?.content ?? null;
  if (!text || typeof text !== "string") throw new Error("LLM response missing text");
  return text.trim();
}

type ViewMode = "weekly" | "monthly";

export default function InsightsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");

  // Weekly windows
  const thisWeekDates = useMemo(() => lastNDates(7, 0), []);
  const lastWeekDates = useMemo(() => lastNDates(7, 7), []);

  // Monthly calendar state (current month by default)
  const today = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonthIndex, setCalMonthIndex] = useState(today.getMonth()); // 0-11
  const monthGrid = useMemo(() => buildMonthGrid(calYear, calMonthIndex), [calYear, calMonthIndex]);

  // Local storage cache
  const [byDate, setByDate] = useState<Record<string, DiaryDraft | null>>({});

  // AI + Recommendations state
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiSummaryStatus, setAiSummaryStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [recommendations, setRecommendations] = useState<CommunityItem[]>([]);

  // --- navigation helper ---
  function gotoDiary(dateISO: string) {
    // ✅ Default route: /diary?date=YYYY-MM-DD
    // If your diary route is different, change ONLY this line.
    router.push(`/diary?date=${encodeURIComponent(dateISO)}`);
  }

  // Compute which dates we need to load from localStorage
  const neededDates = useMemo(() => {
    const set = new Set<string>();
    for (const d of thisWeekDates) set.add(d);
    for (const d of lastWeekDates) set.add(d);
    for (const cell of monthGrid) if (cell.dateISO) set.add(cell.dateISO);
    return Array.from(set);
  }, [thisWeekDates, lastWeekDates, monthGrid]);

  useEffect(() => {
    const map: Record<string, DiaryDraft | null> = {};
    neededDates.forEach((date) => {
      const raw = window.localStorage.getItem(`${DIARY_PREFIX}${date}`);
      map[date] = safeParse<DiaryDraft>(raw);
    });
    setByDate(map);
  }, [neededDates]);

  // Weekly derived
  const thisWeekDrafts = useMemo(
    () => thisWeekDates.map((d) => byDate[d] ?? null).filter((x): x is DiaryDraft => !!x),
    [thisWeekDates, byDate]
  );
  const lastWeekDrafts = useMemo(
    () => lastWeekDates.map((d) => byDate[d] ?? null).filter((x): x is DiaryDraft => !!x),
    [lastWeekDates, byDate]
  );

  const thisMoodAvg = useMemo(() => {
    const nums = thisWeekDrafts.map((d) => d.mood).filter((x): x is number => typeof x === "number");
    return average(nums);
  }, [thisWeekDrafts]);

  const lastMoodAvg = useMemo(() => {
    const nums = lastWeekDrafts.map((d) => d.mood).filter((x): x is number => typeof x === "number");
    return average(nums);
  }, [lastWeekDrafts]);

  const thisIntensityAvg = useMemo(() => {
    const nums = thisWeekDrafts.map((d) => d.intensity).filter((x): x is number => typeof x === "number");
    return average(nums);
  }, [thisWeekDrafts]);

  const lastIntensityAvg = useMemo(() => {
    const nums = lastWeekDrafts.map((d) => d.intensity).filter((x): x is number => typeof x === "number");
    return average(nums);
  }, [lastWeekDrafts]);

  const moodDelta = useMemo(() => {
    if (thisMoodAvg == null || lastMoodAvg == null) return null;
    return thisMoodAvg - lastMoodAvg;
  }, [thisMoodAvg, lastMoodAvg]);

  const intensityDelta = useMemo(() => {
    if (thisIntensityAvg == null || lastIntensityAvg == null) return null;
    return thisIntensityAvg - lastIntensityAvg;
  }, [thisIntensityAvg, lastIntensityAvg]);

  // Monthly derived (actual month days only)
  const monthDateISOs = useMemo(() => {
    const dim = daysInMonth(calYear, calMonthIndex);
    return Array.from({ length: dim }, (_, i) => toISODate(new Date(calYear, calMonthIndex, i + 1)));
  }, [calYear, calMonthIndex]);

  const monthDrafts = useMemo(
    () => monthDateISOs.map((d) => byDate[d] ?? null).filter((x): x is DiaryDraft => !!x),
    [monthDateISOs, byDate]
  );

  const interestTags = useMemo(() => pickTopTags(thisWeekDrafts, 8), [thisWeekDrafts]);

  // Recommendations + AI summary (depends on mode)
  useEffect(() => {
    try {
      const items = loadCommunityItems();
      setRecommendations(recommendCommunity(items, interestTags, 6));
    } catch {
      setRecommendations([]);
    }

    (async () => {
      setAiSummaryStatus("loading");

      if (viewMode === "weekly") {
        if (thisWeekDrafts.length === 0) {
          setAiSummary(`No entries in the last 7 days yet. Add a few daily logs and your summary + recommendations will appear here.`);
          setAiSummaryStatus("ready");
          return;
        }

        const fallback = localFallbackSummaryWeekly(thisWeekDrafts, interestTags);
        try {
          const text = await tryLLMSummary({
            mode: "weekly",
            dates: thisWeekDates,
            drafts: thisWeekDrafts,
            interestTags,
          });
          setAiSummary(text);
        } catch {
          setAiSummary(fallback);
        } finally {
          setAiSummaryStatus("ready");
        }
      } else {
        if (monthDrafts.length === 0) {
          setAiSummary(`No entries in ${formatMonthTitle(calYear, calMonthIndex)} yet. Add a few logs and the monthly summary will appear here.`);
          setAiSummaryStatus("ready");
          return;
        }

        const fallback = localFallbackSummaryMonthly(monthDrafts, calYear, calMonthIndex);
        try {
          const text = await tryLLMSummary({
            mode: "monthly",
            year: calYear,
            monthIndex: calMonthIndex,
            drafts: monthDrafts,
          });
          setAiSummary(text);
        } catch {
          setAiSummary(fallback);
        } finally {
          setAiSummaryStatus("ready");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewMode,
    thisWeekDrafts.length,
    interestTags.join("|"),
    calYear,
    calMonthIndex,
    monthDrafts.length,
  ]);

  function gotoPrevMonth() {
    const m = calMonthIndex - 1;
    if (m < 0) {
      setCalMonthIndex(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonthIndex(m);
    }
  }

  function gotoNextMonth() {
    const m = calMonthIndex + 1;
    if (m > 11) {
      setCalMonthIndex(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonthIndex(m);
    }
  }

  return (
    <main style={{ padding: 16, paddingBottom: 90 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Insights</h1>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{viewMode === "weekly" ? "Sleep-day • Last 7 days" : "Calendar • Monthly"}</div>
      </div>

      {/* View toggle */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["weekly", "monthly"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: viewMode === m ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
              color: "white",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {m === "weekly" ? "Weekly" : "Monthly"}
          </button>
        ))}
      </div>

      {/* WEEKLY VIEW */}
      {viewMode === "weekly" ? (
        <>
          {/* Weekly Comparison */}
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75 }}>This Week vs Last Week</div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Mood (avg)</div>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 6, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{thisMoodAvg == null ? "—" : thisMoodAvg.toFixed(2)}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    last week: {lastMoodAvg == null ? "—" : lastMoodAvg.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                    {moodDelta == null ? "" : `${deltaArrow(moodDelta)} ${fmtSigned(moodDelta)}`}
                  </div>
                </div>
              </div>

              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Intensity (avg)</div>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 6, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {thisIntensityAvg == null ? "—" : thisIntensityAvg.toFixed(2)}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    last week: {lastIntensityAvg == null ? "—" : lastIntensityAvg.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                    {intensityDelta == null ? "" : `${deltaArrow(intensityDelta)} ${fmtSigned(intensityDelta)}`}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Data coverage</div>
                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                  This week entries: <b>{thisWeekDrafts.length}</b> / 7 • Last week entries: <b>{lastWeekDrafts.length}</b> / 7
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
                  Tip: more consistent daily logs make comparisons more reliable.
                </div>
              </div>
            </div>
          </div>

          {/* 7 daily blocks */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {thisWeekDates.map((date) => {
              const draft = byDate[date] ?? null;
              const mood = typeof draft?.mood === "number" ? draft.mood : null;
              const intensity = typeof draft?.intensity === "number" ? draft.intensity : null;
              const topSymptoms = topSymptomsFromDraft(draft);
              const vis = draftVisibility(draft);

              return (
                <button
                  key={date}
                  onClick={() => gotoDiary(date)}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    color: "white",
                    cursor: "pointer",
                  }}
                  title={`Open diary for ${date}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      {formatPretty(date)} <span style={{ opacity: 0.6, fontWeight: 600 }}>({date})</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {draft
                        ? draft.updatedAt
                          ? `Updated: ${new Date(draft.updatedAt).toLocaleString(LOCALE)}`
                          : "Entry available"
                        : "No entry"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>
                    <div style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Mood</div>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>{mood ?? "—"}</div>
                    </div>

                    <div style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Intensity</div>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>{intensity ?? "—"}</div>
                    </div>

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Top Symptoms</div>

                      {topSymptoms.length === 0 ? (
                        <div style={{ marginTop: 6, opacity: 0.75 }}>—</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          {topSymptoms.slice(0, 6).map((t) => (
                            <span
                              key={t}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.08)",
                                fontSize: 12,
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ minWidth: 120 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Visibility</div>
                      <div style={{ marginTop: 6 }}>
                        {draft ? (
                          <span
                            style={{
                              padding: "5px 9px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: vis === "public" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {vis}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {draft?.text?.trim() ? (
                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                      {draft.text.trim().slice(0, 220)}
                      {draft.text.trim().length > 220 ? "…" : ""}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        /* MONTHLY VIEW */
        <>
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Monthly calendar</div>
                <div style={{ marginTop: 4, fontSize: 16, fontWeight: 900 }}>
                  {formatMonthTitle(calYear, calMonthIndex)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={gotoPrevMonth}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ← Prev
                </button>
                <button
                  onClick={gotoNextMonth}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Weekday header */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
                <div key={w} style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, paddingLeft: 4 }}>
                  {w}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {monthGrid.map((cell, idx) => {
                if (!cell.dateISO) {
                  return (
                    <div
                      key={`blank-${idx}`}
                      style={{
                        height: 84,
                        borderRadius: 12,
                        border: "1px dashed rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    />
                  );
                }

                const draft = byDate[cell.dateISO] ?? null;
                const mood = typeof draft?.mood === "number" ? draft.mood : null;
                const intensity = typeof draft?.intensity === "number" ? draft.intensity : null;
                const vis = draftVisibility(draft);

                return (
                  <button
                    key={cell.dateISO}
                    onClick={() => gotoDiary(cell.dateISO!)}
                    style={{
                      height: 84,
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: draft ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                      color: "white",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      overflow: "hidden",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    title={`Open diary for ${cell.dateISO}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>{cell.dayNum}</div>
                      {draft ? (
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: vis === "public" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                            fontSize: 11,
                            fontWeight: 800,
                            opacity: 0.95,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {vis}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, opacity: 0.5 }}>—</span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Mood: <span style={{ fontWeight: 900, opacity: 0.95 }}>{mood ?? "—"}</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Int: <span style={{ fontWeight: 900, opacity: 0.95 }}>{intensity ?? "—"}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {draft?.tags?.length ? draft.tags.slice(0, 2).join(", ") : ""}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
              Tap any day to open that diary entry.
            </div>
          </div>
        </>
      )}

      {/* AI Summary + Recommendations (always at bottom) */}
      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>AI</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800 }}>
              {viewMode === "weekly" ? "Weekly Summary" : "Monthly Summary"}
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{aiSummaryStatus === "loading" ? "Generating…" : "Ready"}</div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
          {aiSummaryStatus === "loading" && !aiSummary ? "Generating your summary…" : aiSummary}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Based on your recent tags:{" "}
          {interestTags.length ? (
            <span style={{ fontWeight: 800, opacity: 0.9 }}>{interestTags.slice(0, 6).join(", ")}</span>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>CommunityHub</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800 }}>Recommended for you</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{recommendations.length ? `${recommendations.length} matches` : "No matches yet"}</div>
        </div>

        {recommendations.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
            No community content matches your recent tags yet. When CommunityHub has more stories/memos (with tags), recommendations will appear here.
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {recommendations.map((it) => (
              <div
                key={it.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>
                    {it.title}{" "}
                    <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 700 }}>• {it.type.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {it.createdAt ? new Date(it.createdAt).toLocaleDateString(LOCALE) : ""}
                  </div>
                </div>

                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                  {it.body.slice(0, 220)}
                  {it.body.length > 220 ? "…" : ""}
                </div>

                {it.tags?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {it.tags.slice(0, 8).map((t) => (
                      <span
                        key={t}
                        style={{
                          padding: "5px 9px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.08)",
                          fontSize: 12,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
          Next upgrade: click-to-open detail page, and ranking by recency + tag overlap + reading history.
        </div>
      </div>
    </main>
  );
}