import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { periodBounds, dateKST } from '../server/domain.js';

async function fixture(t) {
  let clock=Date.parse('2026-09-28T10:00:00+09:00');
  const app=createApp({dbPath:':memory:',now:()=>clock});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.db.close();});
  const url=`http://127.0.0.1:${app.server.address().port}`;
  function client() {
    let cookie='';
    return async(path,method='GET',data,overrides={})=>{
      const res=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Focus-App':'1',Cookie:cookie,...overrides},body:data===undefined?undefined:JSON.stringify(data)});
      if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
      return {status:res.status,body:await res.json(),headers:res.headers};
    };
  }
  const a=client(),b=client();
  await a('/auth/register','POST',{email:'a@example.com',name:'테스터 A',password:'password-test-123'});
  await b('/auth/register','POST',{email:'b@example.com',name:'테스터 B',password:'password-test-123'});
  const p=(await a('/projects','POST',{title:'전공 공부'})).body;
  const task=(await a('/tasks','POST',{project_id:p.id,title:'TCP 공부',estimated:2})).body;
  return {a,b,client,db:app.db,p,task,advance:ms=>clock+=ms};
}
test('auth: hashed password, HttpOnly cookie, logout and invalid credentials',async t=>{
  const {a,db,client}=await fixture(t);
  assert.notEqual(db.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash,'password-test-123');
  assert.equal((await a('/auth/logout','POST',{})).status,200);
  assert.equal((await a('/bootstrap')).status,401);
  const login=await a('/auth/login','POST',{email:'A@example.com',password:'password-test-123'});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await client()('/auth/login','POST',{email:'a@example.com',password:'wrong'})).status,401);
  assert.equal((await client()('/auth/register','POST',{email:'a@example.com',name:'dup',password:'password-test-123'})).status,409);
});
test('ownership: users cannot read, modify, start or delete another user records',async t=>{
  const {a,b,p,task}=await fixture(t);
  assert.equal((await b('/bootstrap')).body.projects.length,0);
  assert.equal((await b(`/projects/${p.id}`,'PATCH',{title:'stolen'})).status,404);
  assert.equal((await b(`/tasks/${task.id}`,'DELETE',{})).status,404);
  assert.equal((await b('/tasks','POST',{project_id:p.id,title:'bad',estimated:1})).status,404);
  assert.equal((await b('/sessions','POST',{task_id:task.id})).status,404);
  const s=(await a('/sessions','POST',{task_id:task.id})).body;
  assert.equal((await b(`/sessions/${s.id}/cancel`,'POST',{})).status,404);
});
test('timer: one active, pause exclusion, restoration, no early finish, idempotent completion',async t=>{
  const {a,task,advance}=await fixture(t);
  await a('/settings','PUT',{focus_minutes:1,short_minutes:1,long_minutes:2,long_every:2});
  const s=(await a('/sessions','POST',{task_id:task.id})).body;
  assert.equal((await a('/sessions','POST',{task_id:task.id})).status,409);
  advance(20000);
  assert.equal((await a(`/sessions/${s.id}/pause`,'POST',{})).body.elapsed_seconds,20);
  advance(60000);
  const restored=(await a('/bootstrap')).body.active;
  assert.equal(restored.elapsed_seconds,20);assert.equal(restored.status,'paused');
  await a(`/sessions/${s.id}/resume`,'POST',{});
  assert.equal((await a(`/sessions/${s.id}/finish`,'POST',{})).status,409);
  advance(40000);
  const finish=await a(`/sessions/${s.id}/finish`,'POST',{});
  assert.equal(finish.body.status,'completed');assert.equal(finish.body.elapsed_seconds,60);
  assert.equal((await a(`/sessions/${s.id}/finish`,'POST',{})).body.id,s.id);
  const stats=(await a('/stats?period=day&date=2026-09-28')).body;
  assert.equal(stats.completed,1);assert.equal(stats.seconds,60);assert.equal(stats.tasks[0].actual,1);
});
test('cancelled focus counts time, break excluded, reflection and weekly review persist',async t=>{
  const {a,task,advance}=await fixture(t);
  const s=(await a('/sessions','POST',{task_id:task.id})).body;
  advance(32000);await a(`/sessions/${s.id}/cancel`,'POST',{});
  assert.equal((await a(`/sessions/${s.id}`,'PATCH',{mood:4,distraction:'SNS',note:'정리 완료'})).status,200);
  const rest=(await a('/sessions','POST',{kind:'short'})).body;
  advance(300000);await a(`/sessions/${rest.id}/finish`,'POST',{});
  const stats=(await a('/stats?period=week&date=2026-09-30')).body;
  assert.equal(stats.seconds,32);assert.equal(stats.completed,0);assert.equal(stats.cancelled,1);assert.equal(stats.averageMood,4);assert.equal(stats.distractions.SNS,1);
  await a('/weekly-review?date=2026-09-30','PUT',{wins:'시작했다',challenges:'졸림',next_week:'일찍 시작'});
  assert.equal((await a('/weekly-review?date=2026-10-04')).body.wins,'시작했다');
});
test('data export excludes credentials, project deletion preserves history, deletion requires password',async t=>{
  const {a,p,task,advance}=await fixture(t);
  const s=(await a('/sessions','POST',{task_id:task.id})).body;
  assert.equal((await a(`/projects/${p.id}`,'DELETE',{})).status,409);
  advance(12000);await a(`/sessions/${s.id}/cancel`,'POST',{});
  await a(`/projects/${p.id}`,'DELETE',{});
  const exported=(await a('/data/export')).body;
  assert.equal(exported.sessions[0].task_title,'TCP 공부');assert.equal(exported.sessions[0].task_id,null);
  assert.doesNotMatch(JSON.stringify(exported),/password_hash|token_hash/);
  assert.equal((await a('/data','DELETE',{password:'bad'})).status,403);
  assert.equal((await a('/data','DELETE',{password:'password-test-123'})).status,200);
  assert.equal((await a('/bootstrap')).body.recent.length,0);
  assert.equal((await a('/account','DELETE',{password:'password-test-123'})).status,200);
  assert.equal((await a('/bootstrap')).status,401);
});
test('validation and CSRF: malformed fields, invalid dates and origins rejected',async t=>{
  const {a,task}=await fixture(t);
  assert.equal((await a('/projects','POST',{title:''})).status,400);
  assert.equal((await a('/settings','PUT',{focus_minutes:0})).status,400);
  assert.equal((await a(`/tasks/${task.id}`,'PATCH',{estimated:1.5})).status,400);
  assert.equal((await a('/stats?date=2026-02-30')).status,400);
  assert.equal((await a('/projects','POST',{title:'bad'},{Origin:'https://attacker.example'})).status,403);
  assert.equal((await a('/projects','POST',{title:'bad'},{'X-Focus-App':''})).status,403);
});
test('Korean calendar: Monday weeks, leap month, midnight boundaries',()=>{
  assert.equal(dateKST(Date.parse('2026-09-27T15:00:00Z')),'2026-09-28');
  assert.equal(periodBounds('week','2026-10-04').startDate,'2026-09-28');
  assert.equal(periodBounds('month','2024-02-15').endDate,'2024-02-29');
});
