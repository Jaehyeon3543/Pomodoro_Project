# V2 협업 규칙

V1 학습을 마친 뒤에만 V2 개발을 시작한다. 현재 브랜치 생성은 작업 공간을 분리하기 위한 준비이며 V2 기능 코드는 포함하지 않는다.

## 브랜치

- `main`: 검증된 V1과 최종 통합본. 직접 기능 개발 금지.
- `v2/integration`: V2 통합 및 전체 테스트 전용.
- `v2/codex-progression`: Codex 작업 브랜치.
- `v2/claude-quests-room`: Claude 작업 브랜치.

## 담당 범위

### Codex

- EXP, Coin, Level 규칙
- Achievement 조건과 보상 원장
- DB 마이그레이션 및 중복 보상 방지
- 공통 REST API 연결과 최종 통합
- 인증·권한·기존 V1 회귀 테스트

### Claude

- Daily Quest와 Weekly Quest 규칙 및 화면
- Focus Room 성장 상태, 아이템 배치와 꾸미기 화면
- Quest/Room 전용 모듈과 테스트
- 해당 기능의 UX 문구와 빈 상태

## 충돌 방지

- Claude는 Quest/Room 전용 새 모듈을 우선 사용하고, 공통 진입 파일 `pomodoro/server/app.js`, `pomodoro/public/app.js`, `pomodoro/server/schema.sql`은 직접 수정하지 않는다.
- 공통 진입 파일 연결과 스키마 합치기는 Codex가 `v2/integration`에서 담당한다.
- 작업 시작 전에 `git status`와 최근 커밋을 확인한다.
- 한 커밋에는 한 기능만 담고 커밋 메시지에 `codex:` 또는 `claude:` 접두사를 붙인다.
- 상대 작업을 되돌리거나 덮어쓰지 않는다. 충돌 시 두 구현의 의도를 확인한 뒤 통합 브랜치에서 해결한다.
- 실제 V2 개발을 시작할 때는 각 브랜치를 별도 Git worktree로 열어 같은 폴더를 공유하지 않는다.

## V2 시작 조건

- 사용자가 V1의 화면·API·DB·인증·상태관리 학습을 완료했다고 확인한다.
- V1 테스트가 Ubuntu에서 통과한다.
- V2 데이터 모델과 보상 규칙을 먼저 합의한다.
