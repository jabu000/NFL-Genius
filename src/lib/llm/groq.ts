import { fetchWithRetry } from "../sources/http";
import { SYSTEM_PROMPT, parseReply, userPrompt } from "./prompt";
import type { WriteupProvider } from "./types";

/** Groq free tier, OpenAI-compatible (https://console.groq.com/keys). */
export function groqProvider(apiKey: string, model = "llama-3.3-70b-versatile"): WriteupProvider {
  return {
    name: `groq:${model}`,
    async writeBatch(inputs) {
      const res = await fetchWithRetry(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.6,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt(inputs) },
            ],
          }),
        },
        1,
      );
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return parseReply(data?.choices?.[0]?.message?.content ?? "", inputs, "groq");
    },
  };
}
