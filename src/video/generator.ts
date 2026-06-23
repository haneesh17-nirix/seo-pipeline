import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { callLLM } from "../llm/provider";

// ── Shared content item shape (from review queue frontmatter) ─────────────────

export interface ContentItem {
  brand: string;
  keyword: string;
  content: string;
  params?: {
    tone?: string;
    outputLanguage?: string;
    referenceFrame?: string;
    postArchitecture?: string;
    literaryInfluence?: string;
  };
}

// ── Video script types ────────────────────────────────────────────────────────

export type VideoFormat = "reel" | "short" | "ad-15s" | "ad-30s" | "explainer-60s";

export interface VideoScene {
  durationSeconds: number;
  visualPrompt: string;    // what to generate / shoot
  voiceover: string;       // text for TTS or human VO
  caption: string;         // on-screen text overlay
  transition?: string;     // cut, fade, slide
}

export interface VideoScript {
  format: VideoFormat;
  totalDuration: number;
  title: string;
  hook: string;            // first 3 seconds — most critical
  scenes: VideoScene[];
  music: string;           // mood description for background music
  cta: string;
  hashtags: string[];
  aspectRatio: "9:16" | "16:9" | "1:1";
  language: string;        // which language the voiceover/captions are written in
}

// ── Script generator ──────────────────────────────────────────────────────────

export async function generateVideoScript(
  item: ContentItem,
  format: VideoFormat
): Promise<VideoScript> {
  const durations: Record<VideoFormat, number> = {
    "reel": 30, "short": 59, "ad-15s": 15, "ad-30s": 30, "explainer-60s": 60,
  };
  const totalDuration = durations[format];
  const isVertical = format === "reel" || format === "short";
  const outputLanguage = item.params?.outputLanguage ?? "English";
  const tone = item.params?.tone ?? "conversational and warm";

  const languageInstruction = buildLanguageInstruction(outputLanguage);

  const prompt = `
You are a video scriptwriter creating a ${format} (${totalDuration} seconds) for "${item.brand}".
Based on this written content about "${item.keyword}", write a punchy video script.

WRITTEN CONTENT TO ADAPT:
${item.content.slice(0, 1500)}

${languageInstruction}

TONE: ${tone}
${item.params?.referenceFrame ? `REFERENCE FRAME: ${item.params.referenceFrame}` : ""}
${item.params?.postArchitecture ? `POST ARCHITECTURE: ${item.params.postArchitecture}` : ""}
${item.params?.literaryInfluence ? `LITERARY SENSIBILITY: ${item.params.literaryInfluence} — let this texture the voiceover language` : ""}

OUTPUT FORMAT — respond with a valid JSON object with this exact structure:
{
  "title": "compelling video title under 60 chars",
  "hook": "opening line for first 3 seconds — must stop the scroll",
  "scenes": [
    {
      "durationSeconds": 5,
      "visualPrompt": "describe what should be shown on screen in detail",
      "voiceover": "exact words spoken",
      "caption": "text shown on screen",
      "transition": "cut"
    }
  ],
  "music": "mood and genre description for background music",
  "cta": "final call to action text",
  "hashtags": ["tag1", "tag2"]
}

RULES:
- Total scenes duration must add up to exactly ${totalDuration} seconds
- Hook must be punchy — under 8 words, creates immediate curiosity
- Each scene visual prompt should describe real, achievable footage or animation
- Captions must be short enough to read in the scene duration
- Format is ${isVertical ? "vertical 9:16 (phone screen)" : "horizontal 16:9"}
- Include at least one scene showing the service being done (authentic, not stock)
- CTA must include the website URL and a clear action
- Do not include JSON comments or trailing commas — pure valid JSON only
`.trim();

  try {
    const raw = await callLLM(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in LLM response");
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      format,
      totalDuration,
      aspectRatio: isVertical ? "9:16" : "16:9",
      language: outputLanguage,
      ...parsed,
    };
  } catch {
    return buildFallbackScript(item, format, totalDuration, outputLanguage);
  }
}

function buildLanguageInstruction(outputLanguage: string): string {
  if (outputLanguage.startsWith("Malayalam")) {
    return `SCRIPT LANGUAGE: Malayalam
  → Write ALL voiceover and captions in Malayalam script (not transliteration).
    The visual prompts can stay in English for the production team.
    The hook, voiceover, and captions must be natural, modern Malayalam — not archaic.
    The brand name "Sahayi" and the website URL may stay in English.
    Every writing instruction above (tone, literary sensibility, reference frame) applies
    NATIVELY in Malayalam — do not translate, express those sensibilities in the language.`;
  }
  if (outputLanguage.startsWith("Manglish")) {
    return `SCRIPT LANGUAGE: Manglish (Malayalam-English code-switch)
  → Write voiceover and captions the way educated urban Keralites actually talk:
    English sentences with Malayalam words woven in naturally (nalla, alle, swalpa, ente, ithu).
    Never forced. The ratio should feel natural — roughly 70% English, 30% Malayalam phrases.
    Visual prompts stay in English.`;
  }
  if (outputLanguage.startsWith("Hindi")) {
    return `SCRIPT LANGUAGE: Hindi
  → Write voiceover and captions in conversational Hindi.
    Not textbook Hindi — Mumbai/everyday register.
    Visual prompts stay in English.`;
  }
  if (outputLanguage.startsWith("English with Malayalam")) {
    return `SCRIPT LANGUAGE: English with Malayalam phrases
  → English primary. Use Malayalam phrases only at emotional beats and local colour moments
    (e.g., "ente veedu", "nalla oru service"). Visual prompts in English.`;
  }
  return `SCRIPT LANGUAGE: English (Indian English, Kerala inflection welcome)`;
}

function buildFallbackScript(
  item: ContentItem,
  format: VideoFormat,
  duration: number,
  language: string
): VideoScript {
  const service = item.keyword.split(" ")[0];
  const isMalayalam = language.startsWith("Malayalam");

  return {
    format,
    totalDuration: duration,
    aspectRatio: "9:16",
    language,
    title: `${item.keyword} — ${item.brand}`,
    hook: isMalayalam ? `ഇനിയും കാത്തിരിക്കേണ്ട.` : `Still waiting for a reliable ${service}?`,
    scenes: [
      {
        durationSeconds: Math.floor(duration * 0.2),
        visualPrompt: `Close-up of a frustrated homeowner looking at a broken ${service} fixture`,
        voiceover: isMalayalam
          ? `ഒരു നല്ല ${service} കിട്ടാൻ ഇത്ര ബുദ്ധിമുട്ടോ?`
          : `Still waiting for a reliable ${service}?`,
        caption: isMalayalam ? "പരിചയമുണ്ടോ?" : "Sound familiar?",
        transition: "cut",
      },
      {
        durationSeconds: Math.floor(duration * 0.4),
        visualPrompt: `Clean split-screen: phone showing ${item.brand} app, then professional arriving at door`,
        voiceover: isMalayalam
          ? `${item.brand} വഴി, 60 സെക്കൻഡിൽ ഒരു verified professional-നെ book ചെയ്യാം.`
          : `With ${item.brand}, book a verified professional in 60 seconds.`,
        caption: isMalayalam ? "60 സെക്കൻഡ് മതി" : "Book in 60 seconds",
        transition: "slide",
      },
      {
        durationSeconds: Math.floor(duration * 0.25),
        visualPrompt: `Time-lapse of professional completing the service, homeowner smiling`,
        voiceover: `Same-day service. Transparent pricing. Guaranteed work.`,
        caption: "Same day ✓  Transparent pricing ✓",
        transition: "fade",
      },
      {
        durationSeconds: Math.floor(duration * 0.15),
        visualPrompt: `${item.brand} logo on white background, URL prominent`,
        voiceover: isMalayalam
          ? `${item.brand}.co.in — ഇന്നു തന്നെ book ചെയ്യൂ.`
          : `Visit ${item.brand}.co.in and book today.`,
        caption: `${item.brand}.co.in`,
        transition: "fade",
      },
    ],
    music: "upbeat, warm, modern Indian — no lyrics, positive energy",
    cta: isMalayalam ? `${item.brand}.co.in-ൽ ഇന്ന് book ചെയ്യൂ` : `Book now at ${item.brand}.co.in`,
    hashtags: [item.brand, service, "Kerala", "homeservices", isMalayalam ? "മലയാളം" : "Shorts"],
  };
}

// ── Video generation APIs ─────────────────────────────────────────────────────

export type VideoProvider = "runway" | "kling" | "pika" | "local-sd";

export async function generateVideoFromScript(
  script: VideoScript,
  provider: VideoProvider,
  outputPath: string
): Promise<string> {
  switch (provider) {
    case "runway": return generateWithRunway(script, outputPath);
    case "kling":  return generateWithKling(script, outputPath);
    case "pika":   return generateWithPika(script, outputPath);
    default:       return saveScriptForManualProduction(script, outputPath);
  }
}

async function generateWithRunway(script: VideoScript, outputPath: string): Promise<string> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("RUNWAY_API_KEY not set");

  const results: string[] = [];

  for (const scene of script.scenes) {
    const res = await axios.post("https://api.runwayml.com/v1/image_to_video", {
      model: "gen3a_turbo",
      promptText: scene.visualPrompt,
      duration: Math.min(scene.durationSeconds, 10),
      ratio: script.aspectRatio,
      watermark: false,
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
        "Content-Type": "application/json",
      },
    });

    const taskId = res.data.id;
    const videoUrl = await pollRunwayTask(taskId, apiKey);
    results.push(videoUrl);
  }

  const manifestPath = outputPath.replace(".mp4", "-scenes.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    script,
    sceneUrls: results,
    nextStep: "Stitch scenes using ffmpeg: ffmpeg -f concat -safe 0 -i scenes.txt -c copy output.mp4",
    ffmpegScript: buildFfmpegCommand(results, outputPath),
  }, null, 2), "utf8");

  return manifestPath;
}

async function pollRunwayTask(taskId: string, apiKey: string, maxWait = 300000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await axios.get(`https://api.runwayml.com/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
    });
    if (status.data.status === "SUCCEEDED") return status.data.output?.[0];
    if (status.data.status === "FAILED") throw new Error(`Runway task failed: ${status.data.failure}`);
  }
  throw new Error("Runway task timed out");
}

async function generateWithKling(script: VideoScript, outputPath: string): Promise<string> {
  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) throw new Error("KLING_API_KEY not set");

  const scene = script.scenes[0];
  const res = await axios.post("https://api.klingai.com/v1/videos/text2video", {
    model: "kling-v1",
    prompt: scene.visualPrompt,
    negative_prompt: "watermark, text, blurry, low quality, stock footage feel",
    cfg_scale: 0.5,
    mode: "std",
    duration: Math.min(script.totalDuration, 10),
    aspect_ratio: script.aspectRatio,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });

  const manifestPath = outputPath.replace(".mp4", "-kling.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ taskId: res.data.data?.task_id, script }, null, 2), "utf8");
  return manifestPath;
}

async function generateWithPika(script: VideoScript, outputPath: string): Promise<string> {
  const apiKey = process.env.PIKA_API_KEY;
  if (!apiKey) throw new Error("PIKA_API_KEY not set");

  const res = await axios.post("https://api.pika.art/v1/generate", {
    promptText: script.scenes.map((s) => s.visualPrompt).join(". "),
    options: {
      aspectRatio: script.aspectRatio,
      frameRate: 24,
      camera: { zoom: "static" },
    },
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });

  const manifestPath = outputPath.replace(".mp4", "-pika.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ taskId: res.data.id, script }, null, 2), "utf8");
  return manifestPath;
}

async function saveScriptForManualProduction(script: VideoScript, outputPath: string): Promise<string> {
  const scriptPath = outputPath.replace(".mp4", "-production-script.md");
  const lines = [
    `# Video Production Script — ${script.title}`,
    `**Format:** ${script.format} | **Duration:** ${script.totalDuration}s | **Ratio:** ${script.aspectRatio} | **Language:** ${script.language}`,
    `**Music:** ${script.music}`,
    `**Hook (first 3s):** ${script.hook}`,
    ``,
    `## Scenes`,
    ...script.scenes.map((s, i) => [
      `### Scene ${i + 1} (${s.durationSeconds}s)`,
      `**Visual:** ${s.visualPrompt}`,
      `**Voiceover:** "${s.voiceover}"`,
      `**On-screen text:** ${s.caption}`,
      `**Transition:** ${s.transition ?? "cut"}`,
      ``,
    ].join("\n")),
    `## CTA`,
    script.cta,
    ``,
    `## Hashtags`,
    script.hashtags.map((t) => `#${t}`).join(" "),
    ``,
    `---`,
    `To generate with AI: set RUNWAY_API_KEY, KLING_API_KEY, or PIKA_API_KEY in .env`,
    `To shoot manually: use this script as a production brief.`,
  ];

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, lines.join("\n"), "utf8");
  return scriptPath;
}

function buildFfmpegCommand(sceneUrls: string[], outputPath: string): string {
  const inputs = sceneUrls.map((u) => `-i "${u}"`).join(" \\\n  ");
  const filter = sceneUrls.map((_, i) => `[${i}:v][${i}:a]`).join("") + `concat=n=${sceneUrls.length}:v=1:a=1[outv][outa]`;
  return `ffmpeg \\\n  ${inputs} \\\n  -filter_complex "${filter}" \\\n  -map "[outv]" -map "[outa]" \\\n  "${outputPath}"`;
}

// ── Public convenience functions ──────────────────────────────────────────────

export async function generateVideoForContent(
  item: ContentItem,
  format: VideoFormat = "short",
  provider: VideoProvider = "local-sd"
): Promise<string> {
  const outputDir = path.join("brands", item.brand, "output", "videos");
  fs.mkdirSync(outputDir, { recursive: true });

  const slug = item.keyword.toLowerCase().replace(/\s+/g, "-").slice(0, 30);
  const langTag = (item.params?.outputLanguage ?? "en").slice(0, 2).toLowerCase();
  const outputPath = path.join(outputDir, `${format}-${langTag}-${slug}-${Date.now()}.mp4`);

  console.log(`  Generating ${format} script [${item.params?.outputLanguage ?? "English"}] for: "${item.keyword}"...`);
  const script = await generateVideoScript(item, format);

  console.log(`  Hook: "${script.hook}"`);
  console.log(`  ${script.scenes.length} scenes × ${format}`);

  const result = await generateVideoFromScript(script, provider, outputPath);
  console.log(`  ✓ Video artifact: ${result}`);
  return result;
}

// Generates scripts in multiple languages and formats from a single content item
export async function generateVideoSuite(
  item: ContentItem,
  formats: VideoFormat[] = ["reel", "short", "ad-15s"],
  languages: string[] = ["English", "Malayalam", "Manglish"],
  provider: VideoProvider = "local-sd"
): Promise<string[]> {
  const results: string[] = [];

  for (const lang of languages) {
    const langItem: ContentItem = {
      ...item,
      params: { ...item.params, outputLanguage: lang },
    };
    for (const format of formats) {
      try {
        const r = await generateVideoForContent(langItem, format, provider);
        results.push(r);
      } catch (err: any) {
        console.error(`  ✗ ${format} [${lang}]: ${err.message}`);
      }
    }
  }

  return results;
}
