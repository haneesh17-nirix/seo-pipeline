import * as fs from "fs";
import * as path from "path";
import { nextParams, ContentParams } from "./parameters";
import { BrandConfig } from "../brands/loader";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";

export type ContentType =
  | "blog-post"
  | "service-landing"
  | "faq-page"
  | "meta-copy"
  | "ad-copy"
  | "social-post"
  | "outreach-email";

export interface GenerateJob {
  brand: BrandConfig;
  contentType: ContentType;
  keyword: string;
  serviceCategory?: string;
  city?: string;
  extraContext?: string;
}

export interface GenerateResult {
  job: GenerateJob;
  params: ContentParams;
  content: string;
  reviewFile: string;
  paramSummary: string;
  generatedAt: string;
  error?: string;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPrompt(job: GenerateJob, params: ContentParams): string {
  const { brand, contentType, keyword, serviceCategory, city } = job;
  const localContext = [city, "Kerala", "India"].filter(Boolean).join(", ");

  const base = `
You are writing ${contentType} content for "${brand.name}" — ${brand.description}
Website: ${brand.siteUrl}

TARGET KEYWORD: "${keyword}"
${serviceCategory ? `SERVICE CATEGORY: ${serviceCategory}` : ""}
LOCAL CONTEXT: ${localContext}

WRITING PARAMETERS (follow all of these precisely):
- Tone: ${params.tone}
- Perspective: ${params.perspective}
- Structure: ${params.structure}
- Opening hook: ${params.hook}
- CTA style: ${params.ctaStyle}
- Local depth: ${params.localDepth}
- Target length: ${params.length}
- Evidence style: ${params.evidence}
${job.extraContext ? `\nADDITIONAL CONTEXT:\n${job.extraContext}` : ""}

RULES:
- Never keyword-stuff. The target keyword appears naturally 2–3 times maximum.
- Every paragraph must add genuine value — no filler sentences.
- Local references must be accurate and specific (real areas, real context).
- Do not mention AI, automation, or that this was generated.
- Do not repeat the same sentence structure twice in a row.
- End with a single clear CTA matching the cta_style parameter above.
`.trim();

  const typeInstructions: Record<ContentType, string> = {
    "blog-post": `
Write a complete blog post. Include:
- An H1 title (not using the keyword verbatim — make it compelling)
- 3–5 H2 subheadings
- A meta description at the top (under 160 chars, labelled "META:")
- Proper paragraph breaks
- The CTA in the final section
`,
    "service-landing": `
Write a service landing page. Include:
- H1 headline (benefit-focused, not just the service name)
- "Why Sahayi" section (3 differentiators)
- How it works (3 steps)
- Trust signals section (what makes providers verified)
- FAQ block (3 questions relevant to this service in this city)
- CTA section
`,
    "faq-page": `
Write a standalone FAQ page targeting voice search and AI answer engines.
- 8–10 questions in natural conversational language (how, what, who, when, why)
- Each answer: 2–4 sentences, direct, complete, citable
- Include FAQPage JSON-LD schema at the bottom (valid schema.org format)
- Structure: H1, then H2 per question, paragraph answer
`,
    "meta-copy": `
Write ONLY the following — no other content:
TITLE: (50–60 chars, includes keyword naturally)
META_DESCRIPTION: (140–155 chars, benefit-led, includes soft CTA)
OG_TITLE: (same or variant of TITLE, can be slightly longer)
OG_DESCRIPTION: (same as meta or a variation, social-friendly)
`,
    "ad-copy": `
Write Google Responsive Search Ad copy:
HEADLINES: (15 headlines, each max 30 chars, varied — benefits, features, CTAs, local signals)
DESCRIPTIONS: (4 descriptions, each max 90 chars, action-oriented)

Then write Meta Ad copy:
META_PRIMARY_TEXT: (up to 125 chars — hook + benefit)
META_HEADLINE: (up to 40 chars)
META_CTA_BUTTON: (one of: Book Now, Learn More, Get Quote, Sign Up)

Label each section clearly.
`,
    "social-post": `
Write 3 variations of a social media post for this keyword/service.
Each variation:
- Platform note (Instagram / LinkedIn / Facebook)
- Post body (platform-appropriate length and style)
- 5–8 relevant hashtags
- Emoji use: Instagram = moderate, LinkedIn = minimal, Facebook = light

Label: VARIATION 1, VARIATION 2, VARIATION 3
`,
    "outreach-email": `
Write an outreach email to a local Kerala blogger or directory listing site.
Subject line: (compelling, not spammy)
Body: introduce Sahayi, explain why it's relevant to their audience,
propose a simple collaboration (listing, review, or mention).
Keep it under 150 words. No attachments referenced.
Sign off as the Sahayi partnerships team.
`,
  };

  return base + "\n\n" + (typeInstructions[contentType] ?? "");
}

// ── Ollama call ───────────────────────────────────────────────────────────────

async function callOllama(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return data.response.trim();
}

// ── Review queue writer ───────────────────────────────────────────────────────

function writeReviewFile(result: GenerateResult, reviewDir: string): string {
  fs.mkdirSync(reviewDir, { recursive: true });
  const slug = result.job.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `review-${result.job.contentType}-${slug}-${ts}.md`;
  const filePath = path.join(reviewDir, fileName);

  const frontmatter = `---
brand: ${result.job.brand.slug}
contentType: ${result.job.contentType}
keyword: "${result.job.keyword}"
${result.job.serviceCategory ? `serviceCategory: ${result.job.serviceCategory}` : ""}
${result.job.city ? `city: ${result.job.city}` : ""}
generatedAt: ${result.generatedAt}
status: pending_review
params:
  tone: "${result.params.tone}"
  perspective: "${result.params.perspective}"
  structure: "${result.params.structure}"
  hook: "${result.params.hook}"
  ctaStyle: "${result.params.ctaStyle}"
  localDepth: "${result.params.localDepth}"
  length: "${result.params.length}"
  evidence: "${result.params.evidence}"
---

<!-- REVIEW INSTRUCTIONS
  1. Read through the content below
  2. Edit freely — tone, facts, local accuracy
  3. Change status to: approved / rejected / needs_revision
  4. If approved, this file gets picked up by the publish queue
-->

${result.content}
`;

  fs.writeFileSync(filePath, frontmatter, "utf8");
  return filePath;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateContent(job: GenerateJob): Promise<GenerateResult> {
  const params = nextParams(job.brand.slug, job.contentType);
  const paramSummary = `${params.tone} | ${params.structure} | ${params.hook} | ${params.length}`;
  const generatedAt = new Date().toISOString();

  const reviewDir = path.join(
    process.cwd(), "brands", job.brand.slug, "output", "review-queue"
  );

  try {
    const prompt = buildPrompt(job, params);
    const model = job.brand.ollamaModel ?? DEFAULT_MODEL;
    const content = await callOllama(prompt, model);

    const result: GenerateResult = {
      job, params, content, paramSummary, generatedAt,
      reviewFile: "",
    };
    result.reviewFile = writeReviewFile(result, reviewDir);
    return result;
  } catch (err: any) {
    const result: GenerateResult = {
      job, params, content: "", paramSummary, generatedAt,
      reviewFile: "",
      error: err.message,
    };
    return result;
  }
}

export async function generateBatch(jobs: GenerateJob[]): Promise<GenerateResult[]> {
  const results: GenerateResult[] = [];
  for (const job of jobs) {
    process.stdout.write(`  [${job.contentType}] "${job.keyword}"${job.city ? ` (${job.city})` : ""} ... `);
    const r = await generateContent(job);
    if (r.error) {
      console.log(`✗ ${r.error}`);
    } else {
      console.log(`✓  → ${path.basename(r.reviewFile)}`);
      console.log(`     params: ${r.paramSummary}`);
    }
    results.push(r);
  }
  return results;
}

// ── Job builders ──────────────────────────────────────────────────────────────
// Convenience functions to build standard job sets from a brand config

export function blogJobsForBrand(brand: BrandConfig): GenerateJob[] {
  const cities: string[] = (brand as any).targetCities ?? [];
  const jobs: GenerateJob[] = [];

  for (const group of brand.keywordGroups) {
    for (const keyword of group.keywords.slice(0, 2)) { // top 2 per group
      const city = cities[Math.floor(Math.random() * cities.length)];
      jobs.push({
        brand,
        contentType: "blog-post",
        keyword,
        serviceCategory: group.group,
        city,
      });
    }
  }
  return jobs;
}

export function adJobsForBrand(brand: BrandConfig): GenerateJob[] {
  const cities: string[] = (brand as any).targetCities ?? [];
  const categories: string[] = (brand as any).serviceCategories ?? [];
  return categories.slice(0, 4).map((cat) => ({
    brand,
    contentType: "ad-copy" as ContentType,
    keyword: `${cat} service ${cities[0] ?? "Kerala"}`,
    serviceCategory: cat,
    city: cities[0],
  }));
}

export function socialJobsForBrand(brand: BrandConfig): GenerateJob[] {
  return brand.keywordGroups.slice(0, 3).map((group) => ({
    brand,
    contentType: "social-post" as ContentType,
    keyword: group.keywords[0],
    serviceCategory: group.group,
  }));
}

export function faqJobsForBrand(brand: BrandConfig): GenerateJob[] {
  const cities: string[] = (brand as any).targetCities ?? [];
  return brand.keywordGroups
    .filter((g) => g.schemaType === "FAQPage" || g.group === "AEO Voice")
    .flatMap((group) =>
      group.keywords.slice(0, 2).map((keyword) => ({
        brand,
        contentType: "faq-page" as ContentType,
        keyword,
        city: cities[0],
      }))
    );
}
