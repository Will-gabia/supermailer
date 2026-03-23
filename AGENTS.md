# 에이전트 작업 가이드

이 문서는 Supermailer 저장소에서 작업하는 AI 에이전트(예: Sisyphus, Code Assist 등)를 위한 운영 규칙입니다.

## 1. 목적

- 작업 범위를 벗어나지 않고 정확하게 수정한다.
- 변경 이유와 시행착오를 저장소 내부 노트에 남긴다.
- 검증이 끝나기 전에는 작업을 완료로 처리하지 않는다.

## 2. 증거 및 학습 기록

에이전트는 작업 중 확인한 학습 사항, 주의점, 아키텍처 결정 사항을 아래 파일에 **추가(append)** 해야 합니다.

- `.sisyphus/notepads/customer-email-platform/learnings.md`
- `.sisyphus/notepads/customer-email-platform/issues.md`

규칙:

- 기존 내용을 덮어쓰지 말 것
- 항상 append 방식으로 기록할 것
- `.sisyphus/plans/*.md` 계획 문서는 읽기 전용으로 취급할 것

## 3. 작업 범위 규칙

- 사용자가 요청한 범위를 넘어서 기능을 넓히지 말 것
- 기존 UI/API 패턴을 존중할 것
- 필요 이상의 재설계는 하지 말 것
- 테스트를 고칠 때는 커버리지를 제거하지 말고, 부트/종료 로직 또는 테스트 데이터/목 처리를 더 견고하게 만들 것

## 4. 문서 수정 규칙

- 최상위 문서(`README.md`, `INSTALL.md`, `CHANGELOG.md`, `AGENTS.md`, `CONVENTIONS.md`)는 저장소의 실제 스크립트/포트/실행 절차와 일치해야 함
- 설치/실행 가이드는 추상적으로 쓰지 말고, 실제 명령어와 기대 결과를 포함해야 함
- 문서 예시는 현재 저장소 기준으로 실행 가능해야 함

## 5. 검증 프로토콜

에이전트는 작업 완료 처리 전에 아래 검증을 수행해야 합니다.

1. ```bash
   pnpm lint
   ```
2. ```bash
   pnpm typecheck
   ```
3. ```bash
   pnpm test
   ```
4. ```bash
   pnpm test:integration
   ```
5. ```bash
   pnpm e2e
   ```

## 6. 추가 권장 확인 사항

작업 종류에 따라 아래도 함께 확인하는 것이 좋습니다.

- 관리자 API 상태 확인
  ```bash
  curl -s http://localhost:3000/api/health
  ```
- 메일 워커 상태 확인
  ```bash
  curl -s http://localhost:3001/health
  ```
- 로컬 인프라 상태 확인
  ```bash
  docker compose ps
  ```

## 7. 금지 사항

- 계획 문서를 임의로 수정하지 말 것
- 테스트 실패를 숨기기 위해 테스트를 삭제하지 말 것
- 실제와 다른 문서를 남기지 말 것
- 타입 오류를 무시하는 임시 우회 코드를 추가하지 말 것
