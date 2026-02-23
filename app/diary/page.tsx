"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DiaryDraft,
  loadDiaryDraft,
  mergeDiaryDraft,
  saveDiaryDraft,
  sleepDayISODate,
} from "../../components/storage";

const ALL_TAGS = [
  "hot_flash",
  "formication",
  "joint_ache",
  "anxiety",
  "sleep_disruption",
  "mood_swings",
];

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDaysISO(iso: string, deltaDays: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function TagPill({
  tag,
  active,
  onToggle,
}: {
  tag: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
        color: "white",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      {tag}
    </button>
  );
}

function VisibilityToggle({
  value,
  onChange,
}: {
  value: "private" | "public";
  onChange: (v: "private" | "public") => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Visibility</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["private", "public"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: value === v ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {v === "private" ? "Private" : "Public"}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
        Private: only you can see • Public: can be shared to CommunityHub
      </div>
    </div>
  );
}

export default function DiaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Default "today" sleep-day (cutoff 06:00)
  const defaultDate = useMemo(() => sleepDayISODate(6), []);

  // If /diary?date=YYYY-MM-DD provided, use it
  const queryDate = searchParams?.get("date") ?? "";
  const activeDate = useMemo(() => {
    if (queryDate && isISODate(queryDate)) return queryDate;
    return defaultDate;
  }, [queryDate, defaultDate]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [draft, setDraft] = useState<DiaryDraft>(() => ({
    date: activeDate,
    tags: [],
    text: "",
    updatedAt: "",
    // visibility default private (backward compatible)
    // @ts-ignore (if DiaryDraft type not updated yet, this still works at runtime)
    visibility: "private",
  }));

  // Load the draft whenever date changes
  useEffect(() => {
    const saved = loadDiaryDraft(activeDate);
    if (saved) {
      // ensure visibility fallback
      const vis = (saved as any)?.visibility === "public" ? "public" : "private";
      setDraft({ ...saved, date: activeDate, ...(saved as any), visibility: vis } as any);
    } else {
      // new empty draft for this date
      setDraft({
        date: activeDate,
        tags: [],
        text: "",
        updatedAt: "",
        // @ts-ignore
        visibility: "private",
      } as any);
    }
  }, [activeDate]);

  function update(patch: Partial<DiaryDraft>) {
    const merged = mergeDiaryDraft(activeDate, patch);
    // ensure visibility fallback
    const vis = (merged as any)?.visibility === "public" ? "public" : "private";
    setDraft({ ...(merged as any), date: activeDate, visibility: vis });
  }

  function toggleTag(tag: string) {
    const has = draft.tags.includes(tag);
    const next = has ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag];
    update({ tags: next });
  }

  function gotoDate(nextISO: string) {
    router.push(`/diary?date=${encodeURIComponent(nextISO)}`);
  }

  const visibility = ((draft as any)?.visibility === "public" ? "public" : "private") as
    | "private"
    | "public";

  return (
    <main style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{activeDate === defaultDate ? "Today Diary" : "Diary"}</h1>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Sleep-day: <b>{activeDate}</b> (cutoff 06:00)
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => gotoDate(addDaysISO(activeDate, -1))}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
            }}
            title="Previous day"
          >
            ← Prev
          </button>
          <button
            onClick={() => gotoDate(addDaysISO(activeDate, +1))}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
            }}
            title="Next day"
          >
            Next →
          </button>
          {activeDate !== defaultDate ? (
            <button
              onClick={() => gotoDate(defaultDate)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 800,
              }}
              title="Back to today"
            >
              Today
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Mood</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map((m) => (
            <button
              key={m}
              onClick={() => update({ mood: m })}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: draft.mood === m ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                minWidth: 44,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8 }}>Intensity (1–5)</div>
        <input
          type="range"
          min={1}
          max={5}
          value={draft.intensity ?? 3}
          onChange={(e) => update({ intensity: Number(e.target.value) })}
          style={{ width: "100%", marginTop: 8 }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>Current: {draft.intensity ?? 3}</div>

        {/* ✅ Visibility */}
        <VisibilityToggle value={visibility} onChange={(v) => update({ ...(draft as any), visibility: v } as any)} />

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Tags</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ALL_TAGS.map((t) => (
            <TagPill key={t} tag={t} active={draft.tags.includes(t)} onToggle={() => toggleTag(t)} />
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Diary text</div>
        <textarea
          value={draft.text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder="Write anything…"
          rows={8}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            resize: "vertical",
          }}
        />

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              saveDiaryDraft({ ...(draft as any), date: activeDate, updatedAt: new Date().toISOString() });
              alert("Saved ✓");
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.10)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Save
          </button>

          {draft.fromSessionId ? (
            <div style={{ fontSize: 12, opacity: 0.7, alignSelf: "center" }}>
              Draft created from chat session: {draft.fromSessionId}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7, alignSelf: "center" }}>
              Tip: send a message in Chat and come back — a draft will appear here.
            </div>
          )}
        </div>

        {mounted && draft.updatedAt ? (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
            Last updated: {new Date(draft.updatedAt).toLocaleString()}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>Last updated: —</div>
        )}
      </div>
    </main>
  );
}