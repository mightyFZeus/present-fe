# Present frontend conventions

- Use TypeScript and the existing App Router/`next/*` application APIs through
  vinext, Vite and the native Cloudflare integration. Keep application imports
  unchanged. Read the installed vinext documentation and the explicit migration
  skill before runtime/config changes; Next documentation is an API compatibility
  reference, not an instruction to restore Next CLI as the primary runtime.
- Primary dev/build/start commands use Vite. `cloudflare.config.ts` is the Worker
  source of truth. Preserve the user's no-cache/no-image-optimizer choices and
  generated static-asset routing exclusions. Do not add cache bindings, deploy,
  authenticate or provision Cloudflare resources without explicit authorization.
- Keep `NEXT_PUBLIC_*` values build-time and narrowly exposed. Deployment and
  same-site backend-cookie/origin requirements are in
  `docs/cloudflare-deployment.md`. Never broaden exposure to all of process.env.
- Use Redux Toolkit for shared application state and RTK Query for API data.
  Keep the store per provider/request; never export a server-global store.
- HTTP requests go through the shared Axios client and Axios-backed RTK Query
  base query. Keep endpoint definitions in feature API modules.
- Use Lucide React for UI icons. Keep modules organized by responsibility.
- Keep secrets on the backend. Secret entries stay empty; the public API URL
  defaults to `http://localhost:8080` as requested. Document other non-secret
  setup values separately. Do not add persistence without a request.
- Use one implementation writer per task. Other agents stay read-only and must
  preserve existing user work.
- At completion, list every changed source/config/documentation/lockfile with a
  clickable path and concrete change. Provide the actual task diff, with a
  preserved baseline when Git is unavailable. Exclude generated dependency/build
  directories and redact actual environment values; report changed key names and
  empty/nonempty status. Never invent a before-version.

- Feature JSON endpoints use the shared RTK Query API. Credential/upload/live and
  binary-resource operations may use Redux Toolkit thunks with transient handles;
  never cache tickets, credentials, Files, Blobs or sockets as API results.
- Keep per-store auth generation and live-intent guards. Logout/expiry/account
  changes must reset requests, cache, object URLs and live resources. Public
  sign-in errors must not clear a different existing session.
- Do not enable Redux DevTools/action logging for the credential-bearing store.
