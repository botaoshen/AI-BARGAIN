import { GoogleGenAI, Type } from "@google/genai";

// Safely retrieve the API key without crashing the browser on Vercel
const getApiKey = () => {
  // 1. AI Studio environment
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  
  // 2. Vercel / Standard Vite environment (Requires VITE_ prefix)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY) {
    return (import.meta as any).env.VITE_GEMINI_API_KEY;
  }

  return "";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export interface DiscountCode {
  code: string;
  description: string;
  expiry?: string;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
  verificationStatus?: string;
  lastVerified?: string;
  type: "code" | "giftcard" | "cashback" | "membership" | "perk" | "sale";
}

export interface BargainResult {
  storeName: string;
  storeUrl: string;
  codes: DiscountCode[];
  summary: string;
}

export interface GiftCardDeal {
  title: string;
  store: string;
  offer: string;
  dates: string;
  type: "this_week" | "next_week" | "ongoing";
  link?: string;
}

export interface GiftCardDealsResponse {
  deals: GiftCardDeal[];
  lastUpdated: string | null;
}

export async function getGiftCardDeals(): Promise<GiftCardDealsResponse> {
  try {
    const res = await fetch('/api/gift-cards');
    if (res.ok) {
      const data = await res.json();
      if (data && data.deals && data.deals.length > 0) {
        return data;
      }
    }
  } catch (error) {
    console.error("Failed to fetch gift card deals from API, using fallback:", error);
  }

  // Fallback data if API fails or is empty
  return {
    deals: [
      {
        title: "Apple Gift Cards",
        store: "Woolworths",
        offer: "20x Everyday Rewards points",
        dates: "Latest Offer",
        type: "this_week"
      },
      {
        title: "Ultimate, Webjet & Timezone",
        store: "Woolworths",
        offer: "20x Everyday Rewards points",
        dates: "Latest Offer",
        type: "this_week"
      },
      {
        title: "TCN Cinema, Pamper, Pub & Bar",
        store: "Coles",
        offer: "2,000 Flybuys points",
        dates: "Latest Offer",
        type: "this_week"
      },
      {
        title: "TCN Gift, Him, Her, Baby & Restaurant",
        store: "Coles",
        offer: "1,000 Flybuys points on $50",
        dates: "Latest Offer",
        type: "next_week"
      },
      {
        title: "Woolworths & Big W",
        store: "Everyday Gifting",
        offer: "3% off + 1x EDR point per dollar",
        dates: "Ongoing",
        type: "ongoing"
      },
      {
        title: "Woolworths, Amazon, Airbnb & Bunnings",
        store: "Qantas Marketplace",
        offer: "3x Qantas points",
        dates: "Ongoing",
        type: "ongoing"
      }
    ],
    lastUpdated: new Date().toISOString()
  };
}

export async function generateDiscountEmail(storeName: string): Promise<{subject: string, body: string}> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Write a polite, genuine, and persuasive email to the customer service team of "${storeName}". 
  The sender is an international student in Australia who is a huge, loyal fan of the brand but is currently on a very tight student budget. 
  The goal is to kindly ask if they could provide a student discount, a one-time promo code, or any hidden offers. 
  Keep it professional, sweet, slightly vulnerable, and not overly demanding.
  
  Return the result strictly in JSON format with two keys: "subject" and "body".`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING }
          },
          required: ["subject", "body"]
        }
      },
    });

    if (!response.text) {
      throw new Error("No response from AI agent.");
    }

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Email Generation Error:", error);
    throw error;
  }
}

export async function findDiscountCodes(storeName: string): Promise<BargainResult> {
  const model = "gemini-3-flash-preview";
  
  // Refined prompt for strict validation, categorization, and annual sale alerts
  const prompt = `Find active deals and UPCOMING/ANNUAL sale alerts for "${storeName}" in Australia.
  
  STRICT VALIDATION RULES:
  1. UNiDAYS/StudentBeans: Only include if explicitly confirmed for "${storeName}". Do NOT assume they work for every store.
  2. Community Sources (Reddit, OzBargain, Forums): If a deal is found here, categorize its verificationStatus as "To be verified (Community Report)" unless there is a very recent (last 24h) confirmation.
  3. Official Sources: Prioritize deals from the store's official site or verified provider portals (Origin, Bupa, etc.).
  4. Cashback: ONLY include offers from "ShopBack" and "TopCashback". Do NOT include "Cashrewards".
  5. Sale Alerts: Look for "Family & Friends Sales", "Warehouse Sales", or "Annual Clearance" events (e.g., L'Oréal Family & Friends). If an event is upcoming or rumored, mark it as 'sale' type.
  
  Search for:
  - Promo Codes (Reddit/OzBargain/Social Media).
  - Gift Card Discounts (e.g. 10% off at Woolworths/Coles).
  - Cashback (ShopBack and TopCashback ONLY).
  - Provider Perks (Origin Energy, AGL, Telstra, Bupa, etc.).
  - Annual/Family & Friends Sale Alerts.
  
  Also, find the official website URL for the store (storeUrl).
  
  Return JSON format.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeName: { type: Type.STRING },
            storeUrl: { type: Type.STRING },
            summary: { type: Type.STRING },
            codes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["code", "giftcard", "cashback", "membership", "perk"] },
                  code: { type: Type.STRING },
                  description: { type: Type.STRING },
                  expiry: { type: Type.STRING },
                  sourceUrl: { type: Type.STRING },
                  confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  verificationStatus: { type: Type.STRING },
                  lastVerified: { type: Type.STRING }
                },
                required: ["type", "code", "description", "sourceUrl", "confidence"]
              }
            }
          },
          required: ["storeName", "storeUrl", "codes", "summary"]
        }
      },
    });

    if (!response.text) {
      throw new Error("No response from AI agent.");
    }

    const result = JSON.parse(response.text.trim());
    return result as BargainResult;
  } catch (error) {
    console.error("BargainAgent Error:", error);
    // Return a fallback structure if parsing fails but we want to avoid a total crash
    if (error instanceof SyntaxError) {
      throw new Error("Received malformed data from the search engine. Please try again.");
    }
    throw error;
  }
}
