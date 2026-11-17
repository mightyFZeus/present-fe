"use client";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { useGetHealthQuery } from "@/features/health/healthApi";
export function BackendStatus() {
  const { data, isFetching, error, refetch } = useGetHealthQuery();
  const connected = data?.status === "ok" && !error;
  return <div className="backend-status">
    <span role="status" className={connected ? "connected" : ""}>
      {isFetching ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : connected ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
      {isFetching ? "Checking connection" : connected ? "Connected" : "Connection unavailable"}
    </span>
    <button type="button" className="icon-button small" aria-label="Retry backend connection" onClick={() => void refetch()} disabled={isFetching}><RefreshCw size={14} aria-hidden="true" /></button>
  </div>;
}
