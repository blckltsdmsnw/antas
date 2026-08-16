# Antas — where things stand

Last updated: 2026-08-16, ~18:30 PHT.

Everything described here is committed and pushed to
`github.com/blckltsdmsnw/antas`. Vercel auto-deploys `main`; a push takes about
45 seconds to go live.

**Production loads.** The 403 bot challenge that blocked every other check is
gone — confirmed in a real browser on 2026-08-14. It was self-inflicted:
production had been polled repeatedly with `curl` and headless browsers to
verify deploys, and Vercel's attack protection started challenging automated
traffic. Do not verify deploys that way. If a challenge page ever returns, it is
**Vercel → antas → Settings → Firewall → Attack Challenge Mode**.

---

## Do these first

### 1. Moderator scope — fixed on 2026-08-14, and the old diagnosis here was wrong

Both real accounts now moderate **South Signal Village**:

| Account | Role |
|---|---|
| `elijaholores@gmail.com` | **admin**, based at `South Signal Village` (was moderator for `New Lower Bicutan`) |
| `olores2216305@ceu.edu.ph` | **admin**, based at `South Signal Village` (added; also made the one real photo report) |

Both were made admins later the same day (`0020`), so each sees *every* barangay's
queue rather than only the one they are based at.

**This section used to say the role was on the wrong account, and that was not
the reason `/console` looked empty.** The one pending SOS signal on production
is in `South Signal Village`, and `moderator_queue` matches
`m.barangay = s.barangay` exactly — so a moderator for `New Lower Bicutan` saw
nothing no matter which account they used. Both barangays are in Taguig; being
"in the right city" is not what the queue checks.

Worth remembering when a queue looks empty: check where the **signals** are
before assuming the moderator row is wrong.

```
npx tsx --env-file=.env.hosted scripts/make-moderator.ts you@example.com "South Signal Village"
```

Both accounts are now **admins** (migration `0020`), so they see *every*
barangay's queue rather than one. That is what makes it possible to open a
signal anywhere — Manila included — without editing the database each time:

```
npx tsx --env-file=.env.hosted scripts/make-moderator.ts you@example.com "South Signal Village" --admin
```

Re-running **without** `--admin` narrows that account back to one barangay. A
barangay is required either way: an admin is a person at a desk who can also
cover others, not a floating permission.

An ordinary moderator is still confined to their single barangay —
`moderators` is keyed on `user_id` with one `barangay` column — and
`tests/integration/admin-role.test.ts` pins both halves, because `0020` reduced
four copies of the scope check to one predicate and a mistake there would widen
every path at once.

**Scope is deliberately not self-service and not geographic.** It cannot be
changed from inside the app, and being physically somewhere does not grant it:
browser geolocation is trivially forged, so "I am standing here" can never be an
access claim. An SOS carries a distressed person's exact location and their
photograph. What keeps the wider admin scope honest is that `sos_detail` still
records a `viewed` event for every look.

There is no "responder" role. `moderators.role` allows `moderator` and `admin`
only, and the product never dispatches anyone — a moderator triages a signal,
they do not answer it.

**Manila is now seeded at district level** (migration `0021`) — Tondo, Sampaloc,
San Miguel, Ermita, Malate and the rest, 16 rows. A signal near CEU Mendiola
resolves to **San Miguel** instead of to the whole city, and the old city-wide
`Manila` bucket has been deleted so nothing can land in it.

Districts rather than barangays on purpose. Manila has 896 barangays, most a few
blocks across; writing those centroids from memory would be inventing the data
that decides which desk an emergency reaches, and at that spacing the error
would exceed the distance between neighbours — precise-looking and wrong. A real
deployment there needs official boundary polygons and `st_contains`, not this.

Granularity is therefore uneven and deliberately so: Marikina 16, Taguig 26,
Manila 16 districts, and **every other NCR city is still one placeholder
centroid**. Adding ~1,700 invented barangays would be false precision, not
progress.

### 2. Seeded demo data — removed from production on 2026-08-15

**Production carries no seeded data.** The 48 demo pins and the fabricated
standing are gone, along with the 8 `@example.test` accounts that owned them.
What remains is real: 8 accounts and 6 depth reports.

They were removed because the link started being shared. Demo pins are harmless
while the audience is you and misleading the moment it is not — and a fabricated
standing is worse than misleading, since that badge asserts other people checked
a reading that never existed.

Use the script rather than the SQL; it is a dry run unless you pass `--yes`:

```
npx tsx --env-file=.env.hosted scripts/unseed.ts        # shows what it would delete
npx tsx --env-file=.env.hosted scripts/unseed.ts --yes  # deletes
```

It prints the seeded accounts by name, the rows they own, **and what will be
kept**, so the blast radius is visible before the delete rather than inferred
afterwards — then re-counts from the database rather than trusting the cascade.

**The counts here were stale, which is worth noticing.** This file said "the two
real accounts and the one real photo report". Production actually holds 8 real
accounts and 6 real reports — the extras are almost certainly anonymous SOS
sessions and test reports made since. Nothing is wrong, but the numbers had
drifted, and that is exactly what makes a hand-written `delete ... like` in the
dashboard dangerous to trust.

To seed again — a local database, or a demo nobody will read as real:

```
npx tsx --env-file=.env.hosted scripts/seed.ts taguig 10
```

The count is a **total**, not per-hotspot. Omitting it writes 25 per hotspot,
which is what previously buried the map in ~300 pins.

**`--standing` fabricates a credibility signal, so it is opt-in.** It gives the
seed reporter four hidden `source = 'user'` reports, each confirmed inside the
hour, which is what makes `reporter_standing` return `reliable` for their pins.
Seeded pins are ordinary demo data; a seeded standing is different in kind,
because the badge means "other people checked this and it held up". Never run it
against a project with real users reading the map.

Those four rows are `source = 'user'` on purpose — standing deliberately ignores
seeded rows — so at the database level they are indistinguishable from genuine
reports. They are `status = 'hidden'`, so they never reach the map.

Every seeded account is under `@example.test` — the reporter as
`seed-<ts>@example.test`, the standing voters as `seed-voter-<ts>-<n>@…` — and
the script prints the one it created. `unseed.ts` above matches on that prefix,
which is why the naming is not cosmetic.

---

## What was built

### Phases 1–2b (earlier, complete)

Depth reporting, SOS with trust scoring, moderator console.

### This session

**Photos on depth reports.** `depth_reports.photo_path` existed in the schema
and was never written or read. Reports can now carry an optional photo; SOS
photos stay required. Migration `0013` adds the public `report-photos` bucket
and widens `reports_near` to return the path.

The bucket is **public**, unlike `sos-photos`, and the asymmetry is deliberate:
a depth report is a picture of a street, an SOS is a picture of a person in
distress. The capture screen states the visibility before offering the shutter.

**Tap a pin, see the water.** Pins are custom elements: photo pins show the
photograph, clusters show a count, and every pin fades with age.

**Full-screen photos** with pinch, double-tap and drag.

**Native camera on `/report`** — hands off to the phone's own camera app.
`/sos` deliberately keeps the in-page viewfinder: there it is an anti-abuse
measure, since `capture="environment"` is only a hint and many browsers will
happily offer the gallery instead.

**Clustering**, in screen space rather than metres. A cluster takes the depth of
its **deepest** member, never an average — eleven ankle-deep reports must not
hide one above-head report behind a reassuring pale blue.

**Live weather** from Open-Meteo, and **rain on the map** when it is really
raining on you. Neither asks for location on load.

**Night map** — light 06:00–18:00 Manila time, dark after. Task pages stay light
in every condition. See `docs/design/foundations.md` §7a.

**The clock is now the only input to the night map.** `prefers-color-scheme`
used to override it, which meant a phone left in dark mode — most phones — got a
dark basemap at 1:41pm, the exact daylight-readability case the design keeps
every other surface light for. The setting is a taste; the sun is a fact.
`mapThemeFor` lost its second parameter and `preferredScheme` is gone.

The page also seeded `useState<MapTheme>("light")` and corrected after mount, so
it stamped `data-map-theme="light"` for a frame before consulting the clock —
the white flash in a dark room the basemap already avoided. Both states are now
seeded from the clock.

**A real logo, and a loading screen.** The mark is a map pin holding a flooded
street: one waterline crossing three buildings of different heights, so the city
is the ruler and the pin says "here". Two variants — a boxed icon on pale blue
with the water already risen, and a dry pin for the splash, where the rising
water does the flooding. Drawn as SVG rather than generated, so it is exact at
every size. The favicon comes from `src/app/icon.svg` via the App Router
convention; `public/icon-192.png` and `icon-512.png` are rasterised from it. The
header word is plain "Antas"; the "antas ng tubig" gloss is gone.

It took four marks. A staff gauge, the letter A flooded to its crossbar, a
person standing in water, and finally this — built from a reference Elijah
generated, simplified hard on the way in. `foundations.md` §7b records why each
of the first three failed, and why a boat was rejected on principle.

Every one of those failures was found by rendering the mark at 16/24/32/64/128px
and looking, never by reasoning about it. The contact sheet is the only reliable
test of an icon, because the sizes that break it are the sizes nobody previews.

The splash rises water over the mark while the map loads, stepping through the
five depth colours in scale order. It is bound to real readiness — basemap
painted, first reports request settled — never to a timer, with a hard ceiling so
a failed request cannot strand anyone behind a logo. Once per session. This is
the only animation permitted past `foundations.md` §8; the terms it has to meet
are written down in §7b.

**All migrations are applied on hosted Supabase**, verified against the live
database: `search_places` answers as anon, `reports_near` still does, and
`my_reports` and `moderator_queue` now return `401 permission denied` to anon
instead of being reachable.

Getting there needed a repair rather than a push. **Hosted had every migration
applied in the database and none of them recorded** — `migration list` showed
sixteen locals against sixteen blanks. A plain `db push` would have tried to run
`0001` onward against a live database with real reports in it. The schema was
probed first (`reports_near` returning `photo_path`, both storage buckets present
with the right visibility), then `0001`–`0013` were marked applied with
`supabase migration repair`, and only `0014`–`0016` actually ran. The same drift
existed locally, for `0013` alone.

If a future push ever fails on something "already exists", that is this: repair
the history, never `db reset` a database with real rows in it.

**The map shows water, reports stain the ground, and an SOS no longer asks for
a depth.**

- **Voyager basemap by day.** Positron drew water as pale grey, so the Marikina
  River and the Pasig — the reason half this city floods — were invisible, and
  the map read as grey mush. Saturation pulled back a quarter so the warmer
  roads do not compete with the depth ramp.
- **Every report stains the map around it**, a blurred disc in its depth colour.
  Overlapping reports deepen the colour by themselves. Soft-edged on purpose: a
  hard boundary would claim a survey we have not done.
- **The Tulong form has no depth gauge.** Nobody in danger works a five-level
  slider, and the form should not spend their seconds asking. `sos_signals.depth`
  is now nullable; the scorer treats "never asked" as different from "claimed
  something shallow", so it withdraws the checks that exist only to contradict a
  claim rather than penalising silence.

**A locate button, a body gauge, and a centre action.** Three more taken from
mockups:

- **"Hanapin ang kinaroroonan ko"** — a crosshair on the map that flies to your
  own position and marks it. Search answers "take me to Malanday"; this answers
  "take me to *me*", which is the more common question. Asks for location only
  on tap, never on load.
- **The depth gauge is now a figure**, not a water column. The scale is body
  parts, so the control is a body. The list of five beside it is the real
  control; the figure is a picture of what the list says.
- **I-report is a raised centre action**, and **Tulong moved into the tab bar**,
  reversing an earlier call — once navigation left the header, the emergency
  control belonged where the thumb already is. `foundations.md` §7c has both.

Refused: **SOS as a long-press on I-report.** Hiding the emergency path inside a
gesture on the routine one cannot be discovered by someone who needs it now, and
under panic people do the routine thing. The three-second hold stays where it
belongs — confirming an SOS, not finding it.

**Search, your own reports, a preparedness guide, and a tab bar.** Five changes,
taken from Google Stitch mockups and filtered hard:

- **Search by place or barangay** (`search_places`, migration `0014`). The map
  opened over Metro Manila and the premise is "has *my* street flooded" — the
  answer used to begin with a pinch across the region.
- **`/ako` — Aking mga Report** (`my_reports`, migration `0015`). A report used
  to vanish into the map. The status shown is the database's real `status`
  column, not an invented review pipeline; depth reports are not moderated.
- **A failed map load now says so**, with a retry, instead of rendering empty.
- **`/gabay`** — preparedness, with the hotline section first. Antas cannot
  dispatch anyone; this turns that from a disclaimer into an action.
- **Bottom tab bar** — Mapa, Gabay, Mag-report, Ako. Tulong stays a standing
  chip in the header and is hidden along with the bar on `/sos`.

Refused from the same mockups, and why, in `docs/design/design.md` §12: authority
alert broadcasts and evacuation orders (no feed, and an evacuation order is an
authority instruction), live evacuation-centre capacity (being wrong sends a
family through floodwater to a full centre), "VERIFIED AUTHORITY" LGU badges
(impersonation), and a "Ligtas" label on ankle-deep water.

**Pins are reachable everywhere on the map.** The legend and the weather strip
were opaque panels that painted over the pins and swallowed taps aimed at them,
so a cluster landing in a corner could be neither seen nor opened. The whole
stacking order now lives in one commented block of `:root` tokens in
`globals.css`: rain 5, chrome 6, pins 8, sheets 14/16, header 20. Pins deliberately
paint *above* the chrome — an unreachable report is worse than an untidy legend —
and the chrome is `pointer-events: none` except the one weather-strip state that
is a real button.

### Later the same session — giving a report an afterlife

Three things, all answering the same complaint: a report was something you sent
into silence, and `/gabay` was something you read once.

**"Kumusta na?" on every report** (migration `0018`). Three buttons under the
depth meter — *Wala na* / *Ganoon pa rin* / *Mas mataas na* — and the most
**recent** answer leads, not the most numerous: ten people saying "ganoon pa
rin" an hour ago do not outrank one person saying "mas mataas na" two minutes
ago. Ties break toward the worse state.

This is the honest version of the comment thread that was asked for. Free text
under a report on a tool **nobody moderates** is a way for "wala na po" to
appear beneath water that is still chest-deep. Three states carry the same
information, need no moderation because there is no prose to moderate, and can
be counted.

**Remove your own report.** Two taps (`Tanggalin` → `Sigurado ka?`), and the row
is **hidden, never deleted** — it is evidence that somebody reported something.
The map filters on `status = 'active'`, so hiding is all it takes to leave.

**The go bag is a checklist now**, not a paragraph. Stored in `localStorage`, not
on an account: packing survives with no signal and no login, which is the
condition that page is most likely read in.

Two defects in `0018` were found only by running it against a real database, and
both are worth remembering:

- **Hiding your own report could never have worked.** PostgreSQL applies SELECT
  policies to the *new* row of an UPDATE, so the moment `status` became
  `hidden` the row fell outside `status = 'active'` and Postgres rejected the
  write. The fix is a second policy letting reporters read their own rows —
  which the hide policy silently depends on, so it is commented as such.
- **The privacy design and the write path were in conflict.** `report_updates`
  rows say who was standing where, so `reporter_id` had to stay unreadable; but
  a PostgREST upsert needs SELECT on the table to resolve its conflict target.
  Writes now go through a `security definer` function that takes **no**
  `reporter_id` at all, and the table grants nothing to `anon` or
  `authenticated` — there is no name to forge and no row to read.

### Reporter names: answered without names (migration `0019`)

You asked for the reporter's name on each report. It shipped as
**`reporter_standing`** instead — one quiet green line on the detail card,
*"Madalas tumutugma ang mga naunang report ng nag-report nito"*, shown only when
that author's earlier readings actually held up.

Three reasons, decided together:

- A name next to a location and a timestamp is a public record that a named
  person was standing somewhere during a flood, when their house may be empty.
- A public free-text name is the same impersonation hole as the "VERIFIED
  AUTHORITY" badge already refused — the first abuse is somebody calling
  themselves "Barangay Malanday DRRMO".
- A stranger's name is not evidence. It cannot answer *"can I trust this
  depth?"*, which is what the request was really for. A track record can.

There was also **no name data to show**. `display_name` is set by the
`handle_new_user` trigger from `raw_user_meta_data.display_name`, which nothing
writes — sign-in is email OTP with no name field — so every profile in both
databases reads the literal string `Anonymous`.

The signal returns `'reliable'` or `'none'` and deliberately **never a count**:
exact tallies would fingerprint each author, letting anyone group reports by
writer and work out which street somebody reports from every morning. There is
no "often wrong" counterpart, and there should not be one — a public negative
mark computed from a handful of taps, with no appeal, on a tool nobody
moderates, is a punishment mechanism.

If you ever do want names, the honest shape is opt-in first-name-only set on
`/ako`, defaulting to empty, with a blocklist on authority words — but it still
publishes name + place + time, which is why it is not the default.

### Reaching the person: phone, call, directions (migration `0022`)

A moderator opening a signal now gets two things they did not have: a **call
button** and a **directions link**.

- **Phone number** is set by the reporter on `/ako`, optional, normalised to
  E.164 on the way in (`0917 123 4567` is stored as `+639171234567`). A landline
  is refused — this number is for reaching somebody who may be standing in
  water, and a landline rings in the house they have left.
- **It is readable through `sos_detail` and nowhere else.** `profiles` stays
  scoped to `id = auth.uid()`, so no user can read another's number, and the
  definer function already refuses anyone who may not see that signal. It never
  touches the map or the depth reports.
- **It is not verified**, and the console says so. Real verification means
  sending an SMS code, which needs a paid provider. A number labelled verified
  that was only typed is a moderator trusting the wrong thing.
- **Directions** open Google Maps routing to the signal's exact coordinates,
  handing off to the Maps app on a phone.

**The number is now asked for after an SOS, not only on `/ako`.** Most senders
are anonymous — no email, no number — so without this the call button above
would read *"walang naibigay na numero"* on almost every signal, and the
barangay would have no way to reach them at all. The prompt appears on the
confirmation screen, **after** the signal has gone out; nothing may delay that.
It is optional, says what the number is for rather than promising anybody will
ring, and does not appear for somebody who already has one saved. The field
itself is shared with `/ako` (`PhoneField`), so there is one definition of which
numbers are acceptable rather than two.

### Offline: the app opens with no signal, and says how old the map is

No signal is the condition Antas is most likely to be opened in, so opening to a
blank page was a real failure. A service worker now caches the shell and
`/gabay` — the guide is static advice and hotline numbers, so it cannot go stale
in any way that hurts somebody, and it is the page most worth having offline.

**The map keeps its last good snapshot and always states its age.** Not
"offline" — the age. *"Walang koneksyon. Ito ang huling nakuha, 40 minuto na ang
nakalipas."* Saying only that the network is down would not tell somebody the
pin under their thumb is two hours old, and that second fact is the one deciding
whether they walk down a street.

**Past six hours it refuses to draw anything**, and says why: *"masyado nang luma
ang huling nakuha… Maaaring iba na ang lalim ng tubig ngayon."* An empty map with
a reason beats a confident map that is wrong.

Two things worth recording, both found before shipping:

- **The service worker cannot cache the flood data at all.** `reports_near` is a
  Supabase RPC, so a POST, and the Cache API refuses non-GET requests. An earlier
  draft had a whole branch stamping report responses with their age that could
  never once have run. The snapshot lives in the page instead — which is the
  better place anyway, since "is this reading still true" is a question about the
  data, not the transport.
- **The fallback was in the wrong branch.** supabase-js resolves with an `error`
  rather than rejecting, so an outage arrives down the *success* path — a fact
  this file had already learned once, when reading only `data` turned every
  outage into a convincingly empty map. Putting the fallback only in the
  rejection handler would have repeated it exactly. Caught by an e2e test, not
  by the unit tests, which passed throughout.

### There was no way to sign out. Now there is.

Not intentional — an oversight, and one the anonymous-SOS change made worse.
Somebody who sends an SOS from a **borrowed or shared phone** was left
permanently signed in on a device that is not theirs, with their reports and
possibly their phone number one tab away from whoever owns it.

The control sits at the bottom of `/ako`. For an **anonymous** session it is
irreversible and says so before the second tap: there is no email to sign back
in with, so leaving means losing the only link to the SOS they sent and its
status. On a borrowed phone that is exactly what somebody wants; on their own it
must never be a surprise.

`/ako` also now says whose session it is when there is no email to show —
*"Naka-sign in nang walang account"* — because saying nothing left a person on a
shared phone unsure what they were looking at.

### Photo abuse checks — the honest half (migration `0026`)

Every SOS photograph is now hashed during enrichment and compared against
earlier signals. A repeat costs 30 points and says so in words a moderator
reads. A live capture of moving water is never byte-identical twice, so a match
is not weak evidence — it says the picture is not of what is happening now.

**Half of what you asked for is not built, and that is the finding.** The plan
included reading camera metadata to spot screenshots. The SOS photo is produced
by `canvas.toBlob`, and **canvas output carries no EXIF at all** — so that check
would have flagged *every genuine SOS photo* as suspicious. A check that fires on
everybody is worse than none, because a moderator learns to ignore it. Caught
before writing it rather than after.

The other limit: this catches **identical bytes**. Re-encoding, resizing or
cropping changes every byte and sails straight through. Catching those needs a
perceptual hash, which needs decoding the image, which needs an image library
this project does not carry — a real dependency decision, not an oversight.

An unknown result is silence, never suspicion: a photo that could not be fetched
scores exactly like a unique one, the same rule the rainfall and elevation checks
follow.

**The sender now hears back (migration `0025`).** Sending used to end in
silence. When a moderator opens the signal it moves `pending → under_review`,
and the sender's screen changes **without a reload** — verified with two actors:
an anonymous sender watching *"Naipadala na, hindi pa nabubuksan"* turn into
*"Binuksan na ito ng barangay"* the moment a moderator opened it.

That transition has existed in the enum since `0005` and nothing ever performed
it, so every signal sat at `pending` until it was confirmed or dismissed.

**This is the honest form of the notification that was refused.** It reports a
completed act — a person read this — and never a promise. Even `confirmed` says
outright that it does not mean anybody is coming. The wording lives in
`src/lib/sos/progress.ts` and is tested there against the sentences it must
never produce, because on that screen the failure mode is not a crash, it is a
line that makes somebody wait instead of climbing.

The sender learns *that* somebody looked, never *who*: `signal_events` stays
unreadable to them, which is exactly why the status has to carry the news.

Note on the wider request this came from: **"a rescuer will arrive in 10-20
minutes" was deliberately not built.** Antas dispatches nobody, and `/sos` says
so twice on the very screen that notification would appear on. A person in
rising water who is told help is coming waits instead of climbing or calling
911. The honest version — telling the sender when a moderator has actually
*opened* their signal — is still available to build, since `sos_signals` already
carries the statuses and realtime is already enabled on the table.

Also raised `auth.rate_limit.email_sent` from 2 to 100 in `supabase/config.toml`.
That file configures the **local** stack only. At 2 per hour the third test
account of an afternoon cannot sign in, and it surfaces as "Hindi naipadala ang
link" — indistinguishable from a broken sign-in flow, which is how it wasted
time before being recognised for what it was.

### An SOS no longer needs an account

`/sos` used to answer a call for help with *"Mag-sign in muna."* Sign-in here is a
magic link: type an email, wait for it, open the mail app, click, come back.
Anywhere else that is minor friction; on that screen it is minutes, needing
signal and a working inbox, from somebody standing in rising water.

Now the page opens an **anonymous session** silently when there is none. Verified
in a browser with no stored session: no prompt, photo, three-second hold,
*"Naipadala na ang SOS mo."* — signal written, reporter an anonymous account,
trust score 71.

It is an anonymous **session**, not an unauthenticated write, and the difference
is the whole design. `reporter_id` stays non-null, so `profiles`, `reputation`,
the one-active-signal index, every RLS policy and the audit trail keep working
untouched. An anonymous sender still cannot file in somebody else's name, read
anybody else's signal, or reach the moderator queue —
`tests/integration/anonymous-sos.test.ts` pins all of that.

The trust score already docks brand-new accounts, so an anonymous SOS is **ranked
lower for a moderator, never refused**. Ranking is the honest response to knowing
less about a signal; refusing it is not.

**Enabled on the hosted project on 2026-08-15**, and verified against it: an
anonymous sign-in succeeds, the `handle_new_user` trigger creates the profile
row, and the account is flagged `is_anonymous`. The throwaway account that check
created was deleted afterwards.

The toggle lives at Supabase dashboard → Authentication → Sign In / Providers →
*Allow anonymous sign-ins*, if it ever needs turning off. `supabase config push`
would also do it and should still be avoided: it pushes the entire local config
— site URL, redirect allow-list, email templates, every rate limit — to
production for the sake of one boolean.

Where anonymous sign-ins are *not* enabled the page degrades to asking for a
sign-in exactly as it used to, so this is never a dead end.

Note that anonymous users count toward Supabase's monthly-active-user billing
tier, which is worth knowing before this ever sees real traffic.

### Audit findings, and what was done about them (migration `0023`)

Three of these were live defects, found by reading the code rather than by any
test failing.

**Suspension suspended nothing.** `decide_sos` has written
`profiles.suspended_at` since `0010` after three false reports, and **nothing
ever read it**. A moderator dismissing three fabricated signals believed they
had stopped somebody; they had set a timestamp. Worse, the UPDATE grant covered
the whole of `profiles`, so the suspended account could clear its own flag in
one request — verified against a real database, not inferred. Now enforced, and
the grant is scoped to `display_name`, `barangay`, `phone`.

It blocks **depth reports only**. An SOS from a suspended account still goes
through, because the rule this system runs on is that it never refuses a call
for help — the doubt is expressed by scoring the signal lower.

**The reputation loop was never connected.** `submit-sos.ts` passed literal
zeros for `confirmed_count` and `false_report_count`, so every moderator
decision fed a wire with nothing on the far end, and a reporter with twenty
confirmed floods scored the same as an account made a minute ago. Now read.

**The SOS hold button could not be used by keyboard.** It listened only for
pointer events — no `onClick`, no key handlers — so a keyboard, switch or
voice-control user could focus it, press it, and have nothing happen, on the one
control in the product that calls for help. Its `aria-valuenow` was also on the
`<button>`, where that attribute is not supported, so no progress was announced
to anybody. Both fixed; the existing test had asserted the attribute in its
invalid position and passed while announcing nothing.

**Documentation had gone false.** `README.md` claimed "No UPDATE or DELETE
policy exists on reports" — untrue since `0018`, and it was a *security* claim.

Not fixed, and small: `display_name` is dead schema (written `'Anonymous'` by a
trigger, read by nothing). The unused `DepthLevel` import in `submit-sos.ts` and
the stray `_map.png` debug screenshot were both cleared on 2026-08-15.

### No moderator could open an SOS photo — since Phase 2B (migration `0024`)

Noticed while testing the anonymous SOS flow, but **not anonymous-specific**: it
affected every SOS ever sent.

`0008` made `sos-photos` private with one SELECT policy — *your own folder* — and
noted that the console would fetch through a signed URL. The console does. The
policy letting a moderator read somebody else's photo was never written, so the
signing request was refused every time.

It hid because storage reports a policy denial as **"Object not found"**, which
reads like a missing file, and because the console rendered the image only when
a URL came back — so a denial produced a card with no photo, indistinguishable
from a signal that had none. Except an SOS *cannot* have none: the live capture
is mandatory.

That is not a cosmetic gap. The photograph is the only part of a signal a slider
drag cannot fake, `hasLivePhoto` feeds the trust score, and the console was
asking a moderator to judge a stranger's emergency while withholding the only
evidence in it.

Fixed, and scoped: a moderator for that barangay can open it, a moderator for
another cannot, an ordinary user cannot, an anonymous visitor cannot, and the
object is still not served from a public URL. The console now says plainly when
a photo cannot be opened rather than rendering nothing.

**The wider miss:** nothing in the test suite touched storage at all, so a bucket
no moderator could read passed every check for two phases.
`tests/integration/sos-photo-access.test.ts` closes that.

---

### The NDRRMC is on the guide now — and 911 is still the loud one

Added 2026-08-15 from numbers Elijah supplied: the NDRRMC Operations Center's
five published trunk lines, alongside 911.

Three things came out of it worth keeping.

**A published number and a dialable number are not the same string.** Agencies
publish trunk lines as prose — *"(02) 8911-5061 to 65 local 100"* — which is
correct to show and impossible to dial. `EmergencyLine` therefore carries
`published` and `dial` as two fields, never derived from each other, because
parsing that sentence into a phone number means guessing at both a range and an
extension. `guide.spec.ts` asserts every `href` on the page matches
`^tel:\+?\d+$`, and that guard was confirmed to go **red** against a version
that fed the published label into the href — the whole point, since the day
someone "simplifies" those two fields into one, every alternate line silently
stops working and nothing else would notice.

**Adding a second desk inverted the safety hierarchy, visually.** Five filled
buttons for the coordination desk against one small button for 911 — the role
text said 911 was faster, and words lose. Somebody scanning a safety page while
water rises presses the biggest blue thing. `EmergencyContact.emphasis` now
carries that as data: `primary` is reserved for a number that dispatches
rescue, everything else is drawn quietly however important it is
institutionally. It is not a side effect of how many lines a desk publishes.

**A test went quiet and nearly stayed that way.** "Admits when local numbers are
missing" counted `.contact` elements and treated more than one as proof a local
desk was listed. Adding a second *national* desk made that count two, so the
assertion stopped running while still passing. It now queries
`[data-scope="local"]` directly. Same shape as the `toHaveAttribute` lesson
below: a test that cannot fail is not a test, and this one was disarmed by a
change nowhere near it.

### Filipino / English, and why it was all-or-nothing

Built 2026-08-15, the last of the things "asked for, not built yet".

**A half-translated safety app is worse than a Filipino-only one.** Somebody
switches to English *because they cannot read Tagalog*, gets English
navigation, and then meets the SOS screen in Tagalog — a page that looks like
it is working, so nothing tells them to go back. That ruled out shipping the
switch before the strings were done, and it is why the control was not put on
screen until the last literal was gone.

**A missing translation is a compile error, not a fallback.** `dict()` takes
the Tagalog table and demands an English one with the same keys and the same
function signatures; there is no `Partial` and no "fall back to `tl`". Verified
by writing a broken dictionary and watching `tsc` reject it. A fallback would
have failed silently and *looked* like a working page — exactly where it would
hurt most, on `/sos` and `/gabay`.

**The language is a cookie, read on the server.** `localStorage` cannot be read
before the first paint, so it could only ever produce a Tagalog page corrected
to English a frame later — the flash this codebase has already shipped twice,
in the go bag's "0 sa 4" and in `data-map-theme`. The price is that every route
is now `ƒ` server-rendered rather than `○` prerendered, which is visible in the
build output and is the intended trade.

Four things worth keeping:

- **Functions cannot cross the server/client boundary.** Passing
  `copy.guide.goBagProgress` from the guide page into `GoBagList` made React
  refuse to render the page at all. Any interpolated phrase must be *called* on
  the server or *read* on the client, never handed between them — so client
  components take the copy and server components take the finished string.
- **The go bag was keyed by its own Tagalog titles.** Translating them would
  have silently emptied every packed bag the moment somebody switched language,
  on the page most likely to be read with no signal. Items have stable ids now,
  and the four old titles are migrated on read.
- **`timestampLabel` compared against a literal.** It suppressed the wall clock
  by testing `relative === "ngayon lang"`; in English that would never match and
  every fresh report would have grown a redundant clock. It compares against the
  dictionary now.
- **The cross-language gloss is gone.** The depth slider and the report card
  used to print the Tagalog reading with its English equivalent underneath. The
  toggle does that job properly, so keeping it would print the same thing twice.

`tests/e2e/language.spec.ts` drives all six reachable screens in English and
fails on any Tagalog function word left on the page — the one thing the type
system cannot catch, since a literal that never went through the dictionary is
invisible to it. Confirmed to go **red** by putting one back.

### Tab-to-tab felt rough, and half of that was self-inflicted

Elijah reported that moving between tabs felt rough. Measured before changing
anything, on a throttled connection:

| | before | after |
|---|---|---|
| production, tap to content | 50–160ms | unchanged |
| dev, tap **acknowledged** | ~850ms (nothing on screen) | ~200ms |

**Most of what he was feeling is the dev server**, which recompiles each route
on demand — roughly ten times slower than the built app. Worth knowing before
anybody optimises production for a problem that lives in `next dev`.

**But part of it was mine.** Reading the language cookie in the root layout
turned every route from `○` prerendered to `ƒ` server-rendered, and those routes
used to be prefetched and swapped instantly. A `loading.tsx` per route buys that
back: per `node_modules/next/dist/docs/.../loading.md`, the fallback is
**prefetched**, so the shell is already on the device when the tab is tapped.

Three things worth keeping:

- **The skeleton is wordless, and that is structural, not stylistic.** A
  `loading.tsx` that read the language cookie could not be prerendered, and an
  un-prerendered fallback cannot be prefetched — which is the whole point.
  `PageSkeleton.test.tsx` asserts it contains no text, because the day somebody
  adds "Loading…" they either break prefetching or ship one language to both
  readers, and neither failure is visible by looking at the page.
- **A pulse, not a shimmer sweep.** §8 rules out decorative gradients, and a
  band of light travelling across the screen also reads as a progress bar —
  the same objection the splash's waves answer. It earns its place on the
  splash's terms: it covers latency that already exists and never adds any.
- **`--raised` was too faint to see** on a phone in daylight, which is the
  condition this product is used in. A skeleton nobody can see is the frozen
  screen it was meant to replace, so the fill is `--line`.

**The map has no skeleton, on purpose.** It is a full-bleed canvas that paints
its own surface, and grey bars would misrepresent it. A full-screen tinted
field would also risk a light flash at night — the exact failure `mapThemeFor`
exists to prevent — because `data-map-theme` is cleared when the map unmounts.

### A shared link said the app was for Marikina

Elijah pasted a link and got the bare title plus *"Antas ng tubig - crowdsourced
flood depth reporting for Marikina."* Two problems, one of them a real error.

**It was factually wrong.** The pilot area widened to Metro Manila a while ago —
`/report` has said `Metro Manila lang ang saklaw ng Antas` since then — but the
description never moved with it. Someone in Taguig reading that preview would
reasonably decide the app was not for them and never open it. The same stale
line was duplicated in `manifest.json`, where it is what an installed PWA shows.

**And there was no card at all** — no `openGraph`, no `twitter`, no
`metadataBase`, no image anywhere in the project.

Now: `generateMetadata` in the root layout, an `opengraph-image.tsx` that draws
the real `AntasMark`, and both descriptions corrected. Three things worth
keeping:

- **The preview says what Antas does *not* do.** It is read before the guide
  and before `/sos`, both of which state the boundary — so a stranger meeting
  the link in a group chat during a storm learns it reports water and summons
  nobody, without having to open it. It is on the card image too.
- **Always Filipino, deliberately.** A preview is generated per URL, not per
  reader: a crawler sends no cookie and there is no recipient to consult. So it
  gets the product's own language rather than whichever one the sharer was
  reading in, and `opengraph-image.tsx` stays prerendered by never touching the
  cookie.
- **`metadataBase` is not optional.** A crawler has no page context to resolve
  a relative path against, so without it the card arrives with no image and
  nothing reports an error anywhere. `src/lib/site.ts` resolves it, preferring
  Vercel's *production* host over `VERCEL_URL` — a link shared from a preview
  deployment would otherwise advertise a hostname that dies with the branch.

The card draws `AntasMark` rather than embedding `icon.svg`; the first attempt
did the latter and the rasteriser refused it outright. Reusing the component is
the better answer anyway — a hand-copied skyline drifts the first time either is
touched. Note the wordmark is **not** Archivo: `@vercel/og` ships one regular
face and satori cannot read the `.woff2` that `next/font` caches, so size and
tracking carry the hierarchy instead of weight.

`tests/e2e/sharing.spec.ts` pins all of it, and is the first test in the suite
to read `<head>` — which is exactly why the stale description survived so long.
Confirmed red against the old text.

**Also worth knowing:** `playwright.config.ts` sets `reuseExistingServer: true`,
so a long-lived `next dev` gets reused across runs. One that had been up through
hundreds of edits served a stale `/gabay` — correct `<html lang>`, Tagalog body —
and failed four language tests that pass against a fresh server and against
production. If e2e fails in a way production does not reproduce, restart the dev
server before believing it.

## Emergency numbers — settled

`src/lib/emergency/contacts.ts` carries **911 and the NDRRMC Operations
Center**. Both are national, and that is the whole list: Elijah closed the local
DRRMO item on 2026-08-15, having decided the numbers he supplied are enough.
**Nothing here is waiting on anybody.**

`LOCAL_CONTACTS` stays as an empty list rather than being deleted, because the
shape of the answer has not changed — a verified LGU desk, if one is ever added,
belongs beside 911 and costs a row. The bar for adding one has not moved either:
from the LGU's own current publication, never from memory.

**The guide still tells readers to find and keep their own barangay's number**,
and that line is no longer conditional on the local list being empty. It was
never a placeholder for this backlog item — a national operations centre cannot
say which street is passable, so the advice stands whether or not the list is
ever filled. `guide.spec.ts` and `language.spec.ts` pin it in both languages.

One caveat outlives the decision: the NDRRMC numbers were **supplied rather than
checked** against the agency's own publication. `contacts.ts` records that in
its `source` field, and they are worth re-verifying before this ever sees real
traffic.

## Removing a report does not remove its photograph — 2026-08-16

**A real gap, found by needing it.** Elijah asked for a Taguig pin to be taken
down because it carried photographs that should not have been public. Hiding the
report is not sufficient: `report-photos` is a **public** bucket by design, so
the map can draw dozens of thumbnails without a signing round-trip per pin.
Setting `status = 'hidden'` removes the pin and leaves the image sitting at a
public URL that anyone holding the link can still open.

The in-app **Tanggalin** control has exactly this behaviour. Somebody removing
their own report reasonably believes the photograph goes with it. It does not.

`scripts/remove-report.ts` does the whole job — deletes the storage object,
confirms it is gone by re-listing the folder, then clears `photo_path` and hides
the row. Storage is deleted **first** on purpose: a hidden row with a live image
is worse than either problem alone, because it looks handled.

```
npx tsx --env-file=.env.hosted scripts/remove-report.ts              # list what viewers see
npx tsx --env-file=.env.hosted scripts/remove-report.ts --remove ID  # delete photo + hide
```

**Still to decide, and it is a product question rather than a bug fix.** Either
`hideReport` should delete the photograph too, or the bucket should stop being
public and the map should fetch signed URLs. The first is probably right, since
the bucket is public for a good reason.

**Production now has a real third-party user.** One of the two photo-bearing
pins belonged to an account that is neither Elijah's nor a seed. It was left
untouched. This changes the standing assumption behind every destructive
operation here: the database is no longer only test data.

## The phone buzzes on the SOS hold — 2026-08-16

Asked for the same day and built the same day. The hold is the one control in
this product where somebody must keep doing something and wait, and they may be
watching the water rather than the screen.

**One short beat when the press registers, and a distinct two-beat pattern when
the signal is actually written.** Nothing in between, and nothing on any failure
path.

The placement of the second beat is the whole design, and it is not where it
looks like it should go. The obvious spot is the moment the three seconds
complete — but at that instant nothing has been sent, and the buzz would fire
identically whether the row reached the database or the upload failed a second
later. A confirming buzz for an SOS that never sent is the harm `design.md` §12
refuses in the notification channel, wearing a different coat: a person in
rising water who believes their call went out waits instead of climbing. So the
second pulse lives in `sos/page.tsx` after the write, not in `HoldToConfirm`,
which has no idea whether the submission it triggered succeeded.

**The single opening beat was wrong, and was replaced by a ramp.** See below —
the reasoning that rejected escalating ticks did not survive contact with a
phone.

**It is never the only channel.** iOS Safari has never shipped the Vibration API,
so on iPhones nothing happens at all. `vibrate()` is a silent no-op when
unsupported and swallows a throwing implementation, because the alternative is
an exception inside `handleConfirm` aborting an SOS over a decoration.
`src/lib/haptics/pulse.ts` documents that as the one deliberate silent failure
in the codebase.

### Both phones were tested, and each said something different

Elijah tried it the same evening. **The iPhone did nothing and the Android was
barely perceptible.** One of those is the design working; the other was a real
miscalibration.

**iOS is not fixable and the workaround is already dead.** Safari has no
Vibration API. Safari 17.4 added `<input type="checkbox" switch>`, which plays a
system haptic when toggled, and libraries drove that from JavaScript by clicking
a hidden one — **Apple closed it in iOS 26.5**, so on any current iPhone it does
nothing either. It would not be worth restoring at any rate: it emits one fixed
haptic, so *"press registered"* and *"signal sent"* would feel identical, and
the entire value of the second buzz is that it cannot be mistaken for the first.
Do not go looking for this again; the note is in `pulse.ts` too.

**The Android weakness was mine.** Twenty milliseconds is below what most phone
motors render convincingly — the motor has to spin up and stop again, so the
shortest durations arrive weak or get clamped, and how weak depends on the
hardware. Raised to **50ms** for the opening tick and **[80, 90, 80]** for the
confirmation, which also widens the gap between them: one short tap, two firm
beats, tellable apart by feel with the phone in a pocket. Verified at `[50]` in
the running app.

The durations now live only in `pulse.ts` — the tests read the constants rather
than repeating the numbers, since they have already had to be chased twice.

### Then it was tested again, and the single beat turned out to be the mistake

*"It's too weak. Just one vibrate then nothing after."* — and Chrome on iOS
behaved exactly like Safari, which it must: **every browser on iOS runs WebKit**,
so Chrome there is Safari with a different toolbar. There is no browser you can
install on an iPhone that has the Vibration API.

The Android half was a design error rather than a tuning one, and it is worth
recording because the reasoning that produced it sounded good.

**The argument that lost.** A continuous three-second buzz says only "something
is happening", where two distinct events say *begun* and *sent* — so escalating
ticks were considered and refused, on the grounds that they duplicate the
progress ring. That is true and beside the point. The question a person holding
the button has is not *"did it start"* but *"is it still going"*, and one tick
followed by three seconds of silence answers the first while abandoning them on
the second. **The ring only duplicates the buzz for somebody who can see the
ring, and this exists precisely because they may be looking at the water.**

**`PULSE_HOLD` is now six beats across the hold**, 700ms apart at the start and
160ms apart at the end — a rhythm you can feel accelerating, which says *how far
along* without anyone having to count. It is requested as a **single pattern**
rather than a beat per interval tick: the phone schedules it, so it cannot drift
or stutter when the main thread is busy, and one `vibrate(0)` cancels the
remainder.

**That cancel is load-bearing.** Lifting a thumb at one second cancels the SOS,
and a phone still ticking for two seconds afterwards tells the person the
opposite of what happened — the same lie as a confirming buzz for a signal that
never sent, only earlier in the sequence. `stop()` therefore cancels, and the
guard was confirmed red by removing it.

Beats are 80–120ms; 20ms and 50ms were both reported as barely there.
`PULSE_SENT` went to `[150, 100, 150]`, longer than **every** beat in the ramp,
and a test pins that ordering — the confirmation is the one pattern carrying
news and must never feel like the hold still counting.

**A margin the tests would not have caught, found by watching the real page.**
The ramp originally ended at 2940ms against a 3000ms hold. Firing calls `stop()`,
which cancels any remaining vibration — so at 60ms of clearance the ramp's own
last beat could be clipped by its own success, on a phone having a slow moment
and nowhere else. It now ends at 2820ms, and `RAMP_HEADROOM_MS` pins 100ms of
room.

Verified on the running page with a real mouse press, loading fresh each time —
because once the hold fires, `fired` blocks any further press, and the first
attempt at this measured nothing at all for exactly that reason. Early release
at 1174ms: ramp requested, then `0`. Full hold: ramp, then the cancel at fire.

Verified three ways, because this repo has learned that green tests are not
evidence:

- **Both new guards were confirmed red against the wrong code.** Firing the sent
  pattern at hold completion broke *"stays silent when the hold completes"*;
  firing it before the result check broke both failure-path tests in
  `src/app/sos/page.test.tsx`.
- **A real browser, a real press.** `navigator.vibrate` was recorded via an init
  script and the control pressed with the mouse: nothing on load, `[20]` at
  press, nothing more mid-hold or on early release — and **no confirming buzz
  after a full three-second hold with no photo attached**, which is a failure
  path.
- `src/app/sos/page.test.tsx` is the first test this page has ever had. It exists
  because the rule being enforced is invisible on screen: a buzz that should not
  have happened leaves the page looking identical.

## Known issues, not fixed

- **Hydration warning on `/report`** from a `caret-color` style Chromium injects
  under automation. Dev-only, pre-existing, appears to be a tooling artifact.
- **A stale `.next` cache can break the build with Google Fonts 404s.**
  `next build` failed twice with `Received response with status 404 when
  requesting …publicsans…woff2` and a pile of module-not-found errors — which
  reads exactly like a broken deploy. Nothing was wrong with the code: deleting
  `.next` and rebuilding succeeded immediately. `next/font/google` fetches the
  font files at build time and caches them, and the cached URLs go stale when
  Google rotates them. **Vercel builds from scratch, so this is local only** —
  do not go hunting for a real fault, and do not assume production is broken.
- **`display_name` is dead schema.** Populated as the literal string
  `'Anonymous'` by the `handle_new_user` trigger and read by nothing; sign-in is
  email OTP with no name field. Left in place deliberately — see `design.md` §12
  for why reporter names were not built — but nothing depends on it.

---

## Asked for, not built yet

Distinct from `design.md` §12, which lists things refused on purpose. These were
wanted and simply have not been done.

**Nothing is open.** The list is empty: the English / Tagalog toggle and the
local DRRMO numbers both closed on 2026-08-15 — the latter by the owner rather
than by code — and the SOS hold's haptic feedback closed on 2026-08-16, the day
it was asked for.

One product decision is still outstanding, but it is a choice rather than a
backlog item: whether `hideReport` should delete the photograph too, or the
`report-photos` bucket should stop being public and the map fetch signed URLs.
See the 2026-08-16 section above.

## Things worth remembering about this codebase

Four of the bugs that mattered most this session were found by *looking at the
running thing*, not by tests — the suite was green through all of them:

- The map stayed light at 4am. `prefers-color-scheme: no-preference` was removed
  from the spec and matches nothing, so the clock was never consulted. The pure
  function was correct and tested; the browser-facing adapter was not.
- The camera viewfinder was black and the shutter captured nothing, because the
  stream was attached before React had committed the element.
- Rain looked frozen at "1fps" while the page held 60fps — the pattern was
  aliasing against the animation distance.
- Tapping a tight cluster did nothing, because a fixed zoom step cannot separate
  members sitting inside one touch target.

The recurring shape: **green tests are not evidence the thing works.** Drive it,
screenshot it, count the network requests, read the database.

A fifth, found later and worth its own note because it is the failure mode *of
the fix for the failure mode*: an e2e assertion for the map theme passed against
the old, broken code. `toHaveAttribute` retries until the **first** match, and
the page briefly stamped `data-map-theme="light"` on mount before the clock was
consulted — so the assertion kept catching the transient rather than the settled
value. A test that cannot go red is not a test. Always confirm a new guard fails
against the unfixed code before trusting it, and for anything that settles
asynchronously, assert the value twice and require both reads to agree.

---

## Verification commands

```
npx vitest run src/                 # unit (274)
npx playwright test                 # e2e (60)
npx vitest run tests/integration    # integration (48) - needs local Supabase
npm run build
```

`vitest run src/` covers only unit tests. `tests/integration/` is a separate
directory, and running only `src/` once let a migration regression through.
