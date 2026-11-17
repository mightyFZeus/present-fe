# Cloudflare deployment

Present uses vinext with Vite and the Cloudflare Vite plugin. Its existing App
Router files and `next/*` imports remain application APIs. `cloudflare.config.ts`
is the Worker configuration; this setup does not use a Wrangler project config.

## Local development and production preview

Use a Node release supported by `cf`: `^22.23.0 || ^24.22.0 || ^26.12.0`.
The migration was tested with Node.js 26.12.1 and npm 11.20.0.

```sh
npm ci
npm run dev
```

Development keeps `http://localhost:3000`. If it is occupied, use an explicit
`--port` override and update your local backend/Google allowed origins; do not
stop another service merely to obtain the port. Both development and preview
fail if the chosen port is occupied, rather than silently switching origins.

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm start
```

`npm start` runs `vite preview` on `http://localhost:3000`, a local production
Worker preview of the built
output. It does not publish a Worker. `npm run check:deploy` builds production
output, validates it with the installed `cf` deployment reader, then dry-runs
the deployment setup. It does not authenticate or publish. Runtime preview
remains a separate check. To validate an existing build without rebuilding, run
`npm run check:build-output`.

## Build Output compatibility

Keep `@cloudflare/vite-plugin@2.0.0-rc.0` and `cf@1.0.0-rc.0` pinned together.
The plugin writes Build Output v1 and the CLI reads v1. The older plugin beta
wrote v0, which the rc CLI rejects even when the application build succeeds.
The offline check resolves `@cloudflare/build-output-utils` from `cf`, so it
uses the actual consumer even when npm installs that dependency nested. It
checks the full schema and rejects legacy or mixed-version output.

The rc plugin automatically clears `.cloudflare/output` on an actual build,
including restored v0 build cache, before generating v1. No project cleanup
wrapper is needed. `.cloudflare` types/state outside that output directory are
preserved. Normal build/deploy aliases use this path; `--skip-build` preserves
prebuilt output and requires it to be valid already. Run `npm run build` if an
old cache is rejected. The underlying deploy `--dry-run` returns before output
validation; use `npm run check:deploy` for the complete local check.

Release references: [Vite plugin rc.0](https://github.com/cloudflare/workers-sdk/releases/tag/%40cloudflare%2Fvite-plugin%402.0.0-rc.0)
and [cf rc.0](https://github.com/cloudflare/cf/releases/tag/cf%401.0.0-rc.0).

## Selected resource choices

- CDN response cache: none.
- Data cache: none.
- Image optimization: none.
- Prerendering: disabled. Cache warming: disabled.
- Bindings: static assets only, with no KV, R2, Images or database resource.

Retain `ASSETS` and both generated static-asset exclusions:
`/_next/static/*` and `/*/_next/static/*`. Keep the source Worker configuration
committed; generated `.cloudflare/`, `.vinext/`, `.next/` and `dist/` output is not
source. Local fonts, the photograph and `/audio/*.mjs` remain static assets.
A source-file/selector-scoped PostCSS adapter preserves the existing whole-slide
containment rules in normal and focused views, without changing application CSS
or the image shim. Authenticated slide Blob URLs stay direct browser resources, not image-optimizer
requests. No new image provider or cache account is required by these choices.

## Public build settings

Configure these public values in the environment that runs the build:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

The API value must be a canonical HTTP(S) origin, with no path, credentials, query
or fragment. Browser values with the `NEXT_PUBLIC_` prefix are embedded at build
time. Changing Worker runtime variables after a build does not change its client
bundle; rebuild after changing either public setting. Do not expose backend
provider keys through public variables or a broad `process.env` replacement.

## Domains, Google and the existing backend

Use a same-site pair such as `https://app.example.com` for the frontend and
`https://api.example.com` for the API. The existing backend uses a host-only,
HttpOnly, SameSite=Lax session cookie. A `workers.dev` frontend with an unrelated
API domain is cross-site and will not restore that cookie through browser fetch.
Use a suitable custom frontend domain rather than changing authentication here.

Configure the exact HTTPS frontend origin in:

- Google Web application OAuth JavaScript origins.
- The backend `AUTH_ALLOWED_ORIGINS` setting for credentialed authentication.
- The backend `LIVE_ALLOWED_ORIGINS` setting for live WebSocket connections.

Use the same public Google client ID on the frontend and backend. The production
API must use HTTPS; the existing client derives WSS for its live connection.
The backend owns session-cookie, authorization and provider configuration. This
migration does not alter those settings or initiate a real sign-in/live session.

## Publishing when authorized

No Cloudflare login, account provisioning or deployment was performed during the
migration. For an intentional future deployment, configure Cloudflare account
access outside source control. CI can use the `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` environment variables. Never commit their values.

The project deployment command is:

```sh
npm run deploy
```

It builds and publishes through `vinext-cloudflare deploy` using the typed
Cloudflare configuration. Unlike `npm start`, this is a real remote deployment.

For Cloudflare Workers Builds, set the build command empty and deploy command to
`npm run deploy`, because that command includes the build. Do not also set
`npm run build` as the dashboard build command, which builds twice. Commit the
lockfile and install with `npm ci` to retain the compatible producer/consumer
pair. Override the default
Wrangler deploy command; it targets a different configuration flow. Set public
build variables for production and preview environments separately.

If intentionally enabling remote preview deployments, the Workers Builds preview
command is `npx vinext-cloudflare previews deploy`. This publishes remotely; it is
not local `vite preview` and was not run as a verification step.

Official references: [vinext Cloudflare guide](https://vinext.dev/docs/deploying/cloudflare)
and [caching choices](https://vinext.dev/docs/guides/caching).
