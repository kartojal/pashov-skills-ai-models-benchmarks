/** Maps model name patterns to logo filenames in /logos/ */
const LOGO_MAP: [RegExp, string][] = [
  [/claude/i, "claude.svg"],
  [/gemini/i, "gemini.svg"],
  [/gpt/i, "openai.svg"],
  [/openai/i, "openai.svg"],
  [/grok/i, "grok.svg"],
  [/x-ai/i, "grok.svg"],
  [/mimo/i, "xiaomi-mimo.svg"],
  [/xiaomi/i, "xiaomi-mimo.svg"],
  [/minimax/i, "minimax.svg"],
  [/qwen/i, "qwen.svg"],
];

export function getModelLogo(model: string): string | null {
  for (const [pattern, file] of LOGO_MAP) {
    if (pattern.test(model)) return `/logos/${file}`;
  }
  return null;
}
