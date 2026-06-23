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

  // ── Literary influence ──────────────────────────────────────────────────────
  // Draw on a specific author's narrative sensibility — not to copy or quote,
  // but to absorb their texture: sentence rhythm, emotional register, world-view.
  // This applies regardless of output language — if writing in Malayalam, absorb
  // the sensibility and EXPRESS IT in natural Malayalam, not in translation.
  literaryInfluence: [
    // Kerala / Malayalam literature — for writing in any language about Kerala
    "Vaikom Muhammad Basheer — radical intimacy, ordinary people with extraordinary inner lives, humour that aches",
    "MT Vasudevan Nair — sparse and devastating, memory as structure, what is left unsaid destroys you",
    "OV Vijayan — surreal and politically raw, language used as a blade, absurdism as the only honest response to history",
    "Kamala Das — confessional, unapologetically interior, the body and the home as political territories",
    "Thakazhi Sivasankara Pillai — labour, backwaters, the dignity of working Kerala, community memory in mud and water",
    "Paul Zacharia — sharp satirical wit, absurdist social commentary, language that makes the familiar strange",
    "Sarah Joseph — feminist, rhythmic, the village and the woman as mirrors of each other",
    // Indian literature — warmth, small-town life, the ordinary made rich
    "R.K. Narayan — gentle, unhurried, finds comedy and dignity in everyday Indian life",
    "Ruskin Bond — nostalgic, sensory, writes as if memory itself has a smell",
    "Premchand — social realism, working-class dignity, plain truth told plainly",
    "Manto — raw, uncomfortable honesty, no sentiment wasted, cuts straight to the nerve",
    // Global literature — diverse rhythms
    "Hemingway — sparse, declarative, the iceberg theory: what's unsaid carries the weight",
    "Chekhov — quietly devastating, character over plot, nothing resolved, everything felt",
    "Maya Angelou — empowering, rhythmic, the personal is universal, joy hard-earned",
    "Gabriel García Márquez — magical realism, the mundane and the miraculous at the same temperature",
    "Toni Morrison — rich, layered, language that holds community memory inside it",
    "Terry Pratchett — footnote humour, absurdist logic that somehow explains everything",
    "David Sedaris — self-deprecating, confessional, funny in a way that makes you wince",
  ],

  // ── Language register ───────────────────────────────────────────────────────
  // Controls vocabulary, syntax informality, cultural coding, and generation voice.
  languageRegister: [
    // Formal end
    "standard formal prose — complete sentences, measured vocabulary, no contractions",
    "professional warm — polished but approachable, like a knowledgeable friend who happens to be an expert",
    // Middle ground
    "everyday conversational — contractions fine, short sentences, feels like spoken word on paper",
    "Manglish natural — English prose woven with Malayalam words that fit organically (nalla, swalpa, alle, ente, sheriyanu, ithu kollam), never transliterated awkwardly; reads like how educated Keralites actually talk",
    "Hinglish natural — English prose with occasional Hindi words that fit naturally (accha, yaar, sahi hai, bilkul), never forced",
    // Informal / generational
    "millennial self-aware — slightly ironic, parenthetical asides, comfortable with cultural references",
    "Gen Z register — lowercase acceptable, short punchy sentences, 'ngl', 'fr', 'no cap', ellipsis for effect... uses line breaks as punctuation",
    // Full Malayalam
    "pure Malayalam — write entirely in Malayalam script; clear, modern, colloquial; not archaic Granthavari; the way a thoughtful young Keralite would write a WhatsApp message that actually sounds educated",
  ],

  // ── Experience and emotional texture ───────────────────────────────────────
  // The felt quality of reading the piece — the emotional after-taste.
  experienceTone: [
    "awed and wonder-filled — written as if the subject genuinely amazes the writer, small things feel significant",
    "subtle and understated — says less than it means, trusts the reader to feel the weight, no exclamation marks",
    "cheesy and unashamedly fun — puns welcome, exclamation marks earned, warmth dialled up, reader should smile",
    "earnest and sincere — no irony, no distance, means every word, vulnerable in the good way",
    "playfully irreverent — gently pokes fun at the category, a little cheeky, reader feels in on the joke",
  ],

  // ── Annotation and typographic personality ──────────────────────────────────
  // How the writer uses the page: punctuation as personality, rhythm through formatting.
  annotationStyle: [
    "clean flowing prose — no special punctuation, paragraphs breathe, traditional essay feel",
    "em-dash interruptions — uses — this — to break rhythm, creates spontaneous asides mid-sentence",
    "parenthetical whispers — frequent (and sometimes lengthy) parenthetical asides, like a second voice in brackets",
    "emoji as light punctuation — 1–3 emojis per section used functionally not decoratively, like a modern street sign",
    "ellipsis pacing — uses... to create pause, let ideas land, trail off deliberately... then return",
    "asterisk and *emphasis* — *italics-style* emphasis via asterisks, occasional ALL CAPS for a beat, visual texture in the prose",
  ],

  // ── Output language ─────────────────────────────────────────────────────────
  // The language the content is WRITTEN IN. All other parameters — literary
  // influence, tone, register, architecture, reference frame — apply fully
  // regardless of language. When writing in Malayalam or Hindi, the instruction
  // is to express those sensibilities in that language natively, never translate.
  outputLanguage: [
    "English — standard Indian English, not British or American; Kerala inflection welcome",
    "Malayalam — write entirely in Malayalam script, modern colloquial, not archaic; express all tone/register/influence instructions natively in Malayalam",
    "Manglish — Malayalam-English code-switch as used by urban Keralites; natural ratio, never forced",
    "Hindi — conversational Indian Hindi; not textbook Hindi; Mumbai/Delhi register fine",
    "English with Malayalam phrases — English primary, Malayalam phrases for emotional beats and local colour",
  ],

  // ── Cultural reference frame ─────────────────────────────────────────────────
  // The external world the content borrows texture from — the lens that reframes
  // a routine service into something the reader immediately relates to.
  // The reference must feel earned and accurate, never crowbarred in.
  referenceFrame: [
    "movie-mirror — open with a specific film scene or character moment that mirrors the reader's situation exactly; bridge from screen to real life before the product appears",
    "political-lens — frame around a civic gap, policy promise vs ground reality, or rights the reader should have; position the product as filling what institutions haven't",
    "empathy-first — lead entirely from inside the reader's emotional state; name the frustration, the waiting, the uncertainty, before offering anything; solution arrives like relief not pitch",
    "helper-view — tell the story from the service provider's side — their morning, their skill, their pride, their livelihood; trust builds through the provider's humanity",
    "job-and-livelihood — anchor the service in economic reality: income, employment, dignity of skilled work, the local economy; the product is an engine for livelihoods not just convenience",
    "technology-reveal — contrast the old way (slow, opaque, unreliable) with the technology-enabled new way; let the tech be the quiet protagonist, never the salesperson",
    "cultural-moment — tie the content to a Kerala festival, season, or shared social ritual; the service becomes part of how people take care of each other at that time",
    "no-external-frame — pure direct content; no borrowed world; the writing's power comes entirely from precision and clarity",
  ],

  // ── Post architecture ────────────────────────────────────────────────────────
  // The structural skeleton of the piece — how the narrative moves from opening
  // to the reader's first mental image of themselves using the product.
  // Every architecture must plant a "seed idea" — one concrete moment of imagined use.
  postArchitecture: [
    "mirror-pivot — open with the external reference scene in full; let the reader feel it; then pivot with 'That's what it's like when...' and map the analogy to their situation; product enters as the resolution the scene needed",
    "day-in-life — follow one character through their day; show the problem building naturally; the product appears at exactly the breaking point; show the day continuing differently because of it",
    "before-after-bridge — three acts: (1) the reader's world before, rendered in detail; (2) the moment of first use — specific, sensory; (3) what their world looks like after, without overpromising",
    "question-ladder — a series of questions, each escalating in specificity, each implicitly answered by a feature or truth about the product; the ladder ends at the reader imagining themselves inside the product",
    "letter-to-past-self — written from someone who's already used the product, addressing their past self who hasn't yet; warm, specific, honest about the doubt they had before; the seed idea lands in the memory of a solved problem",
    "myth-bust — opens by stating a common belief about this service category that is wrong or limiting; systematically dismantles it; the product emerges as what this category should have always been",
    "ripple-effect — one small action (a booking, a tap, a call) set against the full cascade of things it unlocks in someone's day or week; the seed idea is the feeling of 'I didn't know one tap could do all that'",
    "news-report — deadpan journalistic framing: 'Reports from [city] suggest...'; builds credibility through the form; the product is introduced as a development that residents are finding changes their relationship with [service category]",
  ],
} as const;

export type ParameterKey = keyof typeof CONTENT_PARAMETERS;
export type ContentParams = { [K in ParameterKey]: string };

// ── Index-based combination arithmetic ───────────────────────────────────────
// Never materialises the full combination list in memory.
// Uses mixed-radix decoding: treat any integer index as a "number" where each
// digit position selects one value from one dimension.

const PARAM_KEYS = Object.keys(CONTENT_PARAMETERS) as ParameterKey[];
const PARAM_SIZES = PARAM_KEYS.map((k) => CONTENT_PARAMETERS[k].length);

export function countCombinations(): number {
  return PARAM_SIZES.reduce((acc, n) => acc * n, 1);
}

// Decode a flat index into a ContentParams object — O(dimensions), no allocation
export function nthCombination(index: number): ContentParams {
  const total = countCombinations();
  let n = ((index % total) + total) % total; // handle negatives
  const result: Partial<ContentParams> = {};
  for (let i = PARAM_KEYS.length - 1; i >= 0; i--) {
    const key = PARAM_KEYS[i];
    const size = PARAM_SIZES[i];
    result[key] = CONTENT_PARAMETERS[key][n % size] as string;
    n = Math.floor(n / size);
  }
  return result as ContentParams;
}

// ── Seeded LCG permutation (no array, O(1) per call) ─────────────────────────
// Maps cursor position → shuffled combination index using a full-period LCG.
// LCG: f(x) = (step * x + offset) % total
// Full-period guaranteed when gcd(step, total) = 1.
// We pick step = a prime not in the prime factors of total, verified at runtime.

function seedToInt(seed: string): number {
  return parseInt(crypto.createHash("md5").update(seed).digest("hex").slice(0, 8), 16);
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

// Find a step value coprime with total, seeded for variety across cycles
function findStep(total: number, seed: number): number {
  // Start with a large-ish odd number derived from seed, walk until coprime
  let step = (seed % total) | 1; // ensure odd
  if (step < 3) step = 3;
  while (gcd(step, total) !== 1) step += 2;
  return step;
}

function lcgPermute(cursor: number, step: number, offset: number, total: number): number {
  // LCG step: each cursor maps to a unique index in [0, total)
  return ((cursor * step + offset) % total + total) % total;
}

// ── State ─────────────────────────────────────────────────────────────────────

interface ParamState {
  cursor: number;
  cycle: number;
  step: number;
  offset: number;
  totalCombinations: number;
}

function stateFilePath(brandSlug: string, contentType: string): string {
  return path.join(process.cwd(), "brands", brandSlug, "logs", `param-state-${contentType}.json`);
}

function loadState(brandSlug: string, contentType: string): ParamState {
  const total = countCombinations();
  const file = stateFilePath(brandSlug, contentType);

  if (fs.existsSync(file)) {
    try {
      const s = JSON.parse(fs.readFileSync(file, "utf8")) as ParamState;
      if (s.totalCombinations === total) return s;
      // Matrix changed (new params added) — reset
    } catch {}
  }

  const seed = seedToInt(`${brandSlug}:${contentType}:0`);
  return {
    cursor: 0,
    cycle: 0,
    step: findStep(total, seed),
    offset: seed % total,
    totalCombinations: total,
  };
}

function saveState(brandSlug: string, contentType: string, state: ParamState): void {
  const file = stateFilePath(brandSlug, contentType);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

// ── Public API ────────────────────────────────────────────────────────────────

export function nextParams(
  brandSlug: string,
  contentType: string
): ContentParams & { _meta: { index: number; cycle: number; totalCombinations: number } } {
  const state = loadState(brandSlug, contentType);

  // New cycle when we've exhausted all combinations
  if (state.cursor >= state.totalCombinations) {
    const newCycle = state.cycle + 1;
    const seed = seedToInt(`${brandSlug}:${contentType}:${newCycle}`);
    state.cursor = 0;
    state.cycle = newCycle;
    state.step = findStep(state.totalCombinations, seed);
    state.offset = seed % state.totalCombinations;
  }

  const idx = lcgPermute(state.cursor, state.step, state.offset, state.totalCombinations);
  const params = nthCombination(idx);
  const cycle = state.cycle;
  state.cursor += 1;
  saveState(brandSlug, contentType, state);

  return { ...params, _meta: { index: idx, cycle, totalCombinations: state.totalCombinations } };
}

export function previewNextParams(brandSlug: string, contentType: string, n = 5): ContentParams[] {
  const state = loadState(brandSlug, contentType);
  const results: ContentParams[] = [];
  let cursor = state.cursor;

  for (let i = 0; i < n; i++) {
    const wrappedCursor = cursor % state.totalCombinations;
    const idx = lcgPermute(wrappedCursor, state.step, state.offset, state.totalCombinations);
    results.push(nthCombination(idx));
    cursor++;
  }
  return results;
}

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
