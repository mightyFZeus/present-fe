"use client";
import { useEffect, useRef, type DragEvent } from "react";
import { FileUp, LoaderCircle, X } from "lucide-react";
import { useAppSelector, useAppStore } from "@/store/hooks";
import type { WorkspaceController } from "./WorkspaceController";
export function UploadPanel({ controller, library = false, onUploaded }: {
  controller: WorkspaceController;
  library?: boolean;
  onUploaded?(id: string): void;
}) {
  const store = useAppStore();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const auth = useAppSelector((state) => !!state.auth.accessToken);
  const upload = useAppSelector((state) => state.workspace.upload);
  const hasSelection = useAppSelector((state) => !!state.workspace.deck);
  const selected = !library && hasSelection;
  const uploadFile = async (file: File) => {
    const generation = store.getState().auth.generation;
    const operation = controller.upload(file);
    const intent = store.getState().workspace.upload.intent;
    const presentation = await operation;
    const current = store.getState();
    if (presentation && mounted.current && current.auth.generation === generation &&
      current.workspace.upload.intent === intent && current.workspace.deck?.id === presentation.id) {
      onUploaded?.(presentation.id);
    }
  };
  const disabled = !auth || upload.status === "uploading";
  const drop = (event: DragEvent) => {
    event.preventDefault();
    if (disabled) return;
    if (event.dataTransfer.files.length === 1) void uploadFile(event.dataTransfer.files[0]);
  };
  return <section className={`upload-section ${selected ? "has-deck" : ""}`} aria-labelledby="upload-title">
    <div className="section-heading"><h2 id="upload-title">{selected ? "Replace presentation" : "Add a presentation"}</h2></div>
    <div className={`upload-drop ${disabled ? "disabled" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <FileUp size={25} strokeWidth={1.5} aria-hidden="true" />
      <p>Choose your deck to prepare its slides.</p>
      <input ref={input} id="presentation-file-input" className="presentation-file-input" type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" aria-label="Presentation file" disabled={disabled} tabIndex={-1} onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (file) void uploadFile(file);
      }} />
      <button type="button" className="button secondary" disabled={disabled} onClick={() => input.current?.click()}>{upload.status === "uploading" ? <><LoaderCircle size={16} className="spin" aria-hidden="true" /> Uploading…</> : selected ? "Choose another file" : "Choose a file"}</button>
      <span className="file-hint">PDF or PPTX · 20 MiB maximum</span>
      {auth && upload.status !== "uploading" && <span className="drop-hint">or drag and drop a file</span>}
    </div>
    {upload.status === "uploading" && <button className="text-button cancel-upload" onClick={() => controller.cancelUpload()}><X size={14} aria-hidden="true" /> Cancel upload</button>}
    {!auth && <p className="supporting">Sign in before uploading a presentation.</p>}
    {upload.error && <p className="error-text" role="alert">{upload.error}</p>}
  </section>;
}
