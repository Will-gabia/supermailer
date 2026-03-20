# Supermailer

Supermailer는 고객 대상 이메일 발송을 위한 관리형 플랫폼입니다. 구독자 관리, 템플릿 관리, 라우팅 규칙 관리, 개별 발송, 캠페인 발송 큐잉, SMTP/배달 이벤트 추적, 결과 웹훅 전송, 관리자 콘솔을 하나의 저장소에서 운영할 수 있도록 구성되어 있습니다.

## 주요 기능

- **구독자 관리**: 수동 등록, 수정, 구독 해지 처리, 하드 바운스 억제(suppression) 관리
- **구독자 동기화**: 외부 소스에서 구독자 데이터를 pull 방식으로 동기화
- **템플릿 관리**: 제목/HTML/텍스트 템플릿 생성, 변수 추출, 미리보기 지원
- **라우팅 규칙 관리**: 수신자 도메인 기준 SMTP 노드 라우팅 및 기본 fallback 규칙 관리
- **이메일 발송**:
  - 개별 이메일 발송
  - 캠페인 대상 다건 큐잉 발송
- **발송 추적**: queued, dispatching, accepted_by_mta, delivered, bounced, deferred 등 상태 추적
- **결과 웹훅**: 개별 발송에 한해 최종 결과를 외부 시스템으로 웹훅 전송
- **리포팅/이력 조회**: SMTP 코드, 노드별 이벤트, 개별 발송 이력, 웹훅 전송 상태 조회

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
  - 발송 큐 처리 및 워커 상태 점검 엔드포인트 제공
  - 기본 상태 확인 주소: `http://localhost:3001/health`

### 패키지

- `packages/contracts`: 공용 타입, DTO, 식별자, 모델 정의
- `packages/domain`: 순수 비즈니스 로직, 상태 전이 규칙
- `packages/testing`: 테스트 헬퍼와 공용 픽스처
- `packages/config`: 공용 설정

### 인프라

- `docker-compose.yml`: Postgres, Redis, Mailpit, 로컬 Postfix 실행
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

처음 실행할 때는 아래 항목만 순서대로 따라오면 됩니다.

- [ ] Node.js 20+, pnpm 9+, Docker 설치 확인
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
  - 기본 관리자 계정
    - 이메일: `admin@supermailer.local`
    - 비밀번호: `supermailer-admin`

## 실행 가이드 선택

상황에 따라 아래 문서를 기준으로 진행하면 됩니다.

### 운영자용

운영자 관점에서는 아래가 중요합니다.

- 시스템을 빠르게 띄우는 방법
- 상태 점검 방법
- 관리자 콘솔 로그인 정보
- Mailpit/Postfix/워커 상태 확인 방법

→ `INSTALL.md`의 **운영자용 빠른 실행 가이드**부터 읽으면 됩니다.

### 개발자용

개발자 관점에서는 아래가 중요합니다.

- 앱별 실행 명령
- 테스트 실행 순서
- Playwright/통합 테스트 동작 방식
- 포트 충돌/초기화/트러블슈팅 절차

→ `INSTALL.md`의 **개발자용 상세 개발 가이드**부터 읽으면 됩니다.

## 자주 쓰는 명령어

### 전체 워크스페이스

- 개발 서버 실행
  ```bash
  pnpm dev
  ```
- 린트
  ```bash
  pnpm lint
  ```
- 타입 검사
  ```bash
  pnpm typecheck
  ```
- 단위 테스트
  ```bash
  pnpm test
  ```
- 통합 테스트
  ```bash
  pnpm test:integration
  ```
- E2E 테스트
  ```bash
  pnpm e2e
  ```

### 앱별 실행

- 관리 콘솔 API 서버만 실행
  ```bash
  pnpm --filter @supermailer/management-console dev:server
  ```
- 관리 콘솔 UI만 실행
  ```bash
  pnpm --filter @supermailer/management-console dev
  ```
- 메일 워커만 실행
  ```bash
  pnpm --filter @supermailer/mail-worker dev
  ```

## 테스트 전략 요약

- `pnpm test`: 각 패키지/앱의 단위 테스트 실행
- `pnpm test:integration`: DB/큐/라우팅/배달 이벤트 등 통합 시나리오 실행
- `pnpm e2e`: Playwright 기반 브라우저 시나리오 실행

참고로 `playwright.config.ts`는 E2E 실행 시 관리 콘솔 API(`3000`)와 UI(`4173`)를 자동으로 띄웁니다. 메일 워커는 Playwright가 자동 실행하지 않으므로, 워커가 필요한 수동 검증을 할 때는 별도로 실행해야 합니다.

## 문서 안내

- 설치/실행 가이드: [`INSTALL.md`](./INSTALL.md)
- 저장소 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md)
- 에이전트 작업 규칙: [`AGENTS.md`](./AGENTS.md)
- 변경 이력: [`CHANGELOG.md`](./CHANGELOG.md)
