# magicJar (마법의항아리) — Engineering Portfolio

> 개인 맞춤형 **한국 주식 자동매매 시스템**. 룰 기반 quant trading 본체 + AI 분석 보조.
> 본 레포는 **공개 포트폴리오**입니다 — 실제 구현 소스는 비공개이며, 여기에는 아키텍처 결정·설계 문서·활동 통계·대표 코드 발췌를 공개합니다.

**[📊 엔지니어링 활동 통계 대시보드 →](stats.html)**

---

## 한눈에 보기

| | |
|---|---|
| **기간** | 2026-04 ~ (약 6주 집중 개발) |
| **규모** | 1,300+ 커밋 · 100+ PR · 40+ 릴리즈 · 180K+ LOC |
| **백엔드** | Spring Boot 3.3 · Kotlin 2.0 (K2) · JDK 21 · Gradle KTS 멀티모듈(7) |
| **프런트** | React 19 · TypeScript · Vite · Tailwind · TradingView Lightweight Charts v4 |
| **데이터/인프라** | 한국투자증권(KIS) OpenAPI(REST+WebSocket) · Kafka · PostgreSQL · Redis · Docker Compose |
| **AI** | Spring AI (Anthropic/OpenAI) — 사용자 트리거 분석 보조 (매매 결정권 0) |
| **문서화** | ADR 100+ · baseline 기능정의서 12버전 · 자동 release notes 파이프라인 |

## 무엇을 만들었나

한국투자증권 OpenAPI를 통해 **실시간 시세·호가·체결을 수집**하고, 사용자가 정의한 **기술적 지표·차트 조건식(DSL)으로 매매 전략을 표현**, **과거 데이터로 백테스트**한 뒤, **시그널 생성 → 주문 실행**까지 이어지는 엔드투엔드 자동매매 파이프라인입니다.

- **데이터 계층** — KIS WebSocket 실시간 tick(체결/호가) + REST 일봉·분봉 적재, DART 공시·뉴스 수집. 권위는 WS tick, REST는 bootstrap/backfill/fallback.
- **분석·전략 계층** — 기술적 지표 라이브러리 + 차트 조건식 DSL 파서 + StrategyEvaluator + 백테스트 엔진. FVG/Order Block 등 스마트머니 개념 포함.
- **의사결정·실행 계층** — 시그널 dispatch + 주문 실행. **실계좌 이중 게이트**(`MODE=REAL` + `ALLOW_REAL=true`)로 안전장치.
- **운영 계층** — Prometheus + Grafana SLO 대시보드, alert routing, DR drill 자동 재현.

> AI는 **매매 결정권이 없습니다.** 룰/시그널이 본체이고, AI는 사용자가 명시적으로 트리거할 때 뉴스·공시 감성, 전략 설명 등 분석 코멘트만 제공합니다.

## 아키텍처

```
JVM 7 모듈 (Kotlin / Spring Boot 3.3 / JDK 21)
├─ domain/              순수 도메인 + port (Spring·JPA 의존 0)
├─ api/                 REST/STOMP + 외부 어댑터(KIS·DART·Naver) + Kafka producer
├─ batch/               Spring Batch — 일봉 backfill · 전략 백테스트 잡
├─ consumer/            Kafka 소비 + KIS WS + 시그널·주문 dispatch + AI 분석
├─ persistence-shared/  Outbox + JPA 어댑터 공유
├─ indicator-impl/      지표 계산 라이브러리 (api·consumer 공유)
└─ strategy-engine/     DSL 파서 + StrategyEvaluator (api·consumer 공유)

frontend/   React 19 SPA — Watchlist · 실시간 시세 · 차트 · 백테스트 결과 · AI 인사이트
```

데이터(A) → 분석·전략(B) → 의사결정·실행(C) → 운영(D)의 4영역 구조. 자세한 설계는 [`docs/`](docs/) 참고.

## 차별점 — Human-orchestrated AI agent fleet 🤖

이 프로젝트는 **사람(최고 관리자)이 7명의 전문 AI 에이전트를 오케스트레이션**하는 멀티에이전트 개발 하네스로 구축됐습니다:

`architect` · `backend-core` · `market-data` · `strategy-engine` · `ai-engineer` · `frontend` · `qa`

- 모든 변경은 **PR + 코드리뷰 + ADR 게이트**를 통과 — 1,300+ 커밋이 추적 가능한 결정 이력을 남김
- **방향성 보존 가드** — 비트리비얼 변경 전 기존 아키텍처·데이터/자본 흐름·운영 리스크를 점검하는 안전 절차
- **release 자동화** — baseline 문서 → tag → release notes 자동 합성 파이프라인

> 단순 코드 생산이 아니라, **AI 팀을 설계·지휘하고 품질 게이트를 운영하는 시스템 자체를 설계**한 경험.

## 디렉터리

| 경로 | 내용 |
|------|------|
| [`stats.html`](stats.html) | 자동 생성 활동 통계 대시보드 |
| [`docs/`](docs/) | 아키텍처 결정 기록(ADR) · 설계 문서 (sanitized) |
| [`showcase/`](showcase/) | 화면 캡처 · baseline 기능정의서 · 시스템 대시보드 |
| [`scripts/gen-stats.mjs`](scripts/gen-stats.mjs) | 비공개 레포 git 메타데이터 → 통계 페이지 생성기 |

---

<sub>본 레포는 채용·포트폴리오 목적의 공개 미러입니다. 운영 소스코드, 시크릿, 실계좌 정보는 포함하지 않습니다.</sub>
