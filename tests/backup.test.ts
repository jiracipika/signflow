import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildBackup,
  backupToJson,
  parseBackup,
  importBackup,
} from "../lib/signs/backup.ts";
import {
  listSigns,
  builtinSigns,
  teachStaticSign,
  teachDynamicSign,
  matchStatic,
} from "../lib/signs/custom-signs.ts";
import type { Landmark } from "../lib/types.ts";

// The app reads/writes signs through window.localStorage; give node an
// in-memory stand-in so the full export → wipe → import path can run here.
class MemoryLocalStorage {
  #map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.#map.has(k) ? this.#map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.#map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.#map.delete(k);
  }
  clear(): void {
    this.#map.clear();
  }
}
const storage = new MemoryLocalStorage();
globalThis.window = { localStorage: storage } as unknown as Window &
  typeof globalThis;

beforeEach(() => storage.clear());

function samplePose(seed: number): Landmark[] {
  return Array.from({ length: 21 }, (_, i) => ({
    x: 0.3 + (((i * 7 + seed * 3) % 10) * 0.02),
    y: 0.8 - Math.floor(i / 3) * 0.04,
    z: (i % 5) * 0.01 * (seed + 1),
  }));
}

function sampleMotion(seed: number): Landmark[][] {
  return Array.from({ length: 8 }, (_, f) => samplePose(seed + f));
}

const frame = (n = 63) => Array.from({ length: n }, (_, i) => i * 0.001);

const staticSign = () => ({
  label: "TEST",
  kind: "static",
  prototypes: [[frame()]],
});

const wrap = (signs: unknown, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    kind: "signflow-backup",
    exportedAt: "2026-10-05T00:00:00.000Z",
    signs,
    ...over,
  });

const stored = (): { label: string; kind: string; builtin: boolean; prototypes: number[][][] }[] =>
  JSON.parse(storage.getItem("signflow.signs.v1") ?? "[]");

test("export → wipe → import round-trips a taught static sign", () => {
  assert.equal(
    teachStaticSign("THANK YOU", [
      { frames: [samplePose(1)] },
      { frames: [samplePose(2)] },
    ]),
    true
  );
  const json = backupToJson();

  // export carries only the user sign, never the built-ins
  const exported = parseBackup(json);
  assert.ok(exported.ok, `export failed to parse: ${exported.ok ? "" : exported.error}`);
  assert.deepEqual(exported.backup.signs.map((s) => s.label), ["THANK YOU"]);

  // wipe the browser — the taught sign is gone
  storage.clear();
  assert.ok(!listSigns().some((s) => s.text === "THANK YOU"));

  // import it back and recognize it again
  const parsed = parseBackup(json);
  assert.ok(parsed.ok);
  const report = importBackup(parsed.backup);
  assert.deepEqual(report, {
    imported: ["THANK YOU"],
    skippedExisting: [],
    rejected: [],
  });
  const listed = listSigns().find((s) => s.text === "THANK YOU");
  assert.ok(listed, "imported sign not listed");
  assert.equal(listed.kind, "static");
  assert.equal(listed.builtin, false);
  const m = matchStatic(samplePose(1));
  assert.ok(m, "no static match after round-trip");
  assert.equal(m.label, "THANK YOU");
  assert.equal(m.builtin, false);
  assert.ok(m.distance < 1e-9, `expected exact prototype match, got ${m.distance}`);
});

test("backup JSON shape is versioned, kinded and dated", () => {
  teachStaticSign("HELLO2", [{ frames: [samplePose(4)] }]);
  const parsed = JSON.parse(backupToJson());
  assert.deepEqual(Object.keys(parsed).sort(), [
    "exportedAt",
    "kind",
    "signs",
    "version",
  ]);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.kind, "signflow-backup");
  assert.ok(!Number.isNaN(Date.parse(parsed.exportedAt)));
  assert.equal(parsed.signs.length, 1);
  assert.deepEqual(Object.keys(parsed.signs[0]).sort(), [
    "kind",
    "label",
    "prototypes",
  ]);
});

test("imported dynamic signs keep 32-frame sequences", () => {
  assert.equal(teachDynamicSign("WAVE", [{ frames: sampleMotion(1) }]), true);
  const json = backupToJson();
  storage.clear();
  const parsed = parseBackup(json);
  assert.ok(parsed.ok);
  const report = importBackup(parsed.backup);
  assert.deepEqual(report.imported, ["WAVE"]);

  const raw = stored();
  assert.equal(raw.length, 1);
  assert.equal(raw[0].label, "WAVE");
  assert.equal(raw[0].kind, "dynamic");
  assert.equal(raw[0].builtin, false);
  assert.equal(raw[0].prototypes.length, 1);
  assert.equal(raw[0].prototypes[0].length, 32);
  assert.ok(raw[0].prototypes[0].every((f) => f.length === 63));
  assert.ok(
    listSigns().some(
      (s) => s.text === "WAVE" && s.kind === "dynamic" && !s.builtin
    )
  );
});

test("parseBackup rejects tampered/malformed files without throwing", () => {
  const good = [staticSign()];
  const bad: string[] = [
    "{not json",
    "null",
    "[]",
    JSON.stringify({}),
    wrap(good, { kind: "something-else" }),
    wrap(good, { version: 2 }),
    wrap(good, { version: "1" }),
    wrap(good, { exportedAt: "" }),
    wrap("not-an-array"),
    wrap([{ ...staticSign(), label: "" }]),
    wrap([{ ...staticSign(), label: 7 }]),
    wrap([{ ...staticSign(), kind: "wiggle" }]),
    wrap([{ ...staticSign(), prototypes: [] }]),
    wrap([{ ...staticSign(), prototypes: { 0: 1 } }]),
    wrap([42]),
    // static prototypes are single normalized frames
    wrap([{ ...staticSign(), prototypes: [[frame(), frame()]] }]),
    // frames are exactly 63 numbers
    wrap([{ ...staticSign(), prototypes: [[frame(62)]] }]),
    wrap([{ ...staticSign(), prototypes: [[frame().map((v, i) => (i === 5 ? "x" : v))]] }]),
    // Infinity parses back from 1e999 and must be rejected as non-finite
    wrap([{ ...staticSign(), prototypes: [[frame().map((v, i) => (i === 5 ? 1e999 : v))]] }]),
    // dynamic prototypes are sequences resampled to exactly 32 frames
    wrap([
      {
        label: "D",
        kind: "dynamic",
        prototypes: [Array.from({ length: 31 }, () => frame())],
      },
    ]),
  ];
  for (const raw of bad) {
    let threw = false;
    let result: ReturnType<typeof parseBackup> | null = null;
    try {
      result = parseBackup(raw);
    } catch {
      threw = true;
    }
    assert.ok(!threw, `parseBackup threw for: ${raw.slice(0, 60)}`);
    if (result === null || result.ok)
      assert.fail(`expected rejection for: ${raw.slice(0, 60)}`);
    assert.ok(result.error.length > 0, "rejection must carry a reason");
  }
  // positive control: a well-formed file of both kinds parses
  const okResult = parseBackup(
    wrap([
      staticSign(),
      {
        label: "D",
        kind: "dynamic",
        prototypes: [Array.from({ length: 32 }, () => frame())],
      },
    ])
  );
  assert.ok(okResult.ok);
  assert.equal(okResult.backup.signs.length, 2);
});

test("import skips labels already taught here — never overwrites", () => {
  teachStaticSign("MOM", [{ frames: [samplePose(1)] }]);
  const before = stored();

  const backup = parseBackup(backupToJson());
  assert.ok(backup.ok);
  const report = importBackup(backup.backup);
  assert.deepEqual(report.imported, []);
  assert.deepEqual(report.skippedExisting, ["MOM"]);
  // the user's stored samples are untouched
  assert.deepEqual(stored(), before);

  // label identity is case-insensitive, matching teach-mode dedupe
  teachStaticSign("DAD", [{ frames: [samplePose(3)] }]);
  const lower = parseBackup(wrap([{ ...staticSign(), label: "dad" }]));
  assert.ok(lower.ok);
  const again = importBackup(lower.backup);
  assert.deepEqual(again.imported, []);
  assert.deepEqual(again.skippedExisting, ["dad"]);
});

test("import never creates or modifies built-in signs", () => {
  const builtinsBefore = builtinSigns();
  const backup = parseBackup(
    wrap([
      { ...staticSign(), label: "YES" },
      { ...staticSign(), label: "no" },
      { ...staticSign(), label: "FRESH" },
    ])
  );
  assert.ok(backup.ok);
  const report = importBackup(backup.backup);
  assert.deepEqual(report.imported, ["FRESH"]);
  assert.deepEqual(report.skippedExisting, []);
  assert.deepEqual(
    report.rejected.map((r) => r.label),
    ["YES", "no"]
  );
  assert.ok(report.rejected.every((r) => r.reason.includes("built-in")));

  // the built-in set is unchanged and still exactly the shipped three
  assert.deepEqual(builtinSigns(), builtinsBefore);
  assert.deepEqual(
    listSigns()
      .filter((s) => s.builtin)
      .map((s) => s.text)
      .sort(),
    ["I LOVE YOU", "NO", "YES"]
  );
  // storage holds only the user sign, flagged non-builtin
  const raw = stored();
  assert.equal(raw.length, 1);
  assert.equal(raw[0].label, "FRESH");
  assert.equal(raw[0].builtin, false);

  // a tampered sign claiming builtin: true still imports as a user sign
  const evil = parseBackup(
    wrap([{ ...staticSign(), label: "FAKE", builtin: true }])
  );
  assert.ok(evil.ok);
  importBackup(evil.backup);
  const fake = stored().find((s) => s.label === "FAKE");
  assert.ok(fake, "tampered sign not imported");
  assert.equal(fake.builtin, false);
});

test("empty export (no user signs) yields signs: []", () => {
  assert.deepEqual(buildBackup().signs, []);
  assert.deepEqual(JSON.parse(backupToJson()).signs, []);
});

test("buildBackup with no window (SSR) yields an empty backup", () => {
  const saved = globalThis.window;
  delete (globalThis as { window?: Window }).window;
  try {
    assert.deepEqual(buildBackup().signs, []);
  } finally {
    globalThis.window = saved;
  }
});

test("a backup with a duplicate label inside itself imports once", () => {
  const mk = (marker: number) => ({
    label: "TWIN",
    kind: "static",
    prototypes: [[Array.from({ length: 63 }, (_, i) => marker + i * 0.001)]],
  });
  const backup = parseBackup(wrap([mk(0.1), mk(0.9)]));
  assert.ok(backup.ok);
  const report = importBackup(backup.backup);
  assert.deepEqual(report.imported, ["TWIN"]);
  assert.deepEqual(report.skippedExisting, []);
  assert.equal(report.rejected.length, 1);
  assert.match(report.rejected[0].reason, /duplicate/i);
  // exactly one stored sign, and the first occurrence's samples win
  const raw = stored();
  assert.equal(raw.length, 1);
  assert.equal(raw[0].label, "TWIN");
  assert.ok(Math.abs(raw[0].prototypes[0][0][0] - 0.1) < 1e-12);
});
