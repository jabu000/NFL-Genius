import { fetchWithRetry } from "../sources/http";
import { SYSTEM_PROMPT, parseReply, userPrompt } from "./prompt";
import type { WriteupProvider } from "./types";

/** Google Gemini free tier (https://aistudio.google.com/apikey). */
export function geminiProvider(apiKey: string, model = "gemini-2.5-flash"): WriteupProvider {
  return {
    name: `gemini:${model}`,
    async writeBatch(inputs) {
      const res = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userPrompt(inputs) }] }],
            generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
          }),
        },
        1,
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      return parseReply(text, inputs, `gemini`);
    },
  };
}
