# 로컬 개발 및 검증 가이드

이 문서는 **개발자 기준의 로컬 설치/실행/테스트 절차**를 설명합니다.

중요:

- 이 문서의 Docker 사용 방식은 **로컬 개발/검증용**입니다.
- 실제 운영 환경에서는 Postgres, Redis, SMTP/Postfix를 별도 서버 또는 매니지드 서비스로 운영하는 구성이 더 자연스럽습니다.
- 실제 운영 배포 절차는 [`OPERATIONS.md`](./OPERATIONS.md)를 참고하세요.
- Postfix 연동 방식은 [`POSTFIX.md`](./POSTFIX.md)를 참고하세요.

---

## 빠른 시작 체크리스트

아래 순서대로 실행하면 로컬 개발 환경이 올라옵니다.

- [ ] Node.js 20 이상 설치
- [ ] pnpm 9 이상 설치
- [ ] Docker / Docker Compose 사용 가능 확인
  ```bash
  node -v
  pnpm -v
  docker --version
  docker compose version
  ```
- [ ] 의존성 설치
  ```bash
  pnpm install
  ```
- [ ] 환경 파일 생성
  ```bash
  cp .env.example .env
  ```
- [ ] 로컬 인프라 실행
  ```bash
  docker compose up -d
  ```
- [ ] 애플리케이션 실행
  ```bash
  pnpm dev
  ```
- [ ] 상태 확인
  ```bash
  curl -s http://localhost:3000/api/health
  curl -s http://localhost:3001/health
  docker compose ps
  ```
- [ ] 브라우저 접속
  - `http://localhost:4173/login`
  - 이메일: `admin@supermailer.local`
  - 비밀번호: `supermailer-admin`

---

## 1. 로컬 개발에서 Docker로 실행하는 항목

로컬에서는 아래 항목을 `docker compose`로 실행합니다.

- `postgres`
- `redis`
- `mailpit`
- `postfix-local`

이 구성은 어디까지나 **개발/테스트 편의를 위한 로컬 스택**입니다.

- `postgres`: 로컬 DB
- `redis`: BullMQ 큐 연결용
- `mailpit`: 테스트 메일 수신 확인용 UI/SMTP
- `postfix-local`: 로컬 Postfix relay 시뮬레이션

---

## 2. 사전 준비

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

---

## 3. 저장소 의존성 설치

```bash
pnpm install
```

설치가 끝나면 워크스페이스 루트 의존성과 각 앱/패키지 링크가 준비됩니다.

---

## 4. 환경 변수 파일 준비

```bash
cp .env.example .env
```

기본값은 로컬 개발에 맞춰져 있습니다.

### 기본 환경 변수

```env
NODE_ENV=development
MANAGEMENT_CONSOLE_PORT=3000
MANAGEMENT_CONSOLE_HOST=0.0.0.0
MAIL_WORKER_PORT=3001
MAIL_WORKER_HOST=0.0.0.0
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

### 의미 요약

- `DATABASE_URL`: 로컬 Postgres 연결 문자열
- `REDIS_URL`: 로컬 Redis 연결 문자열
- `MAILPIT_*`: 로컬 테스트 메일 수신용
- `SENDSMTP_*`: 로컬 Postfix relay 테스트용
- `*_HOST`: API/워커 바인딩 주소(컨테이너/원격 접근 시 `0.0.0.0` 권장)

---

## 5. 로컬 인프라 실행

```bash
docker compose up -d
```

### 상태 확인

```bash
docker compose ps
```

### 로그 확인

```bash
docker compose logs postgres
docker compose logs redis
docker compose logs mailpit
docker compose logs postfix-local
```

---

## 6. 애플리케이션 실행 방법

### 전체 실행

```bash
pnpm dev
```

### 개별 실행

관리 콘솔 API:

```bash
pnpm --filter @supermailer/management-console dev:server
```

관리 콘솔 UI:

```bash
pnpm --filter @supermailer/management-console dev
```

메일 워커:

```bash
pnpm --filter @supermailer/mail-worker dev
```

---

## 7. 로컬 실행 후 상태 확인

### 관리자 API

```bash
curl -s http://localhost:3000/api/health
```

### 메일 워커

```bash
curl -s http://localhost:3001/health
```

### 브라우저/UI

- 관리자 UI: `http://localhost:4173/login`
- Mailpit UI: `http://localhost:8025`

### 기본 관리자 계정

- 이메일: `admin@supermailer.local`
- 비밀번호: `supermailer-admin`

---

## 8. 테스트 실행 방법

### 전체 검증 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm playwright test
```

### E2E 참고 사항

`playwright.config.ts`는 E2E 실행 시 아래 두 서버를 자동 부팅합니다.

- `NODE_ENV=test pnpm --filter @supermailer/management-console dev:server`
- `pnpm --filter @supermailer/management-console dev`

메일 워커는 자동 실행되지 않으므로, 워커가 필요한 수동 검증 시 별도 실행해야 합니다.

---

## 9. 로컬 개발에서 자주 쓰는 명령어

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm e2e
```

앱별 예시:

```bash
pnpm --filter @supermailer/management-console dev
pnpm --filter @supermailer/management-console dev:server
pnpm --filter @supermailer/mail-worker dev
```

---

## 10. 로컬 종료 및 초기화

애플리케이션 종료:

- 각 개발 서버 터미널에서 `Ctrl + C`

인프라 종료:

```bash
docker compose down
```

볼륨까지 삭제:

```bash
docker compose down -v
```

---

## 11. 로컬 트러블슈팅

### 포트 충돌

- `.env` 포트 값 확인
- 기존 프로세스 종료
- `docker compose down` 후 재시작

### 로그인 화면은 열리는데 데이터가 비정상

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3001/health
```

### 메일 발송 테스트 결과가 안 보임

- 메일 워커 실행 여부 확인
- `docker compose ps` 확인
- Mailpit UI 확인
- Sends 화면 이력 확인

### 테스트 실패

```bash
docker compose down -v
docker compose up -d
pnpm test:integration
pnpm playwright test
```

---

## 12. 관련 문서

- 프로젝트 개요: [`README.md`](./README.md)
- 운영/배포 가이드: [`OPERATIONS.md`](./OPERATIONS.md)
- Postfix 연동 가이드: [`POSTFIX.md`](./POSTFIX.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
