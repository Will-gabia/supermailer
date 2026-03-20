# 저장소 규칙

이 문서는 Supermailer 저장소에서 코드를 추가하거나 수정할 때 따라야 하는 규칙을 설명합니다.

## 1. 아키텍처 및 책임 분리

### 앱 계층

- `apps/management-console`
  - 관리자용 UI(React)
  - 관리자/API 라우트(Hono)
  - DB 접근을 위한 저장소 조합
- `apps/mail-worker`
  - 큐 소비 및 발송 처리
  - SMTP 수락/실패/재시도 처리
  - 워커 상태 점검 엔드포인트 제공

### 공용 패키지

- `packages/contracts`
  - 공용 DTO, 모델, 식별자, 이벤트 타입
- `packages/domain`
  - 순수 비즈니스 로직
  - 상태 전이 규칙, 도메인 검증
- `packages/testing`
  - 테스트 헬퍼 및 공용 픽스처
- `packages/config`
  - 설정 공유

### 책임 분리 원칙

- UI 렌더링 로직은 React 컴포넌트에 둔다.
- API 라우트는 입력 검증/응답 조립 중심으로 유지한다.
- 비즈니스 규칙은 가능한 한 서비스 또는 `packages/domain`으로 이동한다.
- DB 쿼리는 `apps/management-console/src/server/repositories`에서 관리한다.
- 워커 로직은 `apps/mail-worker` 내부에 둔다.

## 2. 타입 및 공용 모델 사용

- 앱 간 공유 타입은 가능한 한 `packages/contracts`를 재사용한다.
- 동일 의미의 타입을 앱마다 중복 정의하지 않는다.
- DTO/모델 이름은 실제 API/도메인 의미를 반영해야 한다.

## 3. 네이밍 규칙

### 코드

- 변수/함수: `camelCase`
  - 예: `loadSendEvents`, `enqueueIndividualSend`
- 타입/인터페이스/클래스: `PascalCase`
  - 예: `SendEventHistoryEntryDto`, `WebhookDeliveryRecord`
- 상수: 기존 코드 스타일에 맞춰 의미 있는 이름 사용

### 파일/디렉터리

- 파일명: `kebab-case`
  - 예: `delivery-events.ts`, `send-enqueue.ts`
- 디렉터리명: 현재 저장소 구조 유지

### 테스트 파일

- 단위 테스트: `*.test.ts`
- 통합 테스트: `*.integration.test.ts`
- E2E 테스트: `e2e/*.spec.ts`

## 4. 테스트 작성 규칙

### 단위 테스트

- 순수 함수, 상태 전이, 검증 로직에는 단위 테스트를 우선한다.
- `packages/domain` 변경 시 테스트 추가를 기본으로 생각한다.

### 통합 테스트

- 저장소, API, 배달 이벤트 처리, 라우팅, 큐 연동은 통합 테스트로 검증한다.
- DB/Redis/Postfix와 연결되는 흐름은 실제 동작을 기준으로 검증해야 한다.

### E2E 테스트

- 사용자 시나리오 중심으로 작성한다.
- 공유 로컬 DB 충돌을 피하기 위해 고유한 이름/이메일을 사용한다.
- 고정 시간 대기(`waitForTimeout`) 대신, **보이는 UI 상태나 응답 조건**을 기준으로 대기한다.

## 5. UI/API 변경 규칙

- 기존 관리자 콘솔의 라우팅/상태 관리 패턴을 유지한다.
- 새 UI를 추가할 때는 가능하면 기존 `loadJson`, `useState`, `useEffect` 흐름을 따른다.
- API는 현재 응답 구조와 인증 방식을 존중한다.
- 관리자 보호 라우트는 세션 인증 흐름과 일관되게 유지한다.

## 6. 커밋 및 변경 단위

- 한 변경은 가능한 한 하나의 논리 단위로 유지한다.
- 문서 변경은 실제 코드/실행 절차와 맞아야 한다.
- 테스트를 고쳤다면 왜 안정성이 좋아졌는지 설명 가능해야 한다.

권장 커밋 접두어 예시:

- `feat:` 기능 추가
- `fix:` 버그 수정
- `docs:` 문서 수정
- `test:` 테스트 추가/수정
- `chore:` 도구/설정 변경

## 7. 환경 변수 및 비밀 정보

- `.env` 파일은 커밋하지 않는다.
- 필요한 환경 변수는 `.env.example`에 유지한다.
- 코드에 비밀값을 하드코딩하지 않는다.

## 8. 문서화 규칙

- 설치 문서는 실제 실행 순서를 기준으로 작성한다.
- 포트, URL, 명령어, 로그인 정보는 저장소의 현재 값과 일치해야 한다.
- README는 개요 중심, INSTALL은 절차 중심, CONVENTIONS는 규칙 중심으로 유지한다.

## 9. AI/에이전트 작업 메모

- 중요한 학습 사항은 `.sisyphus/notepads/customer-email-platform/learnings.md`에 append
- 문제/주의점은 `.sisyphus/notepads/customer-email-platform/issues.md`에 append
- 자세한 운영 규칙은 `AGENTS.md` 참고
