import type { ApiError } from "./apiTypes";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapData<T>(value: unknown): T | undefined {
  return isRecord(value) && "data" in value ? value.data as T : undefined;
}

export const invalidResponse = (): ApiError => ({
  status: "INVALID_RESPONSE",
  message: "The backend returned an invalid response.",
});

export function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("A valid UUID is required.");
  }
  return encodeURIComponent(value);
}

export function presentationPath(id: string) {
  return `/v1/presentations/${uuid(id)}`;
}
