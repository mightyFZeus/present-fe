# Frontend API integration

The base origin is the public `NEXT_PUBLIC_API_BASE_URL` setting, currently
`http://localhost:8080`. Every HTTP call goes through Axios. Redux Toolkit handles
orchestration: RTK Query caches JSON resources, while thunks handle credential and
imperative resource operations without caching secrets or browser handles.

## Existing backend route coverage

| Backend route | Frontend operation |
| --- | --- |
| `GET /health` | `useGetHealthQuery` / `healthApi.endpoints.getHealth` |
| `POST /v1/users/auth/google` | `signInWithGoogle(store, idToken)` |
| `GET /v1/users/auth/session` | Provider bootstrap / `restoreSession()` |
| `POST /v1/users/auth/logout` | `logout()` thunk |
| `POST /v1/presentations` | `uploadPresentation(store, file)` |
| `GET /v1/presentations` | `useListPresentationsInfiniteQuery` |
| `PATCH /v1/presentations/{id}` | `WorkspaceController.renameSaved(id, filename)` / RTK mutation |
| `DELETE /v1/presentations/{id}` | `WorkspaceController.deleteSaved(id)` / RTK mutation |
| `GET /v1/presentations/{id}` | `useGetPresentationQuery(id)` |
| `GET /v1/presentations/{id}/slides` | `useGetPresentationSlidesQuery(id)` |
| `GET /v1/presentations/{id}/source` | `loadPresentationSource({presentationId})` |
| `GET /v1/presentations/{id}/slides/{slideId}/image` | `loadSlideImage({presentationId, slideId})` |
| `POST /v1/presentations/{id}/retrieve` | `useRetrievePresentationMutation` |
| `POST /v1/presentations/{id}/propose` | `useProposePresentationMutation` |
| `POST /v1/presentations/{id}/live-sessions` | Inside `connectLiveSession({presentationId, snapshot})` |
| `GET /v1/live-sessions/{sessionId}/stream` WebSocket | Per-store `LiveClient` inside the live start operation |

The saved library uses the existing backend workspace routes; there is no refresh-token route. Logout clears
Redux/media/resources synchronously, then clears the HttpOnly cookie through the
new backend logout route. Cookie requests are limited to these three auth paths;
other Axios requests keep credentials disabled. Session GET never changes cookies.
Web Locks register auth operations immediately across tabs; unsupported browser
contexts fail closed with setup guidance. A token-free BroadcastChannel logout
signal clears other open tabs without rebroadcasting old HTTP completions.

JSON successes unwrap the backend `{data: ...}` envelope. Only the explicit DELETE
endpoint accepts an empty response, and only for HTTP 204; an empty or malformed
response from another endpoint still fails validation. HTTP failures become
safe `{status, message}` errors. The access token is attached as a Bearer header
per protected request from that store's current auth state, never placed in a URL
or Axios defaults. Public health/sign-in calls do not send it. A public sign-in
401 does not clear an existing session. Logout/current-session 401/account change
invalidates request generations, so old responses cannot log out a newer account
or reintroduce old cached data.

## Sign in and upload

Use these operations from Client Components with `useAppStore()`:

```tsx
import { useAppStore } from '@/store/hooks';
import { signInWithGoogle, logout } from '@/features/auth/authThunks';
import { uploadPresentation } from '@/features/presentations/presentationThunks';

const store = useAppStore();
const session = await signInWithGoogle(store, googleIdToken).unwrap();
// session contains only user + absolute expiresAt, never the access token.
const presentation = await uploadPresentation(store, file).unwrap();
store.dispatch(logout());
```

The dedicated `/login` page renders the official Google button through a one-initialization
GSI broker with one-use, mounted-owner callback nonces. Configure its public client
ID as described in [the workspace guide](web-workspace.md).
Google credential and File inputs use one-use runtime handles, so Redux action
arguments contain handles rather than credential/file objects. The sign-in wire
response token is consumed into memory-only auth state and omitted from the
fulfilled result/cache. Expiry is the earlier of `expiresIn` and the JWT `exp`
time. Browser decoding only bounds time; it does not verify the JWT signature.

Upload sends exactly one FormData field named `document`, with the browser setting
multipart Content-Type/boundary. PDF/PPTX, 255-byte filename and 20 MiB file checks
run locally. The backend owns the stricter 20 MiB *entire multipart body* limit and
the backend enforces slide/page capacity; a file near the limit can still receive 413 from the
backend. Upload returns the backend queued presentation rather than waiting for
preparation. Poll `useGetPresentationQuery(id, {pollingInterval: 1500})` as needed;
stop polling when ready/failed. The workspace performs this polling and fetches
ordered slides only when ready.

Presentation DTOs preserve the backend's UUIDs, RFC3339 timestamps, status/format,
outline and slide count. Slide positions are one-based; slides have no image URL
field. Retrieval scores are cosine similarity values, not probabilities.

## Binary assets and inference

```tsx
import { loadSlideImage, releaseAsset } from '@/features/presentations/presentationThunks';

const resource = await store.dispatch(loadSlideImage({presentationId, slideId})).unwrap();
// Render resource.url; do not put a Blob into application state.
store.dispatch(releaseAsset(resource.key)); // On removal/unmount.
```

`loadPresentationSource` works the same way. Both request binary data with Bearer
authentication and create caller-owned object URLs. Redux stores only URL/type/size
metadata; the runtime owns and revokes actual object URLs on release/logout.
Errors that arrive as JSON Blobs are decoded safely. Source is available before
preparation completes; slides/images/retrieval/proposals return 409 until ready.

Retrieval sends `{query}`. Proposals send `{transcript, snapshot}`. Query/transcript
must be nonblank and at most 6000 UTF-8 bytes; the backend enforces its 16 KiB JSON
body bound. Inference transport timeout is 185 seconds, and returned operation
promises support `.abort()` for UI cleanup. Responses remain advisory proposals;
the low-level API never advances a displayed slide. The workspace validates
eligibility, ownership, confidence and cooldown before applying a live proposal.

## Live transport and microphone ownership

```tsx
import {
  connectLiveSession, stopLiveSession, sendLivePcm, updateLiveSnapshot,
} from '@/features/live/liveThunks';

const metadata = await store.dispatch(connectLiveSession({presentationId, snapshot})).unwrap();
// This promise resolves after matching server readiness. metadata contains no ticket.
sendLivePcm(store, pcmBytes);
updateLiveSnapshot(store, {...snapshot, version: snapshot.version + 1, held: true});
await store.dispatch(stopLiveSession());
```

The backend receives `{}` on every live-session POST. Its ticket is consumed
internally by the socket's first `{type:'auth', ticket, snapshot}` message and is
never returned in Redux results, persisted, logged or placed in the WS URL. The
WS origin must match the configured HTTP API origin and the exact returned
`/v1/live-sessions/{sessionId}/stream` path. HTTP maps to WS; HTTPS maps to WSS.

Audio is raw signed PCM16 little-endian, mono, 16 kHz, with nonempty even frames
of at most 3200 bytes. The client gates audio until `ready.acceptsAudio` and caps
outgoing buffered audio. `CaptureController` owns the explicit microphone flow;
the native AudioWorklet imports the shared FIR/resampling encoder, emits 20 ms
frames including silence, and drops partial/queued frames across snapshot revisions.
It never records or replays microphone audio.
State updates require a strictly higher snapshot version and immediately gate
new audio until state acknowledgment plus readiness. `snapshot.held` is the only
Hold/Resume control. The UI must publish a new full snapshot after applying a
proposal or manual navigation; this transport never assumes a proposal was applied.

Events are validated and fenced by session/epoch/generation/version and published
proposal sequence. A proposal may be older than the latest transcript while newer
speech is pending; requiring equality would starve navigation. Wrong-generation
terminal events and late old connections are ignored. New connect attempts/Stop
invalidate pending ticket requests. Reconnect always creates a fresh session and
ticket; there is no transparent reconnect or audio replay. Auth expiry, logout,
Stop, socket failure and unmount cleanup close resources. Readiness permits the
backend's DB/provider startup time; first auth is still sent immediately on open.

The backend must have its server-only Google/OpenAI/ElevenLabs configuration and
prepared deck ready for those operations. The workspace now supplies sign-in,
upload, slide and microphone controls; it supplies no provider credentials.
Upload may trigger embedding/preparation. Live capture requires explicit Start
and microphone permission; neither runs automatically on page load.


## Verification performed

- `npm run lint`, `npm run typecheck`, `npm run test` (the behavioral suite), and
  `npm run build` passed after the integration changes.
- The actual Redux/RTK Query/Axios health path returned `status: "ok"` from the
  running local backend. Safe unauthenticated protected-route checks returned
  the expected 401; localhost browser-origin CORS preflight passed.
- Browser verification at `http://localhost:3000` displayed the actual page and
  “Backend connected”; the browser warning/error log query returned no entries.
  This also exercised development StrictMode/provider cleanup replay.
- No backend files or database migrations/data were changed. No real Google
  sign-in, uploads, model/transcription calls or microphone recording were executed.
  Auth/upload/assets/live/media tests fake network/socket/browser boundaries.

Slide/page capacity is owned by `MaxPresentationSlides` in the backend
`internal/limits/presentation.go`. The frontend does not duplicate that numeric
policy; backend preparation reports invalid counts. Snapshot validation retains
UUID, uniqueness and required visited-slide membership checks.

## Saved presentation library and presenter routes

`/workspace` is the authenticated library page. It uses the shared account/header,
full-width saved-file cards, empty/upload states, refresh and cursor pagination.
The card cover/title/Open link navigates to `/workspace/[presentationId]`; sibling
rename/delete controls do not navigate. The library requests metadata only, not
slide/image data for every card. Queued/processing items poll every two seconds.

The feature API defines an RTK Query infinite list with opaque cursor replay,
20-item requests and list/item invalidation tags through the shared Axios client.
Successful upload, rename and deletion invalidate affected queries. No total count
is inferred from loaded pages. The explicit DELETE contract accepts only HTTP 204
as an empty response.

The dynamic Server Component awaits its `params` promise and renders the protected
presenter keyed by canonical lowercase UUID. Client queries use that URL ID,
validate before HTTP, and use currentData so a prior selected deck cannot appear
during a cold load or A-to-B route change. Invalid or locally deleted IDs show an
unavailable state and Back to workspace. Reload/deep links fetch the requested
presentation without a previous in-memory selection. No auto-upload, preparation,
provider session or microphone starts when opening a card.
Provider-local teardown clears credentials/resources immediately but marks bootstrap
pending until reattach. This prevents Strict Mode child effects from redirecting a
valid deep link through login; explicit logout and completed failed restoration
still finish anonymous and use the existing login path.

Presenter activation selects the URL ID once, not whenever filenames/status poll.
Ready slides and private images load through existing queries/assets. Unready
uploads show their real preparation status; following stays disabled until ready.
Leaving stops owned capture/live work, releases images, clears navigation, speech
and focused view, and preserves library cache and confirmed-write guards. Cleanup
checks account, deck ID and intent so an old A route cannot stop a newer B session.
A confirmed deletion transition also releases its currently mounted route's URLs.

Upload returns an accepted presentation only while its auth/upload intent is
current. The library file chooser passes the ID to router.push only while mounted
and still current, navigating to queued/processing detail. Failures, cancellation,
account changes and late unmount completions never navigate. No file or credential
is browser-persisted.

Rename updates only label/timestamp, preserving the current slide/microphone.
Delete clears selected resources only after success and only for that selected ID.
Per-store request-ID mutation locks survive controller/page changes. Route detach
does not abort a CRUD request that may have committed; its owned completion still
records the outcome. Existing auth reset aborts requests, fences old responses and
clears locks. New route instances cannot overlap writes for the same file.

Successful writes retain per-auth in-memory deletion/latest-label overrides across
deck selection/cleanup. They filter older pending pages and prevent reopening a
deleted ID even if invalidation refresh fails. Label comparison retains PostgreSQL
submillisecond precision. Auth cleanup clears those overrides and pending locks;
newer server labels can supersede older confirmed ones.

The Node tests execute the actual feature API/store/controllers with synthetic
Axios and browser boundaries. Routing cases cover cold/reloaded/uppercase IDs,
A-to-B display guards, scoped cleanup, cross-controller CRUD and account races,
tombstone URL cleanup and guarded upload navigation. Actual Google/provider/media
connectivity remains separate from these local tests.


### Multi-selection deletion

The library batches the existing owner-scoped `DELETE /v1/presentations/{id}`
operation sequentially; no bulk API or response contract is introduced. It freezes
confirmed IDs, deduplicates them and checks auth generation plus mounted batch
intent before every request. Existing per-ID request locks, exact HTTP 204 handling,
cache invalidation and confirmed deletion tombstones apply to each operation.

A failed request does not undo successful deletions or stop other eligible IDs.
The UI reports individual failures and retains failed/unstarted selection for an
explicit retry. Stop/route exit prevents new starts without aborting a request
that may have committed. Auth reset retains its existing abort/fence behavior.
Native card checkboxes and Select all shown cover loaded available cards only.
