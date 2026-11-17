import { uuid } from "@/lib/api/responseHelpers";
import type { PresentationPage, PresentationSummary } from "@/features/presentations/presentationTypes";

export type SavedPresentationChange = { deleted: true } | { filename: string; updatedAt: string };
export type SavedPresentationChanges = Record<string, SavedPresentationChange>;
type Label = Pick<PresentationSummary, "filename" | "updatedAt">;

// PostgreSQL timestamps may carry precision beyond Date's milliseconds.
export function labelIsAtLeastAsNew(candidate: string, current: string) {
  const difference = Date.parse(candidate) - Date.parse(current);
  if (difference !== 0) return difference > 0;
  const remainder = (value: string) =>
    (value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1] ?? "").padEnd(9, "0").slice(3, 9);
  return remainder(candidate) >= remainder(current);
}

export function latestPresentationLabel<T extends Label>(presentation: T, ...alternatives: (Label | undefined)[]): T {
  let label: Label = presentation;
  for (const candidate of alternatives) {
    if (candidate && labelIsAtLeastAsNew(candidate.updatedAt, label.updatedAt)) label = candidate;
  }
  return { ...presentation, filename: label.filename, updatedAt: label.updatedAt };
}

// Confirmed writes stay authoritative if an older in-flight page completes later.
// These overrides are session-scoped, never browser-persisted.
export function visibleSavedPresentations(pages: PresentationPage[], changes: SavedPresentationChanges) {
  const unique = new Map<string, PresentationSummary>();
  for (const page of pages) {
    for (const presentation of page.presentations) {
      const change = changes[presentation.id];
      if (change && "deleted" in change) continue;
      unique.set(presentation.id, latestPresentationLabel(presentation, change));
    }
  }
  return [...unique.values()];
}

export function presentationHref(id: string) {
  return `/workspace/${uuid(id).toLowerCase()}`;
}

export function isPresentationId(id: string) {
  try { uuid(id); return true; }
  catch { return false; }
}

export function canonicalPresentationId(id: string) {
  return isPresentationId(id) ? id.toLowerCase() : id;
}
