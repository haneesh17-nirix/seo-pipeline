import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { ContentType, SITE } from "../keywords/config";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

export interface GenerateOptions {
  keyword: string;
  contentType: ContentType;
  tone?: "professional" | "casual" | "technical";
  wordCount?: number;
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

const PROMPTS: Record<ContentType, (opts: GenerateOptions) => string> = {
  "blog-post": ({ keyword, tone = "professional", wordCount = 800 }) => `
You are an expert SEO content writer. Write a ${wordCount}-word blog post optimized for the keyword: "${keyword}".

Brand context:
- ${SITE.brandNames[0]}: a professional-grade app suite for industrial operations
- ${SITE.brandNames[1]}: a smart tracking and asset management platform at ${SITE.url}

Requirements:
1. H1 title containing the exact keyword near the start
2. Keyword appears naturally in the first 100 words
3. Use the keyword and semantic variants 4-6 times total
4. 3-4 H2 subheadings with related long-tail keywords
5. Include a "Frequently Asked Questions" section with 3 Q&As
6. End with a CTA mentioning one of the brands
7. Tone: ${tone}
8. Output clean Markdown only — no preamble or explanation.
`,
  "landing-page": ({ keyword, wordCount = 600 }) => `
You are an expert conversion copywriter and SEO specialist. Write landing page copy for: "${keyword}".

Brand: ${SITE.name} — ${SITE.tagline}. Site: ${SITE.url}

Structure:
1. **Hero**: H1 with keyword, one-sentence value prop, CTA button text
2. **Problem**: 3 pain points this audience faces
3. **Solution**: how ${SITE.name} solves it
4. **Features**: 4 benefit-led bullet points
5. **Social proof placeholders**: [TESTIMONIAL], [LOGO BAR], [STAT]
6. **FAQ**: 3 SEO-rich Q&As
7. **Final CTA**: closing headline includes keyword

~${wordCount} words. Output clean Markdown with section labels. No preamble.
`,
  "meta-tags": ({ keyword }) => `
Generate SEO meta tags for a page targeting: "${keyword}".

Brand: ${SITE.name} (${SITE.url})

Output ONLY this JSON — no explanation, no markdown code fences:
{
  "keyword": "${keyword}",
  "title": "<60 chars, keyword near start, brand at end>",
  "metaDescription": "<150-160 chars, includes keyword and a benefit>",
  "h1": "<page H1 containing keyword>",
  "ogTitle": "<Open Graph title, 60 chars max>",
  "ogDescription": "<OG description, 120 chars max>",
  "slug": "<url-slug-for-this-page>",
  "canonicalUrl": "${SITE.url}/<slug>",
  "schemaType": "<most appropriate schema.org type>"
}
`,
  faq: ({ keyword }) => `
Write 8 FAQ entries optimized for: "${keyword}".

For each:
- Question: phrased how users actually type in Google (long-tail, conversational)
- Answer: 60-100 words, includes keyword or a close variant naturally
- Mention ${SITE.name} or ${SITE.brandNames[0]} naturally in 2-3 answers

Format:
## FAQ: ${keyword}

**Q: <question>**
A: <answer>

Output the FAQ section only. No preamble.
`,
};

export async function generateContent(opts: GenerateOptions): Promise<string> {
  const prompt = PROMPTS[opts.contentType](opts);
  return ollamaGenerate(prompt);
}

export async function generateAndSave(
  opts: GenerateOptions & { outputDir?: string }
): Promise<string> {
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
  keywords: string[]
): Promise<{ keyword: string; file: string; error?: string }[]> {
  const results = [];
  for (const keyword of keywords) {
    try {
      const file = await generateAndSave({ keyword, contentType });
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
