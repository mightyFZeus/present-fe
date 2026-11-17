# Present web

Present uses vinext and Vite with the native Cloudflare Workers integration.
The application keeps its App Router structure, TypeScript and `next/*` APIs;
vinext supplies their runtime implementations. Redux Toolkit/RTK Query, Axios,
React Redux, Tailwind CSS and Lucide React retain their existing responsibilities.

## Run locally

Use a Node release supported by `cf`: `^22.23.0 || ^24.22.0 || ^26.12.0`.
The migration was tested with Node.js 26.12.1 and npm 11.20.0.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The default origin is preserved for the existing
backend and Google development settings. The landing page leads to `/login`;
verified sign-in/restoration opens `/workspace`, and saved cards open their own
`/workspace/[presentationId]` pages. Anonymous sessions go to login before the
protected page mounts.

Public build settings are documented with non-secret defaults:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

Use a Google Web application client and the same public client ID on the backend.
Authorize `http://localhost:3000` as a JavaScript origin. The API value must be a
canonical HTTP(S) origin without a path, credentials, query or fragment. Restart
development or rebuild production after changing public values. Backend provider
keys remain server-only. No credentials are supplied by this repository setup.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite/Cloudflare development on port 3000 |
| `npm run build` | Production client/RSC/SSR and Cloudflare Worker build |
| `npm start` | Local production Worker preview on port 3000 |
| `npm run typecheck` | Generate vinext/Worker types, then run TypeScript |
| `npm test` | Node behavioral tests with the actual vinext router shims |
| `npm run lint` | ESLint over source/configuration |
| `npm run check:deploy` | Deployment configuration dry run; no build/publish |
| `npm run deploy` | Intentional real Cloudflare deployment, including build |

`dev:vinext`, `build:vinext` and `start:vinext` remain aliases. Next is retained
for compatible types/lint tooling, not as the primary dev/build/start runtime.
No Cloudflare authentication, account provisioning or remote deployment is needed
for the selected local ASSETS-only setup, and none was performed by migration.

See [Cloudflare deployment](docs/cloudflare-deployment.md) for build-time public
settings, domain/cookie requirements, local previews and Workers Builds commands.
In particular, the existing SameSite=Lax backend session requires a same-site
frontend/API pair such as `app.example.com` and `api.example.com` in production.

## Product and API behavior

The public page explains live voice following and supported number/topic commands.
Its Manrope/Petrona fonts are self-hosted and scoped to the landing page. Native
buttons change a labelled fictional example; they never start a microphone,
transcription or inference call. Login/workspace retain their system typography.

The workspace lists saved presentations, supports rename and confirmed single or
multi-select deletion, and reopens prepared decks without another upload. PDF and
PowerPoint (.pptx) uploads retain original visuals; the backend owns the 20 MiB
multipart and slide-capacity limits. Preparation polls until ready/failed. Saved
metadata, source files and processing remain backend responsibilities.

The API layer covers health, Google sign-in/session/logout, saved presentations,
protected slides/source/images, retrieval/proposals and live-session WebSockets.
All HTTP uses the shared Axios transport. Only auth calls include cookies. Access
tokens remain memory-only; no Web Storage, shared global store or global Axios
Authorization header is introduced. Auth generation fences, request cancellation,
object URL ownership and route/deck intents retain their current behavior.

Start/Resume following explicitly requests microphone permission and starts the
live connection. Hold stops local capture; Stop also closes the live session.
Reload, route return and account changes never restart capture automatically.
Audio remains filtered mono 16 kHz PCM16LE in 20 ms frames, without local recording
or replay. Manual navigation wins; uncertain matches keep the current slide.

- [API contracts and transport](docs/api-integration.md)
- [Workspace behavior and setup](docs/web-workspace.md)
- [Landing/product design](DESIGN.md)

## Configuration and structure

`vite.config.ts` enables vinext and Cloudflare's multi-environment plugin.
`cloudflare.config.ts` defines the Worker and static assets; no shared CDN/data
cache, image optimizer or prerendering is configured. Tailwind runs through its
Vite-compatible PostCSS integration. A narrowly scoped build adapter preserves
the existing normal/focused slide containment against vinext’s inline fill-image
cover default. Application CSS and image imports are unchanged. Keep the generated
static-asset exclusions.
Application `next/*` imports resolve through vinext without source rewrites.

```text
src/app/                       Routes, layout and global styles
src/features/                  Landing, auth, API, live, workspace and audio
src/components/                Backend status and per-provider Redux owner
src/lib/api/                   Axios and transient request/resource ownership
src/store/                     Store factory, typed hooks and RTK Query API
public/audio/                  Native AudioWorklet and shared streaming DSP
scripts/register-tests.mjs      Node TypeScript loader and vinext test aliases
```

Generated `.cloudflare/`, `.vinext/`, `.next/`, `dist/`, dependency directories and
TypeScript build caches are excluded from source. `vinext typegen` creates the
intended compatibility route helpers under `.next/types`; type checking does not
require a preceding Next build. Worker types are generated locally.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run check:deploy
npm start
```

Tests use the existing Node runner and TypeScript compiler with synthetic HTTP,
socket and browser-media boundaries. They exercise reducers/controllers and the
real vinext routing context, but cannot replace local Worker/browser validation.
Verify public/auth/workspace/deep links, fonts, images and `/audio/*.mjs` under
both development and local production preview. Real Google/provider calls require
separate intentional configuration and are not part of the local migration smoke.
# present-fe
