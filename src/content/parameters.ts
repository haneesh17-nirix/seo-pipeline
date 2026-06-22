import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ── Parameter matrix ─────────────────────────────────────────────────────────
// Every dimension that can vary across a content run.
// New values can be added to any array — the combination space expands automatically.

export const CONTENT_PARAMETERS = {
  tone: [
    "conversational and warm",
    "authoritative and confident",
    "empathetic and supportive",
    "direct and no-nonsense",
    "storytelling and narrative",
  ],
  perspective: [
    "brand speaking to the customer",
    "a satisfied customer sharing their experience",
    "an independent expert advisor",
    "a community member recommending a neighbour",
  ],
  structure: [
    "how-to guide with numbered steps",
    "problem → cause → solution narrative",
    "listicle with bolded takeaways",
    "mini case study with before/after",
    "Q&A format addressing common doubts",
    "comparison of DIY vs professional service",
  ],
  hook: [
    "open with a surprising statistic or data point",
    "open with a relatable question the reader is already asking",
    "open with a vivid pain point scenario",
    "open with a short story or anecdote",
    "open with a bold, slightly controversial claim",
  ],
  ctaStyle: [
    "soft — invite them to learn more or explore",
    "direct — clear action with benefit stated",
    "urgency — limited availability or time-sensitive framing",
    "social proof — reference other customers who already booked",
  ],
  localDepth: [
    "city-level references and landmarks",
    "neighbourhood or locality-level specifics",
    "seasonal context (monsoon, summer, festival season)",
    "local event or cultural moment tie-in",
  ],
  length: [
    "concise (550–650 words)",
    "standard (850–1000 words)",
    "in-depth (1100–1300 words)",
  ],
  evidence: [
    "anchor claims with industry statistics or research",
    "use customer testimonial-style quotes (clearly labelled as illustrative)",
    "use concrete before/after examples",
    "reference expert or tradesperson perspective",
  ],
} as const;

export type ParameterKey = keyof typeof CONTENT_PARAMETERS;
export type ContentParams = { [K in ParameterKey]: string };

// ── Combination tracking ──────────────────────────────────────────────────────
// Stores used combinations per brand+contentType in a JSON state file.
// Uses a Fisher-Yates shuffle seeded per brand so the sequence is consistent
// across machines (same brand always gets same shuffled order).

function stateFilePath(brandSlug: string, contentType: string): string {
  return path.join(
    process.cwd(),
    "brands",
    brandSlug,
    "logs",
    `param-state-${contentType}.json`
  );
}

interface ParamState {
  queue: number[];   // indices into the flat combination list, pre-shuffled
  cursor: number;    // next index to use
  totalCombinations: number;
}

function buildAllCombinations(): ContentParams[] {
  const keys = Object.keys(CONTENT_PARAMETERS) as ParameterKey[];
  const values = keys.map((k) => [...CONTENT_PARAMETERS[k]]);

  function recurse(idx: number, current: Partial<ContentParams>): ContentParams[] {
    if (idx === keys.length) return [current as ContentParams];
    return values[idx].flatMap((v) =>
      recurse(idx + 1, { ...current, [keys[idx]]: v })
    );
  }
  return recurse(0, {});
}

// Deterministic shuffle using brand slug as seed (mulberry32)
function seededShuffle(arr: number[], seed: string): number[] {
  const result = [...arr];
  let s = parseInt(crypto.createHash("md5").update(seed).digest("hex").slice(0, 8), 16);
  const rand = () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function loadState(brandSlug: string, contentType: string): ParamState {
  const file = stateFilePath(brandSlug, contentType);
  const allCombos = buildAllCombinations();
  const total = allCombos.length;

  if (fs.existsSync(file)) {
    try {
      const s = JSON.parse(fs.readFileSync(file, "utf8")) as ParamState;
      if (s.totalCombinations === total) return s;
      // Parameter matrix changed — reset
    } catch {}
  }

  // Fresh state: build shuffled queue seeded by brand+contentType
  const queue = seededShuffle(
    Array.from({ length: total }, (_, i) => i),
    `${brandSlug}:${contentType}`
  );
  return { queue, cursor: 0, totalCombinations: total };
}

function saveState(brandSlug: string, contentType: string, state: ParamState): void {
  const file = stateFilePath(brandSlug, contentType);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the next unique parameter combination for this brand + content type.
 * Advances the cursor and saves state. When all combinations are exhausted,
 * re-shuffles (different seed) and starts a new cycle.
 */
export function nextParams(brandSlug: string, contentType: string): ContentParams & { _meta: { index: number; cycle: number; totalCombinations: number } } {
  const allCombos = buildAllCombinations();
  const state = loadState(brandSlug, contentType);

  // End of queue → new cycle with re-shuffle
  if (state.cursor >= state.queue.length) {
    const cycleNum = Math.floor(state.cursor / state.totalCombinations) + 1;
    state.queue = seededShuffle(
      Array.from({ length: state.totalCombinations }, (_, i) => i),
      `${brandSlug}:${contentType}:cycle${cycleNum}`
    );
    state.cursor = 0;
  }

  const idx = state.queue[state.cursor];
  const params = allCombos[idx];
  const cycle = Math.floor(state.cursor / state.totalCombinations);
  state.cursor += 1;
  saveState(brandSlug, contentType, state);

  return { ...params, _meta: { index: idx, cycle, totalCombinations: state.totalCombinations } };
}

/**
 * Preview the next N parameter sets without advancing the cursor.
 */
export function previewNextParams(brandSlug: string, contentType: string, n = 5): ContentParams[] {
  const allCombos = buildAllCombinations();
  const state = loadState(brandSlug, contentType);
  const results: ContentParams[] = [];
  let cursor = state.cursor;

  for (let i = 0; i < n; i++) {
    if (cursor >= state.queue.length) cursor = 0;
    results.push(allCombos[state.queue[cursor]]);
    cursor++;
  }
  return results;
}

/**
 * Returns stats about how many combinations exist and how many have been used.
 */
export function paramStats(brandSlug: string, contentType: string): {
  total: number;
  used: number;
  remaining: number;
  percentComplete: number;
} {
  const state = loadState(brandSlug, contentType);
  const used = state.cursor % state.totalCombinations;
  return {
    total: state.totalCombinations,
    used,
    remaining: state.totalCombinations - used,
    percentComplete: Math.round((used / state.totalCombinations) * 100),
  };
}
