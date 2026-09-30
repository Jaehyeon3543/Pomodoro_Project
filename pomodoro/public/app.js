// One state object owns the current view. Durable data always comes from the API.
const state = { data: null, view: 'focus', kind: 'focus', selected: '', period: 'week', date: today(), stats: null, weekly: null, offset: 0, finishing: false, busy: false };
const root = document.querySelector('#app'), modal = document.querySelector('#modal');
const labels = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function today() { return new Date(Date.now()+9*3600000).toISOString().slice(0,10); }
function minutes(seconds) { return `${Math.floor(seconds/60)}분${seconds%60 ? ` ${seconds%60}초` : ''}`; }
function timeLabel(timestamp) { return new Date(timestamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
const icons = {
 focus:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
 tasks:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
 stats:'<path d="M4 20h17M7 16V9M12 16V4M17 16v-5"/>',
 review:'<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zm0 13h15M8 7h7M8 11h5"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
 guide:'<circle cx="12" cy="12" r="9"/><path d="M10 9a2 2 0 1 1 3 2c-1 1-1 1-1 3M12 17h.01"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
function toast(message) { const el=document.querySelector('#toast'); el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4500); }
async function api(path, method='GET', data) {
  const response=await fetch(`/api${path}`,{method,headers:{'Content-Type':'application/json','X-Focus-App':'1'},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok) { const error=new Error(result.error || '요청을 완료하지 못했습니다.');error.status=response.status;throw error; }
  return result;
}
async function refresh(render=true) {
  state.data=await api('/bootstrap');state.offset=state.data.serverNow-Date.now();
  if(state.data.active) state.kind=state.data.active.kind;
  if(!state.data.tasks.some(t=>t.id===state.selected&&!t.done)) state.selected=state.data.tasks.find(t=>!t.done)?.id || '';
  if(['focus','stats','review'].includes(state.view)) state.stats=await api(`/stats?period=${state.view==='focus'?'day':state.view==='review'?'week':state.period}&date=${state.view==='focus'?today():state.date}`);
  if(state.view==='review') state.weekly=await api(`/weekly-review?date=${state.date}`);
  if(render) renderApp();
}
function renderAuth(register=false) {
  state.data=null;document.title='Focus Log · 나의 집중 기록';
  root.innerHTML=`<main class="auth"><section class="auth-story"><div class="brand"><img src="/favicon.svg" alt="">Focus Log</div><div><div class="eyebrow">A LITTLE FOCUS, EVERY DAY</div><h1>오늘의 집중이,<br><span>내일의 기록으로.</span></h1><p>한 번에 하나의 일에 집중하세요.<br>쌓여가는 시간 속에서 나만의 리듬을 찾아요.</p></div><div class="auth-cycle">01 &nbsp; 할 일 고르기 &nbsp; / &nbsp; 02 &nbsp; 집중하기 &nbsp; / &nbsp; 03 &nbsp; 돌아보기</div></section><section class="auth-form"><div class="auth-box"><div class="eyebrow">MY FOCUS WORKSPACE</div><h2>${register?'나만의 작업실 만들기':'다시 만나 반가워요'}</h2><p class="muted">${register?'작은 집중부터 함께 시작해요.':'오늘의 집중을 이어갈 준비가 되었나요?'}</p><form id="auth-form">${register?'<label>이름<input name="name" autocomplete="name" maxlength="40" required placeholder="어떻게 불러드릴까요?"></label>':''}<label>이메일<input type="email" name="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label><label>비밀번호<input type="password" name="password" autocomplete="${register?'new-password':'current-password'}" minlength="${register?10:1}" maxlength="128" required placeholder="${register?'10자 이상 입력해 주세요':'비밀번호를 입력해 주세요'}"></label><div class="error" role="alert" id="auth-error"></div><button class="primary" type="submit">${register?'회원가입':'로그인'}</button></form><div class="row between"><span class="muted">${register?'이미 계정이 있나요?':'처음 사용하시나요?'}</span><button class="ghost" id="auth-toggle">${register?'로그인':'회원가입'}</button></div><p class="muted" style="font-size:.8rem;margin-top:30px">내 PC에서 실행하는 개인 작업실 · 데이터는 이 서버에 저장됩니다.</p></div></section></main>`;
  document.querySelector('#auth-toggle').onclick=()=>renderAuth(!register);
  document.querySelector('#auth-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{ await api(`/auth/${register?'register':'login'}`,'POST',Object.fromEntries(new FormData(form)));state.view='focus';await refresh(); }
    catch(e){document.querySelector('#auth-error').textContent=e.message;button.disabled=false;}
  };
}
const views = {focus:['집중하기','지금은, 한 가지 일에 집중할 시간.'],tasks:['프로젝트 & 할 일','큰 목표를 작은 집중으로 나누어 보세요.'],stats:['기록 & 통계','숫자 너머, 내가 시간을 쓴 곳.'],review:['Weekly Review','한 주를 돌아보고 다음 집중을 준비해요.'],settings:['설정 & 데이터','나에게 맞는 집중 리듬을 만들어요.'],guide:['포모도로 가이드','시작은 작게, 휴식은 충분히.']};
function renderApp() {
  if(!state.data)return;
  const u=state.data.user;
  root.innerHTML=`<div class="quiet-shell"><header class="topbar"><div class="brand"><img src="/favicon.svg" alt="">Focus Log</div><nav class="topnav" aria-label="주 메뉴">${Object.entries(views).map(([key,v])=>`<button data-view="${key}" class="${key===state.view?'active':''}" ${key===state.view?'aria-current="page"':''}>${v[0]}</button>`).join('')}</nav><div class="top-profile"><span class="avatar" title="${esc(u.name)}">${esc(u.name.slice(0,1))}</span><button class="ghost small" data-action="logout">로그아웃</button></div></header><main class="main"><header class="page-head row between"><div><div class="eyebrow">MY FOCUS / ${state.view.toUpperCase()}</div><h1>${views[state.view][0]}</h1><p>${views[state.view][1]}</p></div><div class="today-tag">${new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'})}</div></header><div id="page-content">${({focus:focusView,tasks:tasksView,stats:statsView,review:reviewView,settings:settingsView,guide:guideView}[state.view])()}</div></main></div>`;
  tick();
}
function metricCards(stats,scope='오늘') {
  return `<div class="metrics"><div class="metric"><div class="caption">${scope} 집중 시간</div><div class="value">${Math.floor((stats?.seconds||0)/60)}<span class="unit">분</span></div></div><div class="metric"><div class="caption">완료한 Pomodoro</div><div class="value">${stats?.completed||0}<span class="unit">회</span></div></div><div class="metric"><div class="caption">평균 집중도</div><div class="value">${stats?.averageMood?.toFixed(1)||'—'}<span class="unit">/ 5</span></div></div></div>`;
}
function taskRow(t,editable=false) {
  return `<div class="task-item ${state.selected===t.id?'selected':''} ${t.done?'done':''}"><input type="checkbox" data-task-done="${t.id}" ${t.done?'checked':''} aria-label="${esc(t.title)} 완료"><button class="task-select" data-select-task="${t.id}"><span class="task-title">${esc(t.title)}</span><span class="task-meta"><span class="project-dot" style="background:${esc(t.project_color)}"></span>${esc(t.project_title)}</span></button><span class="pill" title="실제 완료 횟수 / 예상 횟수">${t.actual} / ${t.estimated} 회</span>${editable?`<button class="small ghost" data-edit-task="${t.id}" aria-label="${esc(t.title)} 수정">수정</button>`:''}</div>`;
}
function focusView() {
  const {active,settings,tasks,recent,completedFocus}=state.data;
  const available=tasks.filter(t=>!t.done), selected=tasks.find(t=>t.id===state.selected);
  return `<div class="focus-layout"><section class="card timer-card"><div class="segmented" aria-label="타이머 종류">${Object.entries(labels).map(([k,v])=>`<button data-kind="${k}" class="${state.kind===k?'selected':''}" aria-pressed="${state.kind===k}" ${active?'disabled':''}>${v}</button>`).join('')}</div><div class="timer-ring" id="timer-ring"><div class="timer-inner"><span class="timer-label">${state.kind==='focus'?'지금은, 한 가지 일에 집중할 시간.':'잠시 쉬어 가도 괜찮아요.'}</span><div class="timer-time" id="timer-time">25:00</div><span class="timer-status" id="timer-status">시작할 준비가 되었어요</span></div></div><div class="timer-task">${active?esc(active.task_title):state.kind==='focus'?(selected?esc(selected.title):'할 일을 먼저 만들어 주세요'):'잠시 화면에서 눈을 떼고 쉬어 보세요'}</div><div class="row timer-actions">${active?`<button class="primary" data-action="${active.status==='paused'?'resume':'pause'}">${active.status==='paused'?'이어서 시작':'일시정지'}</button><button class="ghost" data-action="cancel">중단</button>`:`<button class="primary" data-action="start" ${state.kind==='focus'&&!selected?'disabled':''}>${labels[state.kind]} 시작</button>`}</div><div class="timer-footer">집중 ${settings.focus_minutes}분 · 짧은 휴식 ${settings.short_minutes}분 · ${settings.long_every}회마다 긴 휴식<br>완료한 집중 ${completedFocus}회 · 다음 ${settings.long_every-(completedFocus%settings.long_every)}회 후 긴 휴식</div></section><div class="stack"><section class="card"><div class="section-head"><h2>이번에 집중할 일</h2><button class="small" data-action="add-task">＋ 할 일</button></div>${available.length?available.map(t=>taskRow(t)).join(''):'<div class="empty"><strong>첫 번째 할 일을 정해 볼까요?</strong>“알고리즘 문제 2개 풀기”처럼<br>작고 구체적인 일이 좋아요.</div>'}<div class="row between" style="margin-top:20px"><small>실제 완료 / 예상 Pomodoro</small><button class="ghost small" data-view="tasks">전체 보기 →</button></div></section><section class="card today-summary"><h2>오늘 쌓인 집중</h2><div class="summary-line"><span>집중 시간</span><strong>${minutes(state.stats?.seconds||0)}</strong></div><div class="summary-line"><span>완료한 Pomodoro</span><strong>${state.stats?.completed||0}회</strong></div><div class="summary-line"><span>평균 집중도</span><strong>${state.stats?.averageMood?.toFixed(1)||'—'} / 5</strong></div></section></div></div><div class="focus-note row between wrap"><span>완료 후 짧은 회고 → 휴식 → 다음 집중</span><button class="ghost small" data-action="notifications">종료 알림 켜기 ↗</button></div><section class="card recent"><div class="section-head"><h2>최근 집중 기록</h2><button class="ghost small" data-view="stats">모든 기록 →</button></div>${sessionRows(recent.filter(s=>s.kind==='focus').slice(0,4))}</section>`;
}
function sessionRows(rows) {
  if(!rows.length)return '<div class="empty">첫 집중을 마치면 이곳에 기록이 쌓여요.</div>';
  return rows.map(s=>`<div class="session-row"><span class="session-symbol">${s.status==='completed'?'✓':'Ⅱ'}</span><div class="grow"><strong>${esc(s.task_title)}</strong><p>${esc(s.project_title)} · ${timeLabel(s.ended_at)} · ${s.status==='completed'?'완료':'중단'}${s.mood?` · 집중도 ${s.mood}/5`:''}</p>${s.note?`<p>${esc(s.note)}</p>`:''}</div><span class="duration">${minutes(s.elapsed_seconds)}</span><button class="ghost small" data-reflect="${s.id}">${s.mood||s.note?'회고 수정':'회고'}</button></div>`).join('');
}
function tasksView() {
  return `<div class="row between wrap" style="margin-bottom:24px"><span class="muted">${state.data.projects.length}개 프로젝트 · ${state.data.tasks.filter(t=>!t.done).length}개 진행 중인 할 일</span><div class="row"><button data-action="add-project">＋ 프로젝트</button><button class="primary" data-action="add-task">＋ 할 일</button></div></div>${state.data.projects.length?state.data.projects.map(p=>{const ts=state.data.tasks.filter(t=>t.project_id===p.id);return `<section class="card project-block"><div class="section-head"><div class="project-head" style="border-color:${esc(p.color)}"><h2>${esc(p.title)}</h2><small>${ts.filter(t=>t.done).length} / ${ts.length}개 할 일 완료</small></div><button class="ghost small" data-edit-project="${p.id}">프로젝트 편집</button></div>${ts.length?ts.map(t=>taskRow(t,true)).join(''):'<div class="empty">프로젝트의 첫 할 일을 추가해 주세요.</div>'}</section>`;}).join(''):'<section class="card empty"><strong>하고 싶은 일들을 프로젝트로 묶어 보세요.</strong>예: 전공 공부, 사이드 프로젝트, 독서</section>'}`;
}
function statsView() {
  const s=state.stats;if(!s)return '<div class="loading">통계를 불러오는 중…</div>';
  return `<div class="section-head"><div class="period-controls">${[['day','일'],['week','주'],['month','월']].map(([p,l])=>`<button data-period="${p}" class="${state.period===p?'active':''}">${l}</button>`).join('')}<input type="date" id="stats-date" value="${state.date}" aria-label="통계 기준 날짜"></div><small>${s.startDate} — ${s.endDate} · 한국 시간</small></div>${metricCards(s,'선택 기간')}<div class="grid2"><section class="card"><h2>집중의 흐름</h2>${chart(s)}<p class="muted" style="font-size:.8rem;margin:20px 0 0">중단 세션의 실제 집중 시간도 포함합니다.</p></section><section class="card"><h2>어디에 집중했나요?</h2>${projectStats(s)}</section></div><section class="card recent"><div class="section-head"><h2>예상 vs 실제 Pomodoro</h2><small>할 일별 전체 누적 · 완료한 집중 기준</small></div><div class="table-wrap"><table><thead><tr><th>할 일</th><th>예상</th><th>실제</th><th>차이</th></tr></thead><tbody>${s.tasks.map(t=>`<tr><td>${esc(t.title)}<br><small>${esc(t.project_title)}</small></td><td>${t.estimated}회</td><td>${t.actual}회</td><td>${t.actual-t.estimated>0?'+':''}${t.actual-t.estimated}회</td></tr>`).join('')}</tbody></table>${!s.tasks.length?'<div class="empty">할 일을 만들면 예상과 실제를 비교할 수 있어요.</div>':''}</div></section><section class="card recent"><div class="section-head"><h2>기간 내 집중 기록</h2><small>중단 ${s.cancelled}회 · 회고를 눌러 수정/삭제</small></div><div class="history-list">${sessionRows(s.sessions)}</div></section>`;
}
function chart(s) {
  const max=Math.max(...s.days.map(d=>d.seconds),60);
  return `<div class="chart-scroll"><div class="bars" role="img" aria-label="날짜별 집중 시간: ${s.days.map(d=>`${d.date} ${minutes(d.seconds)}`).join(', ')}">${s.days.map((d,i)=>`<div class="bar-column" title="${d.date}: ${minutes(d.seconds)}"><div class="bar" style="height:${Math.max(1,d.seconds/max*85)}%"></div><span class="bar-label">${s.days.length<10?d.date.slice(5).replace('-','/'):i%5===0?d.date.slice(8):'·'}</span></div>`).join('')}</div></div>`;
}
function projectStats(s) { return s.projects.length?s.projects.map(p=>`<div class="project-stat"><div class="row between"><span>${esc(p.title)}</span><strong>${minutes(p.seconds)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${s.seconds?p.seconds/s.seconds*100:0}%;background:${esc(p.color)}"></div></div></div>`).join(''):'<div class="empty">아직 이 기간의 집중 기록이 없어요.</div>'; }
function reviewView() {
  const w=state.weekly,s=state.stats;if(!w||!s)return '';
  return `<div class="section-head"><div><h2>${s.startDate} — ${s.endDate}</h2><small>월요일부터 일요일까지 · 한국 시간</small></div><input type="date" id="review-date" value="${state.date}" aria-label="회고할 주의 날짜" style="max-width:175px"></div>${metricCards(s,'이번 주')}<div class="grid2"><section class="card"><h2>이번 주의 발자취</h2>${projectStats(s)}<h3 style="margin-top:30px">자주 만난 방해 요소</h3>${Object.entries(s.distractions).length?Object.entries(s.distractions).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<p class="row between"><span>${esc(k)}</span><span class="badge">${v}회</span></p>`).join(''):'<p class="muted">회고에 남긴 방해 요소가 없어요.</p>'}<div class="note">가장 오래 한 일뿐 아니라, 시작하기 어려웠지만 해낸 일도 떠올려 보세요.</div></section><section class="card"><form id="weekly-form"><label>이번 주 잘한 점<textarea name="wins" maxlength="2000" placeholder="작은 성취도 괜찮아요.">${esc(w.wins)}</textarea></label><label>어려웠던 점<textarea name="challenges" maxlength="2000" placeholder="집중을 방해한 상황은 무엇이었나요?">${esc(w.challenges)}</textarea></label><label>다음 주에 시도할 것<textarea name="next_week" maxlength="2000" placeholder="실천할 수 있는 한 가지를 정해 보세요.">${esc(w.next_week)}</textarea></label><div class="row between"><small>${w.updated_at?`${timeLabel(w.updated_at)} 저장됨`:'아직 저장하지 않았어요'}</small><button class="primary">주간 회고 저장</button></div></form></section></div>`;
}
function settingsView() {
  const s=state.data.settings;
  return `<div class="settings-grid"><section class="card"><h2>나의 타이머</h2><p class="muted">변경한 시간은 다음 세션부터 적용됩니다.</p><form id="settings-form"><div class="grid2"><label>집중 시간 (분)<input type="number" name="focus_minutes" min="1" max="180" value="${s.focus_minutes}" required></label><label>짧은 휴식 (분)<input type="number" name="short_minutes" min="1" max="60" value="${s.short_minutes}" required></label><label>긴 휴식 (분)<input type="number" name="long_minutes" min="1" max="120" value="${s.long_minutes}" required></label><label>긴 휴식 간격 (집중 횟수)<input type="number" name="long_every" min="2" max="12" value="${s.long_every}" required></label></div><button class="primary">타이머 설정 저장</button></form></section><div class="stack"><section class="card"><h2>브라우저 알림</h2><p class="muted">${!('Notification' in window)?'이 브라우저에서는 알림을 지원하지 않습니다.':Notification.permission==='granted'?'종료 알림이 허용되어 있어요.':Notification.permission==='denied'?'알림이 차단되어 있어요. 브라우저의 사이트 설정에서 허용해 주세요.':'집중과 휴식이 끝날 때 알려드릴게요.'}</p><button data-action="notifications">알림 권한 요청</button><p class="muted" style="font-size:.8rem;margin-top:15px;margin-bottom:0">페이지가 열려 있을 때 동작합니다. 브라우저 종료나 절전 중에는 즉시 알릴 수 없습니다.</p></section><section class="card"><h2>내 데이터 보관하기</h2><p class="muted">프로젝트, 할 일, 세션, 회고와 설정을 JSON 파일로 내려받습니다.</p><button data-action="export">데이터 내보내기 ↓</button></section></div><section class="card danger-zone"><h2>데이터 초기화</h2><p class="muted">모든 프로젝트, 할 일, 기록, 회고를 삭제합니다. 계정과 타이머 설정은 유지됩니다.</p><button class="danger" data-action="clear-data">데이터 삭제</button></section><section class="card danger-zone"><h2>계정 삭제</h2><p class="muted">${esc(state.data.user.email)} 계정과 모든 기록을 삭제하고 로그아웃합니다.</p><button class="danger" data-action="delete-account">회원 탈퇴</button></section></div>`;
}
function guideView() {
  return `<section class="card guide"><div class="eyebrow">YOUR FIRST POMODORO</div><h2>집중과 휴식을 작은 단위로 나누는 방법</h2><p>포모도로는 정해진 시간 동안 하나의 일에 집중하고 짧게 쉬는 방식이에요. 큰 일을 시작하기 쉽게 나누고, 실제로 어디에 시간을 썼는지 돌아보는 데 활용해 보세요.</p>${[['할 일을 작게 정해요','프로젝트를 만들고, 한두 번의 집중으로 진행할 수 있는 할 일을 적으세요. 예상 Pomodoro 수는 정답이 아니라 다음 계획을 위한 가설이에요.'],['25분 동안 한 가지에 집중해요','기본은 25분이지만 설정에서 자신에게 맞게 조정할 수 있어요. 중간에 떠오르는 다른 일은 메모해 두고, 지금 고른 일로 돌아오세요.'],['끝나면 짧게 돌아봐요','무엇을 했는지, 집중은 어땠는지 한 줄로 남기세요. 꼭 작성할 필요는 없어요. 완료한 횟수와 실제 시간을 함께 보면 계획을 조절하기 쉬워져요.'],['휴식도 일정의 일부예요','집중 후에는 5분, 기본 4회마다 15분 휴식을 제안해요. 일어나 몸을 움직이거나 멀리 바라보세요. 휴식은 집중 시간에 더하지 않아요.'],['일주일에 한 번 기록을 읽어요','Weekly Review에서 잘한 점, 어려웠던 점, 다음 주에 시도할 일을 적어 보세요. 다른 사람의 시간보다 자신의 리듬을 기준으로 삼으세요.']].map(([title,body],i)=>`<div class="step"><span class="step-number">0${i+1}</span><div><h3>${title}</h3><p>${body}</p></div></div>`).join('')}<div class="note" style="margin-top:24px">타이머는 새로고침해도 복원됩니다. 다만 브라우저 알림은 페이지가 열려 있어야 하며, 컴퓨터가 절전 중이면 알림이 늦을 수 있어요. 통계는 한국 시간 기준으로 세션이 끝난 날에 기록됩니다.</div></section>`;
}

function showModal(title,content,onSubmit) {
  modal.innerHTML=`<h2 id="modal-title">${title}</h2>${content}`;
  if(!modal.open)modal.showModal();
  modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>modal.close());
  const form=modal.querySelector('form');
  if(form)form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('[type=submit]');if(button)button.disabled=true;
    try{await onSubmit(Object.fromEntries(new FormData(form)));modal.close();if(state.data)await refresh();}
    catch(error){const el=modal.querySelector('.error');if(el)el.textContent=error.message;else toast(error.message);}
    finally{if(button)button.disabled=false;}
  };
}
const actionsFooter=(label='저장')=>`<div class="error" role="alert"></div><div class="form-actions"><button type="button" data-close>취소</button><button class="primary" type="submit">${label}</button></div>`;
function projectModal(id) {
  const p=state.data.projects.find(p=>p.id===id);
  showModal(p?'프로젝트 편집':'새 프로젝트',`<p>관련된 할 일을 하나의 목표로 묶어요.</p><form><label>프로젝트 이름<input name="title" maxlength="120" required value="${esc(p?.title||'')}" placeholder="예: 컴퓨터 네트워크 공부"></label><label>프로젝트 색상<input name="color" type="color" value="${p?.color||'#7559ff'}"></label>${p?`<button type="button" class="danger" id="delete-project">프로젝트와 할 일 삭제</button>`:''}${actionsFooter()}</form>`,b=>api(p?`/projects/${p.id}`:'/projects',p?'PATCH':'POST',b));
  if(p)modal.querySelector('#delete-project').onclick=()=>confirmModal('프로젝트 삭제','프로젝트와 할 일을 삭제합니다. 기존 집중 기록은 이름과 함께 보존됩니다.',async()=>api(`/projects/${p.id}`,'DELETE',{}));
}
function taskModal(id) {
  if(!state.data.projects.length){projectModal();toast('먼저 프로젝트를 하나 만들어 주세요.');return;}
  const t=state.data.tasks.find(t=>t.id===id);
  showModal(t?'할 일 편집':'새 할 일',`<p>이번에 끝내고 싶은 구체적인 일을 적어 주세요.</p><form>${!t?`<label>프로젝트<select name="project_id">${state.data.projects.map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></label>`:''}<label>할 일<input name="title" maxlength="120" required value="${esc(t?.title||'')}" placeholder="예: TCP 혼잡 제어 정리"></label><label>예상 Pomodoro 횟수<input name="estimated" type="number" min="1" max="999" required value="${t?.estimated||1}"></label>${t?'<button type="button" class="danger" id="delete-task">이 할 일 삭제</button>':''}${actionsFooter()}</form>`,async b=>{const result=await api(t?`/tasks/${t.id}`:'/tasks',t?'PATCH':'POST',{...b,estimated:Number(b.estimated)});if(!t)state.selected=result.id;});
  if(t)modal.querySelector('#delete-task').onclick=()=>confirmModal('할 일 삭제','할 일을 삭제합니다. 기존 집중 기록은 보존됩니다.',async()=>api(`/tasks/${t.id}`,'DELETE',{}));
}
function confirmModal(title,description,action,password=false) {
  showModal(title,`<p>${description}</p><form>${password?'<label>현재 비밀번호<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>':''}${actionsFooter('확인')}</form>`,action);
}
function reflectionModal(s,justFinished=false) {
  showModal(justFinished?'한 번의 집중을 마쳤어요':'집중 회고',`<p>${esc(s.task_title)} · ${minutes(s.elapsed_seconds)}<br>짧게 남겨도 좋아요. 나중에 기록에서 다시 쓸 수 있어요.</p><form><fieldset style="border:0;padding:0;margin:0"><legend style="margin-bottom:10px">집중은 어땠나요?</legend><div class="mood-options">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="mood" value="${n}" ${s.mood===n?'checked':''}>${n}</label>`).join('')}</div><small>1 아쉬움 — 5 매우 좋음 · 선택 사항</small></fieldset><label>방해 요소<select name="distraction">${['','휴대폰','SNS','소음','졸림','기타'].map(v=>`<option value="${v}" ${s.distraction===v?'selected':''}>${v||'없음 / 선택하지 않음'}</option>`).join('')}</select></label><label>무엇을 했나요?<textarea name="note" maxlength="1000" placeholder="예: 흐름 제어와 혼잡 제어의 차이 정리">${esc(s.note)}</textarea></label>${!justFinished?'<button type="button" class="danger" id="delete-session">이 기록 삭제</button>':''}${actionsFooter('회고 저장')}</form>`,b=>api(`/sessions/${s.id}`,'PATCH',{...b,mood:b.mood?Number(b.mood):null}));
  if(!justFinished)modal.querySelector('#delete-session').onclick=()=>confirmModal('기록 삭제','이 세션과 회고를 삭제합니다. 통계에서도 제외되며 되돌릴 수 없습니다.',()=>api(`/sessions/${s.id}`,'DELETE',{}));
}
async function notify() {
  if(!('Notification' in window)){toast('이 브라우저는 알림을 지원하지 않습니다.');return;}
  const permission=await Notification.requestPermission();toast(permission==='granted'?'종료 알림이 켜졌어요.':'브라우저 사이트 설정에서 알림을 허용할 수 있어요.');if(state.view==='settings')renderApp();
}
function sendNotification(s) {
  if('Notification' in window&&Notification.permission==='granted')try{new Notification(`${labels[s.kind]} 시간이 끝났어요`,{body:s.kind==='focus'?'수고했어요. 잠시 쉬면서 짧은 회고를 남겨 보세요.':'다음 집중을 시작할 준비가 되었나요?',tag:s.id,icon:'/favicon.svg'});}catch{}
}
function tick() {
  if(!state.data)return;
  const active=state.data.active;
  const target=active?.target_seconds || state.data.settings[`${state.kind}_minutes`]*60;
  const elapsed=active?Math.min(target,active.elapsed_seconds+(active.status==='running'?Math.max(0,Math.floor((Date.now()+state.offset-active.running_since)/1000)):0)):0;
  const remaining=Math.max(0,target-elapsed), formatted=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  const display=document.querySelector('#timer-time');if(display)display.textContent=formatted;
  const ring=document.querySelector('#timer-ring');if(ring)ring.style.setProperty('--progress',`${elapsed/target*100}%`);
  const status=document.querySelector('#timer-status');if(status)status.textContent=active?(active.status==='paused'?'잠시 멈췄어요':'차근차근, 나의 속도로'):'시작할 준비가 되었어요';
  document.title=active?`${formatted} · ${labels[active.kind]} | Focus Log`:'Focus Log · 나의 집중 기록';
  if(active&&remaining===0&&!state.finishing)finishActive(active);
}
async function finishActive(active) {
  state.finishing=true;
  try{
    const completed=await api(`/sessions/${active.id}/finish`,'POST',{});
    state.data=await api('/bootstrap');state.offset=state.data.serverNow-Date.now();
    state.kind=active.kind==='focus'?(state.data.completedFocus%state.data.settings.long_every===0?'long':'short'):'focus';
    // A completed timer must not erase an in-progress Weekly Review or settings form.
    if(['focus','stats'].includes(state.view))await refresh();
    sendNotification(completed);
    if(completed.kind==='focus'&&state.view==='focus'&&!modal.open)reflectionModal(completed,true);else toast(`${labels[completed.kind]} 완료! ${completed.kind==='focus'?'기록에서 회고를 남길 수 있어요.':''}`);
  }catch(e){toast(`종료 기록 확인 중: ${e.message}`);await new Promise(r=>setTimeout(r,5000));}
  finally{state.finishing=false;}
}

root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled||!state.data)return;
  try{
    if(button.dataset.view){state.view=button.dataset.view;await refresh();window.scrollTo(0,0);return;}
    if(button.dataset.kind){state.kind=button.dataset.kind;renderApp();return;}
    if(button.dataset.selectTask){const task=state.data.tasks.find(t=>t.id===button.dataset.selectTask);if(task.done){toast('완료 체크를 해제하면 다시 집중할 수 있어요.');return;}if(state.data.active){toast('진행 중인 세션을 먼저 끝내 주세요.');return;}state.selected=task.id;state.kind='focus';state.view='focus';await refresh();return;}
    if(button.dataset.editTask){taskModal(button.dataset.editTask);return;}
    if(button.dataset.editProject){projectModal(button.dataset.editProject);return;}
    if(button.dataset.reflect){const s=[...state.data.recent,...(state.stats?.sessions||[])].find(s=>s.id===button.dataset.reflect);if(s)reflectionModal(s);return;}
    if(button.dataset.period){state.period=button.dataset.period;await refresh();return;}
    const action=button.dataset.action;
    if(action==='add-project')return projectModal();
    if(action==='add-task')return taskModal();
    if(action==='notifications')return await notify();
    if(action==='logout'){await api('/auth/logout','POST',{});renderAuth();return;}
    if(action==='export'){
      const data=await api('/data/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`focus-log-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('데이터 파일을 내려받았어요.');return;
    }
    if(action==='clear-data'||action==='delete-account'){
      const account=action==='delete-account';confirmModal(account?'정말 탈퇴하시겠어요?':'모든 기록을 삭제할까요?','이 작업은 되돌릴 수 없습니다. 필요한 데이터는 먼저 내보내기로 보관하세요.',async b=>{await api(account?'/account':'/data','DELETE',b);if(account){modal.close();renderAuth();}else toast('데이터를 삭제했습니다.');},true);return;
    }
    if(action==='cancel')return confirmModal('타이머를 중단할까요?','현재까지의 집중 시간은 중단 기록으로 남고, 완료 횟수에는 포함되지 않습니다.',async()=>{
      const ended=await api(`/sessions/${state.data.active.id}/cancel`,'POST',{});toast(`${minutes(ended.elapsed_seconds)} 기록을 저장했어요.`);
    });
    if(['start','pause','resume'].includes(action)){
      if(state.busy)return;state.busy=true;button.disabled=true;
      try{if(action==='start')await api('/sessions','POST',{kind:state.kind,task_id:state.selected});else await api(`/sessions/${state.data.active.id}/${action}`,'POST',{});await refresh();}
      finally{state.busy=false;button.disabled=false;}
    }
  }catch(e){toast(e.message);if(e.status===401)renderAuth();}
});
root.addEventListener('change',async event=>{
  const el=event.target;
  try{
    if(el.dataset.taskDone){await api(`/tasks/${el.dataset.taskDone}`,'PATCH',{done:el.checked});await refresh();}
    if(['stats-date','review-date'].includes(el.id)&&el.value){state.date=el.value;await refresh();}
  }catch(e){toast(e.message);if(el.dataset.taskDone)el.checked=!el.checked;}
});
root.addEventListener('submit',async event=>{
  const form=event.target;if(!['weekly-form','settings-form'].includes(form.id))return;event.preventDefault();
  const b=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type=submit],button.primary');button.disabled=true;
  try{
    if(form.id==='weekly-form')await api(`/weekly-review?date=${state.date}`,'PUT',b);
    else await api('/settings','PUT',Object.fromEntries(Object.entries(b).map(([k,v])=>[k,Number(v)])));
    toast('저장했어요.');await refresh();
  }catch(e){toast(e.message);button.disabled=false;}
});
setInterval(tick,250);
// Poll only timer state: never replace a form while the user is typing.
setInterval(async()=>{
  if(!state.data||state.finishing||document.hidden)return;
  try{
    const next=await api('/bootstrap'), previous=state.data.active;state.offset=next.serverNow-Date.now();
    if(previous&&!next.active){const ended=next.recent.find(s=>s.id===previous.id);state.data=next;if(state.view==='focus')await refresh();if(ended?.status==='completed'){state.kind=ended.kind==='focus'?(next.completedFocus%next.settings.long_every===0?'long':'short'):'focus';if(state.view==='focus')renderApp();sendNotification(ended);if(ended.kind==='focus'&&state.view==='focus'&&!modal.open)reflectionModal(ended,true);else toast(`${labels[ended.kind]} 시간이 끝났어요.`);}}
    else if(JSON.stringify(previous)!==JSON.stringify(next.active)){state.data.active=next.active;if(next.active)state.kind=next.active.kind;if(state.view==='focus')renderApp();}
  }catch(e){if(e.status===401){modal.close();renderAuth();}}
},15000);
try{await refresh();}catch(e){if(e.status===401)renderAuth();else{root.innerHTML='<div class="loading"><h1>서버에 연결하지 못했어요.</h1><p>서버 실행 상태를 확인한 뒤 새로고침해 주세요.</p></div>';toast(e.message);}}
