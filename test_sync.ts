import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";

const syncGiftCardDeals = async () => {
  try {
    console.log("Starting gift card deals sync from gcdb.com.au...");
    const response = await fetch("https://gcdb.com.au/");
    const html = await response.text();

    const textContent = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').substring(0, 30000);

    const prompt = `Extract the top 6 latest gift card offers from the following website text.
    Return a JSON array of objects with these exact keys:
    - title: (e.g., "Apple Gift Cards")
    - store: (e.g., "Woolworths", "Coles")
    - offer: (e.g., "20x Everyday Rewards points")
    - dates: (e.g., "4 Mar - 10 Mar" or "Latest Offer")
    - type: (must be exactly one of: "this_week", "next_week", "ongoing")

    Website text:
    ${textContent}`;

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
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
              type: { type: Type.STRING, enum: ["this_week", "next_week", "ongoing"] }
            },
            required: ["title", "store", "offer", "dates", "type"]
          }
        }
      }
    });

    console.log("Result text:", result.text);
    if (result.text) {
      const deals = JSON.parse(result.text);
      console.log("Parsed deals:", deals);
    }
  } catch (error) {
    console.error("Failed to sync gift card deals:", error);
  }
};

syncGiftCardDeals();
