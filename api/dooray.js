// Dooray Calendar API Proxy
// 브라우저에서 직접 Dooray API를 호출하면 CORS 에러가 나므로
// 이 서버리스 함수가 중간 다리 역할을 합니다.

const DOORAY_BASE = "https://api.dooray.com";

module.exports = async function handler(req, res) {
  // CORS 허용
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.DOORAY_API_KEY;
  const calendarId = process.env.DOORAY_CALENDAR_ID;
  const memberId = process.env.DOORAY_MEMBER_ID;

  if (!apiKey || !calendarId) {
    return res.status(500).json({
      error: "두레이 API 설정이 필요합니다. Vercel 환경변수를 확인하세요.",
      setup: {
        DOORAY_API_KEY: "두레이 → 설정 → API 서비스 → 인증 토큰 생성",
        DOORAY_CALENDAR_ID: "두레이 캘린더 ID",
        DOORAY_MEMBER_ID: "두레이 멤버 ID",
      },
    });
  }

  const headers = {
    Authorization: `dooray-api ${apiKey}`,
    "Content-Type": "application/json",
  };

  const { action } = req.query;

  try {
    // ─── 일정 목록 조회 ───
    if (action === "list" && req.method === "GET") {
      const { from, to } = req.query;
      const startDate = from || new Date().toISOString().split("T")[0];
      const endDate = to || new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

      const url = `${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events?fromDate=${startDate}T00:00:00%2B09:00&toDate=${endDate}T23:59:59%2B09:00`;

      const response = await fetch(url, { headers });
      const data = await response.json();

      if (!data.result) {
        return res.status(200).json({ events: [], raw: data });
      }

      // Dooray 일정을 BizPlanner 형식으로 변환
      const events = (data.result || []).map((ev) => ({
        id: `dooray-${ev.id}`,
        doorayId: ev.id,
        title: ev.summary || "",
        date: ev.start?.dateTime
          ? ev.start.dateTime.substring(0, 10)
          : ev.start?.date || "",
        time: ev.start?.dateTime
          ? ev.start.dateTime.substring(11, 16)
          : "",
        endTime: ev.end?.dateTime
          ? ev.end.dateTime.substring(11, 16)
          : "",
        location: ev.location || "",
        memo: ev.description || "",
        category: "meeting",
        priority: "medium",
        source: "dooray",
      }));

      return res.status(200).json({ events, total: events.length });
    }

    // ─── 일정 생성 ───
    if (action === "create" && req.method === "POST") {
      const { title, date, time, endTime, location, memo, attendees } = req.body;

      const startDateTime = `${date}T${time || "09:00"}:00+09:00`;
      const endDateTime = `${date}T${endTime || "10:00"}:00+09:00`;

      const body = {
        summary: title,
        start: { dateTime: startDateTime, timeZone: "Asia/Seoul" },
        end: { dateTime: endDateTime, timeZone: "Asia/Seoul" },
        location: location || "",
        description: memo || "",
      };

      // 참석자가 있으면 추가
      if (attendees) {
        body.attendees = attendees
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
          .map((name) => ({ name }));
      }

      const url = `${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await response.json();

      return res.status(response.ok ? 200 : 400).json(data);
    }

    // ─── 일정 수정 ───
    if (action === "update" && req.method === "PUT") {
      const { doorayId, title, date, time, endTime, location, memo } = req.body;

      if (!doorayId) {
        return res.status(400).json({ error: "doorayId가 필요합니다" });
      }

      const body = {
        summary: title,
        start: {
          dateTime: `${date}T${time || "09:00"}:00+09:00`,
          timeZone: "Asia/Seoul",
        },
        end: {
          dateTime: `${date}T${endTime || "10:00"}:00+09:00`,
          timeZone: "Asia/Seoul",
        },
        location: location || "",
        description: memo || "",
      };

      const url = `${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events/${doorayId}`;
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      const data = await response.json();

      return res.status(response.ok ? 200 : 400).json(data);
    }

    // ─── 일정 삭제 ───
    if (action === "delete" && req.method === "DELETE") {
      const { doorayId } = req.query;

      if (!doorayId) {
        return res.status(400).json({ error: "doorayId가 필요합니다" });
      }

      const url = `${DOORAY_BASE}/calendar/v1/calendars/${calendarId}/events/${doorayId}`;
      const response = await fetch(url, { method: "DELETE", headers });

      return res.status(response.ok ? 200 : 400).json({
        success: response.ok,
        message: response.ok ? "삭제 완료" : "삭제 실패",
      });
    }

    // ─── 연결 상태 확인 ───
    if (action === "status") {
      const url = `${DOORAY_BASE}/calendar/v1/calendars/${calendarId}`;
      const response = await fetch(url, { headers });
      const data = await response.json();

      return res.status(200).json({
        connected: response.ok,
        calendarId,
        memberId,
        calendar: data.result || null,
      });
    }

    return res.status(400).json({ error: "Unknown action", available: ["list", "create", "update", "delete", "status"] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
