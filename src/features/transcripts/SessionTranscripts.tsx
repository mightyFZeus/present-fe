"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { useAppSelector, useAppStore } from "@/store/hooks";
import { useListTranscriptsInfiniteQuery, useFinishTranscriptMutation, transcriptFinishKey, type TranscriptSession } from "./transcriptApi";
import { downloadTranscript } from "./transcriptDownload";
import "./transcripts.css";


function TranscriptRow({ session, presentationId, pending, download }: {
  session: TranscriptSession;
  presentationId: string;
  pending: string | null;
  download(id: string): void;
}) {
  const [finish, finishing] = useFinishTranscriptMutation({
    fixedCacheKey: transcriptFinishKey(presentationId, session.id),
  });
  return <li>
    <div><time dateTime={session.createdAt}>{new Date(session.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</time>
      <span>{session.state === "active" ? "Session open" : session.state === "paused" ? "Paused" : "Ended"} · {session.segmentCount} {session.segmentCount === 1 ? "passage" : "passages"}{session.incomplete ? " · Incomplete save" : ""}</span>
      {finishing.error && <span className="transcript-finish-error" role="alert">The session could not be marked ended. Your saved text is still available.</span>}
    </div>
    <div className="transcript-row-actions">
      {finishing.error && <button className="text-button" disabled={finishing.isLoading} onClick={() => void finish({ presentationId, transcriptId: session.id })}>Retry finish</button>}
      {finishing.isLoading && <span className="supporting" role="status">Finishing session…</span>}
      <button className="button secondary" disabled={pending !== null} onClick={() => download(session.id)}><Download size={15} aria-hidden="true" />{pending === session.id ? "Downloading…" : "Download transcript"}</button>
    </div>
  </li>;
}

function UnlistedFinishFailure({ presentationId, transcriptId }: { presentationId: string; transcriptId: string }) {
  const [finish, state] = useFinishTranscriptMutation({
    fixedCacheKey: transcriptFinishKey(presentationId, transcriptId),
  });
  return <p className="error-text" role="alert">
    A session could not be marked finished.
    <button className="text-button" disabled={state.isLoading}
      onClick={() => void finish({ presentationId, transcriptId })}>
      {state.isLoading ? "Finishing…" : "Retry finish"}
    </button>
  </p>;
}

export function SessionTranscripts({ presentationId }: { presentationId: string }) {
  const store = useAppStore();
  const authenticated = useAppSelector((state) => !!state.auth.accessToken);
  const generation = useAppSelector((state) => state.auth.generation);
  const live = useAppSelector((state) => state.live);
  const mutations = useAppSelector((state) => state.api.mutations);
  const active = live.presentationId === presentationId && ["ready", "connecting", "updating"].includes(live.status);
  const query = useListTranscriptsInfiniteQuery(presentationId, {
    skip: !authenticated,
    pollingInterval: active ? 3000 : 0,
    refetchOnMountOrArgChange: true,
  });
  const sessions = query.currentData?.pages.flatMap((page) => page.sessions) ?? [];
  const finishPrefix = `finish-${presentationId}-`;
  const unlistedFailures = Object.entries(mutations).filter(([key, mutation]) =>
    key.startsWith(finishPrefix) && mutation?.endpointName === "finishTranscript" &&
    mutation.status === "rejected" && !sessions.some((session) => key === transcriptFinishKey(presentationId, session.id)),
  ).map(([key]) => key.slice(finishPrefix.length));
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<ReturnType<ReturnType<typeof downloadTranscript>> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, [generation, presentationId]);
  const download = async (id: string) => {
    if (pending) return;
    setPending(id); setError(null);
    const task = store.dispatch(downloadTranscript({ presentationId, transcriptId: id }));
    operation.current = task;
    try { await task.unwrap(); }
    catch {
      if (mounted.current && store.getState().auth.generation === generation) {
        setError("The transcript could not be downloaded. Try again.");
      }
    } finally {
      if (mounted.current && store.getState().auth.generation === generation) setPending(null);
    }
  };
  return <section className="transcript-panel" aria-labelledby="transcript-title">
    <div className="transcript-heading">
      <div><h2 id="transcript-title"><FileText size={16} aria-hidden="true" />Session transcripts</h2>
        <p>Finalized speech, saved as you present. Hold and Resume keep the same transcript.</p></div>
      <button className="icon-button" aria-label="Refresh session transcripts" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={15} aria-hidden="true" /></button>
    </div>
    {query.isLoading ? <p className="supporting" role="status">Loading transcripts…</p> : sessions.length ?
      <ul className="transcript-list">{sessions.map((session) => <TranscriptRow
        key={session.id} session={session} presentationId={presentationId}
        pending={pending} download={(id) => void download(id)}
      />)}</ul> : !query.error && <p className="transcript-empty">Your first transcript appears after Following starts. Stop ends the session. Audio is not saved.</p>}
    {unlistedFailures.map((id) => <UnlistedFinishFailure key={id} presentationId={presentationId} transcriptId={id} />)}
    {query.error && <p className="error-text" role="alert">Transcript history could not load. Use Refresh to try again.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {query.hasNextPage && <button className="text-button" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : "Load more sessions"}</button>}
  </section>;
}
