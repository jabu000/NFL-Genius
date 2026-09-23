import { geminiProvider } from "./gemini";
import { groqProvider } from "./groq";
import { templateProvider, templateWriteup } from "./template";
import type { WriteupInput, Writeup, WriteupProvider } from "./types";

export type { WriteupInput, Writeup } from "./types";

/** Pick the configured free LLM, or templates when no key is set. */
export function getProvider(env = process.env): WriteupProvider {
  const choice = (env.LLM_PROVIDER ?? "").toLowerCase();
  if (choice === "template") return templateProvider;
  if ((choice === "gemini" || !choice) && env.GEMINI_API_KEY) return geminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined);
  if ((choice === "groq" || !choice) && env.GROQ_API_KEY) return groqProvider(env.GROQ_API_KEY, env.GROQ_MODEL || undefined);
  if (env.GEMINI_API_KEY) return geminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined);
  if (env.GROQ_API_KEY) return groqProvider(env.GROQ_API_KEY, env.GROQ_MODEL || undefined);
  return templateProvider;
}

/**
 * Write every player's paragraph in small batches, pausing between requests to
 * stay inside free-tier rate limits. Any failed batch falls back to templates,
 * and after 3 consecutive failures (quota exhausted) the rest use templates too.
 */
export async function writeAll(
  inputs: WriteupInput[],
  provider: WriteupProvider,
  opts: { batchSize?: number; delayMs?: number; log?: (msg: string) => void } = {},
): Promise<Writeup[]> {
  const batchSize = opts.batchSize ?? 8;
  const delayMs = opts.delayMs ?? 6500;
  const log = opts.log ?? (() => {});
  const out: Writeup[] = [];
  let failures = 0;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    if (provider.name === "template" || failures >= 3) {
      out.push(...batch.map(templateWriteup));
      continue;
    }
    try {
      out.push(...(await provider.writeBatch(batch)));
      failures = 0;
    } catch (err) {
      failures++;
      log(`  write-up batch ${i / batchSize + 1} failed (${(err as Error).message}); using templates`);
      out.push(...batch.map(templateWriteup));
    }
    if (i + batchSize < inputs.length) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}
