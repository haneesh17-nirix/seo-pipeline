import * as fs from "fs";
import * as path from "path";
import { SITE, KEYWORD_GROUPS } from "../keywords/config";

// Generates JSON-LD schema markup for each keyword group page
// Paste the output into the <head> of the corresponding page

interface SchemaPage {
  group: string;
  targetPage: string;
  schemaType: string;
  keywords: string[];
}

function buildSoftwareSchema(page: SchemaPage): object {
  const base = SITE.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    url: `${base}${page.targetPage}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: `${SITE.tagline}. Optimized for: ${page.keywords.slice(0, 3).join(", ")}.`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    brand: {
      "@type": "Brand",
      name: SITE.name,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "124",
      bestRating: "5",
    },
  };
}

function buildProductSchema(page: SchemaPage): object {
  const base = SITE.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: page.group.replace("Brand – ", ""),
    url: `${base}${page.targetPage}`,
    description: `${SITE.tagline}. ${page.keywords.slice(0, 2).join(" · ")}.`,
    brand: {
      "@type": "Brand",
      name: SITE.name,
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "124",
      bestRating: "5",
    },
  };
}

function buildFaqSchema(faqs: { question: string; answer: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

function buildOrganizationSchema(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.tagline,
    sameAs: [],
  };
}

export function generateAllSchemas(): Record<string, object> {
  const schemas: Record<string, object> = {
    organization: buildOrganizationSchema(),
  };

  for (const group of KEYWORD_GROUPS) {
    const key = group.targetPage.replace("/", "");
    schemas[key] =
      group.schemaType === "SoftwareApplication"
        ? buildSoftwareSchema(group)
        : buildProductSchema(group);
  }

  return schemas;
}

export function saveSchemas(outputDir?: string): string {
  const dir = outputDir ?? path.join(process.cwd(), "output", "schema");
  fs.mkdirSync(dir, { recursive: true });

  const schemas = generateAllSchemas();
  for (const [name, schema] of Object.entries(schemas)) {
    const filePath = path.join(dir, `${name}.jsonld`);
    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
    fs.writeFileSync(filePath, scriptTag, "utf8");
  }

  return dir;
}
