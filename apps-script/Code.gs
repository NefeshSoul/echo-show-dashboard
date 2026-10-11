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
 * PRIVACY: "Anyone" means anyone with the link can read the JSON. The link
 * is long and unguessable, and it lives only in your bookmark/on the
 * device — but it is obscurity, not authentication.
 */

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || null;
  var payload = {
    agenda: getAgenda(),
    taskLists: getTaskLists(),
    owner: getOwner()
  };
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
