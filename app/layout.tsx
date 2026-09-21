import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

// 'Grandview' is the brand font (proprietary). Source Sans 3 is the accessible
// web fallback; the CSS font stack tries Grandview first, then Segoe UI, then
// this, then Arial.
const body = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prestige Family Day 2026 – Registration Desk",
  description: "Beyond the Skyline · 26 September 2026",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={body.variable}>
        <div className="skyline" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
