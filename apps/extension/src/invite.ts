export const INVITE_PARAM = "vsync";

export function buildInviteUrl(pageUrl: string, code: string): string {
  const url = new URL(pageUrl);
  const params = new URLSearchParams();
  params.set(INVITE_PARAM, code);
  url.hash = params.toString();
  return url.toString();
}

export function parseRoomCode(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const code = new URLSearchParams(raw).get(INVITE_PARAM);
  const trimmed = code?.trim();
  return trimmed ? trimmed : null;
}

export function removeInvite(pageUrl: string): string {
  const url = new URL(pageUrl);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  params.delete(INVITE_PARAM);
  const rest = params.toString();
  url.hash = rest ? rest : "";
  return url.toString();
}
