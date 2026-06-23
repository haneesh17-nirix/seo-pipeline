import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { ContentFragment, FragmentType, loadCorpus, loadAllCorpora, indexCorpus } from "./corpus";

// ── Locality tiers ────────────────────────────────────────────────────────────
// Mirrors how human creativity actually works — most influenced by the near,
// some influence from the adjacent, rare sparks from the distant.

const LOCALITY_WEIGHTS = {
  same_city_same_category:      0.38,  // strongest pull — neighbour writing same thing
  same_city_diff_category:      0.22,  // same place, different context
  diff_city_same_category:      0.20,  // same topic, different place — useful contrast
  diff_city_diff_category:      0.10,  // adjacent but distant
  cross_brand:                  0.07,  // different brand entirely — wildcard spark
  random_wildcard:              0.03,  // pure noise — the unexpected association
};

// ── Selection state tracking ──────────────────────────────────────────────────
// Tracks which fragment combinations have been used.
// Key = sorted hash of all selected fragment IDs.
// Uses the same LCG pattern as parameters.ts — no array materialised.

interface SelectionState {
  usedKeys: string[];       // hashes of past selections (capped at 100k)
  cursor: number;
  seed: number;
}

function selectionStatePath(brandSlug: string): string {
  return path.join(process.cwd(), "brands", brandSlug, "logs", "synthesis-state.json");
}

function loadSelectionState(brandSlug: string): SelectionState {
  const f = selectionStatePath(brandSlug);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  }
  return {
    usedKeys: [],
    cursor: 0,
    seed: parseInt(
      crypto.createHash("md5").update(brandSlug).digest("hex").slice(0, 8), 16
    ),
  };
}

function saveSelectionState(brandSlug: string, state: SelectionState): void {
  // Cap usedKeys at 100k to bound file size — oldest drop off
  if (state.usedKeys.length > 100_000) {
    state.usedKeys = state.usedKeys.slice(-80_000);
  }
  fs.mkdirSync(path.dirname(selectionStatePath(brandSlug)), { recursive: true });
  fs.writeFileSync(selectionStatePath(brandSlug), JSON.stringify(state, null, 2), "utf8");
}

function selectionKey(fragmentIds: string[]): string {
  return crypto.createHash("md5")
    .update([...fragmentIds].sort().join("|"))
    .digest("hex")
    .slice(0, 16);
}

// ── Seeded weighted random ────────────────────────────────────────────────────
// Deterministic but varied — same seed → same sequence, different seeds → different.

class SeededRng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = Math.imul(this.s ^ (this.s >>> 15), this.s | 1);
    this.s ^= this.s + Math.imul(this.s ^ (this.s >>> 7), this.s | 61);
    return ((this.s ^ (this.s >>> 14)) >>> 0) / 4294967296;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Weighted pick: items = [{item, weight}]
  weighted<T>(items: { item: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = this.next() * total;
    for (const { item, weight } of items) {
      r -= weight;
      if (r <= 0) return item;
    }
    return items[items.length - 1].item;
  }

  // Pick N unique items from array
  sample<T>(arr: T[], n: number): T[] {
    const pool = [...arr];
    const result: T[] = [];
    n = Math.min(n, pool.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(this.next() * (pool.length - i));
      result.push(pool[idx]);
      [pool[idx], pool[pool.length - i - 1]] = [pool[pool.length - i - 1], pool[idx]];
    }
    return result;
  }
}

// ── Fragment selection ────────────────────────────────────────────────────────

export interface FragmentSelection {
  fragments: ContentFragment[];
  selectionKey: string;
  localityProfile: Record<string, number>; // how many from each tier
  seed: number;
}

export function selectFragments(
  opts: {
    brandSlug: string;
    targetCategory: string;
    targetCity?: string;
    fragmentCount?: number;    // total fragments to pick (default 7)
    fragmentTypes?: FragmentType[]; // which types to include
  }
): FragmentSelection | null {
  const {
    brandSlug,
    targetCategory,
    targetCity,
    fragmentCount = 7,
    fragmentTypes = ["hook", "local-ref", "tension", "resolution", "metaphor", "voice-beat", "cta-variant"],
  } = opts;

  // Load corpus — index first if stale/missing
  let corpus = loadCorpus(brandSlug);
  if (!corpus || corpus.totalSources === 0) {
    try { corpus = indexCorpus(brandSlug); } catch { return null; }
  }

  const allFragments = corpus.fragments.length > 0
    ? corpus.fragments
    : loadAllCorpora(); // fall back to cross-brand if brand corpus empty

  if (allFragments.length < 3) return null;

  // Filter to requested types
  const byType = (type: FragmentType) =>
    allFragments.filter((f) => f.type === type);

  const state = loadSelectionState(brandSlug);
  const rng = new SeededRng(state.seed + state.cursor);

  // Build locality-tiered pools
  const pools = {
    same_city_same_category: allFragments.filter(
      (f) => f.city === targetCity && f.category === targetCategory
    ),
    same_city_diff_category: allFragments.filter(
      (f) => f.city === targetCity && f.category !== targetCategory
    ),
    diff_city_same_category: allFragments.filter(
      (f) => f.city !== targetCity && f.category === targetCategory
    ),
    diff_city_diff_category: allFragments.filter(
      (f) => f.city !== targetCity && f.category !== targetCategory && f.brand === brandSlug
    ),
    cross_brand: allFragments.filter((f) => f.brand !== brandSlug),
    random_wildcard: allFragments,
  };

  const selected: ContentFragment[] = [];
  const localityProfile: Record<string, number> = {};
  const usedIds = new Set<string>();

  // Ensure at least one of each requested type
  for (const type of fragmentTypes) {
    const typePool = byType(type).filter((f) => !usedIds.has(f.id));
    if (!typePool.length) continue;

    // Pick which locality tier this fragment comes from
    const tierEntries = Object.entries(LOCALITY_WEIGHTS).map(([tier, weight]) => ({
      item: tier as keyof typeof pools,
      weight,
    }));
    const tier = rng.weighted(tierEntries);
    const tierPool = pools[tier].filter((f) => f.type === type && !usedIds.has(f.id));
    const pool = tierPool.length > 0 ? tierPool : typePool;

    const fragment = rng.pick(pool);
    selected.push(fragment);
    usedIds.add(fragment.id);
    localityProfile[tier] = (localityProfile[tier] ?? 0) + 1;
  }

  // Fill remaining slots weighted by locality
  const remaining = fragmentCount - selected.length;
  for (let i = 0; i < remaining; i++) {
    const tierEntries = Object.entries(LOCALITY_WEIGHTS).map(([tier, weight]) => ({
      item: tier as keyof typeof pools,
      weight,
    }));
    const tier = rng.weighted(tierEntries);
    const tierPool = pools[tier].filter((f) => !usedIds.has(f.id));
    if (!tierPool.length) continue;

    const fragment = rng.pick(tierPool);
    selected.push(fragment);
    usedIds.add(fragment.id);
    localityProfile[tier] = (localityProfile[tier] ?? 0) + 1;
  }

  if (!selected.length) return null;

  const key = selectionKey(selected.map((f) => f.id));

  // Check for repeat — advance cursor and retry once if seen before
  if (state.usedKeys.includes(key)) {
    state.cursor += 1;
    state.seed = parseInt(
      crypto.createHash("md5")
        .update(`${brandSlug}:${state.cursor}:${Date.now()}`)
        .digest("hex").slice(0, 8), 16
    );
    saveSelectionState(brandSlug, state);
    // Recursive retry with new seed (max 1 retry to avoid infinite loop)
    return selectFragments(opts);
  }

  // Record this selection
  state.usedKeys.push(key);
  state.cursor += 1;
  saveSelectionState(brandSlug, state);

  return { fragments: selected, selectionKey: key, localityProfile, seed: rng.next() };
}

// ── Synthesis prompt builder ──────────────────────────────────────────────────
// Constructs a prompt that presents fragments as inspiration — not source material.
// The model should absorb their spirit, not copy their words.

export function buildSynthesisPrompt(
  selection: FragmentSelection,
  opts: {
    brand: string;
    siteUrl: string;
    targetKeyword: string;
    contentType: string;
    params: Record<string, string>;
    city?: string;
    serviceCategory?: string;
  }
): string {
  const { fragments, localityProfile } = selection;

  const byType = (type: FragmentType) =>
    fragments.filter((f) => f.type === type).map((f) => `  • "${f.text}"`).join("\n");

  const localityNote = Object.entries(localityProfile)
    .sort((a, b) => b[1] - a[1])
    .map(([tier, n]) => `${n} from ${tier.replace(/_/g, " ")}`)
    .join(", ");

  return `
You are a writer for "${opts.brand}" (${opts.siteUrl}).
You are about to write a ${opts.contentType} for the keyword: "${opts.targetKeyword}"
${opts.city ? `Location context: ${opts.city}, Kerala, India` : ""}
${opts.serviceCategory ? `Service: ${opts.serviceCategory}` : ""}

━━━ WRITING PARAMETERS ━━━
Tone: ${opts.params.tone ?? "conversational"}
Structure: ${opts.params.structure ?? "problem → solution"}
Hook style: ${opts.params.hook ?? "relatable question"}
Length: ${opts.params.length ?? "standard (850–1000 words)"}
Literary influence: ${opts.params.literaryInfluence?.split("—")[0].trim() ?? "natural"}
Language register: ${opts.params.languageRegister?.split("—")[0].trim() ?? "conversational"}
Experience tone: ${opts.params.experienceTone?.split("—")[0].trim() ?? "earnest"}
Annotation style: ${opts.params.annotationStyle?.split("—")[0].trim() ?? "clean prose"}

━━━ INSPIRATION FRAGMENTS ━━━
These are fragments drawn from real content (${localityNote}).
They are NOT source text to copy or paraphrase. They are sparks —
read them the way a writer reads before sitting down to write:
absorb the feeling, the rhythm, the local texture, then close them
and write something entirely your own.

${byType("hook").length    ? `HOOKS (how others opened):\n${byType("hook")}\n`       : ""}
${byType("tension").length ? `TENSION (problems that felt real):\n${byType("tension")}\n` : ""}
${byType("local-ref").length ? `LOCAL TEXTURE (place, season, culture):\n${byType("local-ref")}\n` : ""}
${byType("metaphor").length  ? `METAPHORS (unexpected comparisons):\n${byType("metaphor")}\n`   : ""}
${byType("resolution").length ? `RESOLUTION BEATS (relief, solution):\n${byType("resolution")}\n` : ""}
${byType("voice-beat").length ? `VOICE (personality, register):\n${byType("voice-beat")}\n`    : ""}
${byType("cta-variant").length ? `CALLS TO ACTION (how others ended):\n${byType("cta-variant")}\n` : ""}

━━━ THE RULE ━━━
If any sentence in your output resembles a fragment above by more than
coincidence, rewrite it. The goal is influence, not repetition.
The fragments should shape the FEELING of what you write, not its WORDS.

Now write the ${opts.contentType}.
`.trim();
}

// ── Synthesis stats ───────────────────────────────────────────────────────────

export function synthesisStats(brandSlug: string): {
  uniqueSelectionsUsed: number;
  corpusSize: number;
  possibleCombinations: string;
} {
  const state = loadSelectionState(brandSlug);
  const corpus = loadCorpus(brandSlug);
  const n = corpus?.fragments.length ?? 0;
  const k = 7; // fragment count

  // Combinations = C(n, k) — approximate for large n
  let combos = BigInt(1);
  for (let i = 0; i < k; i++) {
    combos = combos * BigInt(n - i) / BigInt(i + 1);
  }

  return {
    uniqueSelectionsUsed: state.usedKeys.length,
    corpusSize: n,
    possibleCombinations: combos > BigInt(1e15)
      ? `>${Math.round(Number(combos) / 1e12)}T`
      : combos.toLocaleString(),
  };
}
