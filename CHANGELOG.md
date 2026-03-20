# 변경 이력

이 문서는 Supermailer 저장소의 주요 변경 사항을 기록합니다.

## [Unreleased]

### 추가됨

- 구독자, 템플릿, 라우팅, 발송, 리포팅을 포함하는 관리자 콘솔 UI 추가
- Hono 기반 관리자 API 및 인증 흐름 추가
- BullMQ 기반 메일 워커 추가
- Postgres/Redis 기반 영속성 및 큐 처리 구성 추가
- 배달 이벤트 수집 및 결과 웹훅 처리 기능 추가
- Playwright 기반 E2E 테스트 스위트 추가
- 앱/도메인/저장소 단위 통합 테스트 추가
- 프로덕션 배포용 `Dockerfile.management-console`, `Dockerfile.mail-worker`, `compose.production.yml`, `.dockerignore` 추가
- 워크스페이스 전체 `pnpm build` 및 앱/공유 패키지 JS 빌드 산출물 경로 추가
- 운영용 환경 변수 템플릿 `.env.production.example` 추가

### 개선됨

- 관리자 발송 상세 화면에서 개별 발송의 아웃바운드 결과 웹훅 상태를 조회할 수 있도록 개선
- 메일 워커에 실제 HTTP `/health` 엔드포인트를 추가하여 운영 점검 절차를 명확하게 개선
- 설치 문서를 실제 포트/명령어 기준으로 정리하고 한국어로 상세화
- 리포팅 E2E 테스트에서 고정 시간 대기(`waitForTimeout`)를 제거해 안정성을 개선
- 관리 콘솔 서버가 빌드된 SPA 정적 파일 제공 및 non-API HTML 경로를 `index.html`로 fallback하도록 개선
- 관리 콘솔/메일 워커 호스트 바인딩 설정(`MANAGEMENT_CONSOLE_HOST`, `MAIL_WORKER_HOST`)을 도입해 컨테이너 기본 접근성을 개선

### 수정됨

- 잘못 남아 있던 패치 산출물(`.orig`, `.patch`, `.rej`) 제거
- `docker compose` 명령 문서화 불일치 수정
- 문서와 실제 저장소 스크립트/상태 확인 절차 간 불일치 수정
- 운영 문서를 앱 2개 컨테이너(외부 Postgres/Redis/SMTP) 기준으로 정렬하고 로컬 Docker 스택과 역할을 분리
- 프로덕션 ESM 런타임에서 실패하던 extensionless import 경로를 빌드 단계에서 `.js`로 정규화해 `pnpm --filter @supermailer/management-console start` 및 `pnpm --filter @supermailer/mail-worker start`가 컴파일 산출물로 실행되도록 수정
- 관리 콘솔 프로덕션 정적 파일 경로를 실제 Vite 산출물(`apps/management-console/dist/*`) 기준으로 정렬해 서버 static root, start 경로, Docker 실행 가정을 일치시킴
- 운영 문서에 실제 컨테이너 빌드/기동 절차, smoke test 순서, 그리고 프로덕션 UI 접근 포트(`3000`)를 반영해 배포 런북 정확도를 보완
