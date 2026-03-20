# 운영 및 배포 가이드

이 문서는 **실제 운영 환경 또는 운영에 가까운 배포 환경**을 기준으로 작성되었습니다.

중요:

- 이 문서는 로컬 개발용 Docker 스택 설명이 아닙니다.
- 실제 운영에서는 보통 **기존 Postgres/Redis 서버** 또는 **매니지드 서비스**를 사용합니다.
- Mailpit은 운영 구성요소가 아니라 **개발/테스트용 도구**입니다.
- SMTP relay/Postfix 연동은 [`POSTFIX.md`](./POSTFIX.md)를 참고하세요.

---

## 1. 운영 환경 구성 원칙

권장 운영 구성은 아래와 같습니다.

- **Management Console API/UI**: 애플리케이션 서버에 배포
- **Mail Worker**: 별도 프로세스 또는 별도 서버에서 실행
- **Postgres**: 기존 DB 서버 또는 매니지드 Postgres 사용
- **Redis**: 기존 Redis 서버 또는 매니지드 Redis 사용
- **SMTP relay / Postfix**: 외부 relay 또는 사내 Postfix 사용

즉, 운영에서는 `docker compose up -d`로 Postgres/Redis/Mailpit/Postfix를 한 번에 띄우는 방식보다, 이미 존재하는 인프라 주소를 환경 변수에 연결하는 방식이 더 자연스럽습니다.

---

## 2. 운영 환경에서 필요한 핵심 설정

최소한 아래 항목은 대상 환경 값으로 채워야 합니다.

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

실전 배포 시에는 아래 예시 파일을 복사해서 시작하는 것을 권장합니다.

```bash
cp .env.production.example .env.production
```

그 다음 `.env.production`의 값을 실제 운영 환경에 맞게 수정합니다.

### 운영 관점에서 중요한 값

- `DATABASE_URL`
  - 운영 DB 주소
- `REDIS_URL`
  - 운영 Redis 주소
- `AUTH_TOKEN_SECRET`
  - 충분히 긴 랜덤 비밀값 사용 필요
- `SENDSMTP_HOST`, `SENDSMTP_PORT`
  - 실제 relay 또는 Postfix 주소
- `MANAGEMENT_CONSOLE_HOST`, `MAIL_WORKER_HOST`
  - 컨테이너/오케스트레이터 환경에서 외부 접근 가능하도록 `0.0.0.0` 사용

---

## 3. 운영 배포 시 제외해야 할 로컬 전용 요소

운영 문서에서는 아래 항목을 기본 전제로 두지 않습니다.

- `mailpit`
- 로컬 `postfix-local` Docker 컨테이너
- `POSTGRES_PORT`, `REDIS_PORT` 같은 로컬 호스트 포트 기준 설명

이 값들은 로컬 개발에서는 유용하지만, 운영 환경에서는 실제 서버 주소와 네트워크 정책이 더 중요합니다.

---

## 4. 운영 배포 절차 개요

환경에 따라 배포 방식은 다를 수 있지만, 최소 흐름은 아래와 같습니다.

1. 운영 환경 변수 준비
2. Postgres/Redis 연결 확인
3. Management Console 배포
4. Mail Worker 배포
5. SMTP relay/Postfix 연동 확인
6. health endpoint 확인
7. 관리자 로그인 및 기본 기능 확인

### 4-1. 최소 컨테이너 배포 경로

이 저장소는 프로덕션 최소 구성으로 아래 2개 컨테이너만 정의합니다.

- `management-console` (API + 빌드된 SPA 동시 제공)
- `mail-worker`

실행:

```bash
docker compose -f compose.production.yml up --build -d
```

### 4-2. 운영용 환경 파일 준비

1. 예시 파일 복사

```bash
cp .env.production.example .env.production
```

2. 최소 수정 대상

- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `AUTH_TOKEN_SECRET`
- `SENDSMTP_HOST`
- `SENDSMTP_PORT`

3. 운영 반영 전 점검

- DB 주소가 실제 운영 DB를 가리키는지
- Redis 주소가 실제 운영 Redis를 가리키는지
- SMTP relay/Postfix 주소가 앱 컨테이너에서 접근 가능한지
- `AUTH_TOKEN_SECRET`가 충분히 긴 랜덤 문자열인지

### 4-3. 이미지 빌드 절차

루트에서 아래 명령으로 각 앱 이미지를 빌드합니다.

```bash
docker compose --env-file .env.production -f compose.production.yml build
```

이 과정에서 내부적으로 수행되는 핵심 단계:

- 워크스페이스 의존성 설치
- `pnpm build` 실행
- 앱별 `pnpm deploy --filter ... --prod` 실행
- 런타임 이미지에 필요한 파일만 복사

### 4-4. 컨테이너 기동 절차

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
```

상태 확인:

```bash
docker compose --env-file .env.production -f compose.production.yml ps
```

로그 확인:

```bash
docker compose --env-file .env.production -f compose.production.yml logs management-console
docker compose --env-file .env.production -f compose.production.yml logs mail-worker
```

### 4-5. 컨테이너 재기동 / 종료

재기동:

```bash
docker compose --env-file .env.production -f compose.production.yml restart
```

종료:

```bash
docker compose --env-file .env.production -f compose.production.yml down
```

중요 제한 사항:

- `management-console` 시작 시 마이그레이션/관리자 시드가 실행됩니다.
- 따라서 현재 문서에서는 다중 replica 동시 기동(HA 안전성)을 보장하지 않습니다.
- 운영에서는 우선 단일 인스턴스 기준으로 기동/점검 후 확장 전략을 별도로 검토해야 합니다.

### 4-6. 프로덕션 빌드 산출물 경로

현재 프로덕션 런타임은 아래 빌드 산출물 경로를 사용합니다.

- management-console
  - 서버 엔트리: `apps/management-console/dist/server/server/index.js`
  - SPA 정적 파일: `apps/management-console/dist/index.html`, `apps/management-console/dist/assets/*`
- mail-worker
  - 서버 엔트리: `apps/mail-worker/dist/index.js`

운영 스크립트/컨테이너는 위 경로를 기준으로 동작해야 하며, 경로가 달라지면 `start` 스크립트와 Docker CMD를 함께 수정해야 합니다.

---

## 5. 운영 전 사전 점검

- [ ] 운영용 `DATABASE_URL` 준비
- [ ] 운영용 `REDIS_URL` 준비
- [ ] 운영용 `AUTH_TOKEN_SECRET` 준비
- [ ] 운영용 관리자 계정 값 준비
- [ ] SMTP relay/Postfix 주소 준비
- [ ] 방화벽/네트워크 정책 상 API/Worker/Postgres/Redis/SMTP 연결 가능 여부 확인

---

## 6. 운영 후 상태 확인

### 관리자 API

```bash
curl -s http://<management-console-host>:3000/api/health
```

### 메일 워커

```bash
curl -s http://<mail-worker-host>:3001/health
```

### 관리자 로그인

- `http://<management-console-host>:3000/login` 또는 배포 환경의 실제 UI 주소

### 최소 기능 점검

- Subscribers 목록 조회 가능 여부
- Templates 목록 조회 가능 여부
- Routing 목록 조회 가능 여부
- Sends 화면 접근 가능 여부
- Reporting 화면 접근 가능 여부

---

## 7. 운영 장애 점검 기본 순서

### API가 응답하지 않는 경우

- 애플리케이션 프로세스 상태 확인
- `DATABASE_URL` 연결성 확인
- 인증 비밀값 및 환경 변수 누락 여부 확인

### 워커가 발송을 처리하지 않는 경우

- 워커 프로세스 상태 확인
- `REDIS_URL` 연결 확인
- Postgres 연결 확인
- SMTP relay 연결 확인

### 발송은 됐는데 결과 추적이 비정상인 경우

- SMTP relay/Postfix 로그 확인
- correlation header 흐름 확인
- delivery event 수집 경로 확인

---

## 8. 운영 체크리스트

### 일일 점검

- [ ] 관리자 API health 확인
- [ ] 메일 워커 health 확인
- [ ] 관리자 로그인 가능 여부 확인
- [ ] Sends / Reporting 화면 진입 확인

### 장애 대응

- [ ] API health 확인
- [ ] Worker health 확인
- [ ] DB/Redis 연결성 확인
- [ ] SMTP relay/Postfix 로그 확인
- [ ] 최근 배포/환경 변경 여부 확인

### 배포 전

- [ ] 환경 변수 검토
- [ ] Postgres/Redis 연결 점검
- [ ] SMTP relay/Postfix 연결 점검
- [ ] 최소 smoke test 계획 수립

---

## 9. 운영 환경에서 권장 smoke test

- [ ] `docker compose ... ps` 기준 두 컨테이너가 Up 상태인지 확인
- [ ] `curl -s http://<management-console-host>:3000/api/health` 응답 확인
- [ ] `curl -s http://<mail-worker-host>:3001/health` 응답 확인
- [ ] 브라우저에서 `http://<management-console-host>:3000/login` 접속 확인
- [ ] 관리자 로그인 1회 수행
- [ ] Subscribers 화면 진입 확인
- [ ] Templates 화면 진입 확인
- [ ] Routing 화면 진입 확인
- [ ] 개별 이메일 1건 발송
- [ ] 캠페인 큐잉 1건 확인
- [ ] Sends 화면에서 발송 이력과 이벤트 조회 확인
- [ ] Reporting 화면에서 집계 확인

### 9-1. 권장 smoke test 순서 예시

1. health endpoint 두 개 확인
2. 관리자 로그인
3. 개별 이메일 1건 발송
4. Sends 화면에서 queued/이력 확인
5. Reporting 화면에서 상태 집계 확인
6. 필요 시 Postfix/relay 로그에서 send id 상관관계 확인

---

## 10. 관련 문서

- 로컬 개발/검증: [`INSTALL.md`](./INSTALL.md)
- Postfix 연동: [`POSTFIX.md`](./POSTFIX.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
