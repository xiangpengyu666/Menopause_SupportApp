import "./globals.css";
import { TabBar } from "../components/TabBar";

export const metadata = {
  title: "Menopause Companion",
  description: "PWA MVP demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b0b0f", color: "white" }}>
        <div style={{ paddingBottom: 80 }}>{children}</div>
        <TabBar />
      </body>
    </html>
  );
}