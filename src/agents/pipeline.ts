import { strategist, scriptwriter, critic, localiser, producer } from './agents';
import { meetsFloors, type Brief, type BrandContext, type Critique, type PipelineResult, type Script } from './types';
import { validateScript, repairDurations, repairHook } from '../video/validate';

/**
 * Orchestration.
 *
 * Two gates sit between the model and the disk, and they do different jobs:
 *
 *   The CRITIC judges whether the writing is any good. It is a model, so it is
 *   fallible and bounded — two rounds, then escalate. An unbounded critic loop
 *   is how generation cost runs away, and a third round usually regresses
 *   toward whatever mean the critic is measuring against.
 *
 *   The VALIDATOR checks what is mechanically decidable: durations, emptiness,
 *   spelling, hashtags. It is not a model and it does not have opinions. It is
 *   the gate that must never be skipped, because it is the one that is always
 *   right.
 *
 * Durations are repaired rather than rejected. Asking a model to make integers
 * sum to a target is arithmetic planning: llama3.2:3b returned 45s and
 * qwen2.5:7b returned 15s against the same 59s target, both having been told
 * the requirement in capitals. The model sets relative pacing; the exact
 * seconds are assigned in code.
 */

export interface PipelineOptions {
  maxRevisions?: number;
  /** Skip the producer stage when only the script is wanted. */
  withShotList?: boolean;
  onProgress?: (stage: string, detail?: string) => void;
}

export async function runPipeline(
  brief: Brief,
  brand: BrandContext,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const maxRevisions = opts.maxRevisions ?? 2;
  const say = opts.onProgress ?? (() => {});
  const started = Date.now();

  say('strategist', 'finding the angle');
  const angle = await strategist(brief, brand);
  say('strategist', angle.insight.slice(0, 70));

  const critiques: Critique[] = [];
  let notes: string[] = [];
  let script: Script | null = null;
  let revisions = 0;

  for (let round = 0; round <= maxRevisions; round++) {
    say('scriptwriter', round === 0 ? 'drafting' : `revision ${round}`);
    script = await scriptwriter(brief, brand, angle, notes);

    say('critic', 'scoring');
    const c = await critic(brief, brand, angle, script);
    critiques.push(c);

    const scoreLine = Object.entries(c.scores ?? {})
      .map(([k, v]) => `${k[0]}${v}`)
      .join(' ');
    say('critic', `${c.verdict} · ${scoreLine}`);

    if (c.verdict === 'accept' && meetsFloors(c)) break;

    // The critic can say "accept" while scoring below the floors; the floors win.
    notes = (c.notes ?? []).slice(0, 5);
    revisions = round + 1;

    if (round === maxRevisions) {
      say('critic', `still below floors after ${maxRevisions} revisions — escalating`);
    }
  }

  if (!script) throw new Error('Scriptwriter produced nothing');

  // Deterministic repair, then the gate. Both repairs fix things the model
  // cannot reliably do itself: sum integers to a target, and keep two fields
  // in sync.
  script = repairHook({
    ...script,
    scenes: repairDurations(script.scenes ?? [], brief.targetDuration),
  }) as Script;

  if (brief.language !== 'English') {
    say('localiser', brief.language);
    const localised = await localiser(script, brand, brief.language);
    // Durations are re-pinned: a localiser that changed them would silently
    // undo the repair above.
    script = {
      ...localised,
      scenes: repairDurations(localised.scenes ?? script.scenes, brief.targetDuration),
    };
  }

  say('validator', 'checking');
  const result = validateScript(script, {
    targetDuration: brief.targetDuration,
    brandName: brand.name,
    siteUrl: brand.siteUrl,
  });
  say('validator', result.ok ? 'passed' : `${result.errors.length} error(s)`);

  let shotList;
  if (opts.withShotList && result.ok) {
    say('producer', 'shot list');
    shotList = await producer(script, brand);
  }

  return {
    brief,
    angle,
    script,
    critiques,
    shotList,
    revisions,
    passed: result.ok,
    errors: result.errors.map((e) => `${e.code}: ${e.message}`),
    warnings: result.warnings.map((w) => `${w.code}: ${w.message}`),
    elapsedMs: Date.now() - started,
  };
}

/** Builds the brand context the agents need from a brand.json document. */
export function brandContextFrom(raw: Record<string, any>): BrandContext {
  const places: string[] = [];
  for (const loc of raw.locations ?? []) {
    if (loc?.city) places.push(loc.city);
    for (const l of loc?.localities ?? []) places.push(l);
  }
  for (const c of raw.targetCities ?? []) {
    if (typeof c === 'string') places.push(c);
    else if (c?.city) places.push(c.city);
  }

  return {
    name: raw.name,
    slug: raw.slug,
    siteUrl: raw.siteUrl,
    tagline: raw.tagline,
    description: raw.description,
    places: [...new Set(places)],
    serviceCategories: (raw.serviceCategories ?? []).map((s: any) =>
      typeof s === 'string' ? s : s?.name ?? String(s),
    ),
  };
}

export const FORMAT_DURATIONS: Record<Brief['format'], number> = {
  short: 59,
  reel: 30,
  'ad-15s': 15,
  'ad-30s': 30,
  'explainer-60s': 60,
};
