
export function isoNow(): string {
  return new Date().toISOString();
}

export function mustIso(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO time: ${s}`);
  return d.toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function msBetween(aIso: string, bIso: string): number {
  return new Date(bIso).getTime() - new Date(aIso).getTime();
}
