import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { ReviewItem } from "../approval/telegram-bot";

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
}

// ── Script generator ──────────────────────────────────────────────────────────
// Uses the same Ollama LLM to generate structured video scripts
// based on the approved written content

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

export async function generateVideoScript(
  item: ReviewItem,
  format: VideoFormat
): Promise<VideoScript> {
  const durations: Record<VideoFormat, number> = {
    "reel": 30, "short": 59, "ad-15s": 15, "ad-30s": 30, "explainer-60s": 60,
  };
  const totalDuration = durations[format];

  const prompt = `
You are a video scriptwriter creating a ${format} (${totalDuration} seconds) for "${item.brand}".
Based on this written content about "${item.keyword}", write a video script.

WRITTEN CONTENT TO ADAPT:
${item.content.slice(0, 1500)}

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
- Voice must match the written content's tone: ${item.params?.tone ?? "conversational"}
- Captions must be short enough to read in the scene duration
- For ${format === "reel" || format === "short" ? "vertical 9:16" : "horizontal 16:9"} format
- Include at least one scene showing the service being done (authentic, not stock)
- CTA must include the website URL and a clear action
`.trim();

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt,
        stream: false,
        format: "json",
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = (await res.json()) as { response: string };
    const parsed = JSON.parse(data.response);

    return {
      format,
      totalDuration,
      aspectRatio: (format === "reel" || format === "short") ? "9:16" : "16:9",
      ...parsed,
    };
  } catch (err: any) {
    // Fallback script if LLM unavailable
    return buildFallbackScript(item, format, totalDuration);
  }
}

function buildFallbackScript(item: ReviewItem, format: VideoFormat, duration: number): VideoScript {
  const service = item.keyword.split(" ")[0];
  return {
    format,
    totalDuration: duration,
    aspectRatio: "9:16",
    title: `${item.keyword} — ${item.brand}`,
    hook: `Still waiting for a reliable ${service}?`,
    scenes: [
      {
        durationSeconds: Math.floor(duration * 0.2),
        visualPrompt: `Close-up of a frustrated homeowner looking at a broken ${service} fixture`,
        voiceover: `Still waiting for a reliable ${service}?`,
        caption: "Sound familiar?",
        transition: "cut",
      },
      {
        durationSeconds: Math.floor(duration * 0.4),
        visualPrompt: `Clean split-screen: phone showing ${item.brand} app, then professional arriving at door`,
        voiceover: `With ${item.brand}, book a verified professional in 60 seconds.`,
        caption: "Book in 60 seconds",
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
        voiceover: `Visit ${item.brand}.co.in and book today.`,
        caption: `${item.brand}.co.in`,
        transition: "fade",
      },
    ],
    music: "upbeat, warm, modern Indian — no lyrics, positive energy",
    cta: `Book now at ${item.brand}.co.in`,
    hashtags: [item.brand, service, "Kerala", "homeservices", "Shorts"],
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
    // Runway Gen-3 Alpha: text-to-video
    const res = await axios.post("https://api.runwayml.com/v1/image_to_video", {
      model: "gen3a_turbo",
      promptText: scene.visualPrompt,
      duration: Math.min(scene.durationSeconds, 10), // Runway max 10s per clip
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

  // Save scene URLs for stitching
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

  const scene = script.scenes[0]; // Kling: one prompt per generation
  const res = await axios.post("https://api.klingai.com/v1/videos/text2video", {
    model: "kling-v1",
    prompt: scene.visualPrompt,
    negative_prompt: "watermark, text, blurry, low quality, stock footage feel",
    cfg_scale: 0.5,
    mode: "std",
    duration: Math.min(script.totalDuration, 10),
    aspect_ratio: script.aspectRatio,
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

// Fallback: save full production script when no API key is configured
async function saveScriptForManualProduction(script: VideoScript, outputPath: string): Promise<string> {
  const scriptPath = outputPath.replace(".mp4", "-production-script.md");
  const lines = [
    `# Video Production Script — ${script.title}`,
    `**Format:** ${script.format} | **Duration:** ${script.totalDuration}s | **Ratio:** ${script.aspectRatio}`,
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
  const inputs = sceneUrls.map((u, i) => `-i "${u}"`).join(" \\\n  ");
  const filter = sceneUrls.map((_, i) => `[${i}:v][${i}:a]`).join("") + `concat=n=${sceneUrls.length}:v=1:a=1[outv][outa]`;
  return `ffmpeg \\\n  ${inputs} \\\n  -filter_complex "${filter}" \\\n  -map "[outv]" -map "[outa]" \\\n  "${outputPath}"`;
}

// ── Public convenience function ───────────────────────────────────────────────

export async function generateVideoForContent(
  item: ReviewItem,
  format: VideoFormat = "short",
  provider: VideoProvider = "local-sd"
): Promise<string> {
  const outputDir = path.join("brands", item.brand, "output", "videos");
  fs.mkdirSync(outputDir, { recursive: true });

  const slug = item.keyword.toLowerCase().replace(/\s+/g, "-").slice(0, 30);
  const outputPath = path.join(outputDir, `${format}-${slug}-${Date.now()}.mp4`);

  console.log(`  Generating ${format} script for: "${item.keyword}"...`);
  const script = await generateVideoScript(item, format);

  console.log(`  Hook: "${script.hook}"`);
  console.log(`  ${script.scenes.length} scenes × ${format}`);

  const result = await generateVideoFromScript(script, provider, outputPath);
  console.log(`  ✓ Video artifact: ${result}`);
  return result;
}
