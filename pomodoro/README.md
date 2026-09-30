# Focus Log — 포모도로 V1

내 PC에서 실행하며 웹 개발을 배우는 독립 프로젝트입니다. **현재 UI는 기능 검증용 임시안이며, 최종 디자인은 Figma 후보 검토 후 적용합니다.**

## 실행

Node.js **24.15 이상**이 필요합니다. 이 작업 환경의 Node.js 24.19에서 실행과 테스트를 확인했습니다. 외부 npm 패키지가 없어 `npm install`은 필요하지 않습니다.

```powershell
cd "C:\Users\Dev\.codex\.chatgpt-projects\g-p-6ab9f02858188191a7a63e4af004f7bc\pomodoro"
npm start
```

브라우저에서 http://127.0.0.1:3000 을 열고 회원가입합니다. 서버를 종료하려면 해당 터미널에서 Ctrl+C를 누릅니다. 포트가 이미 사용 중이면 실행 중인 서버를 사용하거나 `$env:PORT=3001`로 다른 포트를 지정합니다. 포트를 변경했다면 접속 주소도 변경합니다.

```powershell
npm test        # 메모리 DB를 사용하는 독립 테스트, 실제 기록에 영향 없음
npm run dev     # 서버 코드 변경 시 자동 재시작
```

## 구현된 범위

- 이메일/비밀번호 회원가입, 로그인, 로그아웃, 비밀번호 해시, 7일 쿠키 세션
- 프로젝트/할 일 생성·수정·삭제, 할 일 완료, 예상 횟수
- 집중/짧은 휴식/긴 휴식, 시간 설정, 일시정지/재개/중단, 서버 상태 복원
- 집중 종료 후 짧은 회고, 기록 수정·삭제
- 일/주/월 시간·횟수·집중도·프로젝트 집계, 예상 대비 누적 실제 횟수
- 주간 회고 저장, 브라우저 알림 권한 요청
- JSON 내보내기, 비밀번호 재확인 후 데이터 초기화/회원 탈퇴
- 한국어 가이드와 반응형 화면

브라우저가 닫혀 있으면 알림을 즉시 전달하지 않습니다. 다시 접속하면 서버가 지난 세션을 완료 처리합니다. 푸시 알림이나 백그라운드 작업 큐는 V1에 없습니다. 게임 보상/꾸미기는 아직 구현하지 않았습니다.

## 파일 지도

```text
pomodoro/
├─ public/                 프론트엔드: 브라우저가 받는 파일
│  ├─ index.html           첫 HTML 문서
│  ├─ app.js               화면, 이벤트, API 호출, 화면 상태
│  ├─ style.css            레이아웃과 색상 (디자인 검토 전 임시안)
│  └─ favicon.svg          브라우저 탭 아이콘
├─ server/                 백엔드: 서버에서만 실행
│  ├─ index.js             서버 시작과 환경 설정
│  ├─ app.js               HTTP/REST 경로, 권한 검사, 입력 검증
│  ├─ auth.js              비밀번호 해시와 로그인 세션
│  ├─ db.js                SQLite 연결과 트랜잭션
│  ├─ schema.sql           관계형 DB 구조
│  └─ domain.js            시간 계산과 통계 규칙
├─ tests/app.test.js       API/인증/타이머/통계 통합 테스트
├─ data/focus.sqlite       실행 시 생성되는 실제 데이터 (Git 제외)
├─ docs/ARCHITECTURE.md    구조·DB·상태관리 설명
├─ docs/API.md             REST API 명세
├─ PLAN.md                 범위·화면 흐름·개발 순서·확장 계획
└─ package.json           실행 명령, Node 버전
```

## 학습 순서

1. `public/index.html`에서 HTML, CSS, JavaScript가 어떻게 연결되는지 확인합니다.
2. `public/app.js`의 `api()`와 `start` 동작을 읽고 네트워크 탭에서 요청을 확인합니다.
3. `server/app.js`의 `POST /api/sessions`가 요청을 검증하는 과정을 읽습니다.
4. `server/schema.sql`의 `users → projects → tasks → focus_sessions` 관계를 따라갑니다.
5. `server/domain.js`의 순수 계산 함수와 테스트를 함께 읽습니다.
6. 기능 하나를 고친 후 테스트를 실행하고 브라우저에서 결과를 확인합니다.

## 데이터 관리와 운영 범위

SQLite 파일은 브라우저가 아닌 서버 PC에 있습니다. 브라우저를 바꾸어도 같은 서버와 계정에 로그인하면 기록을 볼 수 있습니다. 다른 PC에서 별도로 서버를 실행하면 다른 DB입니다. JSON 내보내기는 열람/이동용이며 V1에 가져오기 기능은 없습니다.

파일 백업은 서버를 정상 종료한 뒤 `data` 폴더 전체를 복사하세요. 복원도 서버를 종료한 상태에서 수행합니다. 실행 중 DB 파일 하나만 복사하면 WAL의 최신 기록이 누락될 수 있습니다.

기본 서버는 `127.0.0.1`에만 바인딩합니다. 이는 **로컬 학습용 MVP**이며 공개 배포를 끝낸 상태가 아닙니다. 일반 공개 전에 이메일 확인/비밀번호 재설정, 공유 저장소 기반 로그인 시도 제한, HTTPS 프록시, 운영 백업/복원, 개인정보 처리 정책을 별도로 구현해야 합니다. Node 내장 SQLite는 해당 버전에서 release candidate이며, 단일 프로세스의 작은 서비스에 맞춘 선택입니다. 대규모 운영에서는 비동기 DB 드라이버와 PostgreSQL 전환 등을 검토합니다.

환경 변수: `HOST`, `PORT`, `APP_ORIGIN`(브라우저가 접속하는 정확한 origin), `DB_PATH`, `NODE_ENV`. production 모드에서는 HTTPS APP_ORIGIN이 필수이며 쿠키에 Secure가 추가됩니다. 비밀키가 필요한 외부 서비스는 사용하지 않습니다.

## 디자인 검토

[Figma 디자인 후보 A/B/C](https://www.figma.com/design/vkjcUlrnlPUmcJa8SCzvGt)

사용자가 후보를 선택한 뒤 이 프로젝트의 CSS와 화면 구성을 변경합니다. 세 후보는 V1의 정보 배치 비교용이며, 제품에 없는 보상 기능을 완성된 기능으로 표현하지 않습니다.

## 참고 문서

- [Node.js 내장 SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Node.js 암호화 API](https://nodejs.org/api/crypto.html)

별도 웹 프레임워크를 쓰지 않아 HTTP와 상태 흐름을 직접 볼 수 있습니다. 그 대신 라우팅, 검증, 쿠키 처리를 직접 작성했으므로 관련 테스트와 운영 보강이 중요합니다. 기능이 커지면 React 같은 UI 프레임워크와 백엔드 라우터를 단계적으로 도입할 수 있습니다.
