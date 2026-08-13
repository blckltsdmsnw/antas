# Antas — Design Foundations

**Direction:** public service clarity. Light ground, high contrast, generous type, plain
language. It should read as civic infrastructure that works, not as a consumer app.

---

## 1. Who this is for, and under what conditions

Every decision below is answerable to one scenario: **a person outdoors, in the rain, at
night, on a cheap phone with a cracked screen, holding an umbrella with one hand.** They may
be frightened. They are not browsing.

That produces four principles:

| Principle | Consequence |
|---|---|
| **Legible in bad light** | Light ground, near-black text, no thin weights, nothing below 14px |
| **Operable one-handed** | Touch targets at least 48px, primary actions in the lower third of the screen |
| **Plain language** | Filipino first, English beneath where it aids comprehension. No jargon, no numbers where a word will do |
| **The map is the product** | Chrome recedes. No decorative panels competing with the map for attention |

## 2. Colour

The palette is **derived from the domain, not chosen for taste.** The five depth colours
already exist in the code and encode increasing danger; the interface is built around them
rather than beside them.

### Depth ramp - the only saturated colour in the product

| Level | Filipino | Hex | Use |
|---|---|---|---|
| `ankle` | Hanggang bukong-bukong | `#7dd3fc` | markers, depth indicators |
| `knee` | Hanggang tuhod | `#38bdf8` | as above |
| `waist` | Hanggang baywang | `#0284c7` | as above, and the product accent |
| `chest` | Hanggang dibdib | `#1e40af` | as above |
| `above_head` | Lampas ulo | `#581c87` | as above |

`waist` (`#0284c7`) doubles as the interface accent - links, focus rings, primary buttons.
Using a colour from the middle of the scale ties the brand to the subject without implying
danger in ordinary chrome.

**Contrast caution:** `ankle` and `knee` are too light for white text. Any depth colour used
as a text background must pair with near-black ink, or be used as a bar or dot rather than a
filled label.

### Neutrals

| Token | Hex | Use |
|---|---|---|
| `ground` | `#ffffff` | page background |
| `raised` | `#f6f8fa` | cards, panels sitting on the map |
| `line` | `#e2e8f0` | hairlines, dividers |
| `ink` | `#0f172a` | primary text |
| `ink-muted` | `#475569` | secondary text, timestamps |

### Status

| Token | Hex | Use |
|---|---|---|
| `danger` | `#b91c1c` | errors only |
| `success` | `#15803d` | confirmation only |

Red is unambiguous here precisely because the depth ramp runs blue to purple. Nothing in the
depth scale can be mistaken for an error state.

### Photographs

Photos are the one element in the product with a colour palette of their own, and they are
allowed to keep it - no tinting, no duotone, no gradient scrim. A photo of floodwater is
evidence, and styling evidence undermines it.

Two buckets, two rules, and the asymmetry is deliberate:

| | Depth report | SOS |
|---|---|---|
| Bucket | `report-photos`, public | `sos-photos`, private |
| Who sees it | anyone who taps the pin | moderators, via signed URL |
| Why | it is a picture of a street | it is a picture of a person in distress |

The capture screen states the visibility *before* offering the shutter - "Makikita ito ng
lahat sa mapa" - never afterwards.

## 3. Typography

**Geist Sans**, already installed by the project scaffold. Neutral and modern, reading as
neither corporate nor playful - appropriate for a public-service tone.

| Role | Size / line-height | Weight |
|---|---|---|
| Display - depth readout | 32 / 38 | 600 |
| Page heading | 24 / 32 | 600 |
| Section heading | 18 / 26 | 600 |
| Body | 16 / 24 | 400 |
| Secondary | 14 / 20 | 400 |

Nothing below 14px anywhere. No weights below 400. Filipino text sets slightly longer than
English, so allow generous line length - cap at roughly 60 characters.

## 4. Spacing and shape

4px base unit; use 4, 8, 12, 16, 24, 32, 48.

- Corner radius: 12px on cards, 8px on controls, full round on the slider thumb
- Shadow: one level only - `0 1px 3px rgba(15,23,42,.08), 0 4px 12px rgba(15,23,42,.06)`.
  Cards floating over the map need separation; nothing else does
- Minimum touch target 48x48px, including the slider thumb

## 5. Components

### Header
Thin, white, hairline bottom border. Wordmark left, sign-in link right. Never overlaps the
map. Roughly 56px tall.

### Depth slider - the signature control
This is the idea of the product and must not look like a browser default.

- A **vertical gradient track** running the depth ramp shallow to deep, so the control
  itself reads as water depth
- Five **tick marks** at the levels, labelled in Filipino
- Large round thumb, `waist` blue with a white ring, 32px visual and 48px hit area
- Selected level shown at display size in Filipino, with English beneath in `ink-muted`
- The approximate centimetre range shown small and quiet - informative, never the input

### Street history card
Sits over the map as a raised sheet, not a separate black region below it.

- Count as section heading - "4 report sa lugar na ito"
- **Deepest** report at display size, with a depth-coloured dot
- Individual reports as a quiet list: depth label and relative date ("kahapon", "3 araw ang
  nakalipas")
- Empty state is plain and reassuring, not an error

### Photo capture card
Three stages, and the first one is the point: **the camera is never opened by arriving on a
page.** A resting card shows a CSS-drawn lens, says what the photo is for, and waits for a
tap. Opening a page must not raise a permission prompt or put a live viewfinder on a shared
phone.

- Resting: dashed border - it reads as a slot waiting to be filled, which is what an optional
  photo is. Solid would read as a component that failed to load
- Live: full-bleed viewfinder on `ink`, one round 68px shutter, and a way out
- Preview: the shot, with *Gamitin* and *Kumuha ulit*. The shutter never commits - a blurred
  frame of your own thumb is the normal first attempt
- `variant="secondary"` where the photo is optional, so the page's real action keeps the only
  `waist` fill. Two full-width blue buttons make neither of them primary

### Map pins
Custom elements, not MapLibre's default teardrop, because a pin has to carry two facts at
once: how deep, and whether tapping it will show you a photo.

- 20px dot, depth-coloured, 2.5px white border, hit area padded to a finger via `::after`
- A photo pin adds a ring gap in its own depth colour - visible against every basemap tone,
  unlike a tint or an opacity change
- Selected grows to 28px with a `waist` halo

### Report detail sheet
Opened by tapping a pin. The photo is the hero, full-bleed to the sheet edge, because it is
the only part of a report a careless slider drag cannot fake.

- Depth label at display size in **`ink`**, with the depth colour as a bar beside it - see the
  contrast caution above; this is exactly where pale blue on white would bite hardest
- Both time readings: relative ("2 oras") for staleness, wall clock ("2:04 PM") for judging
  whether the photo still describes the street. Manila time, pinned, never the device's
- A five-segment meter filled to the reported level - colour never carries the meaning alone
- "Walang larawan ang report na ito" is a plain statement, not an error. Most reports have no
  photo and that is fine

### Map clustering
Pins closer than 44px merge into one counted marker. Clustering happens in **screen space**,
not in metres: whether two pins collide is a question about pixels, and reports 200m apart are
inseparable at city zoom and distinct at street zoom.

- A cluster takes the depth of its **deepest** member, never an average. Eleven ankle-deep
  reports and one above-head report must not render as pale blue and tell someone a street is
  passable at the moment it is not. Same rule as "Pinakamalalim" in the street history
- Tapping a cluster zooms in. It never picks one of its members for you
- The count is text, so the information is not carried by size alone

### Report freshness
Pins fade with age - full strength under an hour, down to 42% past a day. Floodwater recedes
in hours, so a day-old pin describes a street that has almost certainly changed.

Opacity is a **secondary** cue only. The detail card and street history state the age in words,
which is what someone who cannot perceive the fade relies on. A stale pin never fades below
tappable.

### Rain
Shown only when measured precipitation says it is raining **on the user** - never as
decoration, and never when the weather provider is unreachable. Two composited gradient
layers, no canvas and no per-drop DOM: the person looking at this is on a cheap phone during a
storm, and an effect that eats their battery is actively harmful. Stops entirely under
`prefers-reduced-motion`, and never intercepts a tap meant for a pin.

### Buttons
- Primary: `waist` fill, white text, 48px tall, full-width on mobile
- Secondary: white with `line` border
- Disabled state must be visibly different, not merely faded - a stressed user needs to see
  that the tap registered

### Alerts
Left border in `danger`, tinted background, near-black text. `role="alert"` is already
present in the code. One sentence, plain Filipino, always saying what to do next.

## 6. Layout

**Mobile first.** Design at 390px wide, then adapt.

```
MAP SCREEN                        REPORT SCREEN
+----------------------+          +----------------------+
| Antas    Mag-sign in |          | <- Antas             |
+----------------------+          +----------------------+
|                      |          | Gaano kalalim        |
|                      |          | ang tubig?           |
|        MAP           |          |                      |
|      (hero)          |          |   | _ bukong-bukong  |
|                      |          |   | = tuhod          |
|                      |          |   | # baywang    (o) |
+----------------------+          |   | % dibdib         |
| # 4 report dito      | <- sheet |   | @ lampas ulo     |
|                      |    over  |                      |
| Pinakamalalim        |    map   | HANGGANG BAYWANG     |
| HANGGANG DIBDIB      |          | Waist-deep, 51-100cm |
|                      |          |                      |
| kahapon, 3 araw      |          | [    I-REPORT    ]   |
+----------------------+          +----------------------+
```

On desktop the map fills the viewport and the history card becomes a floating panel at the
left, maximum 380px wide. The report screen stays a single centred column, maximum 480px -
it is a focused task, not a dashboard.

## 7. Accessibility targets

- WCAG AA contrast (4.5:1) on all text. The pale depth colours fail this against white and
  are therefore never used for text
- `aria-valuetext` on the slider announces the Filipino label, not "3 of 5" - already
  implemented and covered by a test
- Full keyboard operation, visible focus rings in `waist` blue
- Colour is never the sole carrier of meaning: every depth colour is accompanied by its
  Filipino label

## 7a. The night map — a deliberate exception

The rule below says this product avoids dark UI, and the reasoning holds for anything you
*fill in*: a dark form is worse outdoors in daylight, which is when floods happen.

That argument inverts after sunset. A full-screen white map at 2am is glare in a dark street,
and typhoon flooding does not stop at 6pm. So:

| | Follows the clock | Always light |
|---|---|---|
| Basemap, map chrome, header | yes | — |
| Report, SOS, console | — | yes |

- Light 06:00–18:00 Manila time, dark from 18:01. The hour is read in `Asia/Manila`, never the
  device's zone - a phone left on another region's clock must not darken the map at midday
- An explicit `prefers-color-scheme` **always wins** over the clock. Someone who set their
  phone to dark meant it
- The theme is decided *before* the map is built. Deciding afterwards meant the first paint
  was always light and then swapped, which at night is a white flash in a dark room
- The SOS link keeps a red at night, lightened for contrast. Greying out the emergency entry
  point after dark is the last thing this interface should do

## 8. What this deliberately avoids

- Dark UI **on task pages** - worse outdoors in daylight, which is when floods happen. The
  map is the documented exception; see 7a
- Decorative illustration, gradients, glassmorphism - this is a safety tool
- Animated transitions beyond 150ms feedback - nobody in a flood wants to wait for an
  animation
- Styling the severity of chrome - only the water gets to be alarming
