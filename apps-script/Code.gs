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
 *  3. Extensions → Advanced Google services → turn ON "Tasks API".
 *  4. Deploy → New deployment → type: Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *     → Deploy → authorize → copy the /exec URL.
 *  5. On the Echo Show, open the dashboard once as:
 *       https://nefeshsoul.github.io/echo-show-dashboard/#<your /exec URL>
 *     (Tip: shorten the /exec URL first — less typing on the Show.)
 *     The page saves it on the device and scrubs it from the address bar,
 *     so the URL never lands in the public repo.
 *
 * PRIVACY: "Anyone" means anyone with the link can read the JSON. The link
 * is long and unguessable, and it lives only in your bookmark/on the
 * device — but it is obscurity, not authentication.
 */

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || null;
  var payload = {
    agenda: getAgenda(),
    taskLists: getTaskLists()
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
  var now = new Date();
  var start = new Date(now); start.setHours(0, 0, 0, 0);
  var end = new Date(now); end.setHours(23, 59, 59, 999);

  var out = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    cal.getEvents(start, end).forEach(function (ev) {
      if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; // declined
      var allDay = ev.isAllDayEvent();
      out.push({
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
          return { title: t.title, due: normDue(t.due) };
        })
    };
  }).filter(function (l) { return l.tasks.length > 0; });
}

function fmtTime(d) {
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
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
