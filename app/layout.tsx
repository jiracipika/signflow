import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

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
    <html lang="en">
      <body>
        <nav className="topnav">
          <Link className="brand" href="/">
            <span aria-hidden="true">🤟</span> SignFlow
          </Link>
          <a href="/live">Sign</a>
          <a href="/practice">Practice</a>
          <a href="/teach">Teach</a>
          <a href="/avatar">Avatar</a>
          <a href="/settings">Settings</a>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}