import { isRecord } from "@/lib/api/responseHelpers";
import type { LiveEvent, LiveSessionResponse, NavigationProposal, NavigationSnapshot } from "./liveTypes";

const id = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const counter = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function validSnapshot(value: NavigationSnapshot): boolean {
  return id(value.displayedSlideId) && id(value.mainSlideId) &&
    (value.returnPointId === null || id(value.returnPointId)) &&
    counter(value.version) && typeof value.held === "boolean" &&
    Array.isArray(value.visitedSlideIds) &&
    new Set(value.visitedSlideIds).size === value.visitedSlideIds.length &&
    value.visitedSlideIds.every(id) && value.visitedSlideIds.includes(value.mainSlideId) &&
    value.visitedSlideIds.includes(value.displayedSlideId);
}

export function readLiveSession(value: unknown, origin: string): LiveSessionResponse | undefined {
  if (!isRecord(value) || !id(value.sessionId) || typeof value.ticket !== "string" ||
      !/^[0-9a-f]{64}$/i.test(value.ticket) || typeof value.wsPath !== "string" ||
      value.wsPath !== `/v1/live-sessions/${value.sessionId}/stream` ||
      typeof value.expiresAt !== "string" || typeof value.ticketExpiresAt !== "string" ||
      Date.parse(value.expiresAt) <= Date.now() || Date.parse(value.ticketExpiresAt) <= Date.now() ||
      !Number.isFinite(Date.parse(value.expiresAt)) || !Number.isFinite(Date.parse(value.ticketExpiresAt)) ||
      (value.transcriptId !== undefined && !id(value.transcriptId)) ||
      !isRecord(value.audio) || value.audio.encoding !== "pcm_s16le" ||
      value.audio.sampleRate !== 16000 || value.audio.channels !== 1) return;
  const url = new URL(value.wsPath, origin);
  if (url.origin !== origin || url.search || url.hash || url.username || url.password) return;
  return {
    sessionId: value.sessionId,
    ...(value.transcriptId ? { transcriptId: value.transcriptId as string } : {}),
    ticket: value.ticket,
    ticketExpiresAt: value.ticketExpiresAt,
    expiresAt: value.expiresAt,
    wsPath: value.wsPath,
    audio: { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 },
  };
}

function readProposal(value: unknown): NavigationProposal | undefined {
  if (!isRecord(value) || !["stay", "advance", "revisit", "return"].includes(String(value.action)) ||
      !id(value.slideId) || !counter(value.version) ||
      (value.returnPointId !== null && !id(value.returnPointId)) ||
      typeof value.confidence !== "number" || !Number.isFinite(value.confidence) ||
      value.confidence < 0 || value.confidence > 1) return;
  return {
    action: value.action as NavigationProposal["action"], slideId: value.slideId,
    confidence: value.confidence, version: value.version, returnPointId: value.returnPointId,
  };
}

export function parseLiveEvent(data: unknown): LiveEvent | undefined {
  if (typeof data !== "string" || new TextEncoder().encode(data).length > 65_536) return;
  let value: unknown;
  try { value = JSON.parse(data); } catch { return; }
  if (!isRecord(value) || !["ready", "stateAck", "transcript", "proposal", "error", "ended"].includes(String(value.type)) ||
      !id(value.sessionId) || !id(value.epoch) || !counter(value.generation) || value.generation < 1 ||
      !counter(value.version) || !counter(value.transcriptSeq) || typeof value.held !== "boolean" ||
      typeof value.acceptsAudio !== "boolean" || typeof value.isFinal !== "boolean") return;
  if (value.text !== undefined && (typeof value.text !== "string" || new TextEncoder().encode(value.text).length > 6000)) return;
  if (value.code !== undefined && typeof value.code !== "string") return;
  if (value.message !== undefined && typeof value.message !== "string") return;
  const proposal = value.proposal === undefined ? undefined : readProposal(value.proposal);
  if (value.type === "proposal" && (!proposal || proposal.version !== value.version)) return;
  if (value.type === "transcript" && typeof value.text !== "string") return;
  return {
    type: value.type as LiveEvent["type"], sessionId: value.sessionId, epoch: value.epoch,
    generation: value.generation, version: value.version, transcriptSeq: value.transcriptSeq,
    held: value.held, acceptsAudio: value.acceptsAudio, isFinal: value.isFinal,
    text: value.text as string | undefined, proposal,
    code: typeof value.code === "string" ? value.code.slice(0, 100) : undefined,
    message: typeof value.message === "string" ? value.message.slice(0, 512) : undefined,
  };
}
