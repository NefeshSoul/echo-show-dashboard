/**
 * Task Board backend — Google Apps Script web app.
 *
 * Serves today's calendar agenda + incomplete Google Tasks as JSON/JSONP
 * for the Echo Show dashboard. No OAuth dance: the script runs as you and
 * uses the built-in Calendar service + the Advanced Tasks service.
 *
 * SETUP (5 minutes, one time):
 *  1. Go to script.google.com → New project → paste this file.
 *  2. Project Settings (gear) → Time zone → (GMT-07:00) Phoenix.
 *  3. In the left sidebar, next to **Services**, click **+** (Add a service)
 *     → select **Tasks API** → **Add**.
 *  4. Deploy → New deployment → type: Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *     → Deploy → authorize → copy the /exec URL.
 *  5. On the Echo Show, open the dashboard and tap the ⚙ button, then
 *     paste the /exec URL into Account 1 (tip: shorten it first — less
 *     typing on the Show). Repeat steps 1–4 signed in as the second
 *     Google account and add its URL as Account 2. URLs stay on the
 *     device and never land in the public repo.
 *
 * TAP-TO-COMPLETE (optional): lets the dashboard mark tasks done.
 *  6. Project Settings (gear) → Script properties → add property
 *       TASKBOARD_SECRET = <a long random string you make up>
 *  7. Re-paste this file, then in the editor select doGet → Run, to
 *     re-authorize (task completion needs write access — click through
 *     the "unverified app" warnings again as in step 4).
 *  8. Deploy → Manage deployments → edit the web app →
 *     Version: New version → Deploy (URL stays the same).
 *  9. On the Show: ⚙ → enter the same secret in the account's
 *     "Secret key" field → Save. Now tapping a task completes it.
 *
 * PRIVACY: "Anyone" means anyone with the link can read the JSON. The link
 * is long and unguessable, and it lives only in your bookmark/on the
 * device — but it is obscurity, not authentication. The secret key guards
 * the *write* endpoint; reads stay link-obscured as before.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action === "complete") return doComplete(params);
  if (params.action === "storeToken") return doStoreToken(params);
  if (params.action === "fetchToken") return doFetchToken(params);
  var payload = {
    agenda: getAgenda(),
    taskLists: getTaskLists(),
    owner: getOwner(),
    execUrl: ScriptApp.getService().getUrl()
  };
  return respond(payload, params.callback);
}

function respond(payload, callback) {
  var json = JSON.stringify(payload);
  if (callback) {
    // JSONP — Apps Script web apps don't send CORS headers.
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Marks one task completed. Guarded by the TASKBOARD_SECRET script property —
 * the dashboard sends it as ?key=... and stores it only on the device.
 */
function doComplete(params) {
  var secret = PropertiesService.getScriptProperties().getProperty("TASKBOARD_SECRET") || "";
  if (!secret || params.key !== secret) {
    return respond({ok: false, error: "bad key"}, params.callback);
  }
  if (!params.listId || !params.taskId) {
    return respond({ok: false, error: "missing id"}, params.callback);
  }
  try {
    Tasks.Tasks.patch({status: "completed"}, params.listId, params.taskId);
    return respond({ok: true}, params.callback);
  } catch (err) {
    return respond({ok: false, error: String(err)}, params.callback);
  }
}

/**
 * One-time secret broker. Lets a device receive secrets (the write key, a
 * Home Assistant token, ...) by typing a short code — nothing long is ever
 * typed on the device or committed to the repo.
 *
 *  STORE (from your computer, once per secret bundle):
 *    ?action=storeToken&code=AB12&key=<TASKBOARD_SECRET>
 *      &haToken=<token>&haUrl=https://host:8123
 *  Guarded by TASKBOARD_SECRET. Stores the bundle under PAIR_<CODE>.
 *
 *  FETCH (from the device):
 *    ?action=fetchToken&code=AB12&callback=cb
 *  Returns {writeKey, haToken, haUrl} ONCE, then deletes it. No key needed —
 *  the short code is the credential and it self-destructs on use.
 */
function doStoreToken(params) {
  var secret = PropertiesService.getScriptProperties().getProperty("TASKBOARD_SECRET") || "";
  if (!secret || params.key !== secret) {
    return respond({ok: false, error: "bad key"}, params.callback);
  }
  var code = String(params.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (code.length < 4) return respond({ok: false, error: "bad code"}, params.callback);
  var bundle = {
    writeKey: secret,
    haToken: String(params.haToken || ""),
    haUrl: String(params.haUrl || "").replace(/\/+$/, "")
  };
  if (!bundle.haToken) return respond({ok: false, error: "missing token"}, params.callback);
  PropertiesService.getScriptProperties().setProperty("PAIR_" + code, JSON.stringify(bundle));
  return respond({ok: true, code: code}, params.callback);
}

function doFetchToken(params) {
  var code = String(params.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("PAIR_" + code);
  if (!raw) return respond({ok: false, error: "not found"}, params.callback);
  props.deleteProperty("PAIR_" + code); // single use
  return respond({ok: true, bundle: JSON.parse(raw)}, params.callback);
}

function getAgenda() {
  // Whole-week window: today + 6 days. Each event carries date:"YYYY-MM-DD".
  var now = new Date();
  var start = new Date(now); start.setHours(0, 0, 0, 0);
  var end = new Date(now); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);

  var out = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    cal.getEvents(start, end).forEach(function (ev) {
      if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; // declined
      var allDay = ev.isAllDayEvent();
      out.push({
        date: fmtDate(ev.getStartTime()),
        start: allDay ? "All day" : fmtTime(ev.getStartTime()),
        end: allDay ? "" : fmtTime(ev.getEndTime()),
        title: ev.getTitle(),
        location: ev.getLocation() || "",
        cal: cal.getName()
      });
    });
  });
  out.sort(function (a, b) {
    if (a.start === "All day") return -1;
    if (b.start === "All day") return 1;
    return a.start < b.start ? -1 : 1;
  });
  return out;
}

function getTaskLists() {
  var lists = (Tasks.Tasklists.list().items) || [];
  return lists.map(function (l) {
    var items = (Tasks.Tasks.list(l.id, {
      showCompleted: false,
      maxResults: 100
    }).items) || [];
    return {
      name: l.title,
      tasks: items
        .filter(function (t) { return t.title; })
        .map(function (t) {
          return { title: t.title, due: normDue(t.due), id: t.id, list: l.id };
        })
    };
  }).filter(function (l) { return l.tasks.length > 0; });
}

function getOwner() {
  try { return Session.getActiveUser().getEmail(); }
  catch (err) { return ""; }
}

function fmtTime(d) {
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

function fmtDate(d) {
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function normDue(iso) {
  // Page understands: "today" | "overdue" | "YYYY-MM-DD" | ""
  if (!iso) return "";
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var d = new Date(iso); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "today";
  if (d < today) return "overdue";
  return iso.slice(0, 10);
}
