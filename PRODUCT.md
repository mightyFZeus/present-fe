# Product

## Register

product

## Users

Presenters who upload an existing PDF or PowerPoint deck and speak naturally while
the application follows the relevant slide. They glance between their laptop,
slides and microphone controls while presenting. No rehearsal or slide scripting
is required by the intended workflow.

## Product Purpose

Provide a focused presentation workspace: authenticate with Google, upload a deck,
wait for preparation, inspect its slides and explicitly start microphone following.
The presenter keeps control through manual navigation, Hold, Resume and Stop.
The protected `/workspace` is a standalone personal library with uploaded-file
cards and real preparation status.
Presenters can rename, permanently delete, and reopen a prepared deck without
uploading or preparing it again. Each card opens its own
`/workspace/[presentationId]` page; opening never starts the microphone. The
presenter sidebar contains only the current deck and its slides, with a clear
Back to workspace link. The library owns new uploads and empty states. Native checkboxes support selecting
multiple shown files, with confirmed deletion and honest per-file retry after a
partial failure. Select all applies only to loaded available cards.
Success means the current slide is clear and listening state is unmistakable.

## Brand Personality

The user selected a calm, focused workspace with a large slide stage and compact
controls. Copy is direct and reassuring, with honest empty, preparation, error and
configuration states. The workspace remains a working product surface; the public landing page explains
the same workflow and leads directly into it.

## Anti-references

The user supplied [Pewbeam](https://pewbeam.com/) as visual inspiration for the
public landing page. Present keeps its own Manrope type, mint/teal accent, imagery,
copy and Google-only login flow; the reference is not a template to copy. The
implementation avoids decorative metrics, fake decks, fabricated transcripts and
visual effects that compete with the actual presentation. Public examples must
be visibly labelled fictional or illustrative, with no simulated live microphone.

## Design Principles

- Give the slide the most space and keep operational controls close together.
- Make user control and the real microphone state visible at every moment.
- Show actual backend state; never imply preparation or listening has completed early.
- Keep manual navigation authoritative and make returning from a revisit obvious.
- Preserve privacy through explicit capture, immediate stopping and no implicit resume.

## Accessibility & Inclusion

The user selected standard accessible controls: keyboard operation, readable
contrast, visible focus, descriptive labels and reduced-motion support. Use native
controls and semantic regions; do not rely on color alone to explain state.

## Public entry and workspace

The public `/` route introduces the product with a clear Start presenting path to
`/login`. The healthy login page centers a branded welcome card with the genuine Google
sign-in button as its only sign-in method. Existing bounded cookie restoration is reused: a new valid sign-in opens
`/workspace`, a valid restored session keeps its protected library/presenter URL,
and anonymous/expired sessions go to `/login`. Protected workspace
components stay unmounted until bootstrap resolves and a valid session exists.
The root provider stays mounted across navigation. The public page gives each
major feature space: less clicker/operator coordination, live voice following
from deck context, supported numbered/topic commands, existing-deck preparation,
Hold/Resume/Stop/manual override and focused presentation view. The hero uses a broad illustrative projector stage with native topic choices.
The original credited photograph supports the human benefit section below it.
The example is visibly fictional and never starts a microphone or inference session.

Use “live voice following” without an unmeasured numerical latency claim. Command
examples use supported cardinal forms such as “Go to slide three” and “Go to the
slide about payments”; ordinal and chained requests are not advertised. Practical
FAQ explains the internet requirement, upload limits, finalized speech, ambiguous
matches and the existing transition spacing. No offline support, perfect accuracy,
zero-click guarantee, automatic deck generation, pricing or customer results are
claimed. The public visual register pairs self-hosted Manrope with selective licensed
Petrona italic. A user-triggered topic/slide handoff demonstrates the idea without
autoplay. Reduced motion retains the complete content. Workspace/login typography
and behavior remain independent.
