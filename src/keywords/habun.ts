import { KeywordGroup } from "./config";

export const HABUN_BRAND = {
  name: "Habun",
  url: "https://habun.ae",
  locations: ["Ras Al Khaimah", "Sharjah"],
  country: "UAE",
  countryCode: "ae",
  gscCountryCode: "are",
  languages: ["en", "ar"],
  cuisine: "casual dining restaurant",
  tagline: "Authentic flavours, warm hospitality — Ras Al Khaimah & Sharjah",
};

export const HABUN_KEYWORD_GROUPS: KeywordGroup[] = [
  {
    group: "Brand",
    keywords: [
      "Habun restaurant",
      "Habun UAE",
      "Habun RAK",
      "Habun Sharjah",
      "Habun Ras Al Khaimah",
      "Habun menu",
      "Habun restaurant review",
    ],
    targetPage: "/",
    schemaType: "Restaurant",
  },
  {
    group: "Local — Ras Al Khaimah",
    keywords: [
      "restaurant in Ras Al Khaimah",
      "best restaurant Ras Al Khaimah",
      "RAK restaurant",
      "where to eat in RAK",
      "family restaurant Ras Al Khaimah",
      "casual dining Ras Al Khaimah",
      "restaurants near me RAK",
      "Ras Al Khaimah food",
    ],
    targetPage: "/ras-al-khaimah",
    schemaType: "Restaurant",
  },
  {
    group: "Local — Sharjah",
    keywords: [
      "restaurant in Sharjah",
      "best restaurant Sharjah",
      "where to eat Sharjah",
      "family restaurant Sharjah",
      "casual dining Sharjah",
      "restaurants near me Sharjah",
      "Sharjah food",
      "dine in Sharjah",
    ],
    targetPage: "/sharjah",
    schemaType: "Restaurant",
  },
  {
    group: "UAE Dining Intent",
    keywords: [
      "best restaurants UAE 2025",
      "UAE casual dining",
      "family friendly restaurant UAE",
      "UAE restaurant guide",
      "eat out UAE",
      "restaurants open now UAE",
      "halal restaurant UAE",
    ],
    targetPage: "/about",
    schemaType: "Restaurant",
  },
  {
    group: "AI & Voice Search",
    keywords: [
      "best restaurant near me Ras Al Khaimah",
      "good restaurant for families in UAE",
      "where should I eat in Sharjah",
      "top rated restaurants in RAK",
      "restaurant with parking in Sharjah",
      "budget friendly restaurant UAE",
    ],
    targetPage: "/",
    schemaType: "Restaurant",
  },
  {
    group: "Menu & Food",
    keywords: [
      "Habun menu prices",
      "restaurant menu Ras Al Khaimah",
      "halal food Sharjah",
      "grills and meze UAE",
      "Arabic food restaurant UAE",
    ],
    targetPage: "/menu",
    schemaType: "Menu",
  },
];

export const HABUN_PAGES = [
  { path: "/", label: "Home" },
  { path: "/menu", label: "Menu" },
  { path: "/ras-al-khaimah", label: "RAK Location" },
  { path: "/sharjah", label: "Sharjah Location" },
  { path: "/about", label: "About" },
  { path: "/reservations", label: "Reservations" },
  { path: "/contact", label: "Contact" },
  { path: "/blog", label: "Blog" },
];

export const HABUN_API_ENDPOINTS = [
  { method: "GET", path: "/api/menu", expect: 200, label: "Menu API" },
  { method: "GET", path: "/api/locations", expect: 200, label: "Locations API" },
  { method: "POST", path: "/api/reservations", expect: 201, label: "Reservations API" },
];
