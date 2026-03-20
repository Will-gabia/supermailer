# 설치 및 실행 가이드

이 문서는 Supermailer를 **로컬 환경에서 설치하고 실행하는 방법**을 설명합니다.

문서를 두 갈래로 나눠서 읽으면 더 편합니다.

- **운영자용**: 서비스를 빨리 띄우고 상태를 확인하고 싶은 경우
- **개발자용**: 로컬 개발, 앱별 실행, 테스트, 문제 해결까지 자세히 필요한 경우

---

## 빠른 시작 체크리스트

아래 항목을 위에서 아래로 그대로 실행하면 기본 부팅이 완료됩니다.

### 공통 준비

- [ ] Node.js 20 이상 설치
- [ ] pnpm 9 이상 설치
- [ ] Docker / Docker Compose 사용 가능 확인
  ```bash
  node -v
  pnpm -v
  docker --version
  docker compose version
  ```

### 첫 실행

- [ ] 의존성 설치
  ```bash
  pnpm install
  ```
- [ ] 환경 파일 생성
  ```bash
  cp .env.example .env
  ```
- [ ] 인프라 실행
  ```bash
  docker compose up -d
  ```
- [ ] 앱 실행
  ```bash
  pnpm dev
  ```
- [ ] 관리자 API 상태 확인
  ```bash
  curl -s http://localhost:3000/api/health
  ```
- [ ] 메일 워커 상태 확인
  ```bash
  curl -s http://localhost:3001/health
  ```
- [ ] 브라우저 접속
  - `http://localhost:4173/login`
  - 이메일: `admin@supermailer.local`
  - 비밀번호: `supermailer-admin`

---

## 운영자용 빠른 실행 가이드

운영자 관점에서는 “전체 스택이 올라오는가, 상태가 정상인가, 기본 로그인과 화면 진입이 되는가”가 가장 중요합니다.

### 1. 운영자용 최소 실행 절차

프로젝트 루트에서 아래만 순서대로 실행합니다.

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

### 2. 운영자용 상태 점검 절차

#### 관리자 API

```bash
curl -s http://localhost:3000/api/health
```

#### 메일 워커

```bash
curl -s http://localhost:3001/health
```

#### Docker 인프라

```bash
docker compose ps
```

#### 메일 수신 UI

- Mailpit: `http://localhost:8025`

### 3. 운영자용 접속 정보

- 관리자 UI: `http://localhost:4173/login`
- 관리자 계정
  - 이메일: `admin@supermailer.local`
  - 비밀번호: `supermailer-admin`

### 4. 운영자용 기본 확인 항목

로그인 후 아래 메뉴가 정상적으로 보이는지 확인합니다.

- Subscribers
- Templates
- Routing
- Sends
- Reporting

### 5. 운영자용 일일 점검 체크리스트

매일 운영 시작 전에 아래 항목을 빠르게 확인하면 기본 장애를 조기에 발견할 수 있습니다.

- [ ] Docker 인프라가 모두 살아 있는지 확인
  ```bash
  docker compose ps
  ```
- [ ] 관리자 API가 healthy 상태인지 확인
  ```bash
  curl -s http://localhost:3000/api/health
  ```
- [ ] 메일 워커가 healthy 상태인지 확인
  ```bash
  curl -s http://localhost:3001/health
  ```
- [ ] 관리자 콘솔 로그인 화면에 정상 진입되는지 확인
  - `http://localhost:4173/login`
- [ ] 로그인 후 주요 메뉴가 보이는지 확인
  - Subscribers
  - Templates
  - Routing
  - Sends
  - Reporting
- [ ] Mailpit UI에 접근 가능한지 확인
  - `http://localhost:8025`
- [ ] 필요 시 최근 인프라 로그를 확인
  ```bash
  docker compose logs postgres
  docker compose logs redis
  docker compose logs mailpit
  docker compose logs postfix-local
  ```

#### 이상 징후가 있을 때 우선 확인할 것

- API health 응답 실패 → `pnpm dev` 또는 관리 콘솔 API 프로세스 확인
- 워커 health 응답 실패 → `pnpm --filter @supermailer/mail-worker dev` 실행 여부 확인
- Mailpit 미접속 → `docker compose ps`와 `docker compose logs mailpit` 확인
- 로그인 화면 미노출 → 4173 포트 점유 여부와 UI 프로세스 상태 확인

### 6. 운영자용 장애 대응 체크리스트

장애가 발생했을 때는 아래 순서로 확인하면 원인 범위를 빨리 좁힐 수 있습니다.

- [ ] 관리자 API 응답 여부 확인
  ```bash
  curl -s http://localhost:3000/api/health
  ```
- [ ] 메일 워커 응답 여부 확인
  ```bash
  curl -s http://localhost:3001/health
  ```
- [ ] Docker 인프라 상태 확인
  ```bash
  docker compose ps
  ```
- [ ] 최근 인프라 로그 확인
  ```bash
  docker compose logs postgres
  docker compose logs redis
  docker compose logs mailpit
  docker compose logs postfix-local
  ```
- [ ] 관리자 UI 접속 여부 확인
  - `http://localhost:4173/login`
- [ ] Mailpit에서 실제 메일 수신 여부 확인
  - `http://localhost:8025`
- [ ] Sends 화면에서 발송 이력/이벤트/웹훅 상태가 보이는지 확인

#### 증상별 우선 대응

- **관리자 UI는 열리는데 데이터가 안 보임**
  - 관리자 API health 확인
  - 브라우저 새로고침 후 재확인
  - API 서버 프로세스 재시작 고려
- **발송이 queued에 머무름**
  - 메일 워커 health 확인
  - Redis/Postgres가 살아 있는지 확인
  - 워커 프로세스 재시작 고려
- **메일은 안 보이는데 발송은 진행됨**
  - Mailpit 접근 여부 확인
  - Postfix/Mailpit 로그 확인
- **관리자 로그인 자체가 안 됨**
  - `http://localhost:3000/api/health` 확인
  - `http://localhost:4173/login` 접속 확인
  - 포트 충돌 여부 확인

### 7. 운영자용 배포 전 체크리스트

배포 또는 운영 반영 전에 최소한 아래 항목은 확인하는 것을 권장합니다.

- [ ] `.env` 값이 대상 환경에 맞는지 확인
- [ ] 필요한 포트가 이미 점유되어 있지 않은지 확인
- [ ] Docker 인프라가 정상 상태인지 확인
  ```bash
  docker compose ps
  ```
- [ ] 관리자 API health 확인
  ```bash
  curl -s http://localhost:3000/api/health
  ```
- [ ] 메일 워커 health 확인
  ```bash
  curl -s http://localhost:3001/health
  ```
- [ ] 관리자 콘솔 로그인 가능 여부 확인
- [ ] 주요 메뉴(Subscribers, Templates, Routing, Sends, Reporting) 접근 가능 여부 확인
- [ ] Mailpit 또는 대상 SMTP 연동 환경에서 메일 수신 경로를 확인할 수 있는지 점검
- [ ] 가능하면 아래 검증 명령을 사전에 통과시켰는지 확인
  ```bash
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm test:integration
  pnpm playwright test
  ```

#### 배포 전 최소 수동 확인 권장 항목

- 개별 이메일 1건 발송
- 캠페인 큐잉 1건 확인
- Sends 화면에서 이력 조회 가능 여부 확인
- Reporting 화면에서 집계가 정상 표시되는지 확인

### 8. 운영자용 종료 절차

애플리케이션 종료:

- `pnpm dev`를 실행한 터미널에서 `Ctrl + C`

인프라 종료:

```bash
docker compose down
```

---

## 개발자용 상세 개발 가이드

이 아래부터는 개발자가 로컬 개발 환경을 세팅하고, 앱을 분리 실행하고, 테스트를 돌리고, 문제를 해결할 때 참고하는 상세 설명입니다.

## 1. 사전 준비

### 필수 도구

- **Node.js** 20 이상
- **pnpm** 9 이상
- **Docker Desktop** 또는 Docker Engine + Docker Compose CLI

### 권장 확인 명령어

```bash
node -v
pnpm -v
docker --version
docker compose version
```

정상이라면 각 도구의 버전이 출력되어야 합니다.

---

## 2. 저장소 의존성 설치

프로젝트 루트에서 아래 명령어를 실행합니다.

```bash
pnpm install
```

설치가 끝나면 워크스페이스 루트의 `node_modules`, 각 패키지의 링크, Playwright 실행 파일 등이 준비됩니다.

---

## 3. 환경 변수 파일 준비

`.env.example`을 복사해서 `.env` 파일을 만듭니다.

```bash
cp .env.example .env
```

기본값은 이미 로컬 개발에 맞춰져 있으므로 대부분 그대로 사용해도 됩니다.

### 기본 환경 변수

```env
NODE_ENV=development
MANAGEMENT_CONSOLE_PORT=3000
MAIL_WORKER_PORT=3001
POSTGRES_PORT=15432
REDIS_PORT=16379
DATABASE_URL=postgres://postgres:postgres@localhost:15432/supermailer
REDIS_URL=redis://localhost:16379
ADMIN_EMAIL=admin@supermailer.local
ADMIN_PASSWORD=supermailer-admin
AUTH_TOKEN_SECRET=supermailer-local-auth-secret
SESSION_COOKIE_NAME=supermailer_admin_session
SESSION_TTL_HOURS=24
MAILPIT_SMTP_HOST=localhost
MAILPIT_SMTP_PORT=1025
MAILPIT_UI_PORT=8025
SENDSMTP_HOST=localhost
SENDSMTP_PORT=2525
```

### 각 값의 의미

- `MANAGEMENT_CONSOLE_PORT=3000`
  - Hono 기반 관리자 API 서버 포트
- `MAIL_WORKER_PORT=3001`
  - 메일 워커 상태 확인 엔드포인트 포트
- `POSTGRES_PORT=15432`
  - 로컬 Postgres 호스트 포트
- `REDIS_PORT=16379`
  - 로컬 Redis 호스트 포트
- `DATABASE_URL`
  - 관리 콘솔/워커가 공통으로 사용하는 Postgres 연결 문자열
- `REDIS_URL`
  - BullMQ 큐 연결용 Redis 주소
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
  - 관리자 콘솔 로그인 기본 계정
- `MAILPIT_*`
  - 로컬 메일 수신 확인용 Mailpit 설정
- `SENDSMTP_*`
  - 로컬 SendSMTP/Postfix 라우팅 확인용 포트 정보

---

## 4. 로컬 인프라 실행

이 프로젝트는 애플리케이션 실행 전에 최소한 Postgres, Redis, Mailpit, Postfix 테스트 스택이 준비되어 있어야 합니다.

프로젝트 루트에서 실행:

```bash
docker compose up -d
```

### 실행되는 서비스

- `postgres`
- `redis`
- `mailpit`
- `postfix-local`

### 상태 확인

```bash
docker compose ps
```

컨테이너가 모두 `Up` 상태인지 확인합니다.

### 로그 확인 예시

```bash
docker compose logs postgres
docker compose logs redis
docker compose logs mailpit
docker compose logs postfix-local
```

---

## 5. 애플리케이션 실행 방법

Supermailer는 크게 세 가지 실행 단위가 있습니다.

1. 관리 콘솔 API 서버
2. 관리 콘솔 UI(Vite)
3. 메일 워커

### 가장 간단한 실행 방법: 전체 동시 실행

```bash
pnpm dev
```

이 명령은 Turbo를 통해 워크스페이스의 `dev` 스크립트를 병렬 실행합니다.

### 개별 실행 방법

필요에 따라 프로세스를 따로 띄울 수도 있습니다.

#### 1) 관리 콘솔 API 서버

```bash
pnpm --filter @supermailer/management-console dev:server
```

- 주소: `http://localhost:3000`
- 상태 확인: `http://localhost:3000/api/health`

#### 2) 관리 콘솔 UI

```bash
pnpm --filter @supermailer/management-console dev
```

- 주소: `http://localhost:4173`

#### 3) 메일 워커

```bash
pnpm --filter @supermailer/mail-worker dev
```

- 상태 확인: `http://localhost:3001/health`

---

## 6. 실행 후 상태 확인

### API 서버 상태

```bash
curl -s http://localhost:3000/api/health
```

예상 예시:

```json
{ "service": "management-console", "status": "healthy", "port": 3000 }
```

### 메일 워커 상태

```bash
curl -s http://localhost:3001/health
```

예상 예시:

```json
{
  "service": "mail-worker",
  "status": "healthy",
  "port": 3001,
  "queueAdapter": "bullmq-ready"
}
```

### 브라우저 접속

- 관리자 UI: `http://localhost:4173/login`
- Mailpit UI: `http://localhost:8025`

### 기본 관리자 계정

- 이메일: `admin@supermailer.local`
- 비밀번호: `supermailer-admin`

---

## 7. 처음 접속한 뒤 확인해 볼 것

관리자 콘솔에 로그인한 뒤 아래 메뉴를 순서대로 확인하면 전체 구성을 빠르게 파악할 수 있습니다.

1. **Subscribers**
   - 구독자 목록
   - 수동 등록
   - 구독 해지/하드 바운스 처리
2. **Templates**
   - 템플릿 생성
   - 제목/HTML 편집
   - 미리보기
3. **Routing**
   - SMTP 노드 등록
   - 도메인별 라우팅 규칙 구성
4. **Sends**
   - 개별 이메일 발송
   - 캠페인 수신자 큐잉
   - 발송 이벤트 이력 확인
   - 개별 발송 웹훅 상태 확인
5. **Reporting**
   - 상태 집계
   - SMTP 코드 분포
   - 노드별 이벤트 분포

---

## 8. 테스트 실행 방법

문서/코드 변경 후 기본적으로 아래 순서대로 확인하는 것을 권장합니다.

### 린트

```bash
pnpm lint
```

### 타입 검사

```bash
pnpm typecheck
```

### 단위 테스트

```bash
pnpm test
```

### 통합 테스트

```bash
pnpm test:integration
```

### E2E 테스트

```bash
pnpm e2e
```

또는 직접 Playwright를 실행할 수도 있습니다.

```bash
pnpm playwright test
```

### Playwright 참고 사항

`playwright.config.ts`는 E2E 실행 시 아래 두 서버를 자동으로 띄웁니다.

- `NODE_ENV=test pnpm --filter @supermailer/management-console dev:server`
- `pnpm --filter @supermailer/management-console dev`

즉, **관리 콘솔 API와 UI는 자동 부팅되지만 메일 워커는 자동 실행되지 않습니다.** 워커가 필요한 수동 검증은 별도로 실행해야 합니다.

---

## 9. 로컬 개발에서 자주 쓰는 명령어

### 전체 워크스페이스 명령

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm e2e
```

### 앱별 명령

```bash
pnpm --filter @supermailer/management-console dev
pnpm --filter @supermailer/management-console dev:server
pnpm --filter @supermailer/management-console test
pnpm --filter @supermailer/management-console test:integration

pnpm --filter @supermailer/mail-worker dev
pnpm --filter @supermailer/mail-worker test
pnpm --filter @supermailer/mail-worker test:integration
```

---

## 10. 종료 방법

### 애플리케이션 종료

- `pnpm dev` 또는 개별 `dev` 명령을 실행한 터미널에서 `Ctrl + C`

### Docker 인프라 종료

```bash
docker compose down
```

데이터 볼륨까지 제거하려면:

```bash
docker compose down -v
```

주의: `-v` 옵션은 Postgres 볼륨을 삭제하므로 로컬 데이터가 초기화됩니다.

---

## 11. 문제 해결

### 1) 포트 충돌이 발생하는 경우

예: 3000, 3001, 15432, 16379, 4173, 8025, 2525 중 하나가 이미 사용 중일 수 있습니다.

- `.env`에서 포트 값을 변경
- `docker compose down` 후 재실행
- 기존 프로세스 종료 후 다시 실행

### 2) 로그인은 되는데 화면이 비정상인 경우

아래를 순서대로 확인합니다.

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3001/health
```

그 다음 브라우저에서 `http://localhost:4173`를 새로고침합니다.

### 3) 메일 발송은 했는데 결과가 안 보이는 경우

다음을 점검합니다.

- 메일 워커가 실행 중인지
- `docker compose ps`에서 Redis/Postgres/Postfix/Mailpit가 살아있는지
- Sends 화면에서 이벤트 이력과 웹훅 상태가 보이는지
- Mailpit UI(`http://localhost:8025`)에서 메일이 수신되었는지

### 4) 테스트가 실패하는 경우

공유 로컬 데이터베이스 상태 때문에 테스트 데이터가 누적될 수 있습니다. 아래 절차를 먼저 시도합니다.

```bash
docker compose down -v
docker compose up -d
pnpm test:integration
pnpm e2e
```

---

## 12. 다음에 읽으면 좋은 문서

- 프로젝트 개요: [`README.md`](./README.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
- 에이전트 작업 규칙: [`AGENTS.md`](./AGENTS.md)
- 변경 이력: [`CHANGELOG.md`](./CHANGELOG.md)
