"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, FileUp, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { presentationsApi, useListPresentationsInfiniteQuery } from "@/features/presentations/presentationsApi";
import type { PresentationSummary } from "@/features/presentations/presentationTypes";
import { useAppSelector, useAppStore } from "@/store/hooks";
import { presentationHref, visibleSavedPresentations } from "./libraryHelpers";
import { UploadPanel } from "./UploadPanel";
import type { WorkspaceController } from "./WorkspaceController";

const statusLabels = {
  queued: "Queued",
  processing: "Preparing",
  ready: "Ready",
  failed: "Preparation failed",
};

function errorMessage(error: unknown, fallback: string) {
  return typeof error === "object" && error !== null && "message" in error &&
    typeof error.message === "string" ? error.message : fallback;
}

function filenameError(value: string) {
  const filename = value.trim();
  if (!filename || new TextEncoder().encode(filename).length > 255 ||
    /[\u0000-\u001f\u007f-\u009f/\\]/u.test(filename)) {
    return "Use a name of 1–255 bytes without slashes or control characters.";
  }
  return null;
}

function SavedPresentationCard({
  presentation,
  controller,
  selected,
  selectionLocked,
  onSelect,
}: {
  presentation: PresentationSummary;
  controller: WorkspaceController;
  selected: boolean;
  selectionLocked: boolean;
  onSelect(id: string, selected: boolean): void;
}) {
  const activeMutation = useAppSelector((state) => state.workspace.savedPending[presentation.id]);
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [filename, setFilename] = useState(presentation.filename);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = useRef<HTMLLIElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const rename = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const restoreActionFocus = useRef<"rename" | "delete" | null>(null);
  const label = useId();
  const actionLocked = selectionLocked || pending || !!activeMutation;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (mode === "rename") { input.current?.focus(); input.current?.select(); }
    if (mode === "delete") keep.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode !== "view" || pending || activeMutation || !mounted.current) return;
    const action = restoreActionFocus.current;
    if (!action) return;
    restoreActionFocus.current = null;
    (action === "rename" ? rename : remove).current?.focus();
  }, [mode, pending, activeMutation]);

  const cancel = () => {
    if (actionLocked) return;
    restoreActionFocus.current = mode === "rename" ? "rename" : "delete";
    setMode("view");
    setError(null);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (actionLocked) return;
    const invalid = filenameError(filename);
    if (invalid) { setError(invalid); return; }
    setPending(true);
    setError(null);
    try {
      await controller.renameSaved(presentation.id, filename.trim());
      if (mounted.current) {
        restoreActionFocus.current = "rename";
        setMode("view");
      }
    } catch (error) {
      if (mounted.current) setError(errorMessage(error, "The presentation could not be renamed."));
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  const confirmDelete = async () => {
    if (actionLocked) return;
    const host = row.current;
    const following = host?.nextElementSibling?.querySelector<HTMLAnchorElement>(".saved-open");
    const previous = host?.previousElementSibling?.querySelector<HTMLAnchorElement>(".saved-open");
    setPending(true);
    setError(null);
    try {
      await controller.deleteSaved(presentation.id);
      if (document.activeElement === document.body || host?.contains(document.activeElement)) {
        requestAnimationFrame(() => {
          const target = following?.isConnected ? following : previous?.isConnected ? previous :
            document.getElementById("saved-presentations-title");
          target?.focus();
        });
      }
    } catch (error) {
      if (mounted.current) setError(errorMessage(error, "The presentation could not be deleted."));
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  return <li ref={row} className={`saved-presentation${selected ? " is-selected" : ""}`}>
    {mode === "view" && <label className="saved-select">
      <input
        type="checkbox"
        aria-label={`Select ${presentation.filename}`}
        checked={selected}
        disabled={selectionLocked || !!activeMutation || mode !== "view"}
        onChange={(event) => onSelect(presentation.id, event.currentTarget.checked)}
      />
    </label>}
    {mode === "rename" ? <form className="saved-rename" onSubmit={save}>
      <label htmlFor={label}>Presentation name</label>
      <input
        ref={input}
        id={label}
        value={filename}
        disabled={actionLocked}
        autoComplete="off"
        aria-invalid={!!error}
        aria-describedby={error ? `${label}-error` : undefined}
        onChange={(event) => { if (!actionLocked) setFilename(event.currentTarget.value); }}
        onKeyDown={(event) => { if (event.key === "Escape" && !pending) cancel(); }}
      />
      <div className="saved-inline-actions">
        <button type="submit" className="button secondary" disabled={actionLocked}>
          <Check size={14} aria-hidden="true" />{pending ? "Saving…" : "Save name"}
        </button>
        <button type="button" className="text-button" disabled={actionLocked} onClick={cancel}>
          <X size={14} aria-hidden="true" />Cancel
        </button>
      </div>
    </form> : mode === "delete" ? <div className="saved-delete" role="group" aria-labelledby={label}>
      <p id={label}>Delete “{presentation.filename}”?</p>
      <p className="supporting">The saved file and its prepared slides will be permanently removed.</p>
      <div className="saved-inline-actions">
        <button
          type="button"
          className="button danger"
          disabled={actionLocked}
          onClick={() => void confirmDelete()}
        >
          {pending ? "Deleting…" : "Delete presentation"}
        </button>
        <button
          ref={keep}
          type="button"
          className="text-button"
          disabled={actionLocked}
          onClick={cancel}
        >
          Keep presentation
        </button>
      </div>
    </div> : <>
      <Link
        href={presentationHref(presentation.id)}
        prefetch={false}
        className="saved-open"
        aria-disabled={!!activeMutation}
        aria-label={`${presentation.status === "ready" ? "Open" : "View status for"} ${presentation.filename}`}
        onClick={(event) => {
          setError(null);
          try {
            controller.ensureSavedAvailable(presentation.id);
            if (activeMutation) throw new Error("Wait for this presentation's current action to finish.");
          } catch (error) {
            event.preventDefault();
            setError(errorMessage(error, "This presentation could not be opened."));
          }
        }}
      >
        <span className="saved-cover" aria-hidden="true">
          <FileText size={38} strokeWidth={1.15} />
          <span>{presentation.format.toUpperCase()}</span>
        </span>
        <span className="saved-file-copy">
          <span className={`saved-status ${presentation.status}`}>
            <span className="status-dot" aria-hidden="true" />{statusLabels[presentation.status]}
          </span>
          <strong title={presentation.filename}>{presentation.filename}</strong>
          <span className="saved-open-label">{presentation.status === "ready" ? "Open presentation" : "View preparation status"}<ArrowUpRight size={14} aria-hidden="true" /></span>
        </span>
      </Link>
      <div className="saved-row-footer">
        <span className="saved-file-meta">
          {presentation.format.toUpperCase()}
          {presentation.slideCount > 0 ? ` · ${presentation.slideCount} ${presentation.slideCount === 1 ? "slide" : "slides"}` : ""}
          {Number.isFinite(Date.parse(presentation.createdAt)) && <time dateTime={presentation.createdAt}>
            {new Date(presentation.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
          </time>}
        </span>
        <button
          ref={rename}
          type="button"
          className="icon-button"
          aria-label={`Rename ${presentation.filename}`}
          disabled={selectionLocked || !!activeMutation}
          onClick={() => { setFilename(presentation.filename); setError(null); setMode("rename"); }}
        ><Pencil size={15} aria-hidden="true" /></button>
        <button
          ref={remove}
          type="button"
          className="icon-button"
          aria-label={`Delete ${presentation.filename}`}
          disabled={selectionLocked || !!activeMutation}
          onClick={() => { setError(null); setMode("delete"); }}
        ><Trash2 size={15} aria-hidden="true" /></button>
      </div>
      {activeMutation && <p className="saved-pending" role="status">{activeMutation.kind === "rename" ? "Saving name…" : "Deleting presentation…"}</p>}
      {presentation.status === "failed" && presentation.error && <p className="saved-preparation-error">{presentation.error}</p>}
    </>}
    {error && <p id={`${label}-error`} className="error-text" role="alert">{error}</p>}
  </li>;
}

export function SavedPresentations({ controller, onUploaded }: {
  controller: WorkspaceController;
  onUploaded?(id: string): void;
}) {
  const store = useAppStore();
  const generation = useAppSelector((state) => state.auth.generation);
  const pendingWrites = useAppSelector((state) => state.workspace.savedPending);
  const [showUpload, setShowUpload] = useState(false);
  const [selection, setSelection] = useState<{
    generation: number;
    ids: string[];
  }>({
    generation,
    ids: [],
  });
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const [batch, setBatch] = useState<{
    total: number;
    completed: number;
    stopping: boolean;
  } | null>(null);
  const [failures, setFailures] = useState<{
    id: string;
    message: string;
  }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const deleteSelected = useRef<HTMLButtonElement>(null);
  const keepSelected = useRef<HTMLButtonElement>(null);
  const restoreBulkFocus = useRef(false);
  const mounted = useRef(false);
  const batchIntent = useRef(0);
  const stopRemaining = useRef(false);
  useEffect(() => {
    mounted.current = true;
    batchIntent.current += 1;
    return () => {
      mounted.current = false;
      batchIntent.current += 1;
    };
  }, [generation]);
  const authenticated = useAppSelector((state) => !!state.auth.accessToken);
  const preparing = useAppSelector((state) =>
    presentationsApi.endpoints.listPresentations.select(undefined)(state).data?.pages.some((page) =>
      page.presentations.some((presentation) => presentation.status === "queued" || presentation.status === "processing"),
    ) ?? false,
  );
  const changes = useAppSelector((state) => state.workspace.savedChanges);
  const query = useListPresentationsInfiniteQuery(undefined, {
    skip: !authenticated,
    pollingInterval: preparing ? 2000 : 0,
    refetchOnMountOrArgChange: true,
  });
  const presentations = useMemo(() =>
    visibleSavedPresentations(query.currentData?.pages ?? [], changes),
  [query.currentData, changes]);
  const selected = selection.generation === generation ? selection.ids.filter((id) =>
    presentations.some((presentation) => presentation.id === id),
  ) : [];
  const eligible = presentations.filter((presentation) => !pendingWrites[presentation.id]);
  const loading = !query.currentData && (query.isLoading || query.isFetching);
  const allSelected = eligible.length > 0 &&
    eligible.every((presentation) => selected.includes(presentation.id));
  const someSelected = eligible.some((presentation) => selected.includes(presentation.id));
  const owned = selection.generation === generation;
  const locked = owned && (!!confirmation || !!batch);
  const selectedPending = selected.some((id) => !!pendingWrites[id]);
  // Adjust this component's transient state before committing a new account or
  // settled list. Fetching/error snapshots do not revoke selection intent.
  if (!owned) {
    setSelection({
      generation,
      ids: [],
    });
    setConfirmation(null);
    setBatch(null);
    setFailures([]);
    setNotice(null);
  } else if (query.currentData && !query.isFetching && !query.error &&
    selected.length !== selection.ids.length) {
    setSelection({
      generation,
      ids: selected,
    });
  }
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);
  useEffect(() => {
    if (confirmation && !batch) keepSelected.current?.focus();
    if (!confirmation && !batch && restoreBulkFocus.current) {
      restoreBulkFocus.current = false;
      const target = selected.length && !selectedPending ? deleteSelected.current :
        document.getElementById("saved-presentations-title");
      target?.focus();
    }
  }, [confirmation, batch, selected.length, selectedPending]);
  const sameAccount = () => mounted.current && store.getState().auth.generation === generation &&
    !!store.getState().auth.accessToken;
  const choose = (id: string, checked: boolean) => {
    if (!sameAccount() || locked || pendingWrites[id]) return;
    setSelection((previous) => ({
      generation,
      ids: checked ? [...new Set([
        ...(previous.generation === generation ? previous.ids : []),
        id,
      ])] : previous.ids.filter((value) => value !== id),
    }));
    setFailures([]);
    setNotice(null);
  };
  const confirmBulkDelete = async () => {
    if (!sameAccount() || !confirmation || batch) return;
    const ids = [...confirmation];
    const intent = ++batchIntent.current;
    const current = () => sameAccount() && batchIntent.current === intent;
    stopRemaining.current = false;
    setBatch({
      total: ids.length,
      completed: 0,
      stopping: false,
    });
    setFailures([]);
    setNotice(null);
    const result = await controller.deleteSavedMany(
      ids,
      () => current() && !stopRemaining.current,
      (completed) => {
        if (current()) setBatch((value) => value ? {
          ...value,
          completed,
        } : value);
      },
    );
    if (!current()) return;
    setSelection((previous) => previous.generation === generation ? {
      generation,
      ids: previous.ids.filter((id) => !result.deleted.includes(id)),
    } : previous);
    setFailures(result.failed);
    setNotice([
      `${result.deleted.length} ${
        result.deleted.length === 1 ? "presentation" : "presentations"
      } deleted.`,
      result.failed.length ? `${result.failed.length} could not be deleted.` : "",
      result.unattempted.length ? `${result.unattempted.length} not attempted.` : "",
    ].filter(Boolean).join(" "));
    restoreBulkFocus.current = true;
    setConfirmation(null);
    setBatch(null);
  };

  return <section className="saved-presentations" aria-labelledby="saved-presentations-title" aria-busy={query.isFetching}>
    <div className="section-heading saved-heading">
      <div className="library-heading-copy">
        <p className="eyebrow">Your workspace</p>
        <h1 id="saved-presentations-title" tabIndex={-1}>Your presentations</h1>
        <p>Upload once. Open your prepared slides whenever you need them.</p>
      </div>
      <div className="library-heading-actions">
      <button type="button" className="button primary" disabled={!authenticated} onClick={() => {
        setShowUpload(true);
        document.getElementById("presentation-file-input")?.click();
      }}><FileUp size={16} aria-hidden="true" />Upload presentation</button>
      <button
        type="button"
        className="icon-button"
        aria-label="Refresh saved presentations"
        disabled={!authenticated || query.isFetching}
        onClick={() => void query.refetch()}
      ><RefreshCw size={15} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="library-upload" hidden={!showUpload && (loading || !!query.error || presentations.length > 0)}>
      {!loading && !query.error && !presentations.length && <div className="library-empty-copy">
        <h2>No presentations yet</h2>
        <p>Your uploaded files will live here. Add your first PDF or PowerPoint to get started.</p>
      </div>}
      <UploadPanel controller={controller} library onUploaded={onUploaded} />
    </div>
    {presentations.length > 0 && <div
      className="saved-selection"
      aria-label="Presentation selection"
    >
      <label className="saved-select-all">
        <input
          ref={selectAll}
          type="checkbox"
          checked={allSelected}
          disabled={locked || !eligible.length}
          onChange={(event) => {
            if (!sameAccount() || locked) return;
            const checked = event.currentTarget.checked;
            setSelection({
              generation,
              ids: checked ? eligible.map((presentation) => presentation.id) : [],
            });
            setFailures([]);
            setNotice(null);
          }}
        />
        Select all shown
      </label>
      <span className="saved-selection-count" role="status">{selected.length} selected</span>
      <div className="saved-selection-actions">
        <button
          type="button"
          className="text-button"
          disabled={locked || !selected.length}
          onClick={() => {
            if (!sameAccount()) return;
            setSelection({
              generation,
              ids: [],
            });
            setFailures([]);
            setNotice(null);
          }}
        >Clear selection</button>
        <button
          ref={deleteSelected}
          type="button"
          className="button secondary"
          disabled={locked || !selected.length || selectedPending}
          onClick={() => {
            if (!sameAccount() || selectedPending) return;
            setConfirmation([...selected]);
            setNotice(null);
          }}
        >
          <Trash2 size={15} aria-hidden="true" />
          {failures.length ? "Retry selected" : "Delete selected"}
        </button>
      </div>
      <p className="saved-selection-hint">
        Select all applies to available cards shown here. New pages stay unselected.
      </p>
      {selectedPending && !batch && <p className="supporting" role="status">
        Wait for the selected presentation’s current action to finish.
      </p>}
    </div>}
    {owned && confirmation && <div
      className="saved-bulk-confirm"
      role="group"
      aria-labelledby="saved-bulk-title"
    >
      <h2 id="saved-bulk-title">
        Delete {confirmation.length} selected {
          confirmation.length === 1 ? "presentation" : "presentations"
        }?
      </h2>
      <p>Each saved file and its prepared slides will be permanently removed.</p>
      <div className="saved-inline-actions">
        {batch ? <>
          <span role="status">{batch.stopping ?
            "Stopping after the current deletion…" :
            `Deleting… ${batch.completed} of ${batch.total} finished`
          }</span>
          <button
            type="button"
            className="text-button"
            disabled={batch.stopping}
            onClick={() => {
              stopRemaining.current = true;
              setBatch((value) => value ? {
                ...value,
                stopping: true,
              } : value);
            }}
          >Stop remaining</button>
        </> : <>
          <button
            type="button"
            className="button danger"
            onClick={() => void confirmBulkDelete()}
          >Delete {confirmation.length} permanently</button>
          <button
            ref={keepSelected}
            type="button"
            className="text-button"
            onClick={() => {
              restoreBulkFocus.current = true;
              setConfirmation(null);
            }}
          >Keep presentations</button>
        </>}
      </div>
      {batch && <p className="supporting">
        Completed deletions cannot be undone. Stop remaining leaves requests already
        started to finish.
      </p>}
    </div>}
    {owned && notice && <p className="saved-bulk-notice" role="status">{notice}</p>}
    {owned && failures.length > 0 && <div className="saved-bulk-errors" role="alert">
      <p>Failed presentations remain selected. Retry selected when you’re ready.</p>
      <ul>{failures.map((failure) => <li key={failure.id}>
        <strong>{
          presentations.find((presentation) => presentation.id === failure.id)?.filename ??
          "Presentation"
        }</strong>: {failure.message}
      </li>)}</ul>
    </div>}
    {loading ? <div className="saved-loading" role="status">
      <span>Loading your presentations…</span>
      <div aria-hidden="true"><span /><span /><span /></div>
    </div> : <>
      {presentations.length > 0 && <ul className="saved-list saved-grid">
        {presentations.map((presentation) => <SavedPresentationCard
          key={presentation.id}
          presentation={presentation}
          controller={controller}
          selected={selected.includes(presentation.id)}
          selectionLocked={locked}
          onSelect={choose}
        />)}
      </ul>}

      {query.error && <div className="saved-list-error" role="alert">
        <p>{errorMessage(query.error, "Your saved presentations could not be loaded.")}</p>
        <button type="button" className="text-button" disabled={query.isFetching} onClick={() => void query.refetch()}>Try again</button>
      </div>}
      {query.hasNextPage && <button
        type="button"
        className="text-button saved-load-more"
        disabled={query.isFetching}
        onClick={() => void query.fetchNextPage()}
      >{query.isFetchingNextPage ? "Loading more…" : "Load more"}</button>}
    </>}
  </section>;
}
