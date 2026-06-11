import * as fs from "fs";
import * as path from "path";

export interface KeywordGroup {
  group: string;
  keywords: string[];
  targetPage: string;
  schemaType: string;
}

export interface BrandConfig {
  slug: string;
  name: string;
  type: "restaurant" | "saas" | "ecommerce" | "other";
  siteUrl: string;
  gscSiteUrl: string;
  gscCredentialsFile: string;
  targetCountry: string;
  gscCountryCode: string;
  languages: string[];
  ollamaModel: string;
  keywordGroups: KeywordGroup[];
  pages: { path: string; label: string }[];
  apiEndpoints: { method: string; path: string; expect: number; label: string }[];
}

const BRANDS_DIR = path.join(process.cwd(), "brands");

export function listBrands(): string[] {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs.readdirSync(BRANDS_DIR).filter((d) => {
    const cfg = path.join(BRANDS_DIR, d, "brand.json");
    return fs.existsSync(cfg);
  });
}

export function loadBrand(slug: string): BrandConfig {
  const cfgPath = path.join(BRANDS_DIR, slug, "brand.json");
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `Brand "${slug}" not found.\nAvailable: ${listBrands().join(", ")}\nCreate with: seo brand add`
    );
  }
  return JSON.parse(fs.readFileSync(cfgPath, "utf8")) as BrandConfig;
}

export function brandOutputDir(slug: string, sub: "output" | "reports" | "logs"): string {
  const dir = path.join(BRANDS_DIR, slug, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createBrand(config: BrandConfig): void {
  const brandDir = path.join(BRANDS_DIR, config.slug);
  if (fs.existsSync(brandDir)) throw new Error(`Brand "${config.slug}" already exists.`);
  for (const sub of ["output", "reports", "logs"]) {
    fs.mkdirSync(path.join(brandDir, sub), { recursive: true });
    fs.writeFileSync(path.join(brandDir, sub, ".gitkeep"), "", "utf8");
  }
  fs.writeFileSync(
    path.join(brandDir, "brand.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf8"
  );
  console.log(`\n✓ Brand created: brands/${config.slug}/brand.json`);
  console.log(`  Next: add your GSC credentials to brands/${config.slug}/gsc-credentials.json`);
}
