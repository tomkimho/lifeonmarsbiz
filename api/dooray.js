// Dooray Calendar API Proxy v2
// 자동으로 캘린더를 찾고, 일정을 동기화합니다.

const DOORAY_BASE = "https://api.dooray.com";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.DOORAY_API_KEY;
  let calendarId = process.env.DOORAY_CALENDAR_ID;
  const memberId = process.env.DOORAY_MEMBER_ID;

  if (!apiKey) {
    return res.status(500).json({ error: "DOORAY_API_KEY가 설정되지 않았습니다.", connected: false });
  }

  const headers = { Authorization: "dooray-api " + apiKey, "Content-Type": "application/json" };
  const action = req.query.action;

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
    if (action === "discover") {
      var r = await fetch(DOORAY_BASE + "/calendar/v1/calendars", { headers: headers });
      if (!r.ok) return res.status(200).json({ connected: false, error: "API 인증 실패 (" + r.status + ")" });
      var d = await r.json();
      var cals = (d.result || []).map(function(c) { return { id: c.id, name: c.name || c.summary || "캘린더", type: c.type }; });
      return res.status(200).json({ connected: true, calendars: cals, message: cals.length + "개 캘린더 발견" });
    }

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

    calendarId = await findCalendarId();
    if (!calendarId) return res.status(500).json({ error: "캘린더 ID를 찾을 수 없습니다.", connected: false });

    if (action === "list" && req.method === "GET") {
      var from = req.query.from;
      var to = req.query.to;
      var startDate = from || new Date().toISOString().split("T")[0];
      var endDate = to || new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
      var url = DOORAY_BASE + "/calendar/v1/calendars/" + calendarId + "/events?fromDate=" + startDate + "T00:00:00%2B09:00&toDate=" + endDate + "T23:59:59%2B09:00";
      var response = await fetch(url, { headers: headers });
      var data = await response.json();
      if (!response.ok || !data.result) return res.status(200).json({ events: [], error: data.message || "일정 조회 실패" });
      var events = (data.result || []).map(function(ev) {
        return {
          id: "dooray-" + ev.id, doorayId: ev.id, title: ev.summary || "",
          date: ev.start && ev.start.dateTime ? ev.start.dateTime.substring(0, 10) : (ev.start && ev.start.date) || "",
          endDate: ev.end && ev.end.dateTime ? ev.end.dateTime.substring(0, 10) : (ev.end && ev.end.date) || "",
          time: ev.start && ev.start.dateTime ? ev.start.dateTime.substring(11, 16) : "",
          endTime: ev.end && ev.end.dateTime ? ev.end.dateTime.substring(11, 16) : "",
          location: ev.location || "", memo: ev.description || "",
          category: "meeting", priority: "medium", source: "dooray"
        };
      });
      return res.status(200).json({ events: events, total: events.length });
    }

    if (action === "create" && req.method === "POST") {
      var b = req.body;
      var body = { summary: b.title, start: { dateTime: b.date + "T" + (b.time || "09:00") + ":00+09:00", timeZone: "Asia/Seoul" }, end: { dateTime: (b.endDate || b.date) + "T" + (b.endTime || "10:00") + ":00+09:00", timeZone: "Asia/Seoul" }, location: b.location || "", description: b.memo || "" };
      if (b.attendees) body.attendees = b.attendees.split(",").map(function(a) { return { name: a.trim() }; }).filter(function(a) { return a.name; });
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

    return res.status(400).json({ error: "Unknown action", available: ["list", "create", "update", "delete", "status", "discover"] });
  } catch (error) {
    return res.status(500).json({ error: error.message, connected: false });
  }
};
