import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ── Fragment types ────────────────────────────────────────────────────────────
// A fragment is a meaningful unit extracted from any piece of content.
// Types mirror how humans actually absorb writing — not whole articles,
// but the hook that stuck, the metaphor that landed, the local detail.

export type FragmentType =
  | "hook"            // opening line that creates pull
  | "metaphor"        // unexpected comparison that makes something click
  | "local-ref"       // specific place, landmark, season, cultural moment
  | "tension"         // a problem stated in a way that feels real
  | "resolution"      // how the problem gets solved — the relief beat
  | "voice-beat"      // a sentence that has strong personality/register
  | "data-anchor"     // a stat or number grounding an abstract claim
  | "cta-variant";    // a call to action phrased in a distinctive way

export interface ContentFragment {
  id: string;           // stable hash of source+position
  sourceFile: string;
  text: string;         // the fragment itself
  type: FragmentType;
  brand: string;
  category: string;     // service category or keyword group
  city?: string;
  language: string;
  wordCount: number;
  extractedAt: string;
}

export interface CorpusIndex {
  brand: string;
  fragments: ContentFragment[];
  lastIndexed: string;
  totalSources: number;
}

// ── Fragment extraction ───────────────────────────────────────────────────────
// Splits content into typed fragments using heuristic rules.
// Not perfect — but captures the same rough units a human reader would retain.

export function extractFragments(
  content: string,
  meta: { brand: string; category: string; city?: string; language?: string; sourceFile: string }
): ContentFragment[] {
  const fragments: ContentFragment[] = [];
  const lang = meta.language ?? "en";

  // Split into sentences, preserving paragraph breaks as context
  const sentences = content
    .replace(/^#{1,6}\s+.+$/gm, "")   // strip headings
    .replace(/META:.+/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 400);

  const paras = content.split(/\n\n+/).filter((p) => p.length > 40);

  const makeId = (text: string) =>
    crypto.createHash("md5").update(meta.sourceFile + text).digest("hex").slice(0, 12);

  const add = (text: string, type: FragmentType) => {
    if (!text.trim()) return;
    fragments.push({
      id: makeId(text),
      sourceFile: meta.sourceFile,
      text: text.trim(),
      type,
      brand: meta.brand,
      category: meta.category,
      city: meta.city,
      language: lang,
      wordCount: text.split(/\s+/).length,
      extractedAt: new Date().toISOString(),
    });
  };

  // First sentence of any paragraph = candidate hook
  for (const para of paras.slice(0, 3)) {
    const first = para.split(/(?<=[.!?।])\s+/)[0];
    if (first && first.length > 15 && first.length < 150) add(first, "hook");
  }

  for (const s of sentences) {
    // Metaphor: "like", "as if", "imagine", simile patterns
    if (/\blike\b|\bas if\b|\bimagine\b|\bjust like\b|—\s*\w/i.test(s)) {
      add(s, "metaphor");
    }
    // Local reference: city names, Kerala landmarks, cultural moments
    else if (/(Kochi|Thiruvananthapuram|Kozhikode|Thrissur|Kerala|Onam|Vishu|monsoon|autorickshaw|chai|achan|amma|nalla|swalpa|yaar|bhai)/i.test(s)) {
      add(s, "local-ref");
    }
    // Tension: problem framing
    else if (/\bwhen\b.*(break|fail|leak|stuck|wait|late|wrong|bad|worst|tired|frustrated)/i.test(s)
          || /\bstill\b|\bhaven't\b|\bno one\b|\bnobody\b|\balways\b.*(same|problem)/i.test(s)) {
      add(s, "tension");
    }
    // Resolution: solution beat
    else if (/(within|minutes|same.?day|instantly|fixed|sorted|done|relief|finally|peace)/i.test(s)) {
      add(s, "resolution");
    }
    // Data anchor: numbers
    else if (/\b\d+[\s%+]/.test(s) && s.length < 200) {
      add(s, "data-anchor");
    }
    // CTA variant: action-oriented endings
    else if (/(book|call|visit|try|get|start|join|download|sign up|order).{0,40}(now|today|here|free|quick)/i.test(s)) {
      add(s, "cta-variant");
    }
    // Voice beat: short punchy sentences with personality
    else if (s.length < 80 && /[!?]$/.test(s)) {
      add(s, "voice-beat");
    }
  }

  return fragments;
}

// ── Corpus indexer ────────────────────────────────────────────────────────────
// Scans all review-queue + output files for a brand and indexes fragments.

export function indexCorpus(brandSlug: string): CorpusIndex {
  const brandDir = path.join(process.cwd(), "brands", brandSlug);
  const brand = JSON.parse(
    fs.readFileSync(path.join(brandDir, "brand.json"), "utf8")
  );

  const searchDirs = [
    path.join(brandDir, "output"),
    path.join(brandDir, "output", "review-queue"),
  ];

  const fragments: ContentFragment[] = [];
  let totalSources = 0;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, "utf8");

      // Extract meta from frontmatter if present
      const keyword = raw.match(/keyword: "(.+)"/)?.[1] ?? "";
      const city = raw.match(/city: (.+)/)?.[1]?.trim();
      const category = raw.match(/serviceCategory: (.+)/)?.[1]?.trim()
        ?? brand.keywordGroups?.find((g: any) =>
            g.keywords.some((k: string) => keyword.toLowerCase().includes(k.toLowerCase()))
          )?.group ?? "general";

      const content = raw.replace(/^---[\s\S]+?---/, "").trim();
      const frags = extractFragments(content, {
        brand: brandSlug,
        category,
        city,
        sourceFile: filePath,
      });

      fragments.push(...frags);
      totalSources++;
    }
  }

  const index: CorpusIndex = {
    brand: brandSlug,
    fragments,
    lastIndexed: new Date().toISOString(),
    totalSources,
  };

  // Persist index
  const indexPath = path.join(brandDir, "logs", "corpus-index.json");
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

  return index;
}

export function loadCorpus(brandSlug: string): CorpusIndex | null {
  const indexPath = path.join(process.cwd(), "brands", brandSlug, "logs", "corpus-index.json");
  if (!fs.existsSync(indexPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch { return null; }
}

// ── Cross-brand corpus ────────────────────────────────────────────────────────
// Merges all brand corpora — enables cross-brand fragment influence.
// Lower weight given to fragments from different brand type (restaurant vs saas).

export function loadAllCorpora(): ContentFragment[] {
  const brandsDir = path.join(process.cwd(), "brands");
  if (!fs.existsSync(brandsDir)) return [];

  const allFragments: ContentFragment[] = [];
  for (const slug of fs.readdirSync(brandsDir)) {
    const corpus = loadCorpus(slug);
    if (corpus) allFragments.push(...corpus.fragments);
  }
  return allFragments;
}
