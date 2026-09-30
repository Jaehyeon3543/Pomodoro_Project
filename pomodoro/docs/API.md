# REST API V1

기본 주소: `http://127.0.0.1:3000/api`. 데이터 형식: JSON.

변경 요청은 `Content-Type: application/json` 및 `X-Focus-App: 1` 헤더가 필요합니다. 브라우저는 동일 출처 요청에 로그인 쿠키를 자동 전송합니다. 가입/로그인을 제외한 모든 API는 인증이 필요합니다. 요청 본문은 최대 32 KiB입니다.

오류: `{ "error": "사용자에게 표시할 한국어 메시지" }`. 400 잘못된 입력, 401 로그인 필요/실패, 403 출처·비밀번호 재확인 실패, 404 없음 또는 다른 사용자의 항목, 409 충돌, 413 크기 초과, 415 형식 오류, 429 로그인 시도 제한, 500 서버 오류.

| 메서드/경로 | 요청 | 성공 응답 |
|---|---|---|
| POST /auth/register | `{email,name,password}` 이름 1~40자, 비밀번호 10~128자 | 201 `{id,email,name}`, 로그인 쿠키 |
| POST /auth/login | `{email,password}` | 200 사용자, 로그인 쿠키 |
| POST /auth/logout | `{}` | 200 `{ok:true}`, 쿠키 만료 |
| GET /bootstrap | 없음 | user, settings, projects, tasks, active, recent, completedFocus, serverNow |
| PUT /settings | `{focus_minutes,short_minutes,long_minutes,long_every}` | 설정 객체 |
| POST /projects | `{title,color?}` 제목 1~120자, 색상 #RRGGBB | 201 프로젝트 |
| PATCH /projects/:id | `{title?,color?}` | `{ok:true}` |
| DELETE /projects/:id | `{}` | `{ok:true}`, 소속 할 일 삭제/과거 기록 유지 |
| POST /tasks | `{project_id,title,estimated}` 예상 1~999회 | 201 할 일 |
| PATCH /tasks/:id | `{title?,estimated?,done?}` done은 boolean | `{ok:true}` |
| DELETE /tasks/:id | `{}` | `{ok:true}`, 과거 기록 유지 |
| POST /sessions | `{kind?,task_id?}` kind=focus/short/long, focus는 task_id 필수 | 201 세션 |
| POST /sessions/:id/pause | `{}` | 세션 |
| POST /sessions/:id/resume | `{}` | 세션 |
| POST /sessions/:id/finish | `{}` | 세션, 목표 시간 전에는 409 |
| POST /sessions/:id/cancel | `{}` | 중단 세션, 경과 시간 저장 |
| PATCH /sessions/:id | `{mood,distraction,note}` mood=null 또는 1~5, note 최대 1000자 | `{ok:true}` |
| DELETE /sessions/:id | `{}` | `{ok:true}`, 종료된 세션만 가능 |
| GET /stats?period=week&date=2026-09-28 | period=day/week/month, date=YYYY-MM-DD | 기간 범위, seconds, completed, cancelled, averageMood, days, projects, distractions, sessions, tasks |
| GET /weekly-review?date=2026-09-28 | 선택 날짜가 속한 주 | `{week_start,wins,challenges,next_week,updated_at?}` |
| PUT /weekly-review?date=2026-09-28 | `{wins,challenges,next_week}` 각각 최대 2000자 | 저장된 회고, 동일 주는 갱신 |
| GET /data/export | 없음 | version=1 JSON, 비밀번호/토큰 제외 |
| DELETE /data | `{password}` | `{ok:true}`, 계정과 설정 유지 |
| DELETE /account | `{password}` | `{ok:true}`, 계정 포함 전부 삭제 |

설정 범위: 집중 1~180분, 짧은 휴식 1~60분, 긴 휴식 1~120분, 긴 휴식 간격 2~12회. 방해 요소는 빈 문자열/휴대폰/SNS/소음/졸림/기타 중 하나입니다.

## 세션 예시

```json
{
  "id": "서버가 생성한 UUID",
  "task_id": "사용자가 소유한 할 일 UUID",
  "kind": "focus",
  "status": "running",
  "target_seconds": 1500,
  "elapsed_seconds": 0,
  "started_at": 1790557200000,
  "running_since": 1790557200000,
  "ended_at": null,
  "mood": null,
  "distraction": "",
  "note": ""
}
```

시각은 Unix epoch milliseconds입니다. 진행 중 조회에서는 elapsed_seconds가 마지막 일시정지까지의 누적 초이고, 화면은 running_since 이후 경과를 더합니다. 완료/중단 상태에서는 elapsed_seconds가 확정된 집중 시간입니다.

`GET /bootstrap`은 작은 V1의 초기 요청 횟수를 줄이기 위한 복합 조회입니다. 목록 전용 GET /projects 또는 GET /tasks는 따로 없으며 bootstrap을 사용합니다. 등록은 POST, 일부 수정은 PATCH, 설정·주간 회고 교체는 PUT, 제거는 DELETE를 사용합니다.

## 상태 전이

```text
새 세션 → running → paused → running
               ├─ 목표 도달 → completed
               └─ 중단 요청 → cancelled
paused ─ 중단 요청 → cancelled
```

종료된 세션에 pause/resume/finish/cancel을 다시 요청하면 변경하지 않고 기존 결과를 반환합니다. 인증된 API를 조회할 때 서버가 목표 시간 도달을 확인하여 완료로 전환할 수 있습니다. 진행 중인 할 일이나 프로젝트는 삭제할 수 없습니다.
