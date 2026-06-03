# 대표 코드 발췌 (Code Highlights)

> 운영 소스는 비공개입니다. 아래는 설계 의도와 코드 품질을 보여주기 위한 **대표 발췌**입니다.
> 시크릿·실계좌·KIS 키는 포함하지 않으며, 일부 식별자는 단순화했습니다.

---

## 1. 주문 거절 사유 — sealed class 도메인 모델링 + 실계좌 안전장치

실주문 경로의 모든 거절/보류 사유를 `sealed class`로 닫아, 컴파일 타임에 모든 분기를 강제합니다. 특히 **3중 게이트**(실거래 허용 플래그 · 사용자 동의 · 자격증명)와, KIS가 주문을 접수했을 수도 있는 **모호한 타임아웃 상태**(`PENDING_RECONCILE`)를 명시적으로 분리해 자동 정합 워커가 사후 검증하도록 설계했습니다.

```kotlin
/**
 * 주문 거절 사유 (sealed class LOCK).
 *
 *   RealGateDenied(cond) — 3중 게이트(실거래 허용/사용자/동의/자격증명) 중 하나 미충족
 *   IdempotencyDuplicate — Redis SETNX false (중복 주문 차단)
 *   KillSwitchOn         — 비상 정지 스위치 ON
 *   KisRejected(rt, msg) — KIS REST 응답 코드 != "0"
 *   KisException(cause)  — 4xx 또는 파싱 실패 (REJECTED 확정)
 *   KisTimeoutPendingReconcile(cause) — 5xx/timeout. 접수 여부 불명 → 사후 정합 검증
 */
sealed class DenyReason {
    data class RealGateDenied(val condition: String) : DenyReason()
    data object IdempotencyDuplicate : DenyReason()
    data object KillSwitchOn : DenyReason()
    data class KisRejected(val rtCd: String, val msg: String) : DenyReason()
    data class KisException(val cause: String) : DenyReason()

    /**
     * KIS 5xx 재시도 후 최종 실패 또는 socket timeout.
     * 클라이언트 ACK 미수신이나 KIS는 주문을 실제 접수했을 수 있는 ambiguous 상태.
     * → REJECTED 마킹 대신 PENDING_RECONCILE 보류 + 1분 cron 워커가 KIS 체결조회로 검증.
     */
    data class KisTimeoutPendingReconcile(val cause: String) : DenyReason()
}
```

**설계 포인트** — "실패"를 단일 boolean이 아니라 *왜 실패했고 다음에 무엇을 해야 하는가*까지 타입에 담았습니다. 금전이 오가는 경로에서 모호한 상태를 코드 구조로 강제 처리하는 안전 설계.

---

## 2. 정밀 금융 연산 — pandas EWM을 Kotlin BigDecimal로 포팅

기술적 지표(80종) 계산에서 부동소수점 누적 오차를 피하기 위해 핵심 통계는 `BigDecimal`로 계산합니다. 아래는 지수가중이동평균(EWM)을 pandas `ewm(span, adjust=False).mean()`과 동일 시맨틱으로 포팅한 코드입니다.

```kotlin
internal object KisIndicatorMath {
    val MC: MathContext = MathContext(20, RoundingMode.HALF_EVEN)
    const val SCALE: Int = 8

    /** pandas ewm(span=period, adjust=False).mean() — 첫 값 = values[0] */
    fun ewm(values: List<BigDecimal>, span: Int): List<BigDecimal> {
        if (values.isEmpty()) return emptyList()
        val alpha = BigDecimal.valueOf(2.0).divide(BigDecimal.valueOf((span + 1).toLong()), MC)
        val one = BigDecimal.ONE
        val out = ArrayList<BigDecimal>(values.size)
        var prev = values[0]
        out.add(prev)
        for (i in 1 until values.size) {
            // next = alpha * value[i] + (1 - alpha) * prev
            val next = alpha.multiply(values[i], MC)
                .add(one.subtract(alpha, MC).multiply(prev, MC), MC)
            prev = next
            out.add(next)
        }
        return out
    }
}
```

**설계 포인트** — 검증된 참조 구현(pandas)과 *동일 시맨틱*을 유지해 백테스트 결과 재현성을 보장하고, 정밀도가 중요한 구간만 BigDecimal, 나머지는 Double로 성능 균형을 맞췄습니다.

---

## 3. 모듈 경계 — 헥사고날 아키텍처

`domain/` 모듈은 Spring·JPA 의존이 **0**입니다. 외부 연동(KIS·DART)·영속·메시징은 모두 port 인터페이스 뒤에 두고 어댑터에서 구현합니다. 덕분에 전략 평가 엔진과 지표 라이브러리를 `api`·`consumer` 양쪽에서 공유하면서도 도메인 로직은 프레임워크와 독립적으로 단위 테스트할 수 있습니다.

```
domain (port 정의, 순수 Kotlin)
  ▲           ▲
  │           │
api          consumer        ← 어댑터에서 port 구현 (KIS REST/WS, JPA, Kafka)
  └─ indicator-impl, strategy-engine 공유
```

> 더 자세한 구조는 [`master-architecture.md`](master-architecture.md), 결정 이력은 [`ADR-INDEX.md`](ADR-INDEX.md) 참고.
