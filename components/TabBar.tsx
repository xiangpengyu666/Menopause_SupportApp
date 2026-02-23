"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/diary", label: "Diary" },
  { href: "/chat", label: "Chat" },
  { href: "/insights", label: "Insights" },
  { href: "/community", label: "Community" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 64,
        borderTop: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(10,10,14,0.92)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        backdropFilter: "blur(10px)",
      }}
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              textDecoration: "none",
              color: active ? "white" : "rgba(255,255,255,0.65)",
              fontWeight: active ? 600 : 500,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}