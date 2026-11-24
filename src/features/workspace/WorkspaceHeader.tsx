import { BrandMark } from "@/components/BrandMark";
"use client";

import Link from "next/link";
import { ArrowLeft, LogOut, UserRound } from "lucide-react";
import { BackendStatus } from "@/components/BackendStatus";
import { googleIdentity } from "@/features/auth/googleIdentity";
import { logout } from "@/features/auth/authThunks";
import { useAppSelector, useAppStore } from "@/store/hooks";

export function WorkspaceHeader({ presenter = false }: { presenter?: boolean }) {
  const store = useAppStore();
  const user = useAppSelector((state) => state.auth.user);
  return <header className="workspace-header">
    <Link href="/" className="brand" aria-label="Prezntly home">
      <BrandMark />
      <span>Prezntly</span>
    </Link>
    {presenter ? <Link href="/workspace" className="workspace-back" aria-label="Back to workspace" prefetch={false}>
      <ArrowLeft size={16} aria-hidden="true" />Back to workspace
    </Link> : <span className="workspace-context">Workspace</span>}
    <div className="header-meta">
      <BackendStatus />
      <div className="account-area">{user ? <>
        <span className="account-name"><UserRound size={16} aria-hidden="true" />
          <span className="account-name-text">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Signed in"}</span>
        </span>
        <button className="icon-button" aria-label="Sign out" onClick={() => {
          googleIdentity.disableAutoSelect();
          store.dispatch(logout());
        }}><LogOut size={17} aria-hidden="true" /></button>
      </> : <span className="signed-out-label">Presenter workspace</span>}</div>
    </div>
  </header>;
}
