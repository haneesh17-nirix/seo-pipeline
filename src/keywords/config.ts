export interface KeywordGroup {
  group: string;
  keywords: string[];
  targetPage: string; // URL path on your site
  schemaType: string; // schema.org type for this page
}

export const SITE = {
  url: "https://www.nyrix.aazhara.in",
  name: "Nyrix",
  brandNames: ["BlueMetal Pro", "Nyrix"],
  tagline: "Smart asset tracking and crusher management software",
};

export const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    group: "Crusher Apps",
    keywords: [
      "best crusher app",
      "crusher apps",
      "crusher application",
      "top crusher software",
      "BlueMetal Pro crusher app",
      "Nyrix crusher",
      "crusher management software",
    ],
    targetPage: "/crusher-app",
    schemaType: "SoftwareApplication",
  },
  {
    group: "Tracking Systems",
    keywords: [
      "tracking systems",
      "tracking software",
      "request tracking software",
      "asset tracking software",
      "asset tracking system",
      "request management software",
      "BlueMetal Pro tracking",
      "Nyrix tracking system",
    ],
    targetPage: "/tracking-software",
    schemaType: "SoftwareApplication",
  },
  {
    group: "Brand – BlueMetal Pro",
    keywords: [
      "BlueMetal Pro",
      "BlueMetal Pro software",
      "BlueMetal Pro app",
      "BlueMetal Pro review",
    ],
    targetPage: "/bluemetal-pro",
    schemaType: "Product",
  },
  {
    group: "Brand – Nyrix",
    keywords: [
      "Nyrix",
      "Nyrix software",
      "Nyrix app",
      "Nyrix asset tracking",
      "Nyrix review",
    ],
    targetPage: "/nyrix",
    schemaType: "Product",
  },
];

export const ALL_KEYWORDS = KEYWORD_GROUPS.flatMap((g) => g.keywords);

export const CONTENT_TYPES = [
  "blog-post",
  "landing-page",
  "meta-tags",
  "faq",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
