import { WORKER_ORIGIN, WORKER_WS_ORIGIN, HARNESS_ORIGIN } from "./config";

const normalize = (code: string): string => code.trim().toUpperCase();

export function roomSocketUrl(code: string): string {
  return `${WORKER_WS_ORIGIN}/room/${normalize(code)}`;
}

export function harnessUrl(code: string): string {
  return `${HARNESS_ORIGIN}/?room=${normalize(code)}`;
}

export function newRoomUrl(): string {
  return `${WORKER_ORIGIN}/new`;
}
