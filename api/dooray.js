// Dooray Calendar API Proxy v4 - Final
module.exports = async function handler(req, res) {
  var DOORAY_BASE = "https://api.dooray.com";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  var apiKey = process.env.DOORAY_API_KEY;
  var calendarId = process.env.DOORAY_CALENDAR_ID;
  var memberId = process.env.DOORAY_MEMBER_ID;

  if (!apiKey) {
    return res.status(500).json({ error: "DOORAY_API_KEY missing", connected: false });
  }

  var hdrs = { "Authorization": "dooray-api " + apiKey, "Content-Type": "application/json" };
  var action = req.query.action;

  async function findCalendarId() {
    if (calendarId && calendarId.indexOf("@") === -1) return calendarId;
    try {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: hdrs });
      if (!r.ok) return null;
      var d = await r.json();
      var cals = d.result || [];
      for (var i = 0; i < cals.length; i++) {
        if (cals[i].type === "MEMBER" || cals[i].type === "DEFAULT") return cals[i].id;
      }
      return cals.length > 0 ? cals[0].id : null;
    } catch (e) { return null; }
  }

  try {
    if (action === "discover") {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: hdrs });
      if (!r.ok) return res.status(200).json({ connected: false, error: "Auth fail " + r.status });
      var d = await r.json();
      var cals = (d.result || []).map(function(c) { return { id: c.id, name: c.name || c.summary || "cal", type: c.type }; });
      return res.status(200).json({ connected: true, calendars: cals, count: cals.length });
    }

    if (action === "status") {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: hdrs });
      if (!r.ok) return res.status(200).json({ connected: false, error: "Auth fail " + r.status });
      var d = await r.json();
      var cals = d.result || [];
      var cid = await findCalendarId();
      return res.status(200).json({ connected: true, calendarId: cid, totalCalendars: cals.length });
    }

    var cid = await findCalendarId();
    if (!cid) return res.status(500).json({ error: "No calendar", connected: false });

    if (action === "list") {
      var from = req.query.from || new Date().toISOString().split("T")[0];
      var to = req.query.to || new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
      var url = DOORAY_BASE + "/calendar/v1/calendars/*/events?calendarIds=" + cid + "&fromDate=" + from + "T00:00:00%2B09:00&toDate=" + to + "T23:59:59%2B09:00";
      var response = await fetch(url, { headers: hdrs });
      var data = await response.json();
      if (!response.ok) return res.status(200).json({ events: [], error: "API " + response.status });
      var rawEvents = data.result || [];
      var events = rawEvents.map(function(ev) {
        var sd = ev.startedAt || "";
        var ed = ev.endedAt || "";
        return {
          id: "dooray-" + ev.id,
          doorayId: ev.id,
          title: ev.subject || ev.summary || ev.title || "",
          date: sd ? sd.substring(0, 10) : "",
          endDate: ed ? ed.substring(0, 10) : "",
          time: sd ? sd.substring(11, 16) : "",
          endTime: ed ? ed.substring(11, 16) : "",
          allDay: ev.wholeDayFlag || false,
          location: ev.location || "",
          memo: ev.body || ev.description || "",
          calendarName: (ev.calendar && ev.calendar.name) || "",
          category: "meeting",
          priority: "medium",
          source: "dooray"
        };
      });
      return res.status(200).json({ events: events, total: events.length });
    }

    if (action === "create" && req.method === "POST") {
      var b = req.body;
      var body = {
        subject: b.title,
        body: b.memo || "",
        startedAt: b.date + "T" + (b.time || "09:00") + ":00+09:00",
        endedAt: (b.endDate || b.date) + "T" + (b.endTime || "10:00") + ":00+09:00",
        wholeDayFlag: false,
        location: b.location || ""
      };
      var response = await fetch(DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events", { method: "POST", headers: hdrs, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : 400).json(await response.json());
    }

    if (action === "update" && req.method === "PUT") {
      var b = req.body;
      if (!b.doorayId) return res.status(400).json({ error: "doorayId needed" });
      var body = {
        subject: b.title,
        body: b.memo || "",
        startedAt: b.date + "T" + (b.time || "09:00") + ":00+09:00",
        endedAt: (b.endDate || b.date) + "T" + (b.endTime || "10:00") + ":00+09:00",
        wholeDayFlag: false,
        location: b.location || ""
      };
      var response = await fetch(DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events/" + b.doorayId, { method: "PUT", headers: hdrs, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : 400).json(await response.json());
    }

    if (action === "delete" && req.method === "DELETE") {
      var did = req.query.doorayId;
      if (!did) return res.status(400).json({ error: "doorayId needed" });
      var response = await fetch(DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events/" + did, { method: "DELETE", headers: hdrs });
      return res.status(response.ok ? 200 : 400).json({ success: response.ok });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    return res.status(500).json({ error: error.message, connected: false });
  }
};
