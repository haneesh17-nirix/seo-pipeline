/**
 * Deterministic quality gate for generated video scripts.
 *
 * Nothing checked model output before it reached disk. Every defect found in the
 * 428 generated files is decidable without a model — arithmetic, string
 * comparison, emptiness, a regex — and none of it was ever checked:
 *
 *   · scene durations summed to 39s against a stated 59s
 *   · a scene arrived with an empty voiceover AND an empty caption (12 dead
 *     seconds out of 43)
 *   · a template variable resolved to the literal string "undefined"
 *   · the brand name was spelled "Sahiayi" in the title and the hashtag
 *   · hashtags carried a doubled hash: "##SahayiService"
 *   · the hook was written into the header but assigned to no scene, so it was
 *     never spoken or shown
 *   · "hook under 8 words" and "CTA must include the website URL" were stated in
 *     the prompt and never enforced
 *
 * This runs before persistence. A script that fails is regenerated rather than
 * written. It is also the gate that protects spend: no script reaches a paid
 * video API until it passes.
 *
 * No model calls. Fast enough to run on every generation.
 */

export interface ValidatableScene {
  durationSeconds: number;
  visualPrompt?: string;
  voiceover?: string;
  caption?: string;
  transition?: string;
}

export interface ValidatableScript {
  title?: string;
  hook?: string;
  scenes?: ValidatableScene[];
  music?: string;
  cta?: string;
  hashtags?: string[];
}

export interface ValidationContext {
  /** Exact total the format requires, e.g. 59 for a short. */
  targetDuration: number;
  /** Canonical brand name, used to catch misspellings. */
  brandName: string;
  /** Site URL the CTA must reference. */
  siteUrl: string;
  /** Maximum words in the hook. */
  maxHookWords?: number;
  /** Tolerance in seconds for the duration sum. 0 = exact. */
  durationTolerance?: number;
}

export interface Finding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Scene index when the finding is scene-specific. */
  scene?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  findings: Finding[];
}

const PLACEHOLDERS = ['undefined', 'null', 'NaN', '[object Object]', 'TODO', 'TBD'];

/** Levenshtein distance, bounded — used to catch near-miss brand spellings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Finds words that are suspiciously close to the brand name without matching it.
 *
 * "Sahiayi" is one transposition from "Sahayi" — a plain substring check misses
 * it entirely, which is how it reached 428 files.
 */
function misspellings(text: string, brand: string): string[] {
  const target = brand.toLowerCase();
  const out = new Set<string>();
  for (const raw of text.split(/[^A-Za-z]+/)) {
    if (!raw || raw.length < 4) continue;
    const w = raw.toLowerCase();
    if (w === target) continue;
    const d = editDistance(w, target);
    if (d > 0 && d <= 2) out.add(raw);
  }
  return [...out];
}

export function validateScript(
  script: ValidatableScript,
  ctx: ValidationContext,
): ValidationResult {
  const findings: Finding[] = [];
  const err = (code: string, message: string, scene?: number) =>
    findings.push({ severity: 'error', code, message, scene });
  const warn = (code: string, message: string, scene?: number) =>
    findings.push({ severity: 'warning', code, message, scene });

  const maxHookWords = ctx.maxHookWords ?? 8;
  const tolerance = ctx.durationTolerance ?? 0;
  const scenes = script.scenes ?? [];

  // ── Structure ──────────────────────────────────────────────────────────────
  if (scenes.length === 0) {
    err('no-scenes', 'Script contains no scenes.');
    return finish(findings);
  }
  if (!script.title?.trim()) err('no-title', 'Script has no title.');
  if (!script.cta?.trim()) err('no-cta', 'Script has no call to action.');

  // ── Duration arithmetic ────────────────────────────────────────────────────
  const total = scenes.reduce((s, sc) => s + (Number(sc.durationSeconds) || 0), 0);
  const drift = Math.abs(total - ctx.targetDuration);
  if (drift > tolerance) {
    err(
      'duration-mismatch',
      `Scene durations total ${total}s but the format requires ${ctx.targetDuration}s ` +
        `(off by ${drift}s).`,
    );
  }

  for (const [i, sc] of scenes.entries()) {
    const d = Number(sc.durationSeconds);
    if (!Number.isFinite(d) || d <= 0) {
      err('bad-duration', `Scene ${i + 1} has a non-positive duration.`, i + 1);
    } else if (d > ctx.targetDuration / 2 && scenes.length > 2) {
      warn(
        'scene-too-long',
        `Scene ${i + 1} is ${d}s — over half the total runtime. Short-form pacing rarely survives this.`,
        i + 1,
      );
    }
  }

  // ── Dead air ───────────────────────────────────────────────────────────────
  for (const [i, sc] of scenes.entries()) {
    const hasVoice = Boolean(sc.voiceover?.trim());
    const hasCaption = Boolean(sc.caption?.trim());
    if (!hasVoice && !hasCaption) {
      err(
        'dead-scene',
        `Scene ${i + 1} has neither voiceover nor caption — ${sc.durationSeconds}s of dead air.`,
        i + 1,
      );
    }
    if (!sc.visualPrompt?.trim()) {
      err('no-visual', `Scene ${i + 1} has no visual direction.`, i + 1);
    }
  }

  // ── Unresolved template variables ──────────────────────────────────────────
  const fields: Array<[string, string | undefined, number | undefined]> = [
    ['title', script.title, undefined],
    ['hook', script.hook, undefined],
    ['cta', script.cta, undefined],
    ['music', script.music, undefined],
  ];
  for (const [i, sc] of scenes.entries()) {
    fields.push([`scene ${i + 1} visual`, sc.visualPrompt, i + 1]);
    fields.push([`scene ${i + 1} voiceover`, sc.voiceover, i + 1]);
    fields.push([`scene ${i + 1} caption`, sc.caption, i + 1]);
  }
  for (const [label, value, scene] of fields) {
    if (!value) continue;
    for (const p of PLACEHOLDERS) {
      if (value.trim() === p || value.includes(`${p}`) && value.trim().length <= p.length + 2) {
        err('unresolved-placeholder', `${label} contains the literal "${p}".`, scene);
        break;
      }
    }
  }

  // ── Brand spelling ─────────────────────────────────────────────────────────
  const allText = [
    script.title,
    script.hook,
    script.cta,
    ...(script.hashtags ?? []),
    ...scenes.flatMap((s) => [s.voiceover, s.caption, s.visualPrompt]),
  ]
    .filter(Boolean)
    .join(' ');

  const wrong = misspellings(allText, ctx.brandName);
  if (wrong.length) {
    err(
      'brand-misspelled',
      `Brand name misspelled as ${wrong.map((w) => `"${w}"`).join(', ')} — expected "${ctx.brandName}".`,
    );
  }

  // ── Hook ───────────────────────────────────────────────────────────────────
  const hook = script.hook?.trim() ?? '';
  if (!hook) {
    err('no-hook', 'Script has no hook. The first three seconds decide whether anyone watches.');
  } else {
    const words = hook.split(/\s+/).filter(Boolean).length;
    if (words > maxHookWords) {
      err('hook-too-long', `Hook is ${words} words; the limit is ${maxHookWords}.`);
    }
    // The hook must actually appear in the film, not just in the header.
    const spoken = scenes
      .flatMap((s) => [s.voiceover ?? '', s.caption ?? ''])
      .join(' ')
      .toLowerCase();
    const stem = hook.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 3).join(' ');
    if (stem && !spoken.includes(stem)) {
      warn(
        'hook-orphaned',
        'The hook appears in the header but in no scene, so it is never spoken or shown.',
      );
    }
  }

  // ── CTA ────────────────────────────────────────────────────────────────────
  const cta = script.cta?.trim() ?? '';
  if (cta) {
    const host = ctx.siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    const ctaAndScenes = (cta + ' ' + spokenText(scenes)).toLowerCase();
    if (host && !ctaAndScenes.includes(host.toLowerCase())) {
      warn('cta-no-url', `Neither the CTA nor any scene mentions ${host}.`);
    }
  }

  // ── Hashtags ───────────────────────────────────────────────────────────────
  for (const tag of script.hashtags ?? []) {
    if (/^#{2,}/.test(tag)) {
      err('hashtag-double-hash', `Hashtag "${tag}" starts with more than one #.`);
    }
    if (/\s/.test(tag.trim())) {
      err('hashtag-space', `Hashtag "${tag}" contains a space.`);
    }
  }

  // ── Pacing ─────────────────────────────────────────────────────────────────
  // Short form should accelerate toward the CTA, not decelerate. The observed
  // script ran 5 → 10 → 12 → 12.
  if (scenes.length >= 3) {
    const d = scenes.map((s) => Number(s.durationSeconds) || 0);
    const monotoneUp = d.every((v, i) => i === 0 || v >= d[i - 1]);
    if (monotoneUp && d[d.length - 1] > d[0]) {
      warn(
        'pacing-inverted',
        `Scenes get progressively longer (${d.join(' → ')}s). Short form usually wants the opposite.`,
      );
    }
  }

  // ── Caption readability ────────────────────────────────────────────────────
  for (const [i, sc] of scenes.entries()) {
    const caption = sc.caption?.trim();
    if (!caption) continue;
    // ~2.5 words per second is a comfortable on-screen reading rate.
    const words = caption.split(/\s+/).length;
    const readable = Math.floor((Number(sc.durationSeconds) || 0) * 2.5);
    if (words > readable) {
      warn(
        'caption-too-long',
        `Scene ${i + 1} caption is ${words} words for ${sc.durationSeconds}s — unlikely to be read in time.`,
        i + 1,
      );
    }
  }

  return finish(findings);
}

function spokenText(scenes: ValidatableScene[]): string {
  return scenes.flatMap((s) => [s.voiceover ?? '', s.caption ?? '']).join(' ');
}

function finish(findings: Finding[]): ValidationResult {
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, findings };
}

/** Single-line summary for logs. */
export function formatResult(result: ValidationResult): string {
  if (result.ok && !result.warnings.length) return '✓ passed';
  const parts: string[] = [];
  if (result.errors.length) parts.push(`${result.errors.length} error(s)`);
  if (result.warnings.length) parts.push(`${result.warnings.length} warning(s)`);
  return `${result.ok ? '✓ passed with' : '✗ failed —'} ${parts.join(', ')}`;
}

/**
 * Rescales scene durations so they sum exactly to the target.
 *
 * Both llama3.2:3b and qwen2.5:7b were asked, explicitly and in capitals, to
 * make durations add up to the target. Neither could: 38s and 15s against a
 * 59s target. Making integers sum to a value is arithmetic planning, and small
 * models fail it regardless of size — so the fix is to stop asking. The model
 * decides how many scenes there are and their relative weight; the exact
 * seconds are assigned here.
 *
 * Proportional scaling preserves the pacing the model intended, then the
 * rounding remainder is distributed from the longest scene down so the total
 * lands exactly.
 */
export function repairDurations<T extends ValidatableScene>(
  scenes: T[],
  targetDuration: number,
  minSceneSeconds = 2,
): T[] {
  if (scenes.length === 0) return scenes;

  const weights = scenes.map((s) => Math.max(Number(s.durationSeconds) || 1, 0.1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Proportional allocation, floored at the minimum readable scene length.
  let allocated = weights.map((w) =>
    Math.max(minSceneSeconds, Math.round((w / totalWeight) * targetDuration)),
  );

  // Distribute the remainder. Take from the longest scenes, give to the
  // longest, so no scene is pushed below the floor.
  let drift = targetDuration - allocated.reduce((a, b) => a + b, 0);
  const order = allocated
    .map((v, i) => [v, i] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);

  let guard = 0;
  while (drift !== 0 && guard++ < 1000) {
    for (const i of order) {
      if (drift === 0) break;
      if (drift > 0) {
        allocated[i]++;
        drift--;
      } else if (allocated[i] > minSceneSeconds) {
        allocated[i]--;
        drift++;
      }
    }
    if (order.every((i) => allocated[i] <= minSceneSeconds) && drift < 0) break;
  }

  return scenes.map((s, i) => ({ ...s, durationSeconds: allocated[i] }));
}

/**
 * Makes the hook match what is actually said first.
 *
 * The hook is generated as its own field, so nothing ties it to scene 1 — and
 * across the existing corpus 28 of 54 scripts have a hook that appears nowhere
 * in the film. Telling the model to sync the two fields does not work
 * reliably; llama3.2 and qwen2.5 both left it orphaned.
 *
 * The hook IS whatever the viewer hears in the first three seconds. So when the
 * stated hook is absent from scene 1, the scene wins and the header is
 * corrected to match — rather than shipping a header that describes a film that
 * was never made.
 */
export function repairHook<T extends ValidatableScript>(script: T, maxWords = 8): T {
  const scenes = script.scenes ?? [];
  if (scenes.length === 0) return script;

  const opening = (scenes[0].voiceover || scenes[0].caption || '').trim();
  if (!opening) return script;

  const hook = (script.hook ?? '').trim();
  const stem = hook.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 3).join(' ');
  const spoken = [scenes[0].voiceover ?? '', scenes[0].caption ?? ''].join(' ').toLowerCase();

  if (stem && spoken.includes(stem)) return script;

  // Take the opening line, trimmed to a hook-sized fragment at a sentence or
  // clause boundary rather than mid-phrase.
  const firstSentence = opening.split(/(?<=[.!?])\s/)[0] ?? opening;
  const words = firstSentence.split(/\s+/).filter(Boolean);
  const trimmed = words.length <= maxWords ? firstSentence : words.slice(0, maxWords).join(' ');

  return { ...script, hook: trimmed.replace(/[,;:]$/, '') };
}
