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

export async function findDiscountCodes(query: string): Promise<BargainResult> {
  const model = "gemini-2.5-pro";
  const isUrl = query.startsWith('http://') || query.startsWith('https://');
  const target = isUrl ? `the website at ${query}` : `the store or brand "${query}"`;
  
  const currentDate = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  // Refined prompt to handle both Store/Brand searches and Specific Product searches
  const prompt = `You are an elite Australian deal hunter and price comparison expert. Today is ${currentDate}.
  
  The user searched for: "${query}".
  
  STEP 1: Determine the intent. Is this a general store/brand (e.g., "Nike", "The Iconic") or a specific product/item (e.g., "Nike Air Force 1", "Dyson V15")?
  
  STEP 2: Execute the appropriate search strategy using your Google Search tool.
  
  IF IT'S A SPECIFIC PRODUCT:
  - Search across MULTIPLE Australian retailers (e.g., The Iconic, ASOS, Myer, David Jones, Amazon AU, Catch, JD Sports, Foot Locker, JB Hi-Fi, etc.) to find who is selling this exact item.
  - Find the absolute lowest current price, active sales, or promo codes that apply to this specific item across different stores.
  - In your JSON response:
    - "storeName" should be the Product Name (e.g., "Best Prices: ${query}").
    - "storeUrl" should be the link to the retailer with the absolute best price.
    - "summary" should summarize the price comparison (e.g., "Retail price is $180, but you can get it for $120 at ASOS using code...").
    - "codes" array should list the best offers from DIFFERENT retailers. Use the "description" field to clearly state the retailer name and the final price.
  
  IF IT'S A GENERAL STORE / BRAND OR URL:
  - Focus on finding store-wide promo codes, gift card discounts, cashback rates, and provider perks for that specific store.
  - Search official sites for newsletter sign-up bonuses, app-exclusive discounts, or student portals.
  - Search community sites using queries like: site:ozbargain.com.au "${query}"
  - In your JSON response:
    - "storeName" is the brand/store name.
    - "codes" array lists the specific promo codes and perks for that store.
  
  STRICT VALIDATION RULES (For both modes):
  1. Expiration: It is currently ${currentDate}. DO NOT include expired deals.
  2. UNiDAYS/StudentBeans: Only include if explicitly confirmed.
  3. Community Sources: If found on OzBargain/Reddit, mark verificationStatus as "To be verified (Community Report)".
  4. Cashback: Check ShopBack, Cashrewards, TopCashback.
  5. If the user provided a URL, extract any specific promo codes, hidden deals, or member perks mentioned on that page.
  
  You MUST return ONLY valid JSON matching this exact structure (do not include markdown code blocks like \`\`\`json):
  {
    "storeName": "string",
    "storeUrl": "string",
    "summary": "string",
    "codes": [
      {
        "type": "code" | "giftcard" | "cashback" | "membership" | "perk" | "sale",
        "code": "string",
        "description": "string",
        "expiry": "string",
        "sourceUrl": "string",
        "confidence": "high" | "medium" | "low",
        "verificationStatus": "string",
        "lastVerified": "string"
      }
    ]
  }`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }]
      },
    });

    if (!response.text) {
      throw new Error("No response from AI agent.");
    }

    let rawText = response.text.trim();
    if (rawText.startsWith('\`\`\`json')) {
      rawText = rawText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (rawText.startsWith('\`\`\`')) {
      rawText = rawText.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    const result = JSON.parse(rawText);
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
