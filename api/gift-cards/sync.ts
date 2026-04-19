import { GoogleGenAI, Type } from "@google/genai";
import { dbService } from "../../src/services/db.ts";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("Starting gift card deals sync from ozbargain.com.au...");
    const response = await fetch("https://www.ozbargain.com.au/tag/gift-card");
    const html = await response.text();

    const textContent = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                            .substring(0, 80000);

    const prompt = `Extract the top 6 latest gift card offers from the following website HTML (OzBargain).
    Return a JSON array of objects with these exact keys:
    - title: (e.g., "Apple Gift Cards")
    - store: (e.g., "Woolworths", "Coles")
    - offer: (e.g., "20x Everyday Rewards points" or "10% off")
    - dates: (e.g., "4 Mar - 10 Mar" or "Latest Offer")
    - type: (must be exactly one of: "this_week", "next_week", "ongoing")
    - link: (the full URL to the deal, e.g., "https://www.ozbargain.com.au/node/123456")

    Website HTML:
    ${textContent}`;

    let apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'your_api_key_here') {
      apiKey = process.env.VITE_GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? process.env.VITE_GEMINI_API_KEY : undefined;
    }
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in the environment.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              store: { type: Type.STRING },
              offer: { type: Type.STRING },
              dates: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["this_week", "next_week", "ongoing"] },
              link: { type: Type.STRING }
            },
            required: ["title", "store", "offer", "dates", "type", "link"]
          }
        }
      }
    });

    if (result.text) {
      const deals = JSON.parse(result.text);
      if (deals && deals.length > 0) {
        dbService.updateGiftCardDeals(deals);
      }
    }
    
    const updatedDeals = dbService.getGiftCardDeals();
    res.status(200).json({ success: true, ...updatedDeals });
  } catch (error: any) {
    console.error("Error syncing gift cards:", error);
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    res.status(500).json({ error: error.message || "Internal server error", apiKeyUsed: !!apiKey });
  }
}
