import type { ApiError } from "@/lib/api/apiTypes";

class SessionCapabilityError extends Error {}

// Shared promises contain no serialized account data. Web Locks register at
// intent time so another tab cannot overtake an older queued logout.
const queues = new Map<string, Promise<unknown>>();
export function orderedCookieRequest<T>(origin: string | undefined, work: () => Promise<T>): Promise<T> {
  const key = origin ?? "unconfigured";
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks && typeof window !== "undefined") return Promise.reject(new SessionCapabilityError());
  if (locks) return locks.request(`present-auth:${key}`, work).then((result) => result);
  // Non-browser tests use a local queue; browser persistence fails closed without Web Locks.
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  queues.set(key, run);
  void run.finally(() => { if (queues.get(key) === run) queues.delete(key); }).catch(() => undefined);
  return run;
}

export function cookieCoordinationError(error: unknown): { error: ApiError } {
  return { error: error instanceof SessionCapabilityError ? {
    status: "CONFIGURATION_ERROR",
    message: "Persistent sign-in needs a modern browser with Web Locks on HTTPS or localhost.",
  } : { status: "NETWORK_ERROR", message: "Browser session coordination failed. Please retry." } };
}
