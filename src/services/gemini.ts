import { GoogleGenAI, Type } from "@google/genai";

// Use import.meta.env for Vite compatibility. 
// Fallback to process.env for local dev server if needed, but safely.
const getApiKey = () => {
  // 1. Check Vite's import.meta.env (standard for client-side Vite apps)
  const metaEnv = (import.meta as any).env;
  if (typeof import.meta !== 'undefined' && metaEnv?.VITE_GEMINI_API_KEY) {
    return metaEnv.VITE_GEMINI_API_KEY;
  }
  
  // 2. Fallback to process.env (for local dev server or Node environments)
  if (typeof process !== 'undefined' && (process as any).env?.GEMINI_API_KEY) {
    return (process as any).env.GEMINI_API_KEY;
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
  codes: DiscountCode[];
  summary: string;
}

export interface GiftCardDeal {
  title: string;
  store: string;
  offer: string;
  dates: string;
  type: "this_week" | "next_week" | "ongoing";
}

export async function getGiftCardDeals(): Promise<GiftCardDeal[]> {
  // In a real app, this would scrape a deal database
  // For this demo, we use the data extracted from the site
  return [
    {
      title: "Apple Gift Cards",
      store: "Woolworths",
      offer: "20x Everyday Rewards points",
      dates: "4 Mar - 10 Mar",
      type: "next_week"
    },
    {
      title: "Drummond Golf & Smiggle",
      store: "Big W",
      offer: "20x EDR points",
      dates: "26 Feb - 4 Mar",
      type: "this_week"
    },
    {
      title: "Timezone & Hoyts",
      store: "Big W",
      offer: "10% Off",
      dates: "26 Feb - 4 Mar",
      type: "this_week"
    },
    {
      title: "TCN Gift, Him, Her, Baby",
      store: "Coles",
      offer: "1,000 Flybuys points on $50",
      dates: "4 Mar - 10 Mar",
      type: "next_week"
    },
    {
      title: "Luxury Escapes, DoorDash",
      store: "Coles",
      offer: "20x Flybuys points",
      dates: "25 Feb - 3 Mar",
      type: "this_week"
    },
    {
      title: "Didi & Amart",
      store: "ShopBack",
      offer: "10% Cashback",
      dates: "While stocks last",
      type: "ongoing"
    }
  ];
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
          required: ["storeName", "codes", "summary"]
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
