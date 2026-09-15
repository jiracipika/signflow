import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Geist({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
        <nav className="topnav">
          <Link className="brand" href="/">
            <span aria-hidden="true">🤟</span> SignFlow
          </Link>
          <a href="/live">Sign</a>
          <a href="/practice">Practice</a>
          <a href="/library">Library</a>
          <a href="/teach">Teach</a>
          <a href="/avatar">Avatar</a>
          <a href="/settings">Settings</a>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
