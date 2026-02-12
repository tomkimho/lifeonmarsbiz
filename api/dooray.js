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

  const headers = { Authorization: `dooray-api ${apiKey}`, "Content-Type": "application/json" };
  const { action } = req.query;

  async function findCalendarId() {
    if (calendarId && !calendarId.includes("@")) return calendarId;
    try {
      const r = await fetch(`${DOORAY_BASE}/calendar/v1/calendars`, { headers });
      if (!r.ok) return null;
      const d = await r.json();
      const cals = d.result || [];
      const primary = cals.find(c => c.type === "MEMBER" || c.type === "DEFAULT") || cals[0];
      return primary ? primary.id : null;
    } catch { return null; }
  }

  try {
    if (action === "discover") {
      const r = await fetch(`${DOORAY_BASE}/calendar/v1/calendars`, { headers });
      if (!r.ok) return res.status(200).json({ connected: false, error: `API 인증 실패 (${r.status})` });
      const d = await r.json();
      const cals = (d.result || []).map(c => ({ id: c.id, name: c.name || c.summary || "캘린더", type: c.type }));
      return res.status(200).json({ connected: true, calendars: cals, message: `${cals.length}개 캘린더 발견` });
    }

    if (action === "status") {
      const r = await fetch(`${DOORAY_BASE}/calendar/v1/calendars`, { headers });
      if (!r.ok) return res.status(200).json({ connected: false, error: `API 인증 실패 (${r.status})` });
      const d = await r.json();
      const cals = d.result || [];
      const cid = await findCalendarId();
      if (!cid && cals.length === 0) return res.status(200).json({ connected: false, error: "캘린더를 찾을 수 없습니다." });
      const usedId = cid || (cals[0] && cals[0].id);
      const calInfo = cals.find(c => c.id === usedId);
      return res.status(200).json({ connected: true, calendarId: usedId, calendarName: calInfo ? (calInfo.name || calInfo.summary) : "캘린더", memberId, autoDetected: !calendarId || calendarId.includes("@"), totalCalendars: cals.length });
    }

    calendarId = await findCalendarId();
    if (!calendarId) return res.status(500).json({ error: "캘린더 ID를 찾을 수 없습니다.", connected: false });

    if (action === "list" && req.method === "GET") {
      const { from, to } = req.query;
      const startDate = from || new Date().toISOString().split("T")[0];
      const endDate = to || new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
      const url = `${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events?fromDate=${startDate}T00:00:00%2B09:00&toDate=${endDate}T23:59:59%2B09:00`;
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (!response.ok || !data.result) return res.status(200).json({ events: [], error: data.message || "일정 조회 실패" });
      const events = (data.result || []).map(ev => ({
        id: `dooray-${ev.id}`, doorayId: ev.id, title: ev.summary || "",
        date: ev.start?.dateTime ? ev.start.dateTime.substring(0, 10) : ev.start?.date || "",
        endDate: ev.end?.dateTime ? ev.end.dateTime.substring(0, 10) : ev.end?.date || "",
        time: ev.start?.dateTime ? ev.start.dateTime.substring(11, 16) : "",
        endTime: ev.end?.dateTime ? ev.end.dateTime.substring(11, 16) : "",
        location: ev.location || "", memo: ev.description || "",
        category: "meeting", priority: "medium", source: "dooray",
      }));
      return res.status(200).json({ events, total: events.length });
    }

    if (action === "create" && req.method === "POST") {
      const { title, date, endDate, time, endTime, location, memo, attendees } = req.body;
      const body = { summary: title, start: { dateTime: `${date}T${time || "09:00"}:00+09:00`, timeZone: "Asia/Seoul" }, end: { dateTime: `${endDate || date}T${endTime || "10:00"}:00+09:00`, timeZone: "Asia/Seoul" }, location: location || "", description: memo || "" };
      if (attendees) body.attendees = attendees.split(",").map(a => a.trim()).filter(Boolean).map(name => ({ name }));
      const response = await fetch(`${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events`, { method: "POST", headers, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : 400).json(await response.json());
    }

    if (action === "update" && req.method === "PUT") {
      const { doorayId, title, date, endDate, time, endTime, location, memo } = req.body;
      if (!doorayId) return res.status(400).json({ error: "doorayId 필요" });
      const body = { summary: title, start: { dateTime: `${date}T${time || "09:00"}:00+09:00`, timeZone: "Asia/Seoul" }, end: { dateTime: `${endDate || date}T${endTime || "10:00"}:00+09:00`, timeZone: "Asia/Seoul" }, location: location || "", description: memo || "" };
      const response = await fetch(`${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events/${doorayId}`, { method: "PUT", headers, body: JSON.stringify(body) });
      return res.status(response.ok ? 200 : 400).json(await response.json());
    }

    if (action === "delete" && req.method === "DELETE") {
      const { doorayId } = req.query;
      if (!doorayId) return res.status(400).json({ error: "doorayId 필요" });
      const response = await fetch(`${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events/${doorayId}`, { method: "DELETE", headers });
      return res.status(response.ok ? 200 : 400).json({ success: response.ok });
    }

    return res.status(400).json({ error: "Unknown action", available: ["list", "create", "update", "delete", "status", "discover"] });
  } catch (error) {
    return res.status(500).json({ error: error.message, connected: false });
  }
}
```

4. **Commit changes** 클릭

1-2분 후 테스트:
```
https://lifeonmarsbiz.vercel.app/api/dooray?action=discover
