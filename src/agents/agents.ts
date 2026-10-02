import { callLLMJson } from '../llm/provider';
import type { Angle, BrandContext, Brief, Critique, Script, ShotList } from './types';

/**
 * The five agents.
 *
 * Each is a prompt plus a parse. They are deliberately thin: the value is in
 * the separation, not in the code. Splitting strategy from drafting lets the
 * critic reject a script without discarding the thinking behind it, and gives
 * the localiser an approved English original to work from rather than
 * improvising its own.
 *
 * Every prompt states the constraint AND the reason for it. Small models comply
 * far more often with "captions must be readable in the scene duration, so keep
 * them under about eight words" than with a bare limit.
 */

const MODEL = process.env.AGENT_MODEL ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';

function brandBlock(brand: BrandContext): string {
  return [
    `BRAND: ${brand.name} — ${brand.tagline ?? ''}`,
    brand.description ? `WHAT IT IS: ${brand.description}` : '',
    `SITE: ${brand.siteUrl}`,
    `SERVICES: ${brand.serviceCategories.slice(0, 10).join(', ')}`,
    `PLACES: ${brand.places.slice(0, 10).join(', ')}`,
    `The brand name is spelled exactly "${brand.name}". Never vary it.`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ── 1. Strategist ────────────────────────────────────────────────────────────

export async function strategist(brief: Brief, brand: BrandContext): Promise<Angle> {
  const prompt = `You are a direct-response strategist. You are NOT writing copy yet.

${brandBlock(brand)}

TOPIC: "${brief.keyword}"${brief.location ? `\nPLACE: ${brief.location}` : ''}

Find the angle. The weak version of this brief is "we fix pipes, call us" — every
competitor says that and nobody watches it. The strong version names something the
viewer already feels but has not put into words.

Think about who searches this and what is actually happening to them: something has
broken, it is probably inconvenient timing, and they are about to let a stranger into
their home. The hesitation is rarely price. It is trust, or not knowing who to call,
or having been let down before.

Respond with JSON only:
{
  "audienceState": "their situation in one sentence, in their words not the brand's",
  "insight": "the non-obvious observation this piece turns on",
  "promise": "the single claim the piece makes — one claim, not a list",
  "objection": "why they hesitate to act",
  "localAnchor": "a concrete detail specific to the place, not decoration"
}`;

  return callLLMJson<Angle>(prompt, { model: MODEL, temperature: 0.9 });
}

// ── 2. Scriptwriter ──────────────────────────────────────────────────────────

export async function scriptwriter(
  brief: Brief,
  brand: BrandContext,
  angle: Angle,
  revisionNotes: string[] = [],
): Promise<Script> {
  const sceneCount = brief.targetDuration <= 15 ? 3 : brief.targetDuration <= 30 ? 4 : 5;

  const revision = revisionNotes.length
    ? `\nA previous draft was rejected. Fix exactly these and change nothing else:\n${revisionNotes
        .map((n) => `- ${n}`)
        .join('\n')}\n`
    : '';

  const prompt = `You are a short-form video scriptwriter.

${brandBlock(brand)}

THE ANGLE — write to this, do not restate it:
Audience: ${angle.audienceState}
Insight: ${angle.insight}
Promise: ${angle.promise}
Objection to clear: ${angle.objection}
Local anchor: ${angle.localAnchor}

FORMAT: ${brief.format}, vertical 9:16, about ${brief.targetDuration} seconds, ${sceneCount} scenes.
${revision}
RULES — each has a reason, follow both:
- The hook is under 8 words AND must be the first thing spoken in scene 1. A hook that
  only exists in the header is never heard by anyone.
- EVERY scene needs both a voiceover line and a caption. A scene with neither is dead
  air, and dead air on vertical video loses the viewer permanently.
- Captions under about 8 words, because the viewer has only that scene to read them.
- Scenes should get SHORTER toward the end. Attention decays; the cut rate should rise.
- Exactly one call to action, and it must mention ${brand.siteUrl}.
- Hashtags: single # each, no spaces inside a tag.
- Write speech, not prose. Read every voiceover line aloud in your head first.
- Do not mention AI or that this was generated.

Scene durations: give your best estimate. They will be rescaled to hit the target
exactly, so relative weight matters more than the absolute numbers.

Respond with JSON only:
{
  "title": "under 60 chars",
  "hook": "under 8 words",
  "scenes": [
    { "durationSeconds": 5, "visualPrompt": "what is on screen", "voiceover": "exact words spoken", "caption": "text on screen", "transition": "cut" }
  ],
  "music": "mood and genre",
  "cta": "call to action including the URL",
  "hashtags": ["tag", "tag"]
}`;

  return callLLMJson<Script>(prompt, { model: MODEL, temperature: 0.85 });
}

// ── 3. Critic ────────────────────────────────────────────────────────────────

export async function critic(
  brief: Brief,
  brand: BrandContext,
  angle: Angle,
  script: Script,
): Promise<Critique> {
  const prompt = `You are a hard-to-please creative director reviewing a script before it goes
into production. Your job is to reject work that is merely acceptable.

${brandBlock(brand)}

THE ANGLE IT WAS MEANT TO EXECUTE:
Insight: ${angle.insight}
Promise: ${angle.promise}
Objection: ${angle.objection}

THE SCRIPT:
${JSON.stringify(script, null, 2)}

Score each 1-5. Be strict — a 5 means you would defend this to a client, not that it
is inoffensive.

- hookStrength: would this stop a scroll in 3 seconds? Generic urgency is a 2.
- specificity: could this sentence appear in a competitor's ad unchanged? If yes, score 2 or less.
- singleIdea: one claim, or a feature list? A list is a 2.
- localTruth: does the place reference mean something to a resident, or is it decoration?
- ctaClarity: exactly one unambiguous action, with the URL?
- register: does it read like a person talking, or like a brochure?

Then give concrete notes. "Make it punchier" is useless. "Scene 2 voiceover states the
service instead of the benefit — say what the viewer gets" is useful. Quote the line
you mean.

Respond with JSON only:
{
  "scores": { "hookStrength": 3, "specificity": 3, "singleIdea": 3, "localTruth": 3, "ctaClarity": 3, "register": 3 },
  "notes": ["specific, actionable, quoting the line"],
  "verdict": "accept"
}

verdict must be exactly the word accept or exactly the word revise — nothing else.
Use revise if ANY score is below 4, except localTruth and register where the floor is 3.`;

  return callLLMJson<Critique>(prompt, { model: MODEL, temperature: 0.3 });
}

// ── 4. Localiser ─────────────────────────────────────────────────────────────

export async function localiser(
  script: Script,
  brand: BrandContext,
  language: Brief['language'],
): Promise<Script> {
  if (language === 'English') return script;

  const guidance: Record<string, string> = {
    Malayalam:
      'Write natural Malayalam in Malayalam script. Do not transliterate English word order into Malayalam — rewrite the thought the way a Malayali would say it.',
    Manglish:
      'Write the way educated Kochi residents actually mix Malayalam and English in speech: Malayalam grammar and connectives, English for technical nouns, romanised. "Ente plumbing needs nalla fixed" is wrong — that is English word order with Malayalam words dropped in. Real Manglish is closer to "Pipe പൊട്ടിയോ? Sahayi-yil vilikku."',
    Hindi: 'Write natural conversational Hindi in Devanagari.',
  };

  const prompt = `You are localising an approved video script into ${language}.

${brandBlock(brand)}

RULES:
- ${guidance[language] ?? ''}
- Translate voiceover and caption. Keep visualPrompt in English — it is for the crew.
- Keep the brand name "${brand.name}" and the URL exactly as they are.
- Keep the same number of scenes and the same durationSeconds.
- Match the meaning and the energy, not the word order.

THE SCRIPT:
${JSON.stringify(script, null, 2)}

Respond with the same JSON structure, localised.`;

  return callLLMJson<Script>(prompt, { model: MODEL, temperature: 0.7 });
}

// ── 5. Producer ──────────────────────────────────────────────────────────────

export async function producer(script: Script, brand: BrandContext): Promise<ShotList> {
  const prompt = `You are a producer turning an approved script into a shot list.

${brandBlock(brand)}

THE SCRIPT:
${JSON.stringify(script, null, 2)}

For each scene give a shot that a crew could film or a video model could render.
Be concrete about framing and action. "A plumber working" is not a shot; "close on
hands tightening a compression fitting under a sink, shallow depth of field" is.

renderPrompt should be usable directly as a text-to-video prompt: subject, action,
setting, lens and lighting. No brand names or on-screen text in the render prompt —
text is composited afterwards.

Respond with JSON only:
{
  "shots": [
    { "scene": 1, "seconds": 5, "shotType": "close-up", "subject": "...", "action": "...", "renderPrompt": "..." }
  ],
  "voiceDirection": "pace, tone, accent",
  "musicDirection": "genre, tempo, where it ducks for voiceover"
}`;

  return callLLMJson<ShotList>(prompt, { model: MODEL, temperature: 0.6 });
}
