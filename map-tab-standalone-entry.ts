import { decodeMapTabPayloadFromBase64, runMapTabStandalone } from './utils/map/mapTabRuntimeCore';

declare global {
  interface Window {
    __KM_MAP_TAB__?: { b64: string };
    L?: unknown;
    marked?: { parse: (md: string) => string };
  }
}

function main(): void {
  const b64 = window.__KM_MAP_TAB__?.b64;
  const L = window.L;
  if (!b64 || !L) return;
  const payload = decodeMapTabPayloadFromBase64(b64);
  runMapTabStandalone(L, window.marked ?? null, payload);
}

main();
