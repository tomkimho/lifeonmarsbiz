// Dooray Calendar API Proxy v3 - Diagnostic
const DOORAY_BASE = "https://api.dooray.com";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  var apiKey = process.env.DOORAY_API_KEY;
  var calendarId = process.env.DOORAY_CALENDAR_ID;
  var memberId = process.env.DOORAY_MEMBER_ID;

  if (!apiKey) {
    return res.status(500).json({ error: "DOORAY_API_KEY가 설정되지 않았습니다.", connected: false });
  }

  var headers = { "Authorization": "dooray-api " + apiKey, "Content-Type": "application/json" };
  var action = req.query.action;

  // Find calendar ID from list
  async function findCalendarId() {
    if (calendarId && calendarId.indexOf("@") === -1) return calendarId;
    try {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: headers });
      if (!r.ok) return null;
      var d = await r.json();
      var cals = d.result || [];
      var primary = null;
      for (var i = 0; i < cals.length; i++) {
        if (cals[i].type === "MEMBER" || cals[i].type === "DEFAULT") { primary = cals[i]; break; }
      }
      if (!primary && cals.length > 0) primary = cals[0];
      return primary ? primary.id : null;
    } catch (e) { return null; }
  }

  try {
    // === DIAGNOSTIC: Try multiple API patterns ===
    if (action === "diag") {
      var cid = await findCalendarId();
      var from = "2026-02-01";
      var to = "2026-02-28";
      var results = {};

      // Pattern 1: /calendar/v1/calendars/{id}/events with fromDate/toDate
      var urls = [
        {
          name: "p1_events_fromDate",
          url: DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events?fromDate=" + from + "T00:00:00%2B09:00&toDate=" + to + "T23:59:59%2B09:00"
        },
        {
          name: "p2_events_from_to",
          url: DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events?from=" + from + "T00:00:00%2B09:00&to=" + to + "T23:59:59%2B09:00"
        },
        {
          name: "p3_schedules",
          url: DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/schedules?fromDate=" + from + "T00:00:00%2B09:00&toDate=" + to + "T23:59:59%2B09:00"
        },
        {
          name: "p4_events_notz",
          url: DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events?fromDate=" + from + "&toDate=" + to
        },
        {
          name: "p5_events_plain",
          url: DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/events"
        },
        {
          name: "p6_calendar_schedules",
          url: DOORAY_BASE + "/calendar/v1/schedules?calendarId=" + cid + "&fromDate=" + from + "T00:00:00%2B09:00&toDate=" + to + "T23:59:59%2B09:00"
        },
        {
          name: "p7_member_schedules",
          url: DOORAY_BASE + "/calendar/v1/calendars/" + cid + "/schedules?from=" + from + "&to=" + to
        },
        {
          name: "p8_calendar_events_v2",
          url: DOORAY_BASE + "/calendar/v2/calendars/" + cid + "/events?fromDate=" + from + "&toDate=" + to
        }
      ];

      for (var i = 0; i < urls.length; i++) {
        try {
          var r = await fetch(urls[i].url, { headers: headers });
          var body = await r.text();
          var preview = body.substring(0, 300);
          results[urls[i].name] = { status: r.status, preview: preview };
        } catch (e) {
          results[urls[i].name] = { status: "error", preview: e.message };
        }
      }

      return res.status(200).json({ calendarId: cid, envCalendarId: calendarId, results: results });
    }

    // === DISCOVER ===
    if (action === "discover") {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: headers });
      if (!r.ok) return res.status(200).json({ connected: false, error: "API 인증 실패 (" + r.status + ")" });
      var d = await r.json();
      var cals = (d.result || []).map(function(c) { return { id: c.id, name: c.name || c.summary || "캘린더", type: c.type }; });
      return res.status(200).json({ connected: true, calendars: cals, message: cals.length + "개 캘린더 발견" });
    }

    // === STATUS ===
    if (action === "status") {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: headers });
      if (!r.ok) return res.status(200).json({ connected: false, error: "API 인증 실패 (" + r.status + ")" });
      var d = await r.json();
      var cals = d.result || [];
      var cid = await findCalendarId();
      if (!cid && cals.length === 0) return res.status(200).json({ connected: false, error: "캘린더를 찾을 수 없습니다." });
      var usedId = cid || (cals[0] && cals[0].id);
      var calInfo = null;
      for (var i = 0; i < cals.length; i++) { if (cals[i].id === usedId) { calInfo = cals[i]; break; } }
      return res.status(200).json({ connected: true, calendarId: usedId, calendarName: calInfo ? (calInfo.name || calInfo.summary) : "캘린더", memberId: memberId, totalCalendars: cals.length });
    }

    // === LIST (will be updated after diag) ===
    calendarId = await findCalendarId();
    if (!calendarId) return res.status(500).json({ error: "캘린더 ID를 찾을 수 없습니다.", connected: false });

    if (action === "list" && req.method === "GET") {
      var from = req.query.from || new Date().toISOString().split("T")[0];
      var to = req.query.to || new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
      
      // Try multiple patterns and return first success
      var patterns = [
        DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/events?fromDate=" + from + "T00:00:00%2B09:00&toDate=" + to + "T23:59:59%2B09:00",
        DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/schedules?fromDate=" + from + "T00:00:00%2B09:00&toDate=" + to + "T23:59:59%2B09:00",
        DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/events?from=" + from + "T00:00:00%2B09:00&to=" + to + "T23:59:59%2B09:00"
      ];
      
      for (var pi = 0; pi < patterns.length; pi++) {
        try {
          var response = await fetch(patterns[pi], { headers: headers });
          if (response.ok) {
            var data = await response.json();
            var rawEvents = data.result || [];
            if (rawEvents.length > 0 || pi === patterns.length - 1) {
              var events = rawEvents.map(function(ev) {
                var startDt = (ev.start && ev.start.dateTime) || (ev.startedAt) || "";
                var endDt = (ev.end && ev.end.dateTime) || (ev.endedAt) || "";
                var title = ev.summary || ev.subject || ev.title || "";
                var startDate = ev.start && ev.start.date;
                var endDate = ev.end && ev.end.date;
                return {
                  id: "dooray-" + ev.id, doorayId: ev.id, title: title,
                  date: startDt ? startDt.substring(0, 10) : (startDate || ""),
                  endDate: endDt ? endDt.substring(0, 10) : (endDate || ""),
                  time: startDt ? startDt.substring(11, 16) : "",
                  endTime: endDt ? endDt.substring(11, 16) : "",
                  location: ev.location || "", memo: ev.description || ev.body || "",
                  category: "meeting", priority: "medium", source: "dooray"
                };
              });
              return res.status(200).json({ events: events, total: events.length, pattern: pi });
            }
          }
        } catch (e) { /* try next */ }
      }
      return res.status(200).json({ events: [], error: "모든 패턴 실패", calendarId: calendarId });
    }

    if (action === "create" && req.method === "POST") {
      var b = req.body;
      var body = { summary: b.title, start: { dateTime: b.date + "T" + (b.time || "09:00") + ":00+09:00", timeZone: "Asia/Seoul" }, end: { dateTime: (b.endDate || b.date) + "T" + (b.endTime || "10:00") + ":00+09:00", timeZone: "Asia/Seoul" }, location: b.location || "", description: b.memo || "" };
      var response = await fetch(DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/events", { method: "POST", headers: headers, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : 400).json(await response.json());
    }

    if (action === "update" && req.method === "PUT") {
      var b = req.body;
      if (!b.doorayId) return res.status(400).json({ error: "doorayId 필요" });
      var body = { summary: b.title, start: { dateTime: b.date + "T" + (b.time || "09:00") + ":00+09:00", timeZone: "Asia/Seoul" }, end: { dateTime: (b.endDate || b.date) + "T" + (b.endTime || "10:00") + ":00+09:00", timeZone: "Asia/Seoul" }, location: b.location || "", description: b.memo || "" };
      var response = await fetch(DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/events/" + b.doorayId, { method: "PUT", headers: headers, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : 400).json(await response.json());
    }

    if (action === "delete" && req.method === "DELETE") {
      var doorayId = req.query.doorayId;
      if (!doorayId) return res.status(400).json({ error: "doorayId 필요" });
      var response = await fetch(DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/events/" + doorayId, { method: "DELETE", headers: headers });
      return res.status(response.ok ? 200 : 400).json({ success: response.ok });
    }

    return res.status(400).json({ error: "Unknown action", available: ["list", "create", "update", "delete", "status", "discover", "diag"] });
  } catch (error) {
    return res.status(500).json({ error: error.message, connected: false });
  }
};
