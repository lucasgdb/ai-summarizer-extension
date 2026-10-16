import { z } from "zod";
import type { Dictionary } from "./i18n";
import type { SummaryOptions } from "./summaries";

// /summaries/options is down: the API still applies its own limits
const fallbackInstructionsLength = 300;

/**
 * Validates the options form against what the API offers right now (models
 * come from its database). Zod implements Standard Schema, which TanStack Form
 * validates with directly.
 */
export function generationSchema(
  options: SummaryOptions | undefined,
  dict: Dictionary,
) {
  const oneOf = (allowed: string[] | undefined) =>
    z.string().refine((value) => !allowed || allowed.includes(value), {
      error: dict.options.invalidChoice,
    });
  const max = options?.max_instructions_length ?? fallbackInstructionsLength;

  return z.object({
    model: oneOf(options?.models.map((model) => model.id)),
    style: oneOf(options?.styles),
    length: oneOf(options?.lengths),
    effort: oneOf(options?.efforts),
    language: oneOf(options?.languages),
    instructions: z.string().max(max, {
      error: dict.options.instructionsTooLong(String(max)),
    }),
  });
}

export type GenerationForm = z.infer<ReturnType<typeof generationSchema>>;
