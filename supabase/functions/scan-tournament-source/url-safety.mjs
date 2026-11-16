import { isIP } from "node:net";

function blockedIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
}

export function isBlockedIp(address) {
  const version = isIP(String(address || "").split("%")[0]);
  if (version === 4) return blockedIpv4(String(address).split("%")[0]);
  if (version === 6) {
    const ip = String(address).toLowerCase().split("%")[0];
    return ip === "::" || ip === "::1" || ip.startsWith("::ffff:") ||
      /^(?:fc|fd|fe[89a-f]|ff)/i.test(ip) ||
      ip.startsWith("::") ||
      ip.startsWith("2001:db8:") ||
      ip.startsWith("2001:10:") ||
      ip.startsWith("2001:0:") ||
      ip.startsWith("64:ff9b:") ||
      ip.startsWith("2002:") ||
      ip.startsWith("3ffe:");
  }
  return true;
}

export async function assertPublicHttpUrl(value, resolveHostAddresses) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("INVALID_SOURCE_URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error("UNSUPPORTED_SOURCE_URL");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname.endsWith(".test") || hostname.endsWith(".invalid") ||
      hostname.endsWith(".example") || hostname.endsWith(".arpa")) {
    throw new Error("PRIVATE_SOURCE_BLOCKED");
  }
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("PRIVATE_SOURCE_BLOCKED");
    return url;
  }
  if (!hostname.includes(".") || typeof resolveHostAddresses !== "function") {
    throw new Error("PRIVATE_SOURCE_BLOCKED");
  }
  let addresses;
  try {
    addresses = await resolveHostAddresses(hostname);
  } catch {
    throw new Error("HOST_LOOKUP_FAILED");
  }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((address) => isBlockedIp(address))) {
    throw new Error("PRIVATE_SOURCE_BLOCKED");
  }
  return url;
}
