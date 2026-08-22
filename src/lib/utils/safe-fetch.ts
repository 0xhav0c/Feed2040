/**
 * SSRF-hardened HTTP fetch for server-side use only.
 *
 * `validateFeedUrl` alone only inspects the literal hostname string, which is
 * bypassable via (a) DNS names that resolve to private IPs (rebinding) and
 * (b) HTTP redirects to internal hosts. This helper closes both holes:
 *   - validates the URL scheme/host on every hop,
 *   - resolves DNS and rejects if ANY resolved address is private/reserved,
 *   - follows redirects manually, re-validating each hop,
 *   - pins the TCP connection to the pre-validated IP (defeats the TOCTOU
 *     window where DNS could rebind between our check and undici's own lookup),
 *   - caps the response body size while streaming.
 *
 * Do NOT import this from client components — it pulls in node:dns and undici.
 */
import dns from "node:dns/promises";
import { Agent } from "undici";
import { validateFeedUrl, isPrivateIP } from "./url-validator";

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 20_000;

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeFetchResult {
  url: string;
  text: string;
  contentType: string;
}

async function resolvePublicIp(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`DNS resolution failed for ${host}`);
  }
  if (addrs.length === 0) throw new Error(`DNS resolution failed for ${host}`);
  for (const a of addrs) {
    if (isPrivateIP(a.address)) {
      throw new Error("URL resolves to a private/internal IP address");
    }
  }
  return addrs[0].address;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Response body exceeds maximum allowed size");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Fetch a URL's text body with SSRF protection and redirect re-validation.
 * Throws on validation failure, non-2xx status, oversized body, or too many
 * redirects.
 */
export async function safeFetchText(
  url: string,
  opts: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = validateFeedUrl(currentUrl);
    if (!validation.valid) throw new Error(validation.error ?? "Invalid URL");

    const parsed = new URL(currentUrl);
    const ip = await resolvePublicIp(parsed.hostname);

    // Pin the connection to the validated IP so a rebinding DNS record cannot
    // point undici at an internal host after our check. SNI/Host stay the real
    // hostname so TLS verification is unaffected.
    const dispatcher = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connect: {
        lookup: (_hostname, _options, cb) =>
          cb(null, [{ address: ip, family: ip.includes(":") ? 6 : 4 }]),
      },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(currentUrl, {
        headers: opts.headers,
        redirect: "manual",
        signal: controller.signal,
        // dispatcher is a Node/undici-only fetch option, absent from DOM types
        dispatcher,
      } as RequestInit & { dispatcher: Agent });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        await dispatcher.close();
        if (!location) throw new Error("Redirect response missing Location");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();
        await dispatcher.close();
        throw new Error(`Status code ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      const text = await readCapped(res, maxBytes);
      await dispatcher.close();
      return { url: currentUrl, text, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Too many redirects");
}
