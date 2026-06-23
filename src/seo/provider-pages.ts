import * as fs from "fs";
import * as path from "path";
import { BrandConfig } from "../brands/loader";

// ── Provider-side landing pages ───────────────────────────────────────────────
// Three provider archetypes — each gets a city × archetype page:
//   quick-earner  — needs income today, no certification required
//   skilled-trade — plumber/electrician/carpenter/painter seeking gig work
//   certified-pro — licensed ITI-certified pro wanting premium, steady bookings
//
// AEO goal: own "plumbing jobs Kochi", "earn money Kerala app",
//           "ഗിഗ് ജോലി കേരളം", "electrician gig work" across Google + AI engines

interface ProviderArchetype {
  type: "quick-earner" | "skilled-trade" | "certified-pro";
  labelEn: string;
  labelMl: string;
  taglineEn: string;
  taglineMl: string;
  descriptionEn: string;
  descriptionMl: string;
  requirements: string[];
  earnings: string;
  earningsMl: string;
  benefits: string[];
  faqs: (city: string) => { q: string; a: string; qMl?: string; aMl?: string }[];
}

const ARCHETYPES: Record<string, ProviderArchetype> = {
  "quick-earner": {
    type: "quick-earner",
    labelEn: "Quick Earner",
    labelMl: "ത്വരിത വരുമാനം",
    taglineEn: "Need work today? Start earning within hours.",
    taglineMl: "ഇന്ന് ജോലി വേണോ? ഏതാനും മണിക്കൂറിനുള്ളിൽ സമ്പാദിക്കൂ.",
    descriptionEn: "No experience, no certification needed. If you can run errands, help with moving, assist tradespeople, or do basic cleaning — Sahayi has work for you. Get paid the same day.",
    descriptionMl: "അനുഭവമോ സർട്ടിഫിക്കേഷനോ ആവശ്യമില്ല. ദൗത്യങ്ങൾ ചെയ്യാൻ,引越しൽ സഹായിക്കാൻ, അല്ലെങ്കിൽ അടിസ്ഥാന ക്ലീനിംഗ് ചെയ്യാൻ സൗകര്യമുണ്ടെങ്കിൽ — Sahayi-യിൽ ജോലിയുണ്ട്. അന്നേ ദിവസം തന്നെ പണം ലഭിക്കും.",
    requirements: [
      "Smartphone with internet connection",
      "Valid government ID (Aadhaar)",
      "Willingness to work flexible hours",
      "Basic communication skills",
    ],
    earnings: "₹400–₹800 per day",
    earningsMl: "ദിവസം ₹400–₹800",
    benefits: [
      "Accept jobs near you — no commute pressure",
      "Flexible hours — work when you want",
      "Same-day payment via UPI or bank transfer",
      "No minimum commitment — take breaks anytime",
      "Customer ratings build your profile for better gigs",
    ],
    faqs: (city) => [
      {
        q: `Can I start earning on Sahayi in ${city} with no experience?`,
        a: `Yes. Sahayi has a Quick Earner category in ${city} that requires no prior experience or certification. Tasks include running errands, assisting in home shifting, basic cleaning support, and helping skilled tradespeople on-site. You can register, get verified, and accept your first booking on the same day.`,
        qMl: `${city}-ൽ അനുഭവമില്ലാതെ Sahayi-ൽ സമ്പാദിക്കാൻ സാധിക്കുമോ?`,
        aMl: `അതെ. Sahayi-യുടെ Quick Earner വിഭാഗത്തിൽ ${city}-ൽ മുൻ അനുഭവമോ സർട്ടിഫിക്കേഷനോ ആവശ്യമില്ല. ഒരേ ദിവസം രജിസ്ട്രർ ചെയ്ത് ആദ്യ ബുക്കിംഗ് സ്വീകരിക്കാം.`,
      },
      {
        q: `How much can I earn per day doing quick tasks in ${city}?`,
        a: `Quick earners in ${city} typically make ₹400–₹800 per day depending on the number of tasks completed. Errand running, moving assistance, and cleaning support are the most in-demand tasks. Payment is transferred directly to your bank account or UPI the same day.`,
        qMl: `${city}-ൽ ദ്രുത ജോലികൾ ചെയ്ത് ദിവസേന എത്ര സമ്പാദിക്കാം?`,
        aMl: `${city}-ലെ Quick Earners സാധാരണ ദിവസേന ₹400–₹800 സമ്പാദിക്കുന്നു. അതേ ദിവസം UPI അല്ലെങ്കിൽ ബാങ്ക് ട്രാൻസ്ഫർ വഴി പണം ലഭിക്കും.`,
      },
      {
        q: `What documents do I need to join Sahayi as a quick earner in ${city}?`,
        a: `You need a smartphone, a valid Aadhaar card for verification, and a bank account or UPI ID for payments. The registration takes about 10 minutes on the Sahayi app and approval usually comes within a few hours.`,
      },
      {
        q: `Is there a minimum number of hours I need to work on Sahayi in ${city}?`,
        a: `No. Sahayi is fully flexible — you set your own availability in the app. Accept tasks when you want, take breaks when you need. There's no minimum commitment or penalty for not accepting tasks.`,
      },
    ],
  },

  "skilled-trade": {
    type: "skilled-trade",
    labelEn: "Skilled Tradesperson",
    labelMl: "നൈപുണ്യ തൊഴിലാളി",
    taglineEn: "Your skill is your business. Sahayi finds you the customers.",
    taglineMl: "നിങ്ങളുടെ കഴിവ് നിങ്ങളുടെ ബിസിനസ്സ്. Sahayi ഉപഭോക്താക്കളെ കണ്ടെത്തുന്നു.",
    descriptionEn: "Plumber, electrician, carpenter, painter, AC technician — if you have a trade skill and want steady work without the overhead of running your own business, Sahayi connects you directly with homeowners in your city who need exactly your skill today.",
    descriptionMl: "പ്ലംബർ, ഇലക്ട്രീഷ്യൻ, ആശാരി, ചിത്രകാരൻ, AC ടെക്നീഷ്യൻ — നിങ്ങൾക്ക് ഒരു തൊഴിൽ കഴിവുണ്ടെങ്കിൽ, Sahayi നിങ്ങളുടെ നഗരത്തിലെ വീട്ടുടമകളുമായി നേരിട്ട് ബന്ധിപ്പിക്കും.",
    requirements: [
      "Minimum 1 year of practical experience in your trade",
      "Basic tools and equipment",
      "Smartphone with internet connection",
      "Valid government ID (Aadhaar)",
      "Willingness to complete a skill verification",
    ],
    earnings: "₹800–₹2500 per day",
    earningsMl: "ദിവസം ₹800–₹2500",
    benefits: [
      "Steady stream of bookings in your area — no marketing needed",
      "You set your service radius and availability",
      "Transparent pricing — customers see estimates before booking",
      "Build a rated profile that attracts premium clients over time",
      "Daily or weekly payouts to your bank or UPI",
      "Support team available if disputes arise",
    ],
    faqs: (city) => [
      {
        q: `How do I register as a plumber or electrician on Sahayi in ${city}?`,
        a: `Download the Sahayi app, choose "Join as Professional," select your trade (plumbing, electrical, etc.), upload your ID and any certifications, and complete a short skill verification. Approval takes 24–48 hours. Once verified, you start receiving job requests in ${city} matching your skills and location.`,
        qMl: `${city}-ൽ Sahayi-ൽ പ്ലംബർ അല്ലെങ്കിൽ ഇലക്ട്രീഷ്യൻ ആയി എങ്ങനെ രജിസ്റ്റർ ചെയ്യാം?`,
        aMl: `Sahayi ആപ്പ് ഡൗൺലോഡ് ചെയ്ത് "Join as Professional" തിരഞ്ഞെടുക്കുക. നിങ്ങളുടെ ട്രേഡ് തിരഞ്ഞെടുത്ത്, ID അപ്‌ലോഡ് ചെയ്ത്, ഒരു ചെറിയ skill verification പൂർത്തിയാക്കുക. 24–48 മണിക്കൂറിനുള്ളിൽ അംഗീകാരം ലഭിക്കും.`,
      },
      {
        q: `How much does a plumber earn per month on Sahayi in ${city}?`,
        a: `Skilled tradespeople in ${city} on Sahayi typically earn ₹800–₹2500 per working day depending on the service type and number of jobs. A plumber averaging 20 working days a month can earn ₹16,000–₹40,000. Electricians and AC technicians often earn at the higher end due to higher service rates.`,
        qMl: `${city}-ൽ Sahayi-ൽ ഒരു പ്ലംബർ മാസം എത്ര സമ്പാദിക്കും?`,
        aMl: `${city}-ൽ Sahayi-ൽ skilled tradespeople ദിവസം ₹800–₹2500 സമ്പാദിക്കുന്നു. മാസം 20 ദിവസം ജോലി ചെയ്യുന്ന ഒരു പ്ലംബർ ₹16,000–₹40,000 സമ്പാദിക്കാം.`,
      },
      {
        q: `Do I need a license to work on Sahayi as an electrician in ${city}?`,
        a: `A license is not mandatory to join Sahayi as an electrician in ${city}, but having one increases your visibility and unlocks premium job categories. Sahayi has a separate "Certified Professional" tier for licensed electricians that attracts higher-value bookings.`,
      },
      {
        q: `Can I work on Sahayi part-time alongside my current job in ${city}?`,
        a: `Yes. Many Sahayi tradespeople in ${city} use the platform for weekend or evening gigs alongside their primary employment. You control your availability entirely from the app — set working hours, accept only what fits your schedule.`,
      },
    ],
  },

  "certified-pro": {
    type: "certified-pro",
    labelEn: "Certified Professional",
    labelMl: "സർട്ടിഫൈഡ് പ്രൊഫഷണൽ",
    taglineEn: "Your certification deserves premium clients. Sahayi delivers them.",
    taglineMl: "നിങ്ങളുടെ സർട്ടിഫിക്കേഷൻ പ്രീമിയം ക്ലയന്റുകൾ അർഹിക്കുന്നു. Sahayi അവരെ നൽകുന്നു.",
    descriptionEn: "ITI-certified, licensed, experienced professionals who want a reliable pipeline of high-value clients without the overhead of marketing or collections. Sahayi's Certified Professional tier puts your verified credentials front and centre — customers choosing you know exactly who they're booking.",
    descriptionMl: "ITI-സർട്ടിഫൈഡ്, ലൈസൻസ്ഡ്, പരിചയസമ്പന്ന പ്രൊഫഷണലുകൾക്ക് Sahayi-യുടെ Certified Professional tier ഉചിതമാണ്. നിങ്ങളുടെ verified credentials ഉപഭോക്താക്കൾക്ക് മുന്നിൽ വ്യക്തമായി കാണിക്കുന്നു.",
    requirements: [
      "ITI / NSDC / trade license or equivalent certification",
      "Minimum 3 years of professional experience",
      "Smartphone with internet connection",
      "Valid government ID and professional license",
      "Completion of Sahayi's professional verification process",
    ],
    earnings: "₹1500–₹5000 per day",
    earningsMl: "ദിവസം ₹1500–₹5000",
    benefits: [
      "Certified Pro badge on your profile — customers see it before booking",
      "Priority placement in search results for your service and city",
      "Access to commercial and institutional clients (offices, hospitals, apartment complexes)",
      "Higher per-job rates than the standard tier",
      "Dedicated professional support line",
      "Monthly performance review and coaching",
      "Option to build and manage a small team under your profile",
    ],
    faqs: (city) => [
      {
        q: `What is the Certified Professional tier on Sahayi in ${city}?`,
        a: `The Certified Professional tier is Sahayi's highest provider tier in ${city}. It's for licensed, ITI-certified, or highly experienced tradespeople who want to attract premium residential, commercial, and institutional clients. Certified Pros appear at the top of search results with a verified badge and command higher rates than standard providers.`,
        qMl: `${city}-ൽ Sahayi-ൽ Certified Professional tier എന്താണ്?`,
        aMl: `Certified Professional tier ${city}-ൽ Sahayi-ൽ ഏറ്റവും ഉയർന്ന provider tier ആണ്. ലൈസൻസ്ഡ്, ITI-സർട്ടിഫൈഡ്, അനുഭവ സമ്പന്ന tradespeople-നുള്ളതാണ് ഇത്.`,
      },
      {
        q: `How do I get Certified Professional status on Sahayi in ${city}?`,
        a: `Apply through the Sahayi app's "Join as Professional" flow and select the Certified tier. Upload your ITI certificate, trade license, or equivalent professional credential. Sahayi's team will verify your documents and may conduct a brief skills assessment for certain trades. The process takes 3–5 business days.`,
      },
      {
        q: `Can Certified Professionals get commercial contracts through Sahayi in ${city}?`,
        a: `Yes. Certified Pros in ${city} are eligible for commercial and institutional work — office buildings, apartment complexes, hospitals, and hotels. These contracts are listed separately in the app and are not available to Quick Earner or Skilled Trade tier providers.`,
      },
      {
        q: `How much more do Certified Professionals earn compared to regular providers on Sahayi?`,
        a: `Certified Professionals on Sahayi typically earn 40–70% more per job than standard tier providers due to higher service rates, access to commercial contracts, and priority booking placement. In ${city}, daily earnings of ₹1500–₹5000 are common for full-time Certified Pros.`,
      },
    ],
  },
};

// ── Schema builders ───────────────────────────────────────────────────────────

function buildProviderSchema(archetype: ProviderArchetype, city: string, brand: BrandConfig): object[] {
  const faqs = archetype.faqs(city);

  const jobPosting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": `${archetype.labelEn} — ${city}`,
    "description": archetype.descriptionEn,
    "hiringOrganization": {
      "@type": "Organization",
      "name": "Sahayi",
      "sameAs": brand.siteUrl,
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": city,
        "addressRegion": "Kerala",
        "addressCountry": "IN",
      }
    },
    "employmentType": "CONTRACTOR",
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "INR",
      "value": {
        "@type": "QuantitativeValue",
        "minValue": archetype.type === "quick-earner" ? 400 : archetype.type === "skilled-trade" ? 800 : 1500,
        "maxValue": archetype.type === "quick-earner" ? 800 : archetype.type === "skilled-trade" ? 2500 : 5000,
        "unitText": "DAY",
      }
    },
    "qualifications": archetype.requirements.join(". "),
    "validThrough": "2027-12-31",
    "datePosted": new Date().toISOString().split("T")[0],
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

  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to Join Sahayi as a ${archetype.labelEn} in ${city}`,
    "description": `Steps to register on Sahayi as a ${archetype.labelEn.toLowerCase()} and start earning in ${city}.`,
    "totalTime": "PT10M",
    "step": [
      { "@type": "HowToStep", "position": 1, "name": "Download Sahayi", "text": "Download the Sahayi app from Google Play or App Store." },
      { "@type": "HowToStep", "position": 2, "name": "Select your tier", "text": `Choose "Join as Professional" and select the ${archetype.labelEn} category.` },
      { "@type": "HowToStep", "position": 3, "name": "Upload documents", "text": "Upload your Aadhaar card and any relevant certifications." },
      { "@type": "HowToStep", "position": 4, "name": "Set your location", "text": `Set your service area within ${city}. Choose how far you're willing to travel.` },
      { "@type": "HowToStep", "position": 5, "name": "Start earning", "text": "Once approved, you'll receive job notifications matching your skills. Accept and earn." },
    ]
  };

  return [jobPosting, faqSchema, howTo];
}

function buildProviderHtml(archetype: ProviderArchetype, city: string, brand: BrandConfig, schema: object[]): string {
  const faqs = archetype.faqs(city);
  const schemaBlocks = schema.map(s =>
    `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`
  ).join("\n");

  const faqHtml = faqs.map(({ q, a, qMl, aMl }) => `
  <div class="faq-item">
    <h3>${q}</h3>
    <p>${a}</p>
    ${qMl ? `<details class="faq-ml"><summary>${qMl}</summary><p>${aMl}</p></details>` : ""}
  </div>`).join("\n");

  const benefitsHtml = archetype.benefits.map(b => `<li>${b}</li>`).join("\n");
  const requirementsHtml = archetype.requirements.map(r => `<li>${r}</li>`).join("\n");

  return `${schemaBlocks}

<article class="provider-page provider-${archetype.type}" lang="en">
  <header>
    <p class="page-label">${archetype.labelMl} · ${archetype.labelEn}</p>
    <h1>${archetype.taglineEn}</h1>
    <p class="lead-ml">${archetype.taglineMl}</p>
    <p class="lead">${archetype.descriptionEn}</p>
    <div class="earnings-callout">
      <span class="earnings-en">Earn <strong>${archetype.earnings}</strong></span>
      <span class="earnings-ml">${archetype.earningsMl}</span>
    </div>
    <a href="${brand.siteUrl}/join/${archetype.type}" class="cta-primary">Join Sahayi in ${city} — Free</a>
    <p class="cta-note">Registration is free. No commission until your first booking.</p>
  </header>

  <section class="requirements">
    <h2>What you need to join</h2>
    <ul>${requirementsHtml}</ul>
  </section>

  <section class="benefits">
    <h2>Why ${city} professionals choose Sahayi</h2>
    <ul>${benefitsHtml}</ul>
  </section>

  <section class="how-to-join">
    <h2>How to start earning in ${city}</h2>
    <ol>
      <li><strong>Download Sahayi</strong> — available on Google Play and App Store. Free.</li>
      <li><strong>Select "${archetype.labelEn}"</strong> under "Join as Professional".</li>
      <li><strong>Upload your Aadhaar</strong> and any relevant certifications.</li>
      <li><strong>Set your service area</strong> in ${city} — choose your radius.</li>
      <li><strong>Get verified and start</strong> — first bookings typically arrive within 24–48 hours of approval.</li>
    </ol>
  </section>

  <section class="faqs">
    <h2>Questions about earning with Sahayi in ${city}</h2>
    ${faqHtml}
  </section>

  <footer class="page-cta">
    <h2>Start earning in ${city} today</h2>
    <p>${archetype.taglineMl}</p>
    <a href="${brand.siteUrl}/join/${archetype.type}" class="cta-primary">Register on Sahayi — Free</a>
  </footer>
</article>`;
}

// ── Malayalam homepage content ─────────────────────────────────────────────────

export function buildMalayalamPage(brand: BrandConfig): { html: string; schema: object[] } {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "inLanguage": "ml",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Sahayi ആപ്പ് എന്താണ്?",
        "acceptedAnswer": { "@type": "Answer", "text": "Sahayi കേരളത്തിലെ ഒരു ഹോം സർവീസസ് മാർക്കറ്റ്പ്ലേസ് ആണ്. പ്ലംബർ, ഇലക്ട്രീഷ്യൻ, ക്ലീനർ, ആശാരി തുടങ്ങിയ verified professionals-നെ നിങ്ങളുടെ വീടിൻ്റെ അടുത്ത് കണ്ടെത്തി ബുക്ക് ചെയ്യാൻ Sahayi സഹായിക്കുന്നു." }
      },
      {
        "@type": "Question",
        "name": "Sahayi-ൽ എങ്ങനെ ഒരു പ്ലംബറെ ബുക്ക് ചെയ്യാം?",
        "acceptedAnswer": { "@type": "Answer", "text": "Sahayi ആപ്പ് തുറന്ന്, 'Plumbing' തിരഞ്ഞെടുക്കുക, നിങ്ങളുടെ ലൊക്കേഷൻ നൽകുക, available professionals-നെ കാണുക, ഒരു സമയം തിരഞ്ഞെടുക്കുക, confirm ചെയ്യുക. ജോലി കഴിഞ്ഞ ശേഷം pay ചെയ്യുക." }
      },
      {
        "@type": "Question",
        "name": "Sahayi-ൽ ജോലി ചെയ്യുന്ന professionals verified ആണോ?",
        "acceptedAnswer": { "@type": "Answer", "text": "അതെ. Sahayi-ൽ ജോലി ചെയ്യുന്ന എല്ലാ professionals-ഉം background check, skill verification, customer rating process-ലൂടെ കടന്നുപോകുന്നു. Verified badge ഇല്ലാതെ bookings സ്വീകരിക്കാൻ കഴിയില്ല." }
      },
      {
        "@type": "Question",
        "name": "Sahayi-ൽ ഒരു professional ആയി join ചെയ്യാൻ എന്ത് ചെയ്യണം?",
        "acceptedAnswer": { "@type": "Answer", "text": "Sahayi ആപ്പ് ഡൗൺലോഡ് ചെയ്ത്, 'Join as Professional' തിരഞ്ഞെടുക്കുക. Aadhaar card, ബന്ധപ്പെട്ട certifications (ഉണ്ടെങ്കിൽ) upload ചെയ്ത്, skill verification complete ചെയ്യുക. 24-48 മണിക്കൂറിനുള്ളിൽ approval ലഭിക്കും." }
      },
      {
        "@type": "Question",
        "name": "Sahayi-ൽ ഒരു ദിവസം എത്ര സമ്പാദിക്കാം?",
        "acceptedAnswer": { "@type": "Answer", "text": "Quick Earners ദിവസം ₹400–₹800 സമ്പാദിക്കും. Skilled tradespeople (plumber, electrician) ₹800–₹2500. Certified Professionals ₹1500–₹5000 വരെ. Payment അതേ ദിവസം UPI അല്ലെങ്കിൽ bank transfer-ൽ ലഭിക്കും." }
      },
    ]
  };

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Sahayi",
    "alternateName": ["സഹായി", "Sahayi App", "Sahayi Kerala"],
    "url": brand.siteUrl,
    "description": "കേരളത്തിലെ ഹോം സർവീസസ് മാർക്കറ്റ്പ്ലേസ്. Verified professionals, transparent pricing.",
    "areaServed": { "@type": "State", "name": "Kerala" },
    "availableLanguage": ["Malayalam", "English", "Hindi"],
  };

  const html = `
<script type="application/ld+json">${JSON.stringify(faqSchema, null, 2)}</script>
<script type="application/ld+json">${JSON.stringify(orgSchema, null, 2)}</script>

<article class="malayalam-page" lang="ml">
  <header>
    <h1>Sahayi — കേരളത്തിലെ വിശ്വസ്ത ഹോം സർവീസസ്</h1>
    <p class="lead">നിങ്ങളുടെ വീടിനടുത്ത് verified plumber, electrician, cleaner, carpenter — 2 മിനിറ്റിൽ ബുക്ക് ചെയ്യൂ. ജോലി കഴിഞ്ഞ ശേഷം pay ചെയ്യൂ.</p>
    <a href="${brand.siteUrl}/download" class="cta-primary">Sahayi ആപ്പ് ഡൗൺലോഡ് ചെയ്യൂ — സൗജന്യം</a>
  </header>

  <section class="services-ml">
    <h2>ഞങ്ങളുടെ സേവനങ്ങൾ</h2>
    <ul>
      <li><strong>Plumbing</strong> — pipe leak, bathroom fitting, water tank cleaning</li>
      <li><strong>Electrical</strong> — wiring, fan installation, switchboard repair</li>
      <li><strong>Cleaning</strong> — home cleaning, deep cleaning, sofa cleaning</li>
      <li><strong>AC Servicing</strong> — AC gas refill, AC repair, annual maintenance</li>
      <li><strong>Carpentry</strong> — furniture repair, door fixing, false ceiling</li>
      <li><strong>Quick Tasks</strong> — errands, moving help, handyman jobs</li>
    </ul>
  </section>

  <section class="how-it-works-ml">
    <h2>Sahayi എങ്ങനെ പ്രവർത്തിക്കുന്നു?</h2>
    <ol>
      <li><strong>ആപ്പ് തുറക്കുക</strong> — Sahayi ആപ്പ് ഡൗൺലോഡ് ചെയ്ത് നിങ്ങളുടെ location നൽകുക.</li>
      <li><strong>സേവനം തിരഞ്ഞെടുക്കുക</strong> — ആവശ്യമായ service select ചെയ്യുക. Rated professionals-നെ കാണുക.</li>
      <li><strong>ബുക്ക് ചെയ്യുക</strong> — ഒരു സമയം തിരഞ്ഞെടുക്കുക. Cost upfront-ൽ കാണാം.</li>
      <li><strong>Track ചെയ്യുക</strong> — Professional വരുന്ന വഴി live-ൽ track ചെയ്യാം.</li>
      <li><strong>ജോലി കഴിഞ്ഞ ശേഷം pay ചെയ്യുക</strong> — UPI, cash, or card.</li>
    </ol>
  </section>

  <section class="join-ml">
    <h2>Sahayi-ൽ professional ആയി join ചെയ്യൂ</h2>
    <p>Plumber, electrician, cleaner, ആശാരി — നിങ്ങൾക്ക് ഒരു skill ഉണ്ടെങ്കിൽ Sahayi-ൽ ജോലി ഉണ്ട്. Registration സൗജന്യം. ആദ്യ ദിവസം തന്നെ ജോലി ലഭിക്കാം.</p>
    <div class="earning-tiers-ml">
      <div class="tier"><strong>Quick Earner</strong><br>ദിവസം ₹400–₹800<br><small>Experience ആവശ്യമില്ല</small></div>
      <div class="tier"><strong>Skilled Trade</strong><br>ദിവസം ₹800–₹2500<br><small>Plumber, Electrician etc.</small></div>
      <div class="tier"><strong>Certified Pro</strong><br>ദിവസം ₹1500–₹5000<br><small>ITI / Licensed professionals</small></div>
    </div>
    <a href="${brand.siteUrl}/join" class="cta-secondary">Join ചെയ്യൂ — സൗജന്യം</a>
  </section>

  <section class="faqs-ml">
    <h2>പതിവ് ചോദ്യങ്ങൾ</h2>
    <div class="faq-item">
      <h3>Sahayi ആപ്പ് എന്താണ്?</h3>
      <p>Sahayi കേരളത്തിലെ ഒരു ഹോം സർവീസസ് മാർക്കറ്റ്പ്ലേസ് ആണ്. Verified professionals-നെ നിങ്ങളുടെ വീടിൻ്റെ അടുത്ത് കണ്ടെത്തി ബുക്ക് ചെയ്യാൻ Sahayi സഹായിക്കുന്നു.</p>
    </div>
    <div class="faq-item">
      <h3>Sahayi-ൽ professionals verified ആണോ?</h3>
      <p>അതെ. എല്ലാ professionals-ഉം background check, skill verification-ലൂടെ കടന്നുപോകുന്നു. Customer ratings പരസ്യമായി കാണാം.</p>
    </div>
    <div class="faq-item">
      <h3>Sahayi-ൽ ഒരു ദിവസം എത്ര സമ്പാദിക്കാം?</h3>
      <p>Quick Earners ₹400–₹800, Skilled Tradespeople ₹800–₹2500, Certified Professionals ₹1500–₹5000. Payment അതേ ദിവസം UPI-ൽ ലഭിക്കും.</p>
    </div>
  </section>
</article>`;

  return { html, schema: [faqSchema, orgSchema] };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateProviderPage(archetypeKey: string, city: string, brand: BrandConfig) {
  const archetype = ARCHETYPES[archetypeKey];
  if (!archetype) throw new Error(`Unknown archetype: ${archetypeKey}`);
  const schema = buildProviderSchema(archetype, city, brand);
  const html = buildProviderHtml(archetype, city, brand, schema);
  return {
    slug: `join-${archetypeKey}-${city.toLowerCase()}`,
    title: `${archetype.labelEn} Jobs in ${city} — Earn with Sahayi`,
    metaDescription: `${archetype.taglineEn} Join Sahayi in ${city} — ${archetype.earnings}. Free registration.`,
    html,
    schema,
    archetype: archetypeKey,
    city,
  };
}

export function saveProviderPages(brand: BrandConfig): string[] {
  const cities: string[] = (brand as any).targetCities ?? [];
  const dir = path.join(process.cwd(), "brands", brand.slug, "output", "provider-pages");
  fs.mkdirSync(dir, { recursive: true });
  const saved: string[] = [];

  for (const archetypeKey of Object.keys(ARCHETYPES)) {
    for (const city of cities) {
      const page = generateProviderPage(archetypeKey, city, brand);
      const htmlFile = path.join(dir, `${page.slug}.html`);
      fs.writeFileSync(htmlFile, page.html, "utf8");
      fs.writeFileSync(path.join(dir, `${page.slug}.schema.json`), JSON.stringify(page.schema, null, 2), "utf8");
      fs.writeFileSync(path.join(dir, `${page.slug}.meta.json`), JSON.stringify({
        slug: page.slug, title: page.title, metaDescription: page.metaDescription,
        archetype: archetypeKey, city,
      }, null, 2), "utf8");
      saved.push(htmlFile);
    }
  }

  // Malayalam page
  const mlPage = buildMalayalamPage(brand);
  fs.writeFileSync(path.join(dir, "sahayi-ml.html"), mlPage.html, "utf8");
  fs.writeFileSync(path.join(dir, "sahayi-ml.schema.json"), JSON.stringify(mlPage.schema, null, 2), "utf8");
  saved.push(path.join(dir, "sahayi-ml.html"));

  return saved;
}
