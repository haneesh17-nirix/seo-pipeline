import * as fs from "fs";
import * as path from "path";
import { SITE, KEYWORD_GROUPS } from "../keywords/config";
import type { BrandConfig, KeywordGroup } from "../brands/loader";

interface SchemaPage {
  group: string;
  targetPage: string;
  schemaType: string;
  keywords: string[];
}

function buildSoftwareSchema(page: SchemaPage, brandName: string, siteUrl: string): object {
  const base = siteUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brandName,
    url: `${base}${page.targetPage}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: `${brandName}. Optimized for: ${page.keywords.slice(0, 3).join(", ")}.`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    brand: { "@type": "Brand", name: brandName },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "124",
      bestRating: "5",
    },
  };
}

function buildRestaurantSchema(page: SchemaPage, brandName: string, siteUrl: string): object {
  const base = siteUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: brandName,
    url: `${base}${page.targetPage}`,
    description: `${brandName}. ${page.keywords.slice(0, 2).join(", ")}.`,
    servesCuisine: "Middle Eastern",
    priceRange: "$$",
    hasMenu: `${base}/menu`,
    brand: { "@type": "Brand", name: brandName },
  };
}

function buildProductSchema(page: SchemaPage, brandName: string, siteUrl: string): object {
  const base = siteUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: page.group.replace("Brand – ", ""),
    url: `${base}${page.targetPage}`,
    description: `${brandName}. ${page.keywords.slice(0, 2).join(" · ")}.`,
    brand: { "@type": "Brand", name: brandName },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };
}

function buildOrganizationSchema(brandName: string, siteUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brandName,
    url: siteUrl,
    sameAs: [],
  };
}

function schemaForGroup(page: SchemaPage, brandName: string, siteUrl: string, brandType?: string): object {
  if (page.schemaType === "Restaurant") return buildRestaurantSchema(page, brandName, siteUrl);
  if (page.schemaType === "SoftwareApplication") return buildSoftwareSchema(page, brandName, siteUrl);
  return buildProductSchema(page, brandName, siteUrl);
}

export function generateAllSchemas(brand?: BrandConfig): Record<string, object> {
  const brandName = brand?.name ?? SITE.name;
  const siteUrl = brand?.siteUrl ?? SITE.url;
  const groups: SchemaPage[] = (brand?.keywordGroups ?? KEYWORD_GROUPS).map((g) => ({
    group: g.group,
    targetPage: g.targetPage,
    schemaType: g.schemaType,
    keywords: g.keywords,
  }));

  const schemas: Record<string, object> = {
    organization: buildOrganizationSchema(brandName, siteUrl),
  };

  for (const group of groups) {
    const key = group.targetPage.replace(/\//g, "") || "home";
    schemas[key] = schemaForGroup(group, brandName, siteUrl, brand?.type);
  }

  return schemas;
}

export function saveSchemas(brand?: BrandConfig, outputDir?: string): string {
  const dir = outputDir
    ? path.join(outputDir, "schema")
    : path.join(process.cwd(), "output", "schema");
  fs.mkdirSync(dir, { recursive: true });

  const schemas = generateAllSchemas(brand);
  for (const [name, schema] of Object.entries(schemas)) {
    const filePath = path.join(dir, `${name}.jsonld`);
    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
    fs.writeFileSync(filePath, scriptTag, "utf8");
  }

  return dir;
}
