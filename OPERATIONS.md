# 운영 및 배포 가이드

이 문서는 **send-only Supermailer**를 운영 환경에 배포하고 점검하는 절차를 설명합니다.

중요:

- 운영 환경에서는 보통 Postgres, Redis, SMTP relay/Postfix를 외부 인프라로 사용합니다.
- 로컬 개발 스택 설명은 [`INSTALL.md`](./INSTALL.md)를 참고하세요.
- Postfix 연동 방식은 [`POSTFIX.md`](./POSTFIX.md)를 참고하세요.
- 외부 클라이언트 연동 계약은 [`CLIENT_API.md`](./CLIENT_API.md), [`openapi.yaml`](./openapi.yaml)을 참고하세요.

---

## 1. 운영 환경 구성 원칙

권장 구성:

- `management-console`: 관리자 UI + API 서버
- `mail-worker`: 발송 큐 처리 워커
- `Postgres`: 기존 DB 서버 또는 매니지드 Postgres
- `Redis`: 기존 Redis 서버 또는 매니지드 Redis
- `SMTP relay / Postfix`: 외부 relay 또는 사내 Postfix

Supermailer의 운영 책임은 아래로 한정됩니다.

- 발송 등록 수신
- 큐잉/워커 처리
- SMTP 라우팅
- Postfix/relay 결과 수집
- 결과 polling API 제공
- 등록된 callback endpoint로 웹훅 전송

---

## 2. 필수 운영 환경 변수

```env
NODE_ENV=production
MANAGEMENT_CONSOLE_PORT=3000
MANAGEMENT_CONSOLE_HOST=0.0.0.0
MAIL_WORKER_PORT=3001
MAIL_WORKER_HOST=0.0.0.0
DATABASE_URL=postgres://<user>:<password>@<db-host>:5432/<db-name>
REDIS_URL=redis://<redis-host>:6379
ADMIN_EMAIL=<admin-email>
ADMIN_PASSWORD=<strong-password>
AUTH_TOKEN_SECRET=<long-random-secret>
SESSION_COOKIE_NAME=supermailer_admin_session
SESSION_TTL_HOURS=24
SENDSMTP_HOST=<relay-host>
SENDSMTP_PORT=<relay-port>
```

운영용 파일 준비:

```bash
cp .env.production.example .env.production
```

최소 점검 대상:

- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `AUTH_TOKEN_SECRET`
- `SENDSMTP_HOST`
- `SENDSMTP_PORT`

---

## 3. 배포 절차

### 3-1. 환경 파일 준비

```bash
cp .env.production.example .env.production
```

`.env.production`에 실제 운영 값을 채웁니다.

### 3-2. 이미지 빌드

```bash
docker compose --env-file .env.production -f compose.production.yml build
```

### 3-3. 컨테이너 기동

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
```

### 3-4. 상태 확인

```bash
docker compose --env-file .env.production -f compose.production.yml ps
curl -s http://localhost:3000/api/health
curl -s http://localhost:3001/health
```

### 3-5. 로그 확인

```bash
docker compose --env-file .env.production -f compose.production.yml logs management-console
docker compose --env-file .env.production -f compose.production.yml logs mail-worker
```

---

## 4. 운영 smoke test

### 4-1. 관리자 로그인 확인

- UI: `http://<management-console-host>:3000/login` 또는 실제 프론트 주소
- 관리자 계정으로 로그인

### 4-2. API 키 발급

관리자 콘솔에서 `individual-send` 권한 API 키를 발급합니다.

### 4-3. Callback endpoint 등록

```bash
curl -s http://<management-console-host>:3000/api/callback-endpoints \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "label": "ops-webhook",
    "targetUrl": "https://client.example.com/webhooks/send-results"
  }'
```

### 4-4. 발송 등록

```bash
curl -s http://<management-console-host>:3000/api/sends \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "eml": "From: sender@example.com\r\nTo: alice@example.com\r\nSubject: Production smoke test\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nProduction smoke test"
  }'
```

예상 응답에는 `sendId`, `queueJobId`, `status: queued`가 포함됩니다.

### 4-5. 결과 polling

```bash
curl -s 'http://<management-console-host>:3000/api/send-results?updatedSince=2026-03-23T00:00:00.000Z&limit=100' \
  -H 'x-api-key: <YOUR_API_KEY>'
```

### 4-6. 관리자 콘솔 확인

- `/sends`: 발송 목록 검색, 페이지 단위 이력 조회, 이벤트 이력, 웹훅 상태
- `/routing`: SMTP 노드/라우팅 규칙, 연결 테스트, 참조 보호 삭제, 도메인별 failover 순서 관리
- `/routing`: 상단 탭으로 `SMTP 노드` / `라우팅 규칙` / `라우트 미리보기` 섹션 이동
- `/reporting`: 상태별 집계와 SMTP 코드 집계
- `/reporting`: 상단 탭으로 `상태별 분류` / `SMTP 응답 코드` / `노드별 성과` 섹션 이동
- `/access-keys`: 외부 연동용 API 키

---

## 5. 운영 후 점검 포인트

### API/워커 정상 여부

```bash
curl -s http://<management-console-host>:3000/api/health
curl -s http://<mail-worker-host>:3001/health
```

### 발송 등록은 되는데 결과 갱신이 느리거나 누락되는 경우

점검 순서:

1. `mail-worker` 프로세스 상태
2. `REDIS_URL` 연결 상태
3. `SENDSMTP_HOST`, `SENDSMTP_PORT` 연결 상태
4. Postfix/relay 로그
5. `/api/send-results` polling 결과
6. `/sends` 상세 이벤트 이력
7. callback endpoint 수신 서버 상태

### 웹훅은 실패하지만 polling은 정상인 경우

- callback endpoint 수신 서버 상태 확인
- 수신 URL 방화벽/네트워크 정책 확인
- 웹훅 서명 검증 로직 확인
- 운영에서는 **polling을 정합성 기준**으로 사용

---

## 6. 운영 체크리스트

### 일일 점검

- [ ] 관리자 API health 확인
- [ ] 메일 워커 health 확인
- [ ] 관리자 로그인 가능 여부 확인
- [ ] `/sends` / `/reporting` 화면 진입 확인
- [ ] 최근 `send-results` polling 응답 확인

### 장애 대응

- [ ] API health 확인
- [ ] Worker health 확인
- [ ] DB/Redis 연결성 확인
- [ ] SMTP relay/Postfix 로그 확인
- [ ] callback endpoint 수신 상태 확인
- [ ] 최근 배포/환경 변경 여부 확인

### 배포 전

- [ ] 환경 변수 검토
- [ ] Postgres/Redis 연결 점검
- [ ] SMTP relay/Postfix 연결 점검
- [ ] callback endpoint 수신 서버 준비 여부 확인
- [ ] smoke test 계획 수립

---

## 7. 권장 smoke test 순서

1. `docker compose ... ps` 확인
2. health endpoint 2개 확인
3. 관리자 로그인
4. API 키 발급
5. callback endpoint 등록
6. 발송 1건 등록
7. `/api/send-results`로 결과 polling
8. `/sends`에서 이벤트/웹훅 상태 확인
9. `/reporting`에서 집계 확인

---

## 8. 관련 문서

- 로컬 개발/검증: [`INSTALL.md`](./INSTALL.md)
- 클라이언트 연동 가이드: [`CLIENT_API.md`](./CLIENT_API.md)
- OpenAPI 문서: [`openapi.yaml`](./openapi.yaml)
- 프로젝트 개요/API 예시: [`README.md`](./README.md)
- Postfix 연동: [`POSTFIX.md`](./POSTFIX.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
