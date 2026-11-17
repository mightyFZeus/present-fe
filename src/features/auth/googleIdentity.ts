export interface GoogleCredential { credential?: string; state?: string }
export interface GoogleIdentity {
  initialize(options: { client_id: string; callback: (response: GoogleCredential) => void; auto_select: boolean }): void;
  renderButton(element: HTMLElement, options: { type: string; theme: string; size: string; width: number; text: string; state: string }): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }
let pending: Promise<GoogleIdentity> | undefined;
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const previous = document.getElementById("present-google-identity") as HTMLScriptElement | null;
    const script = previous ?? document.createElement("script");
    const finish = () => {
      clearTimeout(timer); script.removeEventListener("load", loaded); script.removeEventListener("error", failed);
    };
    const loaded = () => {
      finish();
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else { pending = undefined; script.remove(); reject(new Error("Google sign-in is unavailable.")); }
    };
    const failed = () => { finish(); pending = undefined; script.remove(); reject(new Error("Google sign-in could not load.")); };
    const timer = setTimeout(failed, 15_000);
    script.addEventListener("load", loaded); script.addEventListener("error", failed);
    if (!previous) {
      script.id = "present-google-identity"; script.src = "https://accounts.google.com/gsi/client";
      script.async = true; script.defer = true; document.head.appendChild(script);
    }
  });
  return pending;
}

interface Owner {
  element: HTMLElement;
  active(): boolean;
  credential(value: string): void;
  status(value: "loading" | "ready" | "error"): void;
  used: boolean;
}
export class GoogleIdentityBroker {
  private identity?: GoogleIdentity;
  private clientId?: string;
  private owners = new Map<string, Owner>();
  constructor(private load = loadGoogleIdentity, private nonce = () => crypto.randomUUID()) {}
  mount(clientId: string, owner: Omit<Owner, "used">) {
    const state = this.nonce(); const record = { ...owner, used: false };
    this.owners.set(state, record); owner.element.replaceChildren(); owner.status("loading");
    const active = () => this.owners.get(state) === record && record.active();
    void this.load().then((identity) => {
      if (!active()) return;
      if (!this.identity) {
        this.identity = identity; this.clientId = clientId;
        identity.initialize({ client_id: clientId, auto_select: false, callback: (response) => {
          if (typeof response.state !== "string" || typeof response.credential !== "string") return;
          const target = this.owners.get(response.state);
          if (!target || target.used || !target.active()) return;
          target.used = true; target.credential(response.credential);
        } });
      }
      if (this.clientId !== clientId) throw new Error("Google configuration changed. Reload the page.");
      identity.renderButton(owner.element, { type: "standard", theme: "outline", size: "large", width: 220, text: "signin_with", state });
      if (active()) owner.status("ready");
    }).catch(() => { if (active()) owner.status("error"); });
    return () => { this.owners.delete(state); owner.element.replaceChildren(); };
  }
  disableAutoSelect() { this.identity?.disableAutoSelect(); }
}
export const googleIdentity = new GoogleIdentityBroker();
