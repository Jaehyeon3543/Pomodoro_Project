export function elapsed(session, now) {
  const extra = session.status === 'running' ? Math.max(0, Math.floor((now - session.running_since) / 1000)) : 0;
  return Math.min(session.target_seconds, session.elapsed_seconds + extra);
}
export function dateKST(timestamp) {
  return new Date(timestamp + 9 * 3600000).toISOString().slice(0, 10);
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function periodBounds(period, date) {
  const day = new Date(`${date}T00:00:00+09:00`);
  let start = day.getTime(), end;
  if (period === 'day') end = start + 86400000;
  else if (period === 'week') {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    start -= ((weekday + 6) % 7) * 86400000; end = start + 7 * 86400000;
  } else {
    const [year, month] = date.split('-').map(Number);
    start = Date.UTC(year, month - 1, 1) - 9 * 3600000;
    end = Date.UTC(year, month, 1) - 9 * 3600000;
  }
  return { start, end, startDate: dateKST(start), endDate: dateKST(end - 1) };
}
export function summarize(sessions, bounds) {
  const rows = sessions.filter(s => s.kind === 'focus' && s.ended_at >= bounds.start && s.ended_at < bounds.end);
  const days = [], projects = new Map();
  for (let t = bounds.start; t < bounds.end; t += 86400000) days.push({ date: dateKST(t), seconds: 0, completed: 0 });
  const distractions = {};
  for (const row of rows) {
    const day = days.find(d => d.date === dateKST(row.ended_at));
    day.seconds += row.elapsed_seconds; day.completed += Number(row.status === 'completed');
    const p = projects.get(row.project_title) || { title: row.project_title, color: row.project_color, seconds: 0, completed: 0 };
    p.seconds += row.elapsed_seconds; p.completed += Number(row.status === 'completed'); projects.set(row.project_title, p);
    if (row.distraction) distractions[row.distraction] = (distractions[row.distraction] || 0) + 1;
  }
  const moods = rows.filter(s => s.mood !== null);
  return { ...bounds, seconds: rows.reduce((n, s) => n + s.elapsed_seconds, 0),
    completed: rows.filter(s => s.status === 'completed').length,
    cancelled: rows.filter(s => s.status === 'cancelled').length,
    averageMood: moods.length ? moods.reduce((n, s) => n + s.mood, 0) / moods.length : null,
    days, projects: [...projects.values()].sort((a,b) => b.seconds-a.seconds), distractions, sessions: rows };
}
