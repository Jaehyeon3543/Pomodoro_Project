import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction } from './db.js';
import { hashPassword, verifyPassword, issueSession, cookie, readIdentity } from './auth.js';
import { elapsed, validDate, dateKST, periodBounds, summarize } from './domain.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
function text(value, label, max = 120, optional = false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(400, `${label} 입력을 확인해 주세요.`);
  return value.trim();
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(400, `${label}: ${min}~${max} 사이 정수가 필요합니다.`);
  return value;
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON 형식이 필요합니다.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 32768) fail(413, '입력 내용이 너무 큽니다.'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; }
  catch { fail(400, '올바른 JSON이 아닙니다.'); }
}

export function createApp({ dbPath = fileURLToPath(new URL('../data/focus.sqlite', import.meta.url)), now = Date.now, origin = 'http://127.0.0.1:3000', secure = false } = {}) {
  const db = openDatabase(dbPath);
  const attempts = new Map();
  function rateLimit(req) {
    const key = req.socket.remoteAddress || 'local', time = now();
    for (const [k, v] of attempts) if (v.until < time) attempts.delete(k);
    const bucket = attempts.get(key) || { count: 0, until: time + 15 * 60000 };
    bucket.count++; attempts.set(key, bucket);
    if (bucket.count > 30) fail(429, '로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.');
  }
  const settings = uid => db.prepare('SELECT focus_minutes, short_minutes, long_minutes, long_every FROM settings WHERE user_id=?').get(uid);
  function owned(table, id, uid) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(id, uid);
    if (!row) fail(404, '항목을 찾을 수 없습니다.'); return row;
  }
  function reconcile(uid) {
    const s = db.prepare("SELECT * FROM focus_sessions WHERE user_id=? AND status='running'").get(uid);
    if (s && elapsed(s, now()) >= s.target_seconds) {
      const ended = s.running_since + (s.target_seconds - s.elapsed_seconds) * 1000;
      db.prepare("UPDATE focus_sessions SET status='completed', elapsed_seconds=target_seconds, ended_at=?, running_since=NULL WHERE id=?").run(ended, s.id);
    }
  }
  const history = uid => db.prepare('SELECT * FROM focus_sessions WHERE user_id=? AND ended_at IS NOT NULL ORDER BY ended_at DESC').all(uid);
  const tasks = uid => db.prepare(`SELECT t.*, p.title AS project_title, p.color AS project_color,
    (SELECT COUNT(*) FROM focus_sessions s WHERE s.task_id=t.id AND s.kind='focus' AND s.status='completed') AS actual,
    (SELECT COALESCE(SUM(elapsed_seconds),0) FROM focus_sessions s WHERE s.task_id=t.id AND s.kind='focus' AND s.ended_at IS NOT NULL) AS seconds
    FROM tasks t JOIN projects p ON t.project_id=p.id WHERE t.user_id=? ORDER BY t.created_at DESC`).all(uid);

  const server = createServer(async (req, res) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store' };
    const send = (data, status = 200, extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, origin), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') fail(405, '지원하지 않는 요청입니다.');
        const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/favicon.svg': ['favicon.svg','image/svg+xml'] };
        if (!assets[path]) fail(404, '페이지를 찾을 수 없습니다.');
        const [file, type] = assets[path];
        const data = await readFile(new URL(`../public/${file}`, import.meta.url));
        res.writeHead(200, { ...headers, 'Content-Type': `${type}; charset=utf-8` }); res.end(method === 'HEAD' ? undefined : data); return;
      }
      // JSON + custom header + exact Origin prevent cross-site mutation requests.
      if (!['GET','HEAD'].includes(method)) {
        if (req.headers.origin && req.headers.origin !== origin) fail(403, '허용되지 않은 출처입니다.');
        if (req.headers['x-focus-app'] !== '1') fail(403, '요청 확인 헤더가 없습니다.');
      }
      if (path === '/api/auth/register' && method === 'POST') {
        rateLimit(req); const b = await body(req);
        const email = text(b.email, '이메일', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '이메일 형식을 확인해 주세요.');
        const name = text(b.name, '이름', 40);
        if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 128) fail(400, '비밀번호는 10~128자여야 합니다.');
        const passwordHash = await hashPassword(b.password), id = randomUUID();
        try { transaction(db, () => {
          db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, email, name, passwordHash, now());
          db.prepare('INSERT INTO settings(user_id) VALUES(?)').run(id);
        }); } catch (e) { if (e.message.includes('UNIQUE')) fail(409, '이미 가입된 이메일입니다.'); throw e; }
        const token = issueSession(db, id, now());
        send({ id, email, name }, 201, { 'Set-Cookie': cookie(token, secure) }); return;
      }
      if (path === '/api/auth/login' && method === 'POST') {
        rateLimit(req); const b = await body(req);
        const email = text(b.email, '이메일', 254).toLowerCase();
        if (typeof b.password !== 'string' || b.password.length > 128) fail(400, '비밀번호를 확인해 주세요.');
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        // A fixed dummy hash performs equivalent work for unknown accounts.
        const dummy = `${'00'.repeat(16)}:${'00'.repeat(64)}`;
        const valid = await verifyPassword(b.password, user?.password_hash || dummy);
        if (!user || !valid) fail(401, '이메일 또는 비밀번호가 맞지 않습니다.');
        const token = issueSession(db, user.id, now());
        send({ id: user.id, email: user.email, name: user.name }, 200, { 'Set-Cookie': cookie(token, secure) }); return;
      }
      const user = readIdentity(db, req, now());
      if (!user) fail(401, '로그인이 필요합니다.');
      const uid = user.id;
      reconcile(uid);
      if (path === '/api/auth/logout' && method === 'POST') {
        db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(user.token_hash);
        send({ ok: true }, 200, { 'Set-Cookie': cookie('', secure, true) }); return;
      }
      if (path === '/api/bootstrap' && method === 'GET') {
        send({ user: { id: uid, name: user.name, email: user.email }, settings: settings(uid),
          projects: db.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY created_at').all(uid), tasks: tasks(uid),
          active: db.prepare("SELECT * FROM focus_sessions WHERE user_id=? AND status IN ('running','paused')").get(uid) || null,
          recent: history(uid).slice(0, 20), completedFocus: db.prepare("SELECT COUNT(*) AS n FROM focus_sessions WHERE user_id=? AND kind='focus' AND status='completed'").get(uid).n,
          serverNow: now() }); return;
      }
      if (path === '/api/settings' && method === 'PUT') {
        const b = await body(req);
        db.prepare('UPDATE settings SET focus_minutes=?, short_minutes=?, long_minutes=?, long_every=? WHERE user_id=?').run(
          integer(b.focus_minutes,1,180,'집중 시간'), integer(b.short_minutes,1,60,'짧은 휴식'), integer(b.long_minutes,1,120,'긴 휴식'), integer(b.long_every,2,12,'긴 휴식 간격'), uid);
        send(settings(uid)); return;
      }
      if (path === '/api/projects' && method === 'POST') {
        const b = await body(req), id = randomUUID(), title = text(b.title,'프로젝트');
        const color = b.color || '#6c63ff'; if (!/^#[0-9a-f]{6}$/i.test(color)) fail(400,'색상 형식을 확인해 주세요.');
        db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(id,uid,title,color,now()); send(owned('projects',id,uid),201); return;
      }
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && ['PATCH','DELETE'].includes(method)) {
        const id = projectMatch[1], p = owned('projects',id,uid);
        if (method === 'PATCH') {
          const b = await body(req), title = text(b.title ?? p.title,'프로젝트'), color = b.color ?? p.color;
          if (!/^#[0-9a-f]{6}$/i.test(color)) fail(400,'색상 형식을 확인해 주세요.');
          db.prepare('UPDATE projects SET title=?,color=? WHERE id=?').run(title,color,id);
        } else {
          const active = db.prepare("SELECT s.id FROM focus_sessions s JOIN tasks t ON s.task_id=t.id WHERE t.project_id=? AND s.status IN ('running','paused')").get(id);
          if (active) fail(409,'진행 중인 세션을 먼저 끝내 주세요.');
          db.prepare('DELETE FROM projects WHERE id=?').run(id);
        }
        send({ ok: true }); return;
      }
      if (path === '/api/tasks' && method === 'POST') {
        const b = await body(req), id = randomUUID(); owned('projects',text(b.project_id,'프로젝트 ID'),uid);
        db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?)').run(id,uid,b.project_id,text(b.title,'할 일'),integer(b.estimated,1,999,'예상 횟수'),0,now());
        send(owned('tasks',id,uid),201); return;
      }
      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && ['PATCH','DELETE'].includes(method)) {
        const id = taskMatch[1], t = owned('tasks',id,uid);
        if (method === 'PATCH') {
          const b = await body(req), title = text(b.title ?? t.title,'할 일'), estimated = integer(b.estimated ?? t.estimated,1,999,'예상 횟수');
          if (b.done !== undefined && typeof b.done !== 'boolean') fail(400,'완료 값은 true/false여야 합니다.');
          db.prepare('UPDATE tasks SET title=?,estimated=?,done=? WHERE id=?').run(title,estimated,b.done === undefined ? t.done : Number(b.done),id);
        } else {
          if (db.prepare("SELECT id FROM focus_sessions WHERE task_id=? AND status IN ('running','paused')").get(id)) fail(409,'진행 중인 세션을 먼저 끝내 주세요.');
          db.prepare('DELETE FROM tasks WHERE id=?').run(id);
        }
        send({ ok: true }); return;
      }
      if (path === '/api/sessions' && method === 'POST') {
        const b = await body(req), kind = b.kind || 'focus';
        if (!['focus','short','long'].includes(kind)) fail(400,'타이머 종류를 확인해 주세요.');
        const cfg = settings(uid), id = randomUUID(), time = now();
        let task = null, project = null;
        if (kind === 'focus') {
          task = owned('tasks',text(b.task_id,'할 일 ID'),uid); if (task.done) fail(409,'완료한 할 일은 다시 열고 시작해 주세요.');
          project = owned('projects',task.project_id,uid);
        }
        try { db.prepare(`INSERT INTO focus_sessions(id,user_id,task_id,task_title,project_title,project_color,kind,status,target_seconds,started_at,running_since)
          VALUES(?,?,?,?,?,?,?,'running',?,?,?)`).run(id,uid,task?.id || null,task?.title || '휴식',project?.title || '휴식',project?.color || '#20a988',kind,cfg[`${kind}_minutes`]*60,time,time);
        } catch (e) { if (e.message.includes('UNIQUE')) fail(409,'이미 진행 중인 타이머가 있습니다.'); throw e; }
        send(owned('focus_sessions',id,uid),201); return;
      }
      const actionMatch = path.match(/^\/api\/sessions\/([^/]+)\/(pause|resume|finish|cancel)$/);
      if (actionMatch && method === 'POST') {
        const [,id,action] = actionMatch;
        const s = owned('focus_sessions',id,uid), time = now();
        if (['completed','cancelled'].includes(s.status)) { send(s); return; }
        const count = elapsed(s,time);
        if (action === 'pause' && s.status === 'running') db.prepare("UPDATE focus_sessions SET status='paused',elapsed_seconds=?,running_since=NULL WHERE id=?").run(count,id);
        if (action === 'resume' && s.status === 'paused') db.prepare("UPDATE focus_sessions SET status='running',running_since=? WHERE id=?").run(time,id);
        if (action === 'cancel') db.prepare("UPDATE focus_sessions SET status='cancelled',elapsed_seconds=?,ended_at=?,running_since=NULL WHERE id=?").run(count,time,id);
        if (action === 'finish') fail(409,'설정한 시간이 아직 끝나지 않았습니다.');
        send(owned('focus_sessions',id,uid)); return;
      }
      const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && ['PATCH','DELETE'].includes(method)) {
        const id = sessionMatch[1], s = owned('focus_sessions',id,uid);
        if (!s.ended_at) fail(409,'종료한 세션만 수정하거나 삭제할 수 있습니다.');
        if (method === 'DELETE') db.prepare('DELETE FROM focus_sessions WHERE id=?').run(id);
        else {
          const b = await body(req), mood = b.mood === null ? null : integer(b.mood,1,5,'집중도');
          const distraction = text(b.distraction ?? '', '방해 요소', 30, true);
          if (!['','휴대폰','SNS','소음','졸림','기타'].includes(distraction)) fail(400,'방해 요소를 확인해 주세요.');
          db.prepare('UPDATE focus_sessions SET mood=?,distraction=?,note=? WHERE id=?').run(mood,distraction,text(b.note ?? '', '메모', 1000,true),id);
        }
        send({ ok: true }); return;
      }
      if (path === '/api/stats' && method === 'GET') {
        const period = url.searchParams.get('period') || 'week', date = url.searchParams.get('date') || dateKST(now());
        if (!['day','week','month'].includes(period) || !validDate(date)) fail(400,'기간을 확인해 주세요.');
        send({ ...summarize(history(uid),periodBounds(period,date)), tasks: tasks(uid) }); return;
      }
      if (path === '/api/weekly-review' && ['GET','PUT'].includes(method)) {
        const date = url.searchParams.get('date') || dateKST(now()); if (!validDate(date)) fail(400,'날짜를 확인해 주세요.');
        const week = periodBounds('week',date).startDate;
        if (method === 'PUT') {
          const b = await body(req);
          db.prepare(`INSERT INTO weekly_reviews VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,week_start)
            DO UPDATE SET wins=excluded.wins,challenges=excluded.challenges,next_week=excluded.next_week,updated_at=excluded.updated_at`).run(
              uid,week,text(b.wins,'성과',2000,true),text(b.challenges,'어려움',2000,true),text(b.next_week,'다음 주 계획',2000,true),now());
        }
        send(db.prepare('SELECT week_start,wins,challenges,next_week,updated_at FROM weekly_reviews WHERE user_id=? AND week_start=?').get(uid,week)
          || { week_start: week,wins:'',challenges:'',next_week:'' }); return;
      }
      if (path === '/api/data/export' && method === 'GET') {
        send({ version: 1, exported_at: new Date(now()).toISOString(), timezone:'Asia/Seoul',
          user: { name:user.name,email:user.email }, settings:settings(uid),
          projects:db.prepare('SELECT * FROM projects WHERE user_id=?').all(uid), tasks:tasks(uid),
          sessions:db.prepare('SELECT * FROM focus_sessions WHERE user_id=? ORDER BY started_at').all(uid),
          weekly_reviews:db.prepare('SELECT * FROM weekly_reviews WHERE user_id=?').all(uid) },200,
          { 'Content-Disposition':'attachment; filename="focus-log-export.json"' }); return;
      }
      if (['/api/data','/api/account'].includes(path) && method === 'DELETE') {
        const b = await body(req), record = db.prepare('SELECT password_hash FROM users WHERE id=?').get(uid);
        if (typeof b.password !== 'string' || b.password.length > 128 || !await verifyPassword(b.password,record.password_hash)) fail(403,'비밀번호가 맞지 않습니다.');
        if (path === '/api/account') {
          db.prepare('DELETE FROM users WHERE id=?').run(uid); send({ok:true},200,{'Set-Cookie':cookie('',secure,true)});
        } else {
          transaction(db,() => { for (const table of ['focus_sessions','weekly_reviews','tasks','projects']) db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(uid); });
          send({ok:true});
        } return;
      }
      fail(404,'API를 찾을 수 없습니다.');
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) send({ error: error.status ? error.message : '서버 오류가 발생했습니다. 다시 시도해 주세요.' },error.status || 500);
      else res.end();
    }
  });
  return { server, db };
}
