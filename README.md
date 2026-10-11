# Task Board — Echo Show 15 full-screen dashboard (prototype)

A private Alexa skill that opens a full-screen web dashboard (Google Tasks +
today's calendar agenda) on the Echo Show 15, via the
`Alexa.Presentation.HTML` interface (Alexa Web API for Games — supported on
all Echo Show devices). Say **"Alexa, open task board"**.

## How it works

1. `dashboard/index.html` — the actual dashboard. Dark wall-display theme,
   big clock, calendar section with an Agenda/Week toggle, and task lists in
   side-by-side blocks — one per Google account.
   Data priority: feed URLs saved on the device via the ⚙ settings panel
   (supports two Google accounts — each account can toggle calendar and
   tasks independently, so e.g. shared calendars don't show twice)
   → `./data.json` → embedded demo data (with a visible DEMO DATA badge).
   Calendar events are color-coded by calendar (Google's palette, with a
   legend); tasks are flattened across lists, sorted by due date (overdue
   first), each in its list's color with the list names as chips on top.
   Detects Silk via the user-agent (fullscreen-on-first-touch only applies
   there) and switches to a compact layout on small screens like the
   Echo Show 5 (960×480).
2. `skill/` — a custom Alexa skill. On launch it sends
   `Alexa.Presentation.HTML.Start` with your dashboard URL, which loads the
   page full-screen. The skill session stays open while the page is up.
   "Alexa, ask task board to refresh" reloads the page.

## Setup

### 1. Host the dashboard over HTTPS (required)

The page **must** be served over HTTPS with a valid certificate, at a URL
the Echo Show can reach. Pick one:

- **GitHub Pages** — push `dashboard/` to a repo, enable Pages. Free, easy.
- **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:8000`)
  — free HTTPS to your own machine, no open ports.
- Any static host you already use (Netlify, S3+CloudFront, your VPS…).

Note the final URL, e.g. `https://you.github.io/task-board/`.

### 1b. Quick setup (optional)

Typing two feed URLs plus secret keys on the Show's touchscreen is painful.
Instead, put a `<code>.json` file next to `index.html`:

```json
{"v": 1, "feeds": [
  {"label": "TJ", "url": "https://script.google.com/macros/s/…/exec",
   "key": "your-secret", "cal": true, "tasks": true},
  {"label": "Kelley", "url": "https://script.google.com/macros/s/…/exec",
   "key": "your-secret", "cal": false, "tasks": true}
]}
```

Then on the device open ⚙ → **Quick setup**, type the code (5 characters,
case-insensitive), and tap **Load from code** — both accounts, keys, and the
Calendar/Tasks toggles fill in and save automatically.

Even quicker: open the dashboard as `https://you.github.io/task-board/#aqurn`.
On a device with no feeds configured yet, the code in the URL is applied
automatically on first load (it never overwrites an existing setup).

⚠ Anyone who can read the repo can read that file, so treat the URLs and keys
in it as public. The tap-to-complete secret in the file must match the
`TASKBOARD_SECRET` script property in each Apps Script project.

### 2. Create the skill

Easiest path — Alexa developer console (developer.amazon.com/alexa):

1. **Create Skill** → name `Task Board`, custom model, **Alexa-hosted (Node.js)**,
   region US East. (Alexa-hosted gives you the Lambda for free.)
2. **Build → Interfaces** → enable **Alexa Web API for Games**
   (adds `ALEXA_PRESENTATION_HTML` to the manifest). Save, Build Model.
3. **Code** tab → replace `index.js` with `skill/lambda/index.js`
   (`package.json` already includes `ask-sdk-core`). Deploy.
4. Set the dashboard URL: in the Alexa-hosted skill this is easiest as a
   Lambda environment variable — or just hard-code it at the top of
   `index.js` where `DASHBOARD_URL` is defined. (The `process.env` line is
   already there; replace the fallback string.)
5. **Test** tab → enable skill testing, select **Development**.
6. On the Echo Show 15 (signed into the **same Amazon account**):
   **"Alexa, open task board."**

Alternative: use the ASK CLI with `skill/skill.json` and
`skill/interactionModels/custom/en-US.json`, pointing the endpoint at your
own Lambda.

> The Alexa simulator does **not** render HTML — test on the device.

### 3. Live data — pick a backend

**Recommended: Apps Script web app** (`apps-script/Code.gs`) — no server,
no Google Cloud project, ~5 minutes **per Google account**. Google Tasks
can't be shared between accounts, so for two accounts (e.g. you + your
wife) each person deploys their own copy — the dashboard merges both feeds
and labels whose items are whose.

Per account:
1. **script.google.com** → New project → paste in `apps-script/Code.gs`.
2. Project Settings (gear) → Time zone → **(GMT-07:00) Phoenix**.
3. In the left sidebar, next to **Services**, click **+** (Add a service) →
   select **Tasks API** → **Add**.
4. Deploy → New deployment → type **Web app** → *Execute as:* Me →
   *Who has access:* **Anyone** → Deploy → authorize → copy the `/exec` URL.
5. On the Echo Show, tap the **⚙** button → Account 1: label (e.g. `TJ`) +
   your `/exec` URL; Account 2: label + the second account's `/exec` URL →
   Save. (Tip: shorten the exec URLs first — on the Show you only need to
   type the tinyurl code part, e.g. `25hv99qa`.)

   Already deployed an earlier version of the script? Re-paste the updated
   `Code.gs`, then Deploy → Manage deployments → edit the web app →
   Version: **New version** → Deploy. (The 7-day calendar feed needs the
   updated script; old deployments keep working but only show today.)

**Tap-to-complete** (optional): tapping a task on the board marks it done
in Google Tasks. Per account:
1. In the script project: Project Settings (gear) → Script properties →
   add `TASKBOARD_SECRET` = a long random string you make up (same string
   can be reused for both accounts).
2. Re-paste the updated `Code.gs`, then in the editor select `doGet` →
   Run to re-authorize (completion needs the Tasks write scope — click
   through the "unverified app" warnings again).
3. Deploy → Manage deployments → edit → Version: **New version** → Deploy.
4. On the Show: ⚙ → enter the same secret in the account's **Secret key**
   field → Save. Now tapping a task fades it out and completes it.

**Layout:** ⚙ → **Calendar size** slider (20–80%, default 50%) controls how
much of the screen the calendar section gets, in both orientations.

Feed format (for reference): each feed returns JSONP with:
- `agenda` — events for today + 6 days; each has `date` (`YYYY-MM-DD`),
  `start`/`end` (`HH:MM`; all-day events use `start:"All day", end:""`),
  `title`, `location`, `cal`
- `taskLists` — `[{name, tasks: [{title, due}]}]`; `due` is `"today"`,
  `"overdue"`, `""`, or `YYYY-MM-DD`
- `owner` — account email, used as a fallback label

URLs stay on the device and never land in this public repo.

The page polls the feed every 60 s. Privacy note: "Anyone" access means the
JSON is readable by anyone holding the link — the link is long, unguessable,
and lives only in your bookmark/on the device, but that's obscurity rather
than authentication.

**Alternative: Python poller** (`backend/taskboard_backend.py`) — proper
OAuth with a refresh token, atomic `dashboard/data.json` writes, `--watch`
mode. Needs a Google Cloud project + Desktop OAuth client (~10 min setup)
and **an always-on machine** to keep polling. Note: serving `data.json`
through this public repo would publish your tasks/calendar — keep it to a
local-only setup, or prefer the Apps Script path above.

## Known limits / things to verify on-device

- **Idle timeout:** the Start directive takes `timeoutInSeconds` (max 1800 =
  30 min). Docs say the session ends after that long idle; some devices clamp
  it lower. Worth watching: does the board stay up for hours untouched, or
  drop back to home? If it drops, options are a periodic silent re-launch via
  an Alexa routine, or the muted-audio keep-alive trick in the page.
- **HTTPS only**, valid cert — no self-signed, no plain HTTP.
- Touch works inside the page; "Alexa, go home" / "Alexa, exit" closes it.
- Voice while the board is up goes to the skill (session is open), so
  "refresh" works mid-view.

## Files

```
echo-show-dashboard/
├── dashboard/index.html            # the board (open in a browser to preview)
├── apps-script/Code.gs             # recommended backend: Google Apps Script web app
├── backend/taskboard_backend.py    # alternative backend: Python poller (needs always-on host)
├── skill/                          # (shelved) Alexa skill prototype — see notes below
│   ├── skill.json
│   ├── interactionModels/custom/en-US.json
│   └── lambda/index.js
└── README.md
```

> Note: the `skill/` prototype (Alexa.Presentation.HTML) is shelved — the
> skill session ends after the idle timeout (max 30 min), so it can't serve
> as an always-on wall display. The Silk browser route is the proven path.
