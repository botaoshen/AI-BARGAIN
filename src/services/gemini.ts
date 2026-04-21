import { GoogleGenAI, Type } from "@google/genai";
import localGiftCards from '../data/gift-cards.json';

// Safely retrieve the API key
const getApiKey = () => {
  // Always prefer the standard environment variable injected by the platform
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  
  // Fallback for Vite client-side if polyfilled or set in .env
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY) {
    return (import.meta as any).env.VITE_GEMINI_API_KEY;
  }

  // Last resort: check if it's on window (some environments do this)
  if (typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
    return (window as any).GEMINI_API_KEY;
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
  type: "code" | "giftcard" | "cashback" | "membership" | "perk" | "sale" | "alternative";
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
    // API might not be available yet or in a different environment
  }

  // Fallback data if API fails or is empty
  return localGiftCards as GiftCardDealsResponse;
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

export async function findDiscountCodes(query: string): Promise<BargainResult> {
  const model = "gemini-3-flash-preview"; // Switched to flash for much faster response times
  const isUrl = query.startsWith('http://') || query.startsWith('https://');
  const target = isUrl ? `the website at ${query}` : `the store or brand "${query}"`;
  
  const currentDate = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  // Refined prompt to handle both Store/Brand searches and Specific Product searches
  const prompt = `You are an elite Australian deal hunter and price comparison expert. Today is ${currentDate}.
  
  The user searched for: "${query}".
  
  STEP 1: Determine the intent. Is this a general store/brand (e.g., "Nike", "The Iconic") or a specific product/item (e.g., "Nike Air Force 1", "Dyson V15")?
  
  STEP 2: Execute the appropriate search strategy using your Google Search tool.
  
  IF IT'S A SPECIFIC PRODUCT:
  - Search across MULTIPLE Australian retailers to find who is selling this exact item at the lowest price.
  - Find active sales or promo codes that apply to this specific item.
  - Suggest direct competitors or older models if they are much better deals.
  
  IF IT'S A GENERAL STORE / BRAND OR URL:
  - Find store-wide promo codes, gift card discounts, cashback rates, and provider perks.
  - Search for newsletter sign-up bonuses or app-exclusive discounts.
  
  STRICT RULES:
  1. DO NOT include expired deals.
  2. mark verificationStatus as "Verified" if found on official sites, or "Community Report" if from OzBargain/Reddit.
  3. Provide exact store names and links.`;

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
                  type: { type: Type.STRING, enum: ["code", "giftcard", "cashback", "membership", "perk", "sale", "alternative"] },
                  code: { type: Type.STRING },
                  description: { type: Type.STRING },
                  expiry: { type: Type.STRING },
                  sourceUrl: { type: Type.STRING },
                  confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  verificationStatus: { type: Type.STRING },
                  lastVerified: { type: Type.STRING }
                },
                required: ["type", "code", "description", "confidence", "sourceUrl"]
              }
            }
          },
          required: ["storeName", "codes", "summary"]
        }
      },
    });

    if (!response.text) {
      throw new Error("No response from AI agent. The search might have failed.");
    }

    const result = JSON.parse(response.text.trim());
    return result as BargainResult;
  } catch (error: any) {
    console.error("BargainAgent Error:", error);
    
    // Check for specific error types to provide better feedback
    if (error?.message?.includes("Quota") || error?.message?.includes("rate limit")) {
      throw new Error("API quota exceeded. Please try again in 1 minute.");
    }
    
    if (error instanceof SyntaxError) {
      throw new Error("Received malformed data from the search engine. Please try again.");
    }
    
    throw new Error(error?.message || "An unexpected error occurred during the search.");
  }
}
