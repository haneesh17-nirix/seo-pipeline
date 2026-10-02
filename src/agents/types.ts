/**
 * Contracts for the content agent chain.
 *
 * Generation was a single call: keyword in, finished script out, written
 * straight to disk. That gives no place to insert judgement, so the only
 * quality lever was the model itself. These types split the work into stages
 * with an explicit artefact between each, so a critic can reject a draft
 * without regenerating the strategy, and a localiser can work from an approved
 * English script rather than inventing its own.
 */

export interface BrandContext {
  name: string;
  slug: string;
  siteUrl: string;
  tagline?: string;
  description?: string;
  /** Cities and localities used to keep local references concrete. */
  places: string[];
  serviceCategories: string[];
}

export interface Brief {
  keyword: string;
  format: 'short' | 'reel' | 'ad-15s' | 'ad-30s' | 'explainer-60s';
  targetDuration: number;
  location?: string;
  language: 'English' | 'Malayalam' | 'Manglish' | 'Hindi';
}

/** Stage 1 — what the piece is actually about, before any copy exists. */
export interface Angle {
  /** The reader's situation in one sentence, in their terms not the brand's. */
  audienceState: string;
  /** The non-obvious observation the piece turns on. */
  insight: string;
  /** The single claim the piece makes. Not a list. */
  promise: string;
  /** Why someone hesitates — the objection the piece must clear. */
  objection: string;
  /** Concrete local detail to ground it. */
  localAnchor: string;
}

export interface Scene {
  durationSeconds: number;
  visualPrompt: string;
  voiceover: string;
  caption: string;
  transition: string;
}

export interface Script {
  title: string;
  hook: string;
  scenes: Scene[];
  music: string;
  cta: string;
  hashtags: string[];
}

/** Stage 3 — the critic's verdict. Scores are 1–5. */
export interface Critique {
  scores: {
    hookStrength: number;
    specificity: number;
    singleIdea: number;
    localTruth: number;
    ctaClarity: number;
    register: number;
  };
  /** Concrete, actionable notes — not "make it better". */
  notes: string[];
  verdict: 'accept' | 'revise';
}

/** Stage 5 — what a production team or a render API needs. */
export interface ShotList {
  shots: Array<{
    scene: number;
    seconds: number;
    shotType: string;
    subject: string;
    action: string;
    /** Prompt suitable for an image or video model. */
    renderPrompt: string;
  }>;
  voiceDirection: string;
  musicDirection: string;
}

export interface PipelineResult {
  brief: Brief;
  angle: Angle;
  script: Script;
  critiques: Critique[];
  shotList?: ShotList;
  /** Rounds the critic sent it back. */
  revisions: number;
  /** Validator outcome after deterministic repair. */
  passed: boolean;
  errors: string[];
  warnings: string[];
  elapsedMs: number;
}

/** Floors the critic must clear before a script is accepted. */
export const SCORE_FLOORS: Record<keyof Critique['scores'], number> = {
  hookStrength: 4,
  specificity: 4,
  singleIdea: 4,
  localTruth: 3,
  ctaClarity: 4,
  register: 3,
};

export function meetsFloors(c: Critique): boolean {
  return (Object.keys(SCORE_FLOORS) as Array<keyof Critique['scores']>).every(
    (k) => (c.scores?.[k] ?? 0) >= SCORE_FLOORS[k],
  );
}
