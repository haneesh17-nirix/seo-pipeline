import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { ContentType, SITE } from "../keywords/config";
import type { BrandConfig } from "../brands/loader";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

export interface GenerateOptions {
  keyword: string;
  contentType: ContentType;
  tone?: "professional" | "casual" | "technical";
  wordCount?: number;
  outputDir?: string;
  brand?: BrandConfig;
}

async function ollamaGenerate(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 2048 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { response: string };
  return data.response.trim();
}

function brandContext(brand?: BrandConfig) {
  if (brand) return { name: brand.name, url: brand.siteUrl, tagline: brand.name };
  return { name: SITE.name, url: SITE.url, tagline: SITE.tagline };
}

const PROMPTS: Record<ContentType, (opts: GenerateOptions) => string> = {
  "blog-post": ({ keyword, tone = "professional", wordCount = 800, brand }) => {
    const b = brandContext(brand);
    return `You are an expert SEO content writer. Write a ${wordCount}-word blog post optimized for the keyword: "${keyword}".

Brand: ${b.name} (${b.url})

Requirements:
1. H1 title containing the exact keyword near the start
2. Keyword appears naturally in the first 100 words
3. Use the keyword and semantic variants 4-6 times total
4. 3-4 H2 subheadings with related long-tail keywords
5. Include a "Frequently Asked Questions" section with 3 Q&As
6. End with a CTA mentioning ${b.name}
7. Tone: ${tone}
8. Output clean Markdown only — no preamble or explanation.`;
  },
  "landing-page": ({ keyword, wordCount = 600, brand }) => {
    const b = brandContext(brand);
    return `You are an expert conversion copywriter and SEO specialist. Write landing page copy for: "${keyword}".

Brand: ${b.name} — ${b.tagline}. Site: ${b.url}

Structure:
1. **Hero**: H1 with keyword, one-sentence value prop, CTA button text
2. **Problem**: 3 pain points this audience faces
3. **Solution**: how ${b.name} solves it
4. **Features**: 4 benefit-led bullet points
5. **Social proof placeholders**: [TESTIMONIAL], [LOGO BAR], [STAT]
6. **FAQ**: 3 SEO-rich Q&As
7. **Final CTA**: closing headline includes keyword

~${wordCount} words. Output clean Markdown with section labels. No preamble.`;
  },
  "meta-tags": ({ keyword, brand }) => {
    const b = brandContext(brand);
    return `Generate SEO meta tags for a page targeting: "${keyword}".

Brand: ${b.name} (${b.url})

Output ONLY this JSON — no explanation, no markdown code fences:
{
  "keyword": "${keyword}",
  "title": "<60 chars, keyword near start, brand at end>",
  "metaDescription": "<150-160 chars, includes keyword and a benefit>",
  "h1": "<page H1 containing keyword>",
  "ogTitle": "<Open Graph title, 60 chars max>",
  "ogDescription": "<OG description, 120 chars max>",
  "slug": "<url-slug-for-this-page>",
  "canonicalUrl": "${b.url}/<slug>",
  "schemaType": "<most appropriate schema.org type>"
}`;
  },
  faq: ({ keyword, brand }) => {
    const b = brandContext(brand);
    return `Write 8 FAQ entries optimized for: "${keyword}".

For each:
- Question: phrased how users actually type in Google (long-tail, conversational)
- Answer: 60-100 words, includes keyword or a close variant naturally
- Mention ${b.name} naturally in 2-3 answers

Format:
## FAQ: ${keyword}

**Q: <question>**
A: <answer>

Output the FAQ section only. No preamble.
`;
  },
};

export async function generateContent(opts: GenerateOptions): Promise<string> {
  const prompt = PROMPTS[opts.contentType](opts);
  return ollamaGenerate(prompt);
}

export async function generateAndSave(opts: GenerateOptions): Promise<string> {
  process.stdout.write(`  Generating ${opts.contentType} for: "${opts.keyword}"...`);
  const text = await generateContent(opts);

  const safeSlug = opts.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const ext = opts.contentType === "meta-tags" ? "json" : "md";
  const filename = `${opts.contentType}__${safeSlug}.${ext}`;
  const dir = opts.outputDir ?? path.join(process.cwd(), "output");

  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, text, "utf8");
  console.log(` ✓`);
  return filePath;
}

export async function batchGenerate(
  contentType: ContentType,
  keywords: string[],
  outputDir?: string,
  brand?: BrandConfig
): Promise<{ keyword: string; file: string; error?: string }[]> {
  const results = [];
  for (const keyword of keywords) {
    try {
      const file = await generateAndSave({ keyword, contentType, outputDir, brand });
      results.push({ keyword, file });
    } catch (err: any) {
      console.log(` ✗ ${err.message}`);
      results.push({ keyword, file: "", error: err.message });
    }
  }
  return results;
}

export async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
