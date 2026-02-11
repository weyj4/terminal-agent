const MAX_RESULT_LENGTH = 30_000;
const HEAD_RATIO = 2 / 3;

export function truncateToolResult(text: string, maxLen = MAX_RESULT_LENGTH): string {
  if (text.length <= maxLen) return text;

  const headLen = Math.floor(maxLen * HEAD_RATIO);
  const tailLen = maxLen - headLen;
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  const omitted = text.length - headLen - tailLen;

  return `${head}\n\n... [truncated: ${omitted} characters omitted] ...\n\n${tail}`;
}
