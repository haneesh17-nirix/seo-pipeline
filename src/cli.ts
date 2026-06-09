#!/usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();

import { Command } from "commander";
import { CONTENT_TYPES, KEYWORD_GROUPS, ALL_KEYWORDS } from "./keywords/config";
import { batchGenerate, generateAndSave, checkOllama } from "./content/generator";
import { trackAndSave } from "./tracking/gsc";
import { saveReport, printConsoleReport } from "./reports/reporter";
import { saveSitemap } from "./seo/sitemap";
import { saveSchemas } from "./seo/schema";
import type { ContentType } from "./keywords/config";

const program = new Command();
program.name("seo").description("Free SEO pipeline for Nyrix / BlueMetal Pro").version("1.0.0");

// ── generate ─────────────────────────────────────────────────────────────────
program
  .command("generate")
  .description("Generate SEO content using local Ollama LLM")
  .option("-t, --type <type>", `Content type: ${CONTENT_TYPES.join(", ")}`, "blog-post")
  .option("-k, --keyword <keyword>", "Single keyword")
  .option("-g, --group <group>", "Keyword group name")
  .option("--all", "All configured keywords")
  .action(async (opts) => {
    const type = opts.type as ContentType;
    if (!CONTENT_TYPES.includes(type)) {
      console.error(`Invalid type. Choose: ${CONTENT_TYPES.join(", ")}`); process.exit(1);
    }

    const ok = await checkOllama();
    if (!ok) {
      console.error(`\nCannot reach Ollama at ${process.env.OLLAMA_HOST ?? "http://localhost:11434"}`);
      console.error("Is Ollama running? Start with: ollama serve");
      process.exit(1);
    }

    if (opts.keyword) {
      const file = await generateAndSave({ keyword: opts.keyword, contentType: type });
      console.log(`\n✓ ${file}\n`);
    } else if (opts.group) {
      const group = KEYWORD_GROUPS.find((g) => g.group.toLowerCase() === opts.group.toLowerCase());
      if (!group) { console.error("Group not found."); process.exit(1); }
      console.log(`\nGenerating ${type} for group: ${group.group}\n`);
      const results = await batchGenerate(type, group.keywords);
      console.log(`\n✓ ${results.filter((r) => !r.error).length}/${results.length} files generated\n`);
    } else if (opts.all) {
      console.log(`\nGenerating ${type} for all ${ALL_KEYWORDS.length} keywords...\n`);
      const results = await batchGenerate(type, ALL_KEYWORDS);
      console.log(`\n✓ ${results.filter((r) => !r.error).length}/${results.length} generated\n`);
    } else {
      console.log('Usage: seo generate --type blog-post --keyword "best crusher app"');
      console.log('       seo generate --type meta-tags --group "Crusher Apps"');
      console.log("       seo generate --type faq --all");
    }
  });

// ── track ────────────────────────────────────────────────────────────────────
program
  .command("track")
  .description("Fetch keyword positions from Google Search Console")
  .option("-g, --group <group>", "Only track this keyword group")
  .option("--days <n>", "Days of GSC data to fetch", "7")
  .action(async (opts) => {
    const country = process.env.TARGET_COUNTRY ?? "in";
    let keywords = ALL_KEYWORDS;
    if (opts.group) {
      const group = KEYWORD_GROUPS.find((g) => g.group.toLowerCase() === opts.group.toLowerCase());
      if (!group) { console.error("Group not found."); process.exit(1); }
      keywords = group.keywords;
    }

    const results = await trackAndSave(keywords, country);
    printConsoleReport(results);
    const file = saveReport(results);
    console.log(`✓ Report saved: ${file}\n`);
  });

// ── sitemap ──────────────────────────────────────────────────────────────────
program
  .command("sitemap")
  .description("Generate sitemap.xml for your site")
  .action(() => {
    const file = saveSitemap();
    console.log(`\n✓ Sitemap generated: ${file}`);
    console.log("  Upload this file to the root of your website.\n");
  });

// ── schema ───────────────────────────────────────────────────────────────────
program
  .command("schema")
  .description("Generate JSON-LD schema markup for all pages")
  .action(() => {
    const dir = saveSchemas();
    console.log(`\n✓ Schema files generated in: ${dir}`);
    console.log("  Paste each .jsonld file's <script> tag into the <head> of the matching page.\n");
  });

// ── report ───────────────────────────────────────────────────────────────────
program
  .command("report")
  .description("Print latest keyword performance from saved history")
  .action(() => {
    const { getHistory } = require("./tracking/gsc");
    const results = ALL_KEYWORDS.map((kw) => {
      const h = getHistory(kw);
      return h.length > 0 ? h[h.length - 1] : null;
    }).filter(Boolean);

    if (!results.length) {
      console.log("\nNo data yet. Run: seo track\n"); return;
    }
    printConsoleReport(results as any);
  });

// ── keywords ─────────────────────────────────────────────────────────────────
program
  .command("keywords")
  .description("List all configured keywords")
  .action(() => {
    for (const g of KEYWORD_GROUPS) {
      console.log(`\n  ◈ ${g.group} → ${g.targetPage}`);
      g.keywords.forEach((k) => console.log(`    - ${k}`));
    }
    console.log(`\n  Total: ${ALL_KEYWORDS.length} keywords\n`);
  });

program.parse(process.argv);
