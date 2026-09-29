import type { Metadata, Viewport } from "next";
import Navigation from "@/components/Navigation";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display-brico",
  display: "swap",
});

const body = Geist({
  subsets: ["latin"],
  variable: "--font-body-geist",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SignFlow — ASL fingerspelling assistant",
  description:
    "On-device ASL alphabet fingerspelling recognition: camera to letters to text, with word suggestions. Nothing leaves your device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Navigation />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
