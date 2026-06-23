import axios from "axios";
import * as fs from "fs";
import { ReviewItem } from "../approval/telegram-bot";

// Google Ads API v17 — create RSA (Responsive Search Ads) drafts
// All ads are created as PAUSED drafts. Owner enables spend manually.
// Auth: OAuth2 refresh token (same pattern as GSC)

interface AdsCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;       // Google Ads account ID (without dashes)
  loginCustomerId?: string; // MCC account if applicable
}

function adsCreds(brand: string): AdsCreds {
  const prefix = brand.toUpperCase().replace(/-/g, "_");
  return {
    clientId:      process.env[`${prefix}_ADS_CLIENT_ID`]      ?? process.env.GOOGLE_ADS_CLIENT_ID      ?? "",
    clientSecret:  process.env[`${prefix}_ADS_CLIENT_SECRET`]  ?? process.env.GOOGLE_ADS_CLIENT_SECRET  ?? "",
    refreshToken:  process.env[`${prefix}_ADS_REFRESH_TOKEN`]  ?? process.env.GOOGLE_ADS_REFRESH_TOKEN  ?? "",
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN     ?? "",
    customerId:    process.env[`${prefix}_ADS_CUSTOMER_ID`]    ?? process.env.GOOGLE_ADS_CUSTOMER_ID    ?? "",
  };
}

async function getAccessToken(creds: AdsCreds): Promise<string> {
  const res = await axios.post("https://oauth2.googleapis.com/token", {
    client_id:     creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type:    "refresh_token",
  });
  return res.data.access_token;
}

// ── Ad copy parser ────────────────────────────────────────────────────────────
// Parses the structured output from the parameterized generator's ad-copy type

export interface RsaAdCopy {
  headlines: string[];     // up to 15, max 30 chars each
  descriptions: string[];  // up to 4, max 90 chars each
  finalUrl: string;
  path1?: string;
  path2?: string;
}

export function parseAdCopy(content: string, brand: string, keyword: string): RsaAdCopy {
  const headlines: string[] = [];
  const descriptions: string[] = [];

  // Parse HEADLINES block
  const hlBlock = content.match(/HEADLINES?:?\s*\n([\s\S]+?)(?=DESCRIPTIONS?:|META_|$)/i)?.[1] ?? "";
  for (const line of hlBlock.split("\n")) {
    const cleaned = line.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•]\s*/, "").trim();
    if (cleaned && cleaned.length <= 30) headlines.push(cleaned);
    if (headlines.length >= 15) break;
  }

  // Parse DESCRIPTIONS block
  const descBlock = content.match(/DESCRIPTIONS?:?\s*\n([\s\S]+?)(?=META_|$)/i)?.[1] ?? "";
  for (const line of descBlock.split("\n")) {
    const cleaned = line.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•]\s*/, "").trim();
    if (cleaned && cleaned.length <= 90) descriptions.push(cleaned);
    if (descriptions.length >= 4) break;
  }

  // Fallback: extract from raw content if parsing yields nothing
  if (!headlines.length) {
    const words = keyword.split(" ");
    headlines.push(
      `${words[0].charAt(0).toUpperCase() + words[0].slice(1)} Service Near You`,
      `Verified ${words[0].charAt(0).toUpperCase() + words[0].slice(1)} Pros`,
      `Book in 60 Seconds`,
      `Same-Day Availability`,
      `Trusted by Kerala Homes`,
    );
  }

  const serviceSlug = keyword.split(" ")[0].toLowerCase();
  return {
    headlines: headlines.slice(0, 15),
    descriptions: descriptions.slice(0, 4),
    finalUrl: `https://www.${brand}.co.in/services/${serviceSlug}`,
    path1: serviceSlug.slice(0, 15),
    path2: "Kerala",
  };
}

// ── Google Ads API calls ──────────────────────────────────────────────────────

export async function createRsaDraft(item: ReviewItem): Promise<string> {
  const creds = adsCreds(item.brand);
  if (!creds.clientId || !creds.developerToken) {
    throw new Error("Google Ads credentials not configured");
  }

  const token = await getAccessToken(creds);
  const ad = parseAdCopy(item.content, item.brand, item.keyword);

  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": creds.developerToken,
    "Content-Type": "application/json",
    ...(creds.loginCustomerId ? { "login-customer-id": creds.loginCustomerId } : {}),
  };

  // 1. Create campaign (PAUSED — owner enables budget manually)
  const campaignName = `[DRAFT] ${item.keyword} — ${new Date().toISOString().split("T")[0]}`;
  const campaignRes = await axios.post(
    `https://googleads.googleapis.com/v17/customers/${creds.customerId}/campaigns:mutate`,
    {
      operations: [{
        create: {
          name: campaignName,
          advertisingChannelType: "SEARCH",
          status: "PAUSED",
          manualCpc: {},
          campaignBudget: "", // must be created first in full implementation
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
          },
        },
      }],
    },
    { headers }
  );

  const campaignId = campaignRes.data.results?.[0]?.resourceName ?? "unknown";

  // Save draft locally for owner review
  const draftFile = saveDraftLocally(item, ad, campaignId);

  console.log(`    ✓ Google Ads draft saved (PAUSED — owner must enable spend)`);
  console.log(`    📁 Draft: ${draftFile}`);

  return `ads-draft:${draftFile}`;
}

function saveDraftLocally(item: ReviewItem, ad: RsaAdCopy, campaignId: string): string {
  const dir = `brands/${item.brand}/output/ads-drafts`;
  fs.mkdirSync(dir, { recursive: true });
  const slug = item.keyword.toLowerCase().replace(/\s+/g, "-");
  const file = `${dir}/rsa-${slug}-${new Date().toISOString().split("T")[0]}.json`;

  fs.writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "draft_paused",
    brand: item.brand,
    keyword: item.keyword,
    campaignId,
    ad,
    ownerAction: "Review this draft in Google Ads UI, set budget, then unpause to go live.",
    reviewUrl: `https://ads.google.com/aw/campaigns`,
  }, null, 2), "utf8");

  return file;
}

// ── Meta Ads (Facebook/Instagram) ────────────────────────────────────────────

export interface MetaAdDraft {
  primaryText: string;
  headline: string;
  ctaButton: string;
  destinationUrl: string;
  campaignObjective: "CONVERSIONS" | "LINK_CLICKS" | "BRAND_AWARENESS";
}

export function parseMetaAdCopy(content: string, brand: string, keyword: string): MetaAdDraft {
  const primaryText = content.match(/META_PRIMARY_TEXT:\s*(.+)/i)?.[1]?.trim()
    ?? `Looking for ${keyword}? Sahayi connects you with verified professionals in Kerala. Book in 60 seconds.`;

  const headline = content.match(/META_HEADLINE:\s*(.+)/i)?.[1]?.trim()
    ?? `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} — Book Now`;

  const ctaButton = content.match(/META_CTA_BUTTON:\s*(.+)/i)?.[1]?.trim() ?? "Book Now";

  const serviceSlug = keyword.split(" ")[0].toLowerCase();
  return {
    primaryText: primaryText.slice(0, 125),
    headline: headline.slice(0, 40),
    ctaButton,
    destinationUrl: `https://www.${brand}.co.in/services/${serviceSlug}`,
    campaignObjective: "LINK_CLICKS",
  };
}

export async function saveMetaAdDraft(item: ReviewItem): Promise<string> {
  const ad = parseMetaAdCopy(item.content, item.brand, item.keyword);
  const dir = `brands/${item.brand}/output/ads-drafts`;
  fs.mkdirSync(dir, { recursive: true });
  const slug = item.keyword.toLowerCase().replace(/\s+/g, "-");
  const file = `${dir}/meta-ad-${slug}-${new Date().toISOString().split("T")[0]}.json`;

  fs.writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "draft",
    brand: item.brand,
    keyword: item.keyword,
    platform: "Meta (Facebook + Instagram)",
    ad,
    ownerAction: "Upload this to Meta Ads Manager, set audience + budget, then publish.",
    adsManagerUrl: "https://business.facebook.com/adsmanager",
  }, null, 2), "utf8");

  return file;
}
