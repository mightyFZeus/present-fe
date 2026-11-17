# Present design

## Physical scene and theme

Implementation scene: a presenter glances between a laptop slide stage and compact
microphone controls in a bright meeting room. Use light, calm chrome with subtly
tinted neutral surfaces; keep the actual slide on a dark neutral stage. This is a
design decision for this task, not an additional user-supplied brand reference.

## Color strategy

Restrained OKLCH neutrals, tinted slightly toward teal, with a deep teal accent
reserved for primary actions, active selection and listening state.

- Canvas: oklch(0.975 0.006 190)
- Surface: oklch(0.995 0.003 190)
- Secondary surface: oklch(0.95 0.008 190)
- Text: oklch(0.26 0.018 200)
- Muted text: oklch(0.49 0.018 200)
- Border: oklch(0.86 0.01 190)
- Accent: oklch(0.43 0.085 185)
- Accent tint: oklch(0.93 0.028 185)
- Stage: oklch(0.235 0.012 200)
- Stage text: oklch(0.86 0.01 190)
- Error: oklch(0.46 0.15 28), with a pale tinted error surface

## Typography and spacing

For the workspace, use the native system sans stack. Body 14px, supporting labels 12–13px, section
headings 16px, workspace title 24px and empty-stage heading 24px. Avoid oversized
marketing typography. Limit explanatory copy to about 65ch. Use a 4px spacing base
with varied 12/16/20/24/32px gaps according to hierarchy.

## Structure

The standalone `/workspace` library uses the shared 64px header and a full-width
content area capped at 1280px, with 36px desktop gutters. A clear heading and
Upload presentation action precede a three-column grid of saved-file cards,
reducing to two columns and then one at narrow widths. Each card uses an honest
file-type cover, filename, actual status, slide count and uploaded date. No slide
image/context requests run just to decorate the library. The main card link opens
a separate presentation page; rename/delete are sibling controls with native
inline editing and permanent-deletion confirmation. Empty state has a prominent
real file chooser/drop target. Loading, fetch errors, retry, refresh and Load more
are explicit. Successful actions retain useful keyboard focus. Each card has a native selection
checkbox separate from its navigation link. A compact toolbar shows the selection
count, Select all shown, Clear selection and confirmed bulk deletion. Selection
uses the existing accent border; no inferred total or unrequested bulk action is
added. Failed or unstarted deletions remain selected for explicit retry.

The `/workspace/[presentationId]` presenter uses a 264px rail containing only the
selected-deck details and scrolling thumbnails. It has a Back to workspace link,
no saved-library grid and no replacement uploader. The stage takes the remaining
space; navigation and microphone actions share one wrapping control bar with
recent speech below. Slides use contain sizing, never cropping, including portrait
pages. Sidebar thumbnails and the main image share one asset owner. Narrow layouts
stack the current-deck setup above the stage and retain readable 44px controls.
Native upload inputs have explicit clipped styling, avoiding duplicate raw browser
file-chooser controls beside the product button.

Presentation view uses the existing dark stage across the viewport, with the slide
centered and contained for either portrait or landscape pages. Header, setup,
transcript, title and footnote chrome disappear without replacing the viewer or
its asset owner. A compact floating control strip appears on interaction and
stays visible while paused, in an error state or keyboard-focused. Native full
screen is an explicit option; Hold and Stop retain this uncluttered layout.

## Components and states

Native accessible buttons and file inputs, 8px control radius, 12px stage/frame
radius. Use one consistent icon family (Lucide). Distinguish disabled, hover,
focus, active, pending and error states with labels as well as color. Google uses
its genuine provider-rendered button. Missing configuration is explained honestly.
Preparation uses real status labels rather than invented progress percentages.

## Accessibility and motion

Target AA readable contrast, visible 2px focus outlines, adequate touch targets,
semantic headings/regions, informative image alternatives and status announcements.
Transitions are 150–200ms ease-out for meaningful state changes only; honor
prefers-reduced-motion. No decorative page choreography, gradients, glass, side
accent stripes or repeated metric-card grids.

## Public landing page: Speaker’s stage

Artifact: public marketing page for speakers and teams. Primary action: `/login`.
Adjectives: confident, calm, human, precise. Essence: **Voice becomes focus**.
The proposition is a presentation that stays with the speaker’s thought, with
visible human control. This is a dark, airy marketing surface; the protected
workspace and login keep their existing design systems.

Three directions were considered: Speaker’s stage, a programme rail, and a pale
mint conversation. Speaker’s stage was selected externally by the coordinator.
Its structural rule is an oversized left-aligned headline above a broad recessed
projector stage, rather than a small photograph beside a conventional hero.
The signature is a mint focus frame with a user-triggered handoff between three
fictional campus topics. The permanent illustrative label distinguishes the
example from real transcription or a product session.

References: [Pewbeam](https://pewbeam.com/) for explaining speech-to-screen behavior
and [Pitch](https://pitch.com/) for generous product-explanation space. Transpose
those principles; do not copy layouts, claims, branding or content.

### Landing tokens

Plain CSS custom properties scoped to `.present-landing` are the adapter.
Manrope, from the official Google Fonts distribution, is the display/body family.
The 24,532-byte unmodified Latin variable font (400–800) is self-hosted through
`next/font/local`, with its SIL OFL 1.1 license and exact source/hash recorded in
`src/features/landing/fonts/`. Petrona italic remains a brief human emphasis,
including “naturally”, rather than the primary text family. Fonts are loaded only
by the landing component, not by the root layout.

The type scale has ratio 1.25 and base 16px:

| Token | Size | Use |
| --- | --- | --- |
| `--landing-type-0` | 16px | Body |
| `--landing-type-1` | 20px | Leads and subheads |
| `--landing-type-2` | 25px | Brand and emphasis |
| `--landing-type-3` | 31.25px | Compact display |
| `--landing-type-4` | 39.0625px | Mobile headings |
| `--landing-type-5` | 48.828125px | Section display |

The responsive hero extends to 92px; compact metadata uses 12–14px. Manrope
tracking is optical, roughly -0.02 to -0.035em for display, with body text at normal
tracking. Body measure stays at or below 65ch. Use weights 400–700 for the page.

The established charcoal/mint palette stays dominant: about 60% dark neutral, 30%
recessed/surface and paper explanation, 10% mint emphasis. Defined edges replace
shadows. The spacing base is 4px, with 4/8/12/16/20/24/32/40/48/64/96/128px tokens.
Only two radii are used: 4px controls/paper and 8px stages. No glass or gradients.

| Role | CSS token | OKLCH | sRGB fallback |
| --- | --- | --- | --- |
| Background | canvas | `0.17 0.014 200` | `#081112` |
| Surface | surface | `0.205 0.015 200` | `#0f191a` |
| Recess | recess | `0.14 0.012 200` | `#040b0b` |
| Foreground | ink | `0.94 0.012 95` | `#edebe2` |
| Muted | muted | `0.73 0.015 180` | `#9eaba8` |
| Border | line | `0.33 0.015 190` | `#2d3837` |
| Accent/success | accent/success | `0.8 0.07 160` | `#97ccae` |
| Accent hover | hover | `0.88 0.06 160` | `#b6e4ca` |
| Accent foreground | canvas | `0.17 0.014 200` | `#081112` |
| Paper | paper | `0.95 0.018 95` | `#f2efe1` |
| Paper foreground | paper-ink | `0.25 0.025 185` | `#132623` |
| Paper muted | paper-muted | `0.46 0.025 185` | `#495d5a` |
| Warning | warning | `0.82 0.12 85` | `#e8be62` |
| Error | error | `0.77 0.12 28` | `#f79689` |

CSS uses the OKLCH roles. Fallback swatches above are a portable reference; semantic
warning/error roles are reserved and do not create invented landing statuses.

### Composition, components and motion

The hero presents one clear promise, supporting copy and a primary filled CTA,
followed by a broad illustrative stage. Topic buttons are native, 44px-plus targets
with `aria-pressed` and visible selected treatment. Visitors can explore energy,
water and rollout in any order. One meaningful first state is server-rendered.
There is no recording, timed autoplay, waveform, fake LIVE state or provider call.
The fixed quote and slide heights keep topic changes stable.

A supporting credited auditorium photograph now accompanies the human benefit
section below the hero. It remains the original asset and attribution. The image
is no longer preloaded as the hero. Varied explanation rows, a paper command band,
sequential 01–03 preparation steps, controls interlude, native FAQ and footer CTA
carry the remaining story. No repeated feature-card template or decorative proof.
All existing section anchors and login destinations remain available.

Motion tokens: fast 160ms, handoff 260ms; ease-out
`cubic-bezier(0.23, 1, 0.32, 1)`. One gentle hero entrance and the topic/slide handoff
animate only opacity and transform. FAQ icon rotation communicates disclosure.
Motion is enabled only under `prefers-reduced-motion: no-preference`. A reduced
preference immediately cancels entrance/handoff motion and retains full content.
No observer or JavaScript initialization is required to reveal page content.

All selectors/tokens remain scoped. Reflow targets 320/390px mobile and
1280/1440px desktop. Keep native keyboard interaction, mint visible focus, 44px
controls and labels that explain state without relying on color. Use one Lucide
icon family with restrained stroke widths. Native details retain browser behavior.

### Landing audit and changelog

Self-audit score: **8.5/10** for the stated landing-page direction. This is a
subjective craft score, supported by the checks below, not an accessibility
certification or a claim that the unperformed checks passed.

2026-11-16: **8.5/10, pass with stated verification limits.** The public marketing
surface follows the confident/calm/human/precise Speaker’s stage commitment:
Manrope/Petrona, charcoal/mint, and one topic-to-slide focus-frame handoff. The bare
structure is a broad presentation stage, human photo section, explanation rows,
command band and sequential setup, rather than a repeated feature-card template.
The review preserved the existing promise and honest microphone/control copy.

Source review and rendered QA fixed the initial tall desktop stage, narrow-screen
header overflow, intrinsic aspect-ratio width and a small slide footnote. Final
browser checks at 320/390/768/1280/1440px found no horizontal overflow. All topics
fit the 320px paper and retain native focus/one pressed button after Space/Enter.
At 1280×800 the topic controls finish at y781; the 1440×900 screenshot contains the
full hero and stage. Feature/question anchors, native FAQ keyboard behavior and
the real login CTA passed. Login has no landing root and keeps its system font.
Browser error logs were empty. No microphone/provider operation was started.

Computed sRGB contrast pairs pass AA: ink/canvas 16.01:1, muted/canvas 8.03:1,
muted/surface 7.51:1, canvas/accent 10.51:1, paper-ink/paper 13.72:1 and
paper-muted/paper 6.08:1. Selection also uses text, native pressed state and an
edge. Supporting slide metadata/footnotes are at least 12px; controls have 44px
minimum targets. Short compact topic/navigation labels are deliberate exceptions
to the skill’s preferred 14–16px action type, with browser readability checked.

The three new tests cover useful deterministic SSR, arbitrary-order native topic
selection and progressive/reduced-motion CSS guards. All 93 frontend tests,
lint, typecheck and production build passed. Motion is guarded in source and
covered by tests; OS/browser reduced-motion emulation was unavailable, so no
runtime preference-switch result is claimed. A manual assistive-technology audit
and browser zoom matrix were not performed. Existing photo/Petrona assets,
global styles, auth and workspace behavior remain unchanged.

Changelog: replaced the split-photo hero with the Speaker’s stage composition,
added local Manrope and meaningful user-driven handoff, moved photography below
the hero, tightened desktop rhythm and completed responsive/keyboard fixes.

## Login and protected workspace

The `/login` page uses a pale blue-neutral canvas and one centered white rounded
card. It carries Present’s own icon/brand, a visible Welcome to Present heading,
short explanatory copy and one genuine Google SDK button. Google remains the only
sign-in method: no email/password fields, OR divider or duplicate sign-in widget. Loading, configuration,
backend error and retry states appear only when needed. Use independently scoped
`auth-*` styles and flexible full-height centering so short screens can scroll.
The workspace sidebar no longer owns sign-in. A client AuthGate waits for the
existing provider’s restoration, withholds workspace children when invalid and
replaces the route with `/login`; valid login opens `/workspace`, while valid
restoration retains the requested protected library/presenter route.
Cookies, storage rules, account cleanup and microphone behavior are unchanged.
