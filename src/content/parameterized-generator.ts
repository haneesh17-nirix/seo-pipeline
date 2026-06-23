import * as fs from "fs";
import * as path from "path";
import { nextParams, ContentParams } from "./parameters";
import { BrandConfig } from "../brands/loader";
import { selectFragments, buildSynthesisPrompt, FragmentSelection } from "./synthesizer";
import { indexCorpus, loadCorpus } from "./corpus";
import { callLLM, llmProvider } from "../llm/provider";

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

// ── Synthesis-aware prompt builder ───────────────────────────────────────────
// When corpus has fragments, build a synthesis prompt that uses them as
// inspiration. Falls back to pure parametric prompt when corpus is empty.

function buildPromptWithSynthesis(
  job: GenerateJob,
  params: ContentParams,
  selection: FragmentSelection | null
): string {
  if (selection && selection.fragments.length >= 3) {
    return buildSynthesisPrompt(selection, {
      brand: job.brand.name,
      siteUrl: job.brand.siteUrl,
      targetKeyword: job.keyword,
      contentType: job.contentType,
      params: params as unknown as Record<string, string>,
      city: job.city,
      serviceCategory: job.serviceCategory,
    }) + "\n\n" + typeInstructionBlock(job.contentType);
  }
  return buildPrompt(job, params);
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

WRITING PARAMETERS — follow every one of these precisely:

TONE: ${params.tone}
PERSPECTIVE: ${params.perspective}
STRUCTURE: ${params.structure}
OPENING HOOK: ${params.hook}
CTA STYLE: ${params.ctaStyle}
LOCAL DEPTH: ${params.localDepth}
TARGET LENGTH: ${params.length}
EVIDENCE STYLE: ${params.evidence}

LITERARY INFLUENCE: ${params.literaryInfluence}
  → Do not quote or name this author. Absorb their sensibility:
    their sentence rhythm, the weight they give small moments,
    their relationship with the reader. Let it colour the prose
    without announcing itself.

LANGUAGE REGISTER: ${params.languageRegister}
  → This controls vocabulary, syntax, and cultural coding.
    If the register includes vernacular words (yaar, accha, nalla etc.),
    use them only where they feel genuinely natural — never forced,
    never more than 2–3 per piece.

EXPERIENCE TONE: ${params.experienceTone}
  → This is the emotional after-taste of reading the piece.
    A reader should finish and feel this, not be told it.

OUTPUT LANGUAGE: ${params.outputLanguage}
  → This is the language you write in. Every other instruction below —
    literary influence, tone, register, experience, annotation, reference
    frame, post architecture — applies FULLY in this language.
    Do not translate. Express those sensibilities natively in this language.
    If the language is Malayalam: write in Malayalam script throughout.
    If Manglish: mix naturally as an educated urban Keralite would.
    The SEO keyword may appear in English even in a Malayalam piece —
    that is normal and expected for search visibility.

ANNOTATION STYLE: ${params.annotationStyle}
  → Let this shape how punctuation and formatting are used.
    The page should have a typographic personality consistent
    with this style throughout — not just in one section.
    If writing in Malayalam script, adapt this style to Malayalam
    punctuation conventions — do not force English em-dashes into
    Malayalam prose where they feel unnatural.

CULTURAL REFERENCE FRAME: ${params.referenceFrame}
  → This is the external world the content borrows texture from.
    Use it as an entry point — the reader should recognise the world
    you've borrowed before they realise you're talking about a service.
    The reference must feel earned: accurate, specific, never crowbarred in.
    If it's a film, describe a scene precisely. If it's political, name the
    gap honestly. If it's empathy-first, stay inside the feeling longer than
    feels comfortable before offering anything.

POST ARCHITECTURE: ${params.postArchitecture}
  → This is the structural skeleton of the piece — follow it.
    Every architecture has one non-negotiable goal: by the end, the reader
    must have a concrete mental image of themselves using this product.
    Not "this sounds good" — but "I can see myself doing this."
    That moment — the seed idea — is the most important thing you will write.
    Plant it naturally. Never announce it.
${job.extraContext ? `\nADDITIONAL CONTEXT:\n${job.extraContext}` : ""}

HARD RULES:
- The target keyword appears naturally 2–3 times maximum. Never stuffed.
- Every paragraph earns its place — no filler, no padding.
- Local references must be real: actual areas, real seasonal context, genuine cultural moments.
- Do not mention AI, automation, or that this was generated.
- Never repeat the same sentence structure twice in a row.
- The literary influence, register, and annotation style must be consistent
  throughout — not applied to one paragraph and then abandoned.
- End with a single CTA matching the cta_style above.
`.trim();

  return base + "\n\n" + typeInstructionBlock(contentType);
}

function typeInstructionBlock(contentType: ContentType): string {
  const typeInstructions: Record<ContentType, string> = {
    "blog-post": `Write a complete blog post. Include:
- An H1 title (not using the keyword verbatim — make it compelling)
- 3–5 H2 subheadings
- A meta description at the top (under 160 chars, labelled "META:")
- Proper paragraph breaks
- The CTA in the final section`,
    "service-landing": `Write a service landing page. Include:
- H1 headline (benefit-focused, not just the service name)
- "Why Sahayi" section (3 differentiators)
- How it works (3 steps)
- Trust signals section (what makes providers verified)
- FAQ block (3 questions relevant to this service and city)
- CTA section`,
    "faq-page": `Write a standalone FAQ page targeting voice search and AI answer engines.
- 8–10 questions in natural conversational language (how, what, who, when, why)
- Each answer: 2–4 sentences, direct, complete, citable
- Include FAQPage JSON-LD schema at the bottom (valid schema.org format)
- Structure: H1, then H2 per question, paragraph answer`,
    "meta-copy": `Write ONLY the following — no other content:
TITLE: (50–60 chars, includes keyword naturally)
META_DESCRIPTION: (140–155 chars, benefit-led, includes soft CTA)
OG_TITLE: (same or variant of TITLE, can be slightly longer)
OG_DESCRIPTION: (same as meta or a variation, social-friendly)`,
    "ad-copy": `Write Google Responsive Search Ad copy:
HEADLINES: (15 headlines, each max 30 chars, varied — benefits, features, CTAs, local signals)
DESCRIPTIONS: (4 descriptions, each max 90 chars, action-oriented)

Then write Meta Ad copy:
META_PRIMARY_TEXT: (up to 125 chars — hook + benefit)
META_HEADLINE: (up to 40 chars)
META_CTA_BUTTON: (one of: Book Now, Learn More, Get Quote, Sign Up)

Label each section clearly.`,
    "social-post": `Write 3 variations of a social media post for this keyword/service.
Each variation:
- Platform note (Instagram / LinkedIn / Facebook)
- Post body (platform-appropriate length and style)
- 5–8 relevant hashtags
- Emoji use: Instagram = moderate, LinkedIn = minimal, Facebook = light

Label: VARIATION 1, VARIATION 2, VARIATION 3`,
    "outreach-email": `Write an outreach email to a local Kerala blogger or directory listing site.
Subject line: (compelling, not spammy)
Body: introduce Sahayi, explain why it's relevant to their audience,
propose a simple collaboration (listing, review, or mention).
Keep it under 150 words. No attachments referenced.
Sign off as the Sahayi partnerships team.`,
  };
  return typeInstructions[contentType] ?? "";
}


// ── Review queue writer ───────────────────────────────────────────────────────

function writeReviewFile(
  result: GenerateResult,
  reviewDir: string,
  selection?: FragmentSelection | null
): string {
  fs.mkdirSync(reviewDir, { recursive: true });
  const slug = result.job.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `review-${result.job.contentType}-${slug}-${ts}.md`;
  const filePath = path.join(reviewDir, fileName);

  const synthesisBlock = selection
    ? `synthesisKey: "${selection.selectionKey}"
localityProfile: ${JSON.stringify(selection.localityProfile)}
fragmentCount: ${selection.fragments.length}`
    : "";

  const frontmatter = `---
brand: ${result.job.brand.slug}
contentType: ${result.job.contentType}
keyword: "${result.job.keyword}"
${result.job.serviceCategory ? `serviceCategory: ${result.job.serviceCategory}` : ""}
${result.job.city ? `city: ${result.job.city}` : ""}
generatedAt: ${result.generatedAt}
status: pending_review
${synthesisBlock}
params:
  tone: "${result.params.tone}"
  perspective: "${result.params.perspective}"
  structure: "${result.params.structure}"
  hook: "${result.params.hook}"
  ctaStyle: "${result.params.ctaStyle}"
  localDepth: "${result.params.localDepth}"
  length: "${result.params.length}"
  evidence: "${result.params.evidence}"
  outputLanguage: "${result.params.outputLanguage?.split(" — ")[0] ?? "English"}"
  referenceFrame: "${result.params.referenceFrame?.split(" — ")[0] ?? ""}"
  postArchitecture: "${result.params.postArchitecture?.split(" — ")[0] ?? ""}"
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

  // Try to select corpus fragments for synthesis
  let selection: FragmentSelection | null = null;
  try {
    selection = selectFragments({
      brandSlug: job.brand.slug,
      targetCategory: job.serviceCategory ?? "general",
      targetCity: job.city,
    });
  } catch {
    // No corpus yet — first-run scenario, fall back to pure parametric
  }

  try {
    const prompt = buildPromptWithSynthesis(job, params, selection);
    const model = (job.brand as any).ollamaModel ?? DEFAULT_MODEL;
    const content = await callLLM(prompt, model);

    const result: GenerateResult = {
      job, params, content, paramSummary, generatedAt,
      reviewFile: "",
    };
    result.reviewFile = writeReviewFile(result, reviewDir, selection);
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
