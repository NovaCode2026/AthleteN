export type AppErrorArea = "AUTH"|"DATA"|"FILE"|"MSG"|"IG"|"SCAN"|"AI"|"PAY"|"ATH"|"ROLE"|"VERIFY"|"ADMIN"|"UI"|"NET";
const supportEmail = "novacode.create@gmail.com";
export function errorCodeFor(error: unknown): string {
  const raw = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (/instagram|ig_|oauth|meta|business discovery/.test(raw)) return raw.includes("rate") ? "IG-007" : "IG-006";
  if (/tournament|scanner|scan|source url/.test(raw)) return "SCAN-015";
  if (/attachment|message|conversation/.test(raw)) return "MSG-001";
  if (/upload|storage|file/.test(raw)) return "FILE-001";
  if (/payment|checkout|subscription|billing|trial/.test(raw)) return "PAY-001";
  if (/ai coach|openai|ai /.test(raw)) return "AI-002";
  if (/permission|not authorized|forbidden|rls/.test(raw)) return "DATA-007";
  if (/timeout|timed out/.test(raw)) return "NET-002";
  if (/network|fetch|failed to fetch/.test(raw)) return "NET-001";
  if (/profile|onboarding|username|account/.test(raw)) return "AUTH-010";
  return "UI-006";
}
export function userError(error: unknown, fallback = "Something went wrong."): string {
  return `${fallback} Error code: ${errorCodeFor(error)}. Contact NovaCode at ${supportEmail}, send a message in AthleteN, or use Problem/Feedback. Include the code and what you were doing.`;
}
