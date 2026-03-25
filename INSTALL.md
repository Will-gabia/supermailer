# 로컬 개발 및 검증 가이드

이 문서는 **send-only Supermailer**의 로컬 설치, 실행, 검증 절차를 설명합니다.

중요:

- 로컬에서는 Docker로 Postgres, Redis, Mailpit, Postfix 테스트 스택을 올립니다.
- 실제 운영 절차는 [`OPERATIONS.md`](./OPERATIONS.md)를 참고하세요.
- Postfix 연동 방식은 [`POSTFIX.md`](./POSTFIX.md)를 참고하세요.
- 외부 클라이언트 연동 예시와 OpenAPI는 [`CLIENT_API.md`](./CLIENT_API.md), [`openapi.yaml`](./openapi.yaml)을 참고하세요.

---

## 1. 빠른 시작

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

상태 확인:

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3001/health
docker compose ps
```

브라우저 접속:

- UI: `http://localhost:4173/login`
- 이메일: `admin@supermailer.local`
- 비밀번호: `supermailer-admin`

---

## 2. 필수 도구

```bash
node -v
pnpm -v
docker --version
docker compose version
```

권장 버전:

- Node.js 20+
- pnpm 9+
- Docker / Docker Compose

---

## 3. 환경 변수 준비

```bash
cp .env.example .env
```

주요 기본값:

```env
NODE_ENV=development
MANAGEMENT_CONSOLE_PORT=3000
MANAGEMENT_CONSOLE_HOST=0.0.0.0
MAIL_WORKER_PORT=3001
MAIL_WORKER_HOST=0.0.0.0
DATABASE_URL=postgres://postgres:postgres@localhost:15432/supermailer
REDIS_URL=redis://localhost:16379
ADMIN_EMAIL=admin@supermailer.local
ADMIN_PASSWORD=supermailer-admin
AUTH_TOKEN_SECRET=supermailer-local-auth-secret
SENDSMTP_HOST=localhost
SENDSMTP_PORT=2525
```

---

## 4. 로컬 인프라 실행

```bash
docker compose up -d
docker compose ps
```

필요 시 로그 확인:

```bash
docker compose logs postgres
docker compose logs redis
docker compose logs mailpit
docker compose logs postfix-local
```

---

## 5. 애플리케이션 실행

### 전체 실행

```bash
pnpm dev
```

### 개별 실행

```bash
pnpm --filter @supermailer/management-console dev:server
pnpm --filter @supermailer/management-console dev
pnpm --filter @supermailer/mail-worker dev
```

---

## 6. 로컬 smoke test

### 6-1. 관리자 로그인

브라우저에서 `http://localhost:4173/login` 접속 후 로그인합니다.

### 6-2. API 키 발급

관리자 콘솔의 **API 키** 화면에서 `individual-send` 권한 키를 발급합니다.

### 6-3. Callback endpoint 등록

```bash
curl -s http://localhost:3000/api/callback-endpoints \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "label": "local-webhook",
    "targetUrl": "http://localhost:4010/webhooks/send-results"
  }'
```

### 6-4. 발송 등록

```bash
curl -s http://localhost:3000/api/sends \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "eml": "From: sender@example.com\r\nTo: alice@example.com\r\nSubject: Local test\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nLocal test"
  }'
```

### 6-5. 결과 polling

```bash
curl -s 'http://localhost:3000/api/send-results?updatedSince=2026-03-23T00:00:00.000Z&limit=100' \
  -H 'x-api-key: <YOUR_API_KEY>'
```

### 6-6. 콘솔에서 확인

- `/sends`에서 발송 목록을 검색하고 페이지 단위로 이력 확인
- `/routing`에서 SMTP 노드 추가/활성화/연결 테스트/삭제 및 규칙 확인
- `/routing` 상단 탭으로 `SMTP 노드` / `라우팅 규칙` / `라우트 미리보기` 섹션 이동
- `/reporting`에서 상태 집계 확인
- `/reporting` 상단 탭으로 `상태별 분류` / `SMTP 응답 코드` / `노드별 성과` 섹션 이동

---

## 7. 테스트 실행

최종 검증 명령:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm e2e
```

### E2E 참고

`playwright.config.ts`는 E2E 실행 시 아래 두 서버를 자동 부팅합니다.

```bash
NODE_ENV=test pnpm --filter @supermailer/management-console dev:server
pnpm --filter @supermailer/management-console dev
```

메일 워커는 Playwright가 자동 실행하지 않으므로, 워커가 필요한 수동 검증 시 별도 실행해야 합니다.

---

## 8. 로컬 종료 및 초기화

```bash
docker compose down
docker compose down -v
```

---

## 9. 트러블슈팅

### API/UI는 뜨는데 발송 상태가 갱신되지 않는 경우

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3001/health
docker compose ps
```

확인 순서:

1. 워커 실행 여부
2. Redis 연결 여부
3. Postfix/relay 로그
4. `/sends` 이벤트 이력 화면
5. `/api/send-results` polling 응답

### 테스트 실패 시

```bash
docker compose down -v
docker compose up -d
pnpm test:integration
pnpm e2e
```

---

## 10. 관련 문서

- 프로젝트 개요: [`README.md`](./README.md)
- 클라이언트 연동 가이드: [`CLIENT_API.md`](./CLIENT_API.md)
- OpenAPI 문서: [`openapi.yaml`](./openapi.yaml)
- 운영/배포 가이드: [`OPERATIONS.md`](./OPERATIONS.md)
- Postfix 연동 가이드: [`POSTFIX.md`](./POSTFIX.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
