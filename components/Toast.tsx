"use client";

import React, { useEffect } from "react";

export type ToastItem = {
  id: string;
  message: string;
};

export function Toast({
  items,
  onRemove,
}: {
  items: ToastItem[];
  onRemove: (id: string) => void;
}) {
  // 自动消失（每条 2.2s）
  useEffect(() => {
    if (items.length === 0) return;

    const timers = items.map((t) =>
      window.setTimeout(() => onRemove(t.id), 2200)
    );

    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [items, onRemove]);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 84, // 避开 TabBar
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.72)",
            color: "white",
            backdropFilter: "blur(10px)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
            pointerEvents: "auto",
          }}
          onClick={() => onRemove(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}