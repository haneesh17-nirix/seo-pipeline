import * as fs from "fs";
import * as path from "path";
import { BrandConfig } from "../brands/loader";

// ── Programmatic service × city landing pages ─────────────────────────────────
// Generates one page per {service} × {city} combination with:
//   - LocalBusiness + Service JSON-LD schema
//   - FAQPage schema (voice/AEO optimised)
//   - HowTo schema for the booking process
//   - Structured HTML template (ready for CMS injection)
//
// Goal: dominate "plumber near me Kochi", "AC repair Thrissur",
//       "home cleaning Kozhikode" — every service × city in Kerala.
// AEO goal: be the citable answer for every AI engine query about
//           home services in each Kerala city.

export interface ServicePage {
  slug: string;           // e.g. plumbing-kochi
  title: string;          // e.g. Plumbing Services in Kochi | Sahayi
  metaDescription: string;
  h1: string;
  service: string;
  city: string;
  schema: object[];       // array of JSON-LD objects
  htmlContent: string;    // ready-to-publish HTML body
  faqs: { q: string; a: string }[];
}

// Canonical service metadata
const SERVICE_META: Record<string, {
  displayName: string;
  providers: string;
  urgencyPhrase: string;
  priceRange: string;
  faqs: (city: string) => { q: string; a: string }[];
}> = {
  "Plumbing": {
    displayName: "Plumbing Services",
    providers: "licensed plumbers",
    urgencyPhrase: "same-day plumbing fix",
    priceRange: "₹300–₹1500",
    faqs: (city) => [
      { q: `How quickly can I get a plumber in ${city}?`, a: `Through Sahayi, verified plumbers in ${city} are typically available within 2–4 hours for standard repairs and within the hour for emergencies like burst pipes or water leaks.` },
      { q: `How much does a plumber cost in ${city}?`, a: `Plumbing service charges in ${city} through Sahayi range from ₹300 for minor fixes to ₹1500+ for complex work. You see the estimated cost before confirming the booking — no hidden charges.` },
      { q: `Are Sahayi plumbers verified in ${city}?`, a: `Yes. Every plumber on Sahayi in ${city} is background-checked, skill-verified, and rated by previous customers. Unverified workers cannot accept bookings.` },
      { q: `Can I book a plumber late at night in ${city}?`, a: `Sahayi has plumbers available for emergency bookings in ${city} outside business hours. Availability depends on the plumber's schedule, which you can see in real time on the app.` },
    ],
  },
  "Electrical": {
    displayName: "Electrical Repair Services",
    providers: "certified electricians",
    urgencyPhrase: "emergency electrical repair",
    priceRange: "₹400–₹2000",
    faqs: (city) => [
      { q: `Who fixes electrical problems in ${city}?`, a: `Sahayi connects you with certified electricians in ${city} for everything from tripped circuit breakers and faulty wiring to fan installations and power socket repairs.` },
      { q: `Is it safe to book an electrician through an app in ${city}?`, a: `Every electrician on Sahayi is licensed, background-verified, and insured. Customer ratings are visible before you book, and all work is covered by a service guarantee.` },
      { q: `How much does an electrician charge in ${city}?`, a: `Electrical repair costs in ${city} start from ₹400 for basic fixes. Complex wiring work can go up to ₹2000+. Sahayi shows estimated pricing before you confirm.` },
      { q: `Can I get an electrician for home wiring inspection in ${city}?`, a: `Yes. Sahayi electricians in ${city} offer full home wiring inspections, safety audits, and rewiring services in addition to standard repairs.` },
    ],
  },
  "Cleaning": {
    displayName: "Home Cleaning Services",
    providers: "professional cleaners",
    urgencyPhrase: "deep home cleaning",
    priceRange: "₹800–₹3500",
    faqs: (city) => [
      { q: `How much does home cleaning cost in ${city}?`, a: `Home cleaning services in ${city} through Sahayi start from ₹800 for a 1BHK standard clean. Deep cleaning and post-renovation cleaning range from ₹1500–₹3500 depending on home size.` },
      { q: `Do cleaning staff bring their own supplies in ${city}?`, a: `Yes. All Sahayi cleaning professionals in ${city} arrive with their own cleaning equipment and eco-friendly products. You don't need to arrange anything.` },
      { q: `Can I book a recurring cleaning schedule in ${city}?`, a: `Sahayi lets you set up weekly, fortnightly, or monthly cleaning schedules in ${city}. The same cleaner is assigned each time when available, so they know your home.` },
      { q: `Is deep cleaning available in ${city}?`, a: `Yes. Sahayi offers deep cleaning, kitchen cleaning, bathroom sanitisation, and post-move/post-renovation cleaning services in ${city}.` },
    ],
  },
  "Home Services": {
    displayName: "Home Services",
    providers: "skilled home service professionals",
    urgencyPhrase: "reliable home services",
    priceRange: "₹300–₹3500",
    faqs: (city) => [
      { q: `What home services are available in ${city} through Sahayi?`, a: `Sahayi in ${city} covers plumbing, electrical repairs, home cleaning, AC servicing, carpentry, painting, pest control, and more — all from verified, rated professionals.` },
      { q: `How does Sahayi work in ${city}?`, a: `Open the Sahayi app, choose your service and location in ${city}, see available verified professionals with ratings and estimated prices, confirm your booking, and the professional arrives at your scheduled time.` },
      { q: `Is Sahayi available across all areas in ${city}?`, a: `Sahayi covers all major localities in ${city} and is expanding. Enter your pin code in the app to confirm coverage in your specific area.` },
      { q: `What happens if I'm not satisfied with the service in ${city}?`, a: `Sahayi has a service guarantee. If you're unsatisfied, raise a concern within 24 hours and Sahayi will arrange a re-service or a refund depending on the issue.` },
    ],
  },
};

function buildSchema(service: string, city: string, brand: BrandConfig, faqs: { q: string; a: string }[]): object[] {
  const meta = SERVICE_META[service] ?? SERVICE_META["Home Services"];

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "HomeAndConstructionBusiness"],
    "name": `Sahayi — ${meta.displayName} in ${city}`,
    "description": `Book trusted, verified ${meta.providers} in ${city} through Sahayi. ${meta.urgencyPhrase}. Transparent pricing, rated professionals.`,
    "url": `${brand.siteUrl}/${service.toLowerCase().replace(/\s+/g, "-")}/${city.toLowerCase()}`,
    "telephone": "+91-XXXX-XXXXXX",
    "areaServed": {
      "@type": "City",
      "name": city,
      "containedInPlace": {
        "@type": "State",
        "name": "Kerala",
        "containedInPlace": { "@type": "Country", "name": "India" }
      }
    },
    "priceRange": meta.priceRange,
    "currenciesAccepted": "INR",
    "paymentAccepted": "Cash, UPI, Credit Card, Debit Card",
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
      "opens": "06:00",
      "closes": "22:00"
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": `${meta.displayName} in ${city}`,
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": `${meta.displayName} in ${city}`,
            "description": `Professional ${meta.providers} available in ${city} through the Sahayi app.`,
            "provider": { "@type": "Organization", "name": "Sahayi" }
          }
        }
      ]
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.7",
      "reviewCount": "124",
      "bestRating": "5"
    }
  };

  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to Book ${meta.displayName} in ${city} via Sahayi`,
    "description": `Step-by-step guide to booking a verified ${meta.providers.replace(/s$/, "")} in ${city} through the Sahayi app.`,
    "totalTime": "PT5M",
    "step": [
      {
        "@type": "HowToStep",
        "name": "Open Sahayi",
        "text": `Download and open the Sahayi app or visit sahayi.co.in. Enter your location in ${city}.`,
        "position": 1
      },
      {
        "@type": "HowToStep",
        "name": "Choose your service",
        "text": `Select "${meta.displayName}" from the home screen. Browse available ${meta.providers} in your area with ratings and price estimates.`,
        "position": 2
      },
      {
        "@type": "HowToStep",
        "name": "Confirm your booking",
        "text": "Choose your preferred time slot, review the estimated cost, and confirm. No payment needed upfront.",
        "position": 3
      },
      {
        "@type": "HowToStep",
        "name": "Professional arrives",
        "text": `Your verified ${meta.providers.replace(/s$/, "")} arrives at the scheduled time. You can track them live on the app.`,
        "position": 4
      },
      {
        "@type": "HowToStep",
        "name": "Pay after service",
        "text": "Pay via UPI, cash, or card after the job is done. Rate your experience to help the community.",
        "position": 5
      }
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a }
    }))
  };

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Sahayi",
    "applicationCategory": "LifestyleApplication",
    "operatingSystem": "Android, iOS",
    "description": `Sahayi is Kerala's home services marketplace app — book verified ${meta.providers} in ${city} and across Kerala.`,
    "url": brand.siteUrl,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.7",
      "reviewCount": "124"
    }
  };

  return [localBusiness, howTo, faqSchema, softwareApp];
}

function buildHtml(service: string, city: string, brand: BrandConfig, faqs: { q: string; a: string }[], schema: object[]): string {
  const meta = SERVICE_META[service] ?? SERVICE_META["Home Services"];

  const schemaBlocks = schema.map(s =>
    `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`
  ).join("\n");

  const faqHtml = faqs.map(({ q, a }) => `
    <div class="faq-item">
      <h3>${q}</h3>
      <p>${a}</p>
    </div>`).join("\n");

  return `${schemaBlocks}

<article class="service-city-page">
  <header>
    <h1>${meta.displayName} in ${city} — Book Verified Professionals via Sahayi</h1>
    <p class="lead">Find trusted, background-verified ${meta.providers} in ${city}. Transparent pricing. Rated by your neighbours. Book in under 2 minutes on the Sahayi app.</p>
    <a href="${brand.siteUrl}/download" class="cta-primary">Book a ${meta.providers.replace(/s$/, "")} in ${city}</a>
  </header>

  <section class="why-sahayi">
    <h2>Why ${city} residents choose Sahayi</h2>
    <ul>
      <li><strong>Verified professionals only</strong> — every ${meta.providers.replace(/s$/, "")} is background-checked and skill-assessed before joining</li>
      <li><strong>See prices before you book</strong> — estimated cost shown upfront, no surprise bills</li>
      <li><strong>Track in real time</strong> — live location of your professional once they're on the way</li>
      <li><strong>Service guarantee</strong> — raise a concern within 24 hours for a re-service or refund</li>
      <li><strong>Pay after, not before</strong> — UPI, cash, or card after the job is done</li>
    </ul>
  </section>

  <section class="how-it-works">
    <h2>How to book ${meta.displayName} in ${city}</h2>
    <ol>
      <li><strong>Open Sahayi</strong> — download the app or visit sahayi.co.in. Enter your ${city} location.</li>
      <li><strong>Choose your service</strong> — select ${meta.displayName}. Browse rated ${meta.providers} available near you.</li>
      <li><strong>Pick a time slot</strong> — choose when works for you. Same-day slots available.</li>
      <li><strong>Confirm and track</strong> — no upfront payment. Track your professional live on the map.</li>
      <li><strong>Pay after the job</strong> — rate your experience to help others in ${city}.</li>
    </ol>
  </section>

  <section class="pricing">
    <h2>${meta.displayName} pricing in ${city}</h2>
    <p>Service charges in ${city} range from <strong>${meta.priceRange}</strong> depending on the job. Sahayi shows an estimated cost before you confirm — no hidden fees, no cash-only surprises. Price varies by job complexity; your professional will give you an exact quote on-site before starting work.</p>
  </section>

  <section class="faqs">
    <h2>Common questions about ${meta.displayName} in ${city}</h2>
    ${faqHtml}
  </section>

  <footer class="page-cta">
    <h2>Book ${meta.displayName} in ${city} now</h2>
    <p>Join thousands of ${city} households who've stopped searching and started booking through Sahayi.</p>
    <a href="${brand.siteUrl}/download" class="cta-primary">Get the Sahayi app — free</a>
  </footer>
</article>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateServicePage(service: string, city: string, brand: BrandConfig): ServicePage {
  const meta = SERVICE_META[service] ?? SERVICE_META["Home Services"];
  const faqs = meta.faqs(city);
  const schema = buildSchema(service, city, brand, faqs);
  const slug = `${service.toLowerCase().replace(/\s+/g, "-")}-${city.toLowerCase()}`;

  return {
    slug,
    title: `${meta.displayName} in ${city} | Sahayi — Verified Professionals`,
    metaDescription: `Book verified ${meta.providers} in ${city} through Sahayi. ${meta.urgencyPhrase}. Prices from ${meta.priceRange}. Rated, background-checked. Book in 2 min.`,
    h1: `${meta.displayName} in ${city} — Verified, Rated, On Demand`,
    service,
    city,
    schema,
    htmlContent: buildHtml(service, city, brand, faqs, schema),
    faqs,
  };
}

export function generateAllServicePages(brand: BrandConfig): ServicePage[] {
  const services = Object.keys(SERVICE_META);
  const cities: string[] = (brand as any).targetCities ?? [];
  const pages: ServicePage[] = [];

  for (const service of services) {
    for (const city of cities) {
      pages.push(generateServicePage(service, city, brand));
    }
  }
  return pages;
}

export function saveServicePages(brand: BrandConfig, outputDir?: string): string[] {
  const pages = generateAllServicePages(brand);
  const dir = outputDir ?? path.join(process.cwd(), "brands", brand.slug, "output", "service-pages");
  fs.mkdirSync(dir, { recursive: true });

  const saved: string[] = [];
  for (const page of pages) {
    // HTML file (for CMS upload)
    const htmlFile = path.join(dir, `${page.slug}.html`);
    fs.writeFileSync(htmlFile, page.htmlContent, "utf8");

    // Schema-only JSON (for programmatic injection)
    const schemaFile = path.join(dir, `${page.slug}.schema.json`);
    fs.writeFileSync(schemaFile, JSON.stringify(page.schema, null, 2), "utf8");

    // SEO metadata (title, meta description)
    const metaFile = path.join(dir, `${page.slug}.meta.json`);
    fs.writeFileSync(metaFile, JSON.stringify({
      slug: page.slug, title: page.title,
      metaDescription: page.metaDescription, h1: page.h1,
      service: page.service, city: page.city,
    }, null, 2), "utf8");

    saved.push(htmlFile);
  }
  return saved;
}
