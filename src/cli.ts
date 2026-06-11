#!/usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();

import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";
import { Command } from "commander";

import { loadBrand, listBrands, createBrand, brandOutputDir, BrandConfig } from "./brands/loader";
import { generateAndSave, batchGenerate, checkOllama } from "./content/generator";
import { trackAndSave } from "./tracking/gsc";
import { saveReport, printConsoleReport } from "./reports/reporter";
import { saveSitemap } from "./seo/sitemap";
import { saveSchemas } from "./seo/schema";
import type { ContentType } from "./keywords/config";

const CONTENT_TYPES: ContentType[] = ["blog-post", "landing-page", "meta-tags", "faq"];

const program = new Command();
program.name("seo").description("Multi-brand SEO pipeline").version("1.0.0");

// ── shared brand resolver ────────────────────────────────────────────────────
function resolveBrand(brandSlug?: string): BrandConfig {
  const brands = listBrands();
  if (!brands.length) {
    console.error("\nNo brands configured yet. Run: seo brand add\n");
    process.exit(1);
  }
  if (!brandSlug) {
    if (brands.length === 1) return loadBrand(brands[0]);
    console.error(`\nMultiple brands found. Specify one with --brand <slug>\nAvailable: ${brands.join(", ")}\n`);
    process.exit(1);
  }
  return loadBrand(brandSlug);
}

// ── brand management ─────────────────────────────────────────────────────────
const brandCmd = program.command("brand").description("Manage brands");

brandCmd
  .command("list")
  .description("List all configured brands")
  .action(() => {
    const brands = listBrands();
    if (!brands.length) { console.log("\nNo brands configured. Run: seo brand add\n"); return; }
    console.log(`\n${"Slug".padEnd(22)} ${"Name".padEnd(28)} ${"Type".padEnd(12)} Site`);
    console.log("─".repeat(85));
    for (const slug of brands) {
      const b = loadBrand(slug);
      const cred = fs.existsSync(path.resolve(b.gscCredentialsFile));
      const credIcon = cred ? "✓ GSC" : "✗ no GSC";
      console.log(`  ${slug.padEnd(20)} ${b.name.padEnd(28)} ${b.type.padEnd(12)} ${b.siteUrl}  [${credIcon}]`);
    }
    console.log();
  });

brandCmd
  .command("add")
  .description("Interactively create a new brand profile")
  .action(async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    console.log("\n── New brand setup ──────────────────────────────────\n");
    const slug = (await ask("  slug (e.g. habun-dubai): ")).trim().toLowerCase().replace(/\s+/g, "-");
    const name = (await ask("  display name (e.g. Habun — Dubai): ")).trim();
    const type = (await ask("  type [restaurant/saas/ecommerce/other]: ")).trim() as BrandConfig["type"];
    const siteUrl = (await ask("  site URL (e.g. https://habun.ae): ")).trim();
    const country = (await ask("  target country code (e.g. ae, in, us): ")).trim();
    rl.close();

    const gscMap: Record<string, string> = { ae: "are", in: "ind", us: "usa", gb: "gbr", au: "aus" };

    createBrand({
      slug, name, type,
      siteUrl,
      gscSiteUrl: siteUrl,
      gscCredentialsFile: `./brands/${slug}/gsc-credentials.json`,
      targetCountry: country,
      gscCountryCode: gscMap[country] ?? country,
      languages: country === "ae" ? ["en", "ar"] : ["en"],
      ollamaModel: "llama3.2",
      keywordGroups: [
        {
          group: "Brand",
          keywords: [`${name}`, `${name} review`, `${name} ${country === "ae" ? "UAE" : ""}`],
          targetPage: "/",
          schemaType: type === "restaurant" ? "Restaurant" : "SoftwareApplication",
        },
      ],
      pages: [
        { path: "/", label: "Home" },
        { path: "/about", label: "About" },
        { path: "/contact", label: "Contact" },
      ],
      apiEndpoints: [],
    });

    console.log(`\n  Edit brands/${slug}/brand.json to add keyword groups, pages, and API endpoints.`);
    console.log(`  Follow docs/gsc-setup.md to create brands/${slug}/gsc-credentials.json.\n`);
  });

brandCmd
  .command("show <slug>")
  .description("Show keyword summary for a brand")
  .action((slug) => {
    const b = loadBrand(slug);
    console.log(`\n  ${b.name}  (${b.siteUrl})`);
    console.log(`  Country: ${b.targetCountry.toUpperCase()}   GSC: ${b.gscCountryCode}   Model: ${b.ollamaModel}\n`);
    let total = 0;
    for (const g of b.keywordGroups) {
      console.log(`  ◈ ${g.group} → ${g.targetPage}`);
      g.keywords.forEach((k) => console.log(`    - ${k}`));
      total += g.keywords.length;
      console.log();
    }
    console.log(`  Total: ${total} keywords across ${b.keywordGroups.length} groups\n`);
  });

// ── generate ─────────────────────────────────────────────────────────────────
program
  .command("generate")
  .description("Generate SEO content for a brand")
  .requiredOption("-b, --brand <slug>", "Brand slug (e.g. habun-rak)")
  .option("-t, --type <type>", `Content type: ${CONTENT_TYPES.join(", ")}`, "blog-post")
  .option("-k, --keyword <keyword>", "Single keyword")
  .option("-g, --group <group>", "Keyword group name")
  .option("--all", "All keywords for this brand")
  .action(async (opts) => {
    const brand = resolveBrand(opts.brand);
    const type = opts.type as ContentType;
    const outputDir = brandOutputDir(brand.slug, "output");
    const ollamaOk = await checkOllama();
    if (!ollamaOk) {
      console.error(`\nOllama not reachable at ${process.env.OLLAMA_HOST ?? "http://localhost:11434"}`);
      console.error(`Open SSH tunnel: ssh -i ~/.ssh/id_rsa_habun_seo -L 11434:localhost:11434 seouser@20.216.5.173 -N &\n`);
      process.exit(1);
    }

    const allKeywords = brand.keywordGroups.flatMap((g) => g.keywords);

    if (opts.keyword) {
      const file = await generateAndSave({ keyword: opts.keyword, contentType: type, outputDir, brand });
      console.log(`\n✓ ${file}\n`);
    } else if (opts.group) {
      const group = brand.keywordGroups.find((g) => g.group.toLowerCase() === opts.group.toLowerCase());
      if (!group) {
        console.error(`Group not found. Available: ${brand.keywordGroups.map((g) => g.group).join(", ")}`);
        process.exit(1);
      }
      console.log(`\nGenerating ${type} for [${brand.name}] group: ${group.group}\n`);
      const results = await batchGenerate(type, group.keywords, outputDir, brand);
      console.log(`\n✓ ${results.filter((r) => !r.error).length}/${results.length} files\n`);
    } else if (opts.all) {
      console.log(`\nGenerating ${type} for all ${allKeywords.length} keywords in [${brand.name}]...\n`);
      const results = await batchGenerate(type, allKeywords, outputDir, brand);
      console.log(`\n✓ ${results.filter((r) => !r.error).length}/${results.length} generated\n`);
    } else {
      console.log(`\nUsage:`);
      console.log(`  seo generate --brand ${brand.slug} --type blog-post --keyword "best restaurant in RAK"`);
      console.log(`  seo generate --brand ${brand.slug} --type meta-tags --group "Local RAK"`);
      console.log(`  seo generate --brand ${brand.slug} --type faq --all\n`);
    }
  });

// ── track ─────────────────────────────────────────────────────────────────────
program
  .command("track")
  .description("Fetch keyword rankings from Google Search Console")
  .requiredOption("-b, --brand <slug>", "Brand slug")
  .option("-g, --group <group>", "Only track this keyword group")
  .action(async (opts) => {
    const brand = resolveBrand(opts.brand);

    // Override env vars with brand-specific values
    process.env.GSC_CREDENTIALS_FILE = path.resolve(brand.gscCredentialsFile);
    process.env.GSC_SITE_URL = brand.gscSiteUrl;

    let keywords = brand.keywordGroups.flatMap((g) => g.keywords);
    if (opts.group) {
      const group = brand.keywordGroups.find((g) => g.group.toLowerCase() === opts.group.toLowerCase());
      if (!group) { console.error("Group not found."); process.exit(1); }
      keywords = group.keywords;
    }

    console.log(`\nTracking [${brand.name}] — ${keywords.length} keywords (${brand.targetCountry.toUpperCase()})\n`);
    const results = await trackAndSave(keywords, brand.targetCountry, brand.slug);
    printConsoleReport(results, brand);

    const reportDir = brandOutputDir(brand.slug, "reports");
    const file = saveReport(results, reportDir, brand.name);
    console.log(`✓ Report: ${file}\n`);
  });

// ── track-all ─────────────────────────────────────────────────────────────────
program
  .command("track-all")
  .description("Track rankings for every configured brand")
  .action(async () => {
    const brands = listBrands();
    console.log(`\nTracking all ${brands.length} brands...\n`);
    for (const slug of brands) {
      const brand = loadBrand(slug);
      const credPath = path.resolve(brand.gscCredentialsFile);
      if (!fs.existsSync(credPath)) {
        console.log(`  [${brand.name}] ⚠ Skipped — no GSC credentials (${brand.gscCredentialsFile})`);
        continue;
      }
      process.env.GSC_CREDENTIALS_FILE = credPath;
      process.env.GSC_SITE_URL = brand.gscSiteUrl;
      const keywords = brand.keywordGroups.flatMap((g) => g.keywords);
      console.log(`\n  ── ${brand.name} (${keywords.length} keywords) ──`);
      try {
        const results = await trackAndSave(keywords, brand.targetCountry, brand.slug);
        const reportDir = brandOutputDir(brand.slug, "reports");
        saveReport(results, reportDir, brand.name);
        const ranked = results.filter((r) => r.position > 0).length;
        console.log(`  ✓ ${ranked}/${results.length} keywords ranked`);
      } catch (err: any) {
        console.log(`  ✗ ${err.message}`);
      }
    }
    console.log();
  });

// ── sitemap ───────────────────────────────────────────────────────────────────
program
  .command("sitemap")
  .description("Generate sitemap.xml for a brand")
  .requiredOption("-b, --brand <slug>", "Brand slug")
  .action((opts) => {
    const brand = resolveBrand(opts.brand);
    const outputDir = brandOutputDir(brand.slug, "output");
    const file = saveSitemap(brand, outputDir);
    console.log(`\n✓ Sitemap: ${file}`);
    console.log(`  Upload to the root of ${brand.siteUrl}\n`);
  });

// ── schema ────────────────────────────────────────────────────────────────────
program
  .command("schema")
  .description("Generate JSON-LD schema markup for a brand")
  .requiredOption("-b, --brand <slug>", "Brand slug")
  .action((opts) => {
    const brand = resolveBrand(opts.brand);
    const outputDir = brandOutputDir(brand.slug, "output");
    const dir = saveSchemas(brand, outputDir);
    console.log(`\n✓ Schema files: ${dir}`);
    console.log(`  Paste each .jsonld <script> tag into the matching page <head>\n`);
  });

// ── report ────────────────────────────────────────────────────────────────────
program
  .command("report")
  .description("Print latest rank snapshot for a brand")
  .requiredOption("-b, --brand <slug>", "Brand slug")
  .action((opts) => {
    const brand = resolveBrand(opts.brand);
    const { getHistory } = require("./tracking/gsc");
    const keywords = brand.keywordGroups.flatMap((g) => g.keywords);
    const results = keywords.map((kw: string) => {
      const h = getHistory(kw, brand.slug);
      return h.length ? h[h.length - 1] : null;
    }).filter(Boolean);
    if (!results.length) { console.log(`\nNo data for [${brand.name}] yet. Run: seo track --brand ${brand.slug}\n`); return; }
    printConsoleReport(results as any, brand);
  });

// ── run-all ───────────────────────────────────────────────────────────────────
program
  .command("run-all")
  .description("Run full pipeline for one or all brands: generate → track → sitemap → schema")
  .option("-b, --brand <slug>", "Limit to one brand (default: all brands)")
  .option("-t, --type <type>", `Content type for generate step`, "blog-post")
  .option("--skip-generate", "Skip content generation (useful when Ollama is unavailable)")
  .option("--skip-track", "Skip GSC rank tracking")
  .option("--skip-sitemap", "Skip sitemap generation")
  .option("--skip-schema", "Skip schema generation")
  .option("--only-track", "Only run rank tracking (alias for --skip-generate --skip-sitemap --skip-schema)")
  .action(async (opts) => {
    const allSlugs = opts.brand ? [opts.brand] : listBrands();
    if (!allSlugs.length) {
      console.error("\nNo brands configured. Run: seo brand add\n");
      process.exit(1);
    }

    const skipGenerate = opts.skipGenerate || opts.onlyTrack;
    const skipTrack    = opts.skipTrack;
    const skipSitemap  = opts.skipSitemap || opts.onlyTrack;
    const skipSchema   = opts.skipSchema  || opts.onlyTrack;
    const type         = opts.type as ContentType;

    const ollamaOk = skipGenerate ? false : await checkOllama();
    if (!skipGenerate && !ollamaOk) {
      console.log(`\n⚠  Ollama not reachable — skipping content generation`);
      console.log(`   To enable: ssh -i ~/.ssh/id_rsa_habun_seo -L 11434:localhost:11434 seouser@20.216.5.173 -N &\n`);
    }

    const width = 50;
    const line = "─".repeat(width);
    const results: { slug: string; steps: string[] }[] = [];

    for (const slug of allSlugs) {
      const brand = loadBrand(slug);
      console.log(`\n${"═".repeat(width)}`);
      console.log(`  ${brand.name}  (${slug})`);
      console.log(`${"═".repeat(width)}`);
      const steps: string[] = [];

      // step 1 — generate
      if (!skipGenerate && ollamaOk) {
        const outputDir = brandOutputDir(slug, "output");
        const keywords = brand.keywordGroups.flatMap((g) => g.keywords);
        console.log(`\n  [1/4] Generating ${type} for ${keywords.length} keywords...`);
        const genResults = await batchGenerate(type, keywords, outputDir, brand);
        const ok = genResults.filter((r) => !r.error).length;
        console.log(`  ✓ ${ok}/${genResults.length} files generated`);
        steps.push(`generate: ${ok}/${genResults.length}`);
      } else {
        console.log(`\n  [1/4] Generate — skipped`);
        steps.push("generate: skipped");
      }

      // step 2 — track
      if (!skipTrack) {
        const credPath = path.resolve(brand.gscCredentialsFile);
        if (fs.existsSync(credPath)) {
          process.env.GSC_CREDENTIALS_FILE = credPath;
          process.env.GSC_SITE_URL = brand.gscSiteUrl;
          console.log(`\n  [2/4] Tracking ${brand.keywordGroups.flatMap((g) => g.keywords).length} keywords...`);
          try {
            const keywords = brand.keywordGroups.flatMap((g) => g.keywords);
            const rankResults = await trackAndSave(keywords, brand.targetCountry, brand.slug);
            const reportDir = brandOutputDir(slug, "reports");
            const file = saveReport(rankResults, reportDir, brand.name);
            const ranked = rankResults.filter((r) => r.position > 0).length;
            console.log(`  ✓ ${ranked}/${rankResults.length} keywords ranked → ${path.relative(process.cwd(), file)}`);
            steps.push(`track: ${ranked}/${rankResults.length} ranked`);
          } catch (err: any) {
            console.log(`  ✗ Track failed: ${err.message}`);
            steps.push(`track: failed`);
          }
        } else {
          console.log(`\n  [2/4] Track — skipped (no GSC credentials)`);
          steps.push("track: no credentials");
        }
      } else {
        console.log(`\n  [2/4] Track — skipped`);
        steps.push("track: skipped");
      }

      // step 3 — sitemap
      if (!skipSitemap) {
        const outputDir = brandOutputDir(slug, "output");
        console.log(`\n  [3/4] Generating sitemap...`);
        const sitemapFile = saveSitemap(brand, outputDir);
        console.log(`  ✓ ${path.relative(process.cwd(), sitemapFile)}`);
        steps.push("sitemap: done");
      } else {
        console.log(`\n  [3/4] Sitemap — skipped`);
        steps.push("sitemap: skipped");
      }

      // step 4 — schema
      if (!skipSchema) {
        const outputDir = brandOutputDir(slug, "output");
        console.log(`\n  [4/4] Generating schema markup...`);
        const schemaDir = saveSchemas(brand, outputDir);
        console.log(`  ✓ ${path.relative(process.cwd(), schemaDir)}`);
        steps.push("schema: done");
      } else {
        console.log(`\n  [4/4] Schema — skipped`);
        steps.push("schema: skipped");
      }

      results.push({ slug, steps });
    }

    // summary
    console.log(`\n${"═".repeat(width)}`);
    console.log(`  Run complete — ${results.length} brand(s)`);
    console.log(`${"═".repeat(width)}\n`);
    for (const r of results) {
      console.log(`  ${r.slug.padEnd(22)} ${r.steps.join("  ·  ")}`);
    }
    console.log();
  });

program.parse(process.argv);
