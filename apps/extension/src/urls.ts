const normalize = (code: string): string => code.trim().toUpperCase();

export function roomSocketUrl(wsOrigin: string, code: string): string {
  return `${wsOrigin}/room/${normalize(code)}`;
}

export function newRoomUrl(httpOrigin: string): string {
  return `${httpOrigin}/new`;
}
