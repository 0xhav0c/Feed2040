/**
 * URL validation utility to prevent SSRF attacks.
 * Blocks private/internal IPs, non-HTTP schemes, and reserved hostnames.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateIP(hostname: string): boolean {
  const stripped = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // Block octal (0177.0.0.1), hex (0x7f.0.0.1), and decimal (2130706433) IP formats
  if (/^0x[0-9a-f]+$/i.test(stripped)) return true;
  if (/^[0-9]+$/.test(stripped) && !stripped.includes(".")) return true;
  if (/^0[0-7]/.test(stripped)) return true;

  // IPv4 private ranges
  const ipv4Match = stripped.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }

  // IPv6 private ranges
  if (stripped === "::1") return true;
  if (stripped.startsWith("fc") || stripped.startsWith("fd")) return true;
  if (stripped.startsWith("fe80")) return true;
  if (stripped === "::") return true;

  return false;
}

export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateOllamaUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only http/https URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return { valid: false, error: "This hostname is not allowed" };
  }

  return { valid: true };
}

export function validateFeedUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Scheme "${parsed.protocol}" is not allowed. Only http and https are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: "This hostname is not allowed" };
  }

  if (isPrivateIP(hostname)) {
    return { valid: false, error: "Private/internal IP addresses are not allowed" };
  }

  if (!hostname.includes(".") && !hostname.startsWith("[")) {
    return { valid: false, error: "Single-label hostnames are not allowed" };
  }

  return { valid: true };
}
