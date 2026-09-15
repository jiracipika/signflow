"use client";

// Sign library: browsable common words. Each entry shows how SignFlow renders
// it today (taught recording / built-in approximation / fingerspelling), a
// fingerspelling preview that plays on the avatar, and a link to learn the
// real sign from Lifeprint (ASLU) or Signing Savvy.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { libraryRows, type LibraryRow } from "@/lib/signs/library";

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
      if (filter === "signed" && r.status === "fingerspelled") return false;
      if (filter === "fingerspelled" && r.status !== "fingerspelled") return false;
      if (q && !r.word.includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  return (
    <>
      <div className="card">
        <h2>Sign library</h2>
        <p>
          Common words and how SignFlow signs them right now. Words with a
          taught or built-in sign play that motion on the avatar; everything
          else is fingerspelled letter by letter. Each entry links to the real
          sign —{" "}
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
              {f === "all" ? "All" : f === "signed" ? "Has a sign" : "Fingerspelled only"}
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
      </div>

      <div className="card">
        {!rows ? (
          <p className="muted">Loading library…</p>
        ) : visible.length === 0 ? (
          <p className="muted">No words match.</p>
        ) : (
          <ul className="library-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visible.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <li
                  key={r.word}
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
                  <span className={meta.cls} title={`SignFlow renders this as: ${meta.label}`}>
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
                      {r.fingerspelling}
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
                </li>
              );
            })}
          </ul>
        )}
        <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
          Built-in signs are approximate single hand shapes — shape only, no
          motion, not certified ASL. Teach mode recordings are your own and
          always take precedence.
        </p>
      </div>
    </>
  );
}
