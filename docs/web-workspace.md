# Prezntly workspace

The protected `/workspace` is a standalone presentation library. Uploaded files
appear as cards; opening one navigates to `/workspace/[presentationId]`, where
current-deck thumbnails sit beside a large uncropped slide stage and controls.
There are no sample decks, fabricated speech or hidden automatic provider calls.
Product and visual decisions are recorded in PRODUCT.md and DESIGN.md. The public
landing lives at `/`; Start presenting and Sign in open `/login`. The healthy
login page centers a branded welcome card with the genuine Google button as the
only sign-in method. A valid new sign-in opens `/workspace`; restored sessions
keep their protected library/presenter URL. AuthGate withholds protected children during bootstrap
or invalid/expired auth and uses route replacement to `/login`. The existing
provider stays mounted across these routes. Leaving the workspace runs
its existing capture/resource cleanup and never automatically resumes audio.

The expanded public page uses a compact photo hero, mixed sans/italic typography,
detailed feature sections and clearly labelled static examples. It explains live
voice following and supported commands without promising a fixed response time.
These marketing components add no auth state, microphone capture or API calls;
login, cookie restoration, workspace guards and presentation controls are reused.

## Workspace layout

A compact header carries workspace context, the real connection status and account
controls. The library page has full-width saved-file cards and a genuine upload
empty state. The separate presenter rail contains only selected-deck details and
a scrolling slide list, with Back to workspace in its header. The stage takes the available workspace height,
with manual navigation and microphone actions together below it. Recent speech is
secondary. Narrow layouts stack the setup and wrap control groups; buttons retain
44px targets and long filenames wrap. Presentation view keeps its separate
viewport layout and the existing contained portrait/landscape viewer.

## Local setup

1. Run the backend at `http://localhost:8080` and allow the web origin
   `http://localhost:3000` in its HTTP CORS and live allowed-origin settings.
2. The local `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is configured to match the backend
   Google Web application client ID. For a new setup, set it in `.env.local`;
   `.env.example` deliberately leaves the value empty.
   Authorize both `http://localhost` and `http://localhost:3000` as Google
   JavaScript origins for local testing. The backend
   `GOOGLE_CLIENT_ID` must match. This public identifier is not a provider secret.
3. Run `npm run dev`, open `http://localhost:3000/login` and use Google's rendered
   sign-in button. A valid session opens `/workspace` automatically. Missing configuration, script failures and backend rejection
   have explicit states; failed sign-in gets a fresh callback owner for retry.
4. Upload a PDF/PPTX from the library, or open an existing card. New uploads open
   their own queued/processing presenter page. Wait for Ready, then navigate or
   choose Start following.
   Upload may incur backend embedding/preparation calls. Start requests microphone
   permission and then opens live transcription; neither occurs on page load.

Google, OpenAI, ElevenLabs and database secrets stay on the backend. The frontend
restores a still-valid login from the API's HttpOnly cookie before showing Google
sign-in. The token stays in Redux memory; no localStorage/sessionStorage stores
credentials. Reload restores the library or requested presenter URL after sign-in restoration,
and never resumes capture. Restoration
uses the original one-hour expiry, not a sliding or refresh session. Missing or
expired sessions show sign-in; network failures offer Retry session and Google.
Cookie login/logout/restore are ordered with Web Locks; use a modern browser on
HTTPS or localhost. Other tabs receive token-free logout signals. Provider cleanup
(including Strict Mode) clears local resources without logging out on the server.
The saved library uses authenticated list/rename/delete routes. There is no
refresh-token route.
No agent has performed a real sign-in, uploaded a deck, or activated a microphone.

## Uploads and protected slides

The file input and drop target send one multipart `document` field. Local checks
accept PDF/PPTX, at most 20 MiB file bytes and 255 UTF-8 filename bytes. The backend
limits the **whole multipart body** to 20 MiB and enforces slide/page capacity; allow
space for the multipart overhead. Cancellation prevents late upload completion
from selecting a deck. Queued/processing status polls every 1.5 seconds; ready or
failed stops polling. Failed preparation displays the server's safe error.

Slides load only for the ready current deck. One asset owner fetches at most three
protected PNG requests concurrently and shares each object URL between thumbnail
and stage. Deck changes, cancellation, logout and unmount abort stale work and
revoke URLs. A late previous owner cannot revoke its replacement. Images use
object-contain to preserve portrait and landscape decks. Each failed preview can
be retried. Source download helpers remain available in the API layer.

## Navigation and speech

The first slide starts held at version 1. Manual Previous/Next, thumbnail selection
and the focusable stage's Left/Right keys publish a new authoritative snapshot.
Confident automatic matches can select any slide in the current deck, including
a jump from the first slide to the last. Presentation order is context rather
than a destination filter. Jumping ahead visits only the selected target; skipped
slides are not marked visited. An earlier slide can be revisited even if it was
skipped, preserving the original main slide and one Return to main point across
earlier hops. Advancing beyond the main slide from a revisit clears that return
point. Stay proposals change nothing. The wire fields and action names are
unchanged; the allowed destinations are broader than the original next-only policy.

Automatic proposals apply only while actively Following, with the current deck,
session, epoch/generation and snapshot version, a newer published sequence,
confidence at least 0.8, a valid current-deck target and 1.5 seconds since the last manual
or automatic move. Published proposals may trail newer speech; equality with the
latest transcript sequence is deliberately not required. Manual controls take
precedence. Discarded/ambiguous/cooldown proposals are never delayed and replayed.
The state bridge coalesces rapid controls to the latest snapshot while waiting
for server acknowledgment/readiness. Audio is gated during that transition.

## Microphone lifecycle

Start/Resume is an explicit user action. Its click warms the AudioContext, obtains
permission **before** opening a paid live provider session, and keeps acquired
tracks disabled through matching server readiness. A long first permission prompt
does not consume the provider's idle window. Failed/cancelled/expired attempts stop
all tracks, including streams returned after cancellation. The native worklet
mixes channels, applies a low-pass FIR, maintains resampling phase across chunks,
and emits mono 16 kHz signed PCM16 little-endian in 320-sample/640-byte frames.
Silence is streamed too; RMS powers only the 10 Hz level meter, never a voice gate.
The output graph is silent, so there is no audible microphone loopback.

Hold immediately disposes tracks/context and publishes held state. Stop also
closes the live session. Hidden tabs/pagehide, device loss, processing failure,
terminal connection errors, logout, account change and expiry stop capture; resume
is always explicit. Recoverable matching errors with acceptsAudio true keep
capture active and show a message. Snapshot changes reset DSP partial buffers;
revision/time/readiness guards reject queued obsolete audio. When the audio send
buffer is full, the browser drops new audio frames. If the buffer stays full for
one second, following stops. Capture stops as soon as the server ends the session.
The browser waits briefly for the server's close reason and shows a specific
message for known reasons.

Microphone APIs require a secure context (localhost is accepted). Browser/device
permission and real provider connectivity still need user testing. No audio,
MediaStream, AudioContext, socket, Blob or credential callback is stored in Redux.
The per-store runtime synchronously cleans media on reset before React effects.

## Presentation view

Following enters presentation view only when capture actually reaches listening.
A small Presentation view button also enters it without starting a microphone or
opening a live session. The slide fills the viewport with contain sizing, while
the header, sidebar, transcript and stage labels are hidden from display and tab
navigation. The existing viewer, queries, assets and navigation remain mounted.

Hold, Stop, errors and brief server readiness gaps retain the presentation layout.
A held navigation snapshot shows Resume even if capture still reports listening;
Stop remains available. Pointer or keyboard interaction reveals compact controls.
They hide after 2.5 seconds only while following, without errors or toolbar focus;
meter/transcript updates do not restart that timer.

Full screen is requested only through its button. Unsupported/rejected requests
keep the viewport presentation usable and do not alter capture. Escape first
leaves native full screen, retaining presentation view; a further Escape or
Presenter controls holds capture and returns to the presenter controls with visible
focus restored. Back to workspace is a separate link to the file library.
Late fullscreen promises are fenced to the current root/account/deck/operation.
No focus exit or refresh automatically resumes the microphone.

The additive presentation reducer is installed from the workspace into the
retained per-provider store. Existing auth/deck/API/live state and runtime handles
are preserved; the core store/provider are unchanged. Deck/session reset clears
the view. This is in-memory UI state, with no persistence or API change.

## Accessibility and verification

Native buttons/file inputs, named controls, visible keyboard focus, a working
skip-to-stage target, readable contrast, reduced-motion support and responsive
single-column layout are included. Speech updates do not constantly interrupt a
screen reader. Browser review at desktop and 390px mobile confirmed no overflow,
no warning/error entries, real health connection/retry and keyboard skip focus.

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
The Node behavioral cases execute actual TypeScript/encoder modules with fake HTTP,
socket and media boundaries: navigation, coalescing/cooldown, same-key URL
ownership, late upload/permission cleanup, expiry with delayed timers, readiness,
old worklet callbacks, presentation lifecycle/fullscreen races, controller refresh lifecycle, GSI one-use owners and component sign-in failure retry.
The real Google/microphone/paid provider path remains for configured user testing;
there is no demo login, fake production route or test-mode auth bypass.

Slide/page capacity is owned by `MaxPresentationSlides` in the backend
`internal/limits/presentation.go`. The frontend does not duplicate that numeric
policy; backend preparation reports invalid counts. Snapshot validation retains
UUID, uniqueness and required visited-slide membership checks.

## Saved presentations and navigation

After sign-in, `/workspace` shows a full-width library with cards for the current
user's saved files. Cards show actual filename, file type, status, slide count and
uploaded date without fetching slide images for previews. The initial page has
up to 20 entries; Load more follows the backend cursor. Refresh, loading, empty
and retryable error states remain explicit. There is no reserved slide stage or
presentation sidebar on this page.

The empty library explains that no files have been uploaded and offers a real
PDF/PowerPoint file picker and drag/drop target. The native input is clipped, so
only the product chooser is visible. In a populated library the Upload presentation
action opens the upload panel. Accepted uploads navigate to their own presenter
URL and show queued/processing status, then prepared slides. Failed, canceled,
late-unmounted or old-account uploads never trigger navigation.

Each card's main link opens its separate presenter URL, with rename/delete buttons
outside that link. Opening a ready deck loads prepared slides without re-upload or
preparation. Unready cards open their actual status. Deep links and refresh use
the URL ID rather than a previously selected deck; uppercase UUIDs are normalized.
Invalid/deleted links show an unavailable state and Back to workspace.
A valid restored session keeps a deep presentation URL during provider replay;
local teardown remains bootstrap-pending, while explicit logout and failed restore
retain the existing sign-in behavior. The presenter
rail contains only the current deck and slides, with no library or replacement
uploader. Start following is always a separate explicit microphone action.

Rename uses an inline form with Save name, Cancel/Escape and filename validation.
Delete expands an inline permanent-removal confirmation and initially focuses Keep
presentation. Failed mutations show inline errors and preserve content/resources.
Successful rename restores its action focus; delete focuses the neighboring card
link or library heading. Neither card management action navigates.

Returning to the library stops owned audio/live work, releases URLs, and clears
selected navigation/transcript/focused view. Confirmed write guards and list cache
remain until auth reset. CRUD locks and outcomes survive route/controller changes,
preventing stale pages or overlapping writes from restoring deleted cards or old
labels. No credentials/files are added to browser persistence.


## Selecting multiple saved files

Use each card’s native checkbox to select files without opening them. Select all
shown includes only loaded cards without a pending action; Load more never selects
new files automatically. Successful list refreshes prune selections that are no
longer shown. Fetching/error states retain selection intent.

The selection toolbar provides a count, Clear selection and Delete selected. The
permanent-delete confirmation freezes the selected IDs. Keep presentations sends
no delete requests. Confirmed deletion runs one existing delete request at a time,
with progress and Stop remaining. Stopping leaves already-started requests to
finish; completed deletions cannot be undone. Successes disappear only after the
server confirms them. Failed/unstarted files remain selected, and per-file errors
and Retry selected make partial outcomes explicit.

Card editing and selection are locked during confirmation/deletion. Pending
per-file actions are respected across routes. Leaving the library or changing
accounts stops queued work; already-started same-account CRUD still records its
outcome through the existing owner guards. Selection/confirmation are transient
and clear on route exit or account change. Opening a card stays a separate link.

## Next slide and cue preview

The presenter sidebar shows the next slide and a short speaking cue. The preview
follows the displayed slide in deck order, including a return to an earlier slide.
The final slide shows an end state. The preview never changes the current slide.

The cue uses existing speaker notes first. If notes are empty, the cue uses the
slide summary, slide text or title. A label identifies the source. Long text is
shortened to 240 characters. No extra model request or manual preparation is required.

The preview shares the current image owner with thumbnails and the main stage.
Loading and image failures have visible states. Retry uses the existing asset owner.
Changing the deck or account clears the old preview with the existing workspace state.

Presentation view removes the preview from the rendered interface. Hold and Stop
keep that view active until the presenter returns to the workspace. The preview
then returns without another image request. Share Presentation view when the
audience must see only the current slide.
