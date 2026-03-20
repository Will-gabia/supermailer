# Postfix 연동 가이드

이 문서는 Supermailer가 SMTP relay 또는 Postfix와 어떻게 연결되는지 설명합니다.

중요:

- 이 저장소의 `infra/postfix`는 **로컬 개발/검증용 예시 구성**입니다.
- 실제 운영에서는 별도 Postfix 서버나 외부 SMTP relay를 사용하게 될 가능성이 높습니다.
- Supermailer는 Postfix 자체를 관리하는 시스템이 아니라, **SMTP 노드 정보를 통해 relay를 호출하고 correlation을 추적하는 애플리케이션**입니다.

---

## 1. Supermailer에서 Postfix가 하는 역할

Supermailer는 메일 발송 시 SMTP 노드(host, port) 정보를 사용해 relay로 접속합니다.

현재 워커 발송 코드 기준:

- SMTP 접속 대상: `request.smtpNode.host`, `request.smtpNode.port`
- 메일 헤더에 `X-Supermailer-Send-Id` 추가
- SMTP 응답에서 queue id를 파싱해 correlation에 사용

즉, Postfix는 아래 역할을 담당합니다.

- 외부 메일 전달 relay
- queue id 생성
- 로그 기반 상관관계 추적 보조

---

## 2. 로컬 예시 구성

저장소의 로컬 예시는 아래 파일에 들어 있습니다.

- `infra/postfix/config/main.cf`
- `infra/postfix/config/header_checks`
- `infra/postfix/bin/correlate-send-log.sh`
- `infra/postfix/bin/show-postfix-state.sh`

### 로컬 `main.cf`에서 확인되는 핵심 값

- `relayhost = [mailpit]:1025`
  - 로컬에서는 Postfix가 Mailpit으로 전달
- `enable_long_queue_ids = yes`
  - 긴 queue id 사용
- `maillog_file = /var/log/postfix/postfix.log`
  - Postfix 로그 파일 위치
- `header_checks = regexp:/etc/postfix/header_checks`
  - 특정 헤더를 로그에 남기기 위한 설정

### 헤더 추적

`header_checks`에는 아래 규칙이 들어 있습니다.

```text
/^X-Supermailer-Send-Id:\s*(.+)$/ WARN supermailer-send-id=$1
```

이 규칙은 `X-Supermailer-Send-Id`를 로그 상관관계 추적에 활용하기 위한 것입니다.

---

## 3. 운영 환경에서 권장하는 연동 방향

운영에서는 보통 두 가지 방식 중 하나를 택합니다.

### 방식 A: 기존 SMTP relay 사용

- 사내 SMTP relay
- 클라우드 SMTP relay
- 기존 Postfix 서버

이 경우 Supermailer에는 해당 relay의:

- host
- port

를 SMTP 노드로 등록하면 됩니다.

### 방식 B: 전용 Postfix relay 사용

운영팀이 관리하는 Postfix 서버를 두고, Supermailer는 그 Postfix를 SMTP 노드로 사용합니다.

이 경우 Postfix 쪽에서는 최소한 아래를 검토하는 것이 좋습니다.

- relay 대상 정책
- 로그 수집 정책
- queue id 확인 가능 여부
- `X-Supermailer-Send-Id` 같은 correlation header 보존/기록 방식

---

## 4. 운영 Postfix 설정 시 고려할 항목

실제 운영 환경마다 설정은 다르지만, 아래 항목은 중요합니다.

- relay host / upstream SMTP 설정
- 로그 저장 위치
- queue id 확인 가능 여부
- header logging 정책
- 접근 허용 네트워크(`mynetworks`) 정책
- 재시도/지연/바운스 로그 관찰 가능 여부

로컬 예시 기준으로 보면 특히 아래 두 항목이 중요합니다.

### 4-1. correlation header 기록

Supermailer는 `X-Supermailer-Send-Id`를 넣어서 발송합니다.

운영 Postfix에서도 가능하면 이 헤더를 로그에서 추적 가능하게 두는 것이 좋습니다.

### 4-2. queue id 추적 가능성

SMTP acceptance 이후 queue id를 통해:

- 애플리케이션 send id
- Postfix queue id
- relay identity

를 연결해 볼 수 있으면 운영 추적성이 좋아집니다.

---

## 5. 로컬 보조 스크립트

### 현재 상태 보기

```bash
./infra/postfix/bin/show-postfix-state.sh
```

이 스크립트는 로컬 docker compose 기준으로:

- `postconf -n`
- 최근 postfix 로그

를 보여줍니다.

### 특정 send id 추적

```bash
./infra/postfix/bin/correlate-send-log.sh <send-id>
```

이 스크립트는 로그에서 `X-Supermailer-Send-Id`를 기준으로 관련 queue id와 로그 라인을 추출합니다.

---

## 6. 운영 점검 포인트

### 메일이 queued 이후 진행되지 않는 경우

- Mail Worker 상태 확인
- SMTP relay/Postfix 접근 가능 여부 확인
- Postfix 로그에서 send-id / queue id 확인

### 수락은 되었는데 최종 상태가 이상한 경우

- Postfix 로그 확인
- delivery event 수집 경로 확인
- deferred / bounce / delivery 신호 확인

### 특정 발송 건을 추적하고 싶은 경우

- Sends 화면에서 send id 확인
- Postfix 로그에서 correlation header 기반 추적
- queue id와 애플리케이션 기록을 함께 확인

---

## 7. 관련 문서

- 로컬 개발/검증: [`INSTALL.md`](./INSTALL.md)
- 운영/배포: [`OPERATIONS.md`](./OPERATIONS.md)

---

## 8. 컨테이너 배포와 SMTP 연동 주의사항

`compose.production.yml`은 앱 컨테이너(`management-console`, `mail-worker`)만 정의합니다.

- Postfix/Mailpit/Postgres/Redis 컨테이너는 운영 compose에 포함되지 않습니다.
- 운영에서는 외부 SMTP relay/Postfix 주소를 `SENDSMTP_HOST`, `SENDSMTP_PORT`로 주입해야 합니다.
- 두 앱 컨테이너가 동일한 SMTP relay에 도달 가능한 네트워크 정책인지 배포 전에 확인해야 합니다.
