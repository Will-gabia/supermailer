# Supermailer

Supermailer는 **발송 실행과 결과 전달에 집중한 이메일 전송 서비스**입니다. 외부 클라이언트가 이미 준비한 **raw RFC 822 / EML 원문**을 보내면, Supermailer가 큐잉·라우팅·워커 처리·Postfix 상관관계 추적·배달 이벤트 수집·결과 조회·선택적 콜백 전송을 담당합니다.

## 현재 제품 경계

- **Supermailer가 담당하는 것**
  - 발송 요청 수신
  - SMTP 노드/라우팅 규칙 적용
  - 큐잉 및 워커 처리
  - Postfix/relay 결과 수집
  - 발송 상태 저장
  - 결과 polling API 제공
  - 사전 등록 callback endpoint로 결과 웹훅 전송
- **외부 클라이언트가 담당하는 것**
  - 수신자 관리
  - 템플릿 관리
  - 캠페인/세그먼트
  - 비즈니스 워크플로우

## 주요 기능

- **발송 API**: raw RFC 822 / EML 메시지를 그대로 큐에 등록
- **결과 조회 API**: `updatedSince` 기준으로 변경된 발송 결과 pull
- **콜백 엔드포인트 등록**: API 키 단위 callback endpoint 사전 등록
- **결과 웹훅 전송**: 최종 결과를 등록된 endpoint로 서명 후 전달
- **라우팅 관리**: 도메인 기준 SMTP 노드 라우팅, ordered failover 체인 구성, fallback 관리
- **리포팅/이력 조회**: 발송 이력 검색/페이지네이션, 상태 분포, SMTP 코드, 노드별 이벤트 조회

## 저장소 구성

### 앱

- `apps/management-console`
  - 관리자용 React SPA(Vite)
  - Hono 기반 API 서버
  - 기본 주소
    - UI: `http://localhost:4173`
    - API: `http://localhost:3000`
- `apps/mail-worker`
  - BullMQ 기반 백그라운드 워커
  - 발송 큐 처리 및 상태 확인 엔드포인트 제공
  - 상태 확인: `http://localhost:3001/health`

### 패키지

- `packages/contracts`: 공용 타입, DTO, 식별자
- `packages/domain`: 발송 상태 전이 규칙
- `packages/testing`: 테스트 헬퍼와 공용 픽스처
- `packages/config`: 공용 설정

### 인프라

- `docker-compose.yml`: Postgres, Redis, Mailpit, 로컬 Postfix 실행
- `compose.production.yml`: management-console + mail-worker 프로덕션 컨테이너 실행
- `infra/postfix`: Postfix 로컬 테스트 구성을 위한 설정/스크립트

## 로컬 개발 시 기본 포트

- 관리자 UI: `4173`
- 관리자 API: `3000`
- 메일 워커 상태 확인: `3001`
- Postgres: `15432`
- Redis: `16379`
- Mailpit UI: `8025`
- SendSMTP/Postfix: `2525`

## 빠른 시작 체크리스트

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

## Canonical 외부 API

아래 문서를 먼저 보는 것을 권장합니다.

- OpenAPI 문서: [`openapi.yaml`](./openapi.yaml)
- 클라이언트 연동 가이드: [`CLIENT_API.md`](./CLIENT_API.md)

아래 3개가 현재 권장 외부 연동 경로입니다.

### 1. Callback endpoint 등록

```bash
curl -s http://localhost:3000/api/callback-endpoints \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "label": "ops-webhook",
    "targetUrl": "https://client.example.com/webhooks/send-results"
  }'
```

예상 응답:

```json
{
  "data": {
    "id": "01HQ...",
    "label": "ops-webhook",
    "targetUrl": "https://client.example.com/webhooks/send-results",
    "isActive": true,
    "createdAt": "2026-03-23T09:00:00.000Z",
    "updatedAt": "2026-03-23T09:00:00.000Z"
  }
}
```

### 2. 메일 발송 등록

```bash
curl -s http://localhost:3000/api/sends \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "eml": "From: sender@example.com\r\nTo: alice@example.com\r\nSubject: Hello from Supermailer\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello from Supermailer",
    "callbackEndpointId": "01HQ..."
  }'
```

예상 응답:

```json
{
  "status": "queued",
  "scope": "send",
  "sendId": "4Z2...",
  "queueJobId": "send-4Z2...",
  "recipient": "alice@example.com",
  "callbackEndpointId": "01HQ..."
}
```

### 3. 변경된 결과 polling

```bash
curl -s 'http://localhost:3000/api/send-results?updatedSince=2026-03-23T00:00:00.000Z&limit=100' \
  -H 'x-api-key: <YOUR_API_KEY>'
```

예상 응답:

```json
{
  "data": [
    {
      "sendId": "4Z2...",
      "kind": "individual",
      "recipientEmail": "alice@example.com",
      "status": "queued",
      "callbackEndpointId": "01HQ...",
      "updatedAt": "2026-03-23T09:05:00.000Z"
    }
  ]
}
```

## 관리자 콘솔에서 확인 가능한 것

- 발송 목록 검색/페이지 이동 및 상태 확인
- 개별 발송 이벤트 이력 확인
- 웹훅 전달 상태 확인
- SMTP 노드 추가/활성화/연결 테스트/안전한 삭제
- 도메인별 primary/failover SMTP 노드 순서 구성
- 라우팅 규칙 관리 및 상단 섹션 탭 이동
- 리포트/통계 확인 및 상단 섹션 탭 이동
- 외부 연동용 API 키 발급

## 자주 쓰는 명령어

### 전체 워크스페이스

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:integration
pnpm e2e
```

### 앱별 실행

```bash
pnpm --filter @supermailer/management-console dev:server
pnpm --filter @supermailer/management-console dev
pnpm --filter @supermailer/mail-worker dev
```

## 검증 명령

저장소 기준 최종 검증은 아래 순서입니다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm e2e
```

## 문서 안내

- 로컬 개발/검증 가이드: [`INSTALL.md`](./INSTALL.md)
- 운영/배포 가이드: [`OPERATIONS.md`](./OPERATIONS.md)
- OpenAPI 문서: [`openapi.yaml`](./openapi.yaml)
- 클라이언트 연동 가이드: [`CLIENT_API.md`](./CLIENT_API.md)
- 운영 환경 변수 예시: [`.env.production.example`](./.env.production.example)
- Postfix 연동 가이드: [`POSTFIX.md`](./POSTFIX.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
- 에이전트 작업 규칙: [`AGENTS.md`](./AGENTS.md)
- 변경 이력: [`CHANGELOG.md`](./CHANGELOG.md)
