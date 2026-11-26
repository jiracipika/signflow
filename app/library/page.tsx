"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { libraryRows, type LibraryRow } from "@/lib/signs/library";
import {
  MotionConfig,
  motion,
  staggerContainer,
  fadeUp,
  fadeUpCapped,
  hoverLift,
} from "@/components/motion-kit";

const STATUS_META: Record<
  LibraryRow["status"],
  { label: string; cls: string }
> = {
  taught: { label: "Taught sign", cls: "tag ok" },
  builtin: { label: "Built-in (approximate)", cls: "tag warn" },
  fingerspelled: { label: "Fingerspelled", cls: "tag" },
};

type Filter = "all" | "signed" | "fingerspelled";

export default function LibraryPage() {
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // sign store reads localStorage — defer past first render
  useEffect(() => {
    const id = setTimeout(() => setRows(libraryRows()), 0);
    return () => clearTimeout(id);
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toUpperCase();
    return rows.filter((r) => {
      if (filter === "signed" && r.playback !== "recording") return false;
      if (filter === "fingerspelled" && r.playback !== "fingerspelling") return false;
      if (q && !r.word.includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  return (
    <MotionConfig reducedMotion="user">
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <motion.div variants={fadeUp} className="card">
        <h2>Sign library</h2>
        <p>
          The avatar replays motion recordings from Teach and fingerspells other words.
          Learn the ASL signs from{" "}
          <a href="https://www.lifeprint.com/" target="_blank" rel="noreferrer">
            Lifeprint/ASLU
          </a>{" "}
          or{" "}
          <a href="https://www.signingsavvy.com/" target="_blank" rel="noreferrer">
            Signing Savvy
          </a>
          .
        </p>
        <div className="btn-row" style={{ flexWrap: "wrap" }}>
          {(["all", "signed", "fingerspelled"] as Filter[]).map((f) => (
            <button
              key={f}
              className="btn"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "signed" ? "Has a recording" : "Fingerspelled only"}
            </button>
          ))}
          <input
            type="text"
            value={query}
            maxLength={20}
            placeholder="Filter words…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter library words"
            style={{ minWidth: 140 }}
          />
        </div>
        </motion.div>

        <motion.div variants={fadeUp} className="card">
          {!rows ? (
            <p className="muted">Loading library…</p>
          ) : visible.length === 0 ? (
            <p className="muted">No words match.</p>
          ) : (
            <ul className="library-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visible.map((r, rowIdx) => {
                const meta = STATUS_META[r.status];
                return (
                  <motion.li
                    key={r.word}
                    custom={rowIdx}
                    variants={fadeUpCapped}
                    whileHover={hoverLift}
                    whileTap={{ scale: 0.99 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                  <strong style={{ minWidth: 130 }}>{r.word}</strong>
                  <span className={meta.cls} title={`Avatar plays ${r.playback}`}>
                    {meta.label}
                  </span>
                  <span className="small muted" style={{ flex: 1, minWidth: 200 }}>
                    {r.note}
                  </span>
                  <Link
                    className="btn"
                    href={`/avatar?text=${encodeURIComponent(r.word)}`}
                    title={`Fingerspell/sign ${r.word} on the avatar`}
                  >
                    <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {r.playback === "recording" ? "Play recording" : r.fingerspelling}
                    </span>
                  </Link>
                  <a
                    className="btn ghost"
                    href={r.referenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Learn the real sign"
                  >
                    Reference ↗
                  </a>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
            Built-in handshapes are static previews. Follow the reference videos for the full signs.
          </p>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
