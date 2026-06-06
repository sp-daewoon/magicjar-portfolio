# 대표 코드 발췌 (Code Highlights)

> 운영 소스는 비공개입니다. 아래는 설계 의도와 코드 품질을 보여주기 위한 **대표 발췌**입니다.
> 시크릿·실계좌·KIS 키는 포함하지 않으며, 일부 식별자·주석은 단순화했습니다.

---

## 1. KIS WebSocket 브리지 — 유령 재연결 루프 차단 (2단 CAS 가드)

KIS 실시간 시세 WS(1,800+ LOC 단일 브리지)의 가장 어려운 결함은 **유령 세션 증식**이었습니다. 연결이 이중 단절되면 stale `doFinally`가 여러 개 동시에 재연결을 발사해, 살아있는 세션 위에 유령 세션이 쌓이는 문제. 재연결 스케줄링을 2단 가드로 봉쇄했습니다 — ① 살아있는 세션 존재 시 스케줄 자체를 차단, ② CAS로 동시 진입 중 단 1개만 통과.

```kotlin
private fun scheduleReconnect() {
    // ① 살아있는 세션 존재 시 재연결 스케줄 자체를 차단 — stale doFinally가
    //    정상 세션이 살아있는데도 재연결을 발사해 유령 세션을 증식시키던 직접 원인 봉쇄.
    if (session.connected) {
        log.debug("KIS WS scheduleReconnect skip — 이미 살아있는 세션 존재 (유령 재연결 차단)")
        return
    }
    // ② 단일 발사 CAS — 동시에 진입한 여러 doFinally(이중 단절·다수 stale 세션) 중 단 1개만 통과.
    //    CAS 실패분은 즉시 무효화 → pending reconnect future N개 누적(유령 루프 증식) 차단.
    if (!reconnectScheduled.compareAndSet(false, true)) {
        log.debug("KIS WS scheduleReconnect skip — 재연결 이미 예약됨")
        return
    }
    val attempt = session.incrementReconnect()
    val delayMs = reconnectDelaysMs[(attempt - 1).coerceIn(0, reconnectDelaysMs.size - 1)]
    log.warn("KIS WS 재연결 스케줄: attempt={} delay={}ms", attempt, delayMs)   // 즉시→2s→5s→10s→30s

    // 30초 이상 연속 실패 시 REST polling fallback 활성화 — 시세 공급 무중단
    if (delayMs >= pollingFallbackTimeoutSeconds * 1000 && !pollingFallbackActive.get()) {
        pollingFallbackActive.set(true)
        onPollingFallbackStart?.invoke()
    }
    scheduleConnect(delayMs)
}
```

**설계 포인트** — 재연결은 "끊기면 다시 붙는다"가 아니라 *동시성 사건*입니다. 지수 백오프(즉시→2s→5s→10s→30s)에 더해, WS가 장기간 죽으면 REST polling으로 자동 강등해 시세 공급 자체는 끊기지 않게 했습니다.

---

## 2. 시장 시간 인지 Heartbeat Watchdog — 거짓 재연결 해소

10초 고정 timeout watchdog은 거래량이 적은 시간외 구간에서 *자연 무신호*를 연결 끊김으로 오판해 거짓 재연결을 반복했습니다. KST 정규장(09:00~15:30)은 30s, 그 외는 60s로 **동적 timeout**을 적용하고, dispose 호출은 CAS로 단 1회만 허용합니다.

```kotlin
/** 정규장(09:00~15:30 KST) 30s — 체결 빈도 높아 무신호 = 끊김 가능성 높음.
 *  정규장 외 60s — NXT/시간외 거래량 적어 자연 무신호 허용 확대. */
internal fun currentHeartbeatTimeoutSeconds(): Long {
    val nowKst = LocalTime.now(kstZone)
    return if (!nowKst.isBefore(LocalTime.of(9, 0)) && nowKst.isBefore(LocalTime.of(15, 30))) {
        heartbeatTimeoutRegularSeconds   // 30s
    } else {
        heartbeatTimeoutOffHoursSeconds  // 60s
    }
}

private fun startHeartbeatWatchdog() {
    stopHeartbeatWatchdog()
    heartbeatWatchdog = scheduler.scheduleAtFixedRate({
        if (!session.connected || session.shuttingDown) return@scheduleAtFixedRate
        val lastMsg = session.lastMessageAt.get() ?: return@scheduleAtFixedRate
        val elapsed = Clock.System.now().epochSeconds - lastMsg.epochSeconds
        if (elapsed > currentHeartbeatTimeoutSeconds() && session.subscribedCodes.isNotEmpty()) {
            // reconnecting CAS: 이미 재연결 중이면 중복 dispose 차단
            if (reconnecting.compareAndSet(false, true)) {
                log.warn("KIS WS heartbeat 무신호 {}s — 재연결 트리거", elapsed)
                wsDisposable?.dispose()
            }
        }
    }, 10L, 10L, TimeUnit.SECONDS)  // 체크 주기 10s 고정, timeout은 동적
}
```

**설계 포인트** — "끊김 감지"의 임계값은 코드 상수가 아니라 *시장의 상태*입니다. PINGPONG keep-alive(수신 raw 그대로 echo — KIS 공식 시맨틱)와 함께 이중 생존 신호를 유지합니다.

---

## 3. KIS WS 암호화 체결통보 — AES-256-CBC 복호화 파이프라인

체결통보(H0STCNI0/9)는 평문 시세와 달리 AES-256-CBC로 암호화되어 도달합니다. 구독 SUCCESS 응답에서 trId별 `iv`/`key`를 추출·보관했다가, encrypted 플래그가 선 메시지만 복호화 후 라우팅합니다. 복호화 실패가 WS 스트림 전체를 죽이지 않도록 메시지 단위로 격리(`runCatching`)했습니다.

```kotlin
is KisWsMessageParser.ParsedMessage.RealtimeData -> {
    val data = if (parsed.encrypted) {
        val aesKey = trIdToAesKey[parsed.trId]           // 구독 SUCCESS 응답에서 저장한 iv/key
            ?: return logAndSkip("AES key 미저장", parsed)
        runCatching { KisWsAesDecryptor.decrypt(parsed.rawData, aesKey.iv, aesKey.key) }
            .getOrElse { e -> return logAndSkip("AES 복호화 실패: ${e.message}", parsed) }
    } else parsed.rawData

    when (parsed.trId) {
        "H0STCNT0" -> handleTickData(data)               // KRX 체결가
        "H0NXCNT0" -> handleNxtTickData(data)            // NXT 대체거래소 (08:00~20:00 cover)
        "H0STASP0" -> handleOrderbookData(data)          // 호가
        "H0STCNI0", "H0STCNI9" -> handleExecutionNotice(parsed.trId, data)  // 체결통보 (실전/모의)
        "H0STOUP0" -> handleOvertimeSinglePriceTickData(data)               // 시간외 단일가
        else -> log.debug("KIS WS 알 수 없는 TR_ID: {}", parsed.trId)
    }
}
```

```kotlin
object KisWsAesDecryptor {
    /** KIS 공식 spec: AES-256-CBC + PKCS5Padding, IV 16B/Key 32B는 UTF-8 문자열 그대로 */
    fun decrypt(cipherTextB64: String, iv: String, key: String): String {
        require(iv.length == 16) { "KIS WS AES IV 길이 결함: 16 byte 의무 (실제=${iv.length})" }
        require(key.length == 32) { "KIS WS AES Key 길이 결함: 32 byte 의무 (실제=${key.length})" }
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key.toByteArray(Charsets.UTF_8), "AES"),
            IvParameterSpec(iv.toByteArray(Charsets.UTF_8)),
        )
        return String(cipher.doFinal(Base64.getDecoder().decode(cipherTextB64)), Charsets.UTF_8)
    }
}
```

**설계 포인트** — 이 결함은 실사용(dogfooding)에서 발견됐습니다: 암호화 통보를 평문으로 가정해 주문이 `ACK`에 영구 고착. KIS 공식 Python 예제(`kis_auth.py`)와 시맨틱을 1:1 대조해 포팅하고, 입력 검증(`require`)으로 키 배포 결함을 복호화 전에 차단합니다.

---

## 4. Redis 분산 Rate Limiter — 2-bucket reserve 모델로 주문 경로 보호

KIS REST는 초당 호출 한도(EGW00201)가 있고, api·consumer·batch **멀티 JVM**이 같은 한도를 공유합니다. Bucket4j + Redis(Lettuce)로 단일 글로벌 bucket을 발행하되, 캔들 수집 burst가 **주문 경로를 굶기는** 사고를 막기 위해 bucket을 둘로 쪼갰습니다 — shared(전 priority 공용) + reserve(주문 전용 fallback). 두 bucket의 합은 KIS 한도와 같아 절대 초과하지 않습니다.

```kotlin
/** priority 차등 단발 소비 (non-blocking) — shared 1차, USER_PATH(주문)만 reserve fallback.
 *  비주문(INGESTION·BACKFILL)은 reserve 접근 0 → shared 소진 시에도 주문 토큰은 보존됨. */
private fun tryConsumeRouted(priority: KisCallPriority): Boolean {
    if (sharedBucket.tryConsume(1L)) return true
    if (reserveEnabled && priority == KisCallPriority.USER_PATH) {
        return reserveBucket.tryConsume(1L)
    }
    return false
}

/** KIS REST 호출 직전 token 1개 acquire — blocking polling (50ms interval). */
override fun acquire(priority: KisCallPriority, timeoutMillis: Long) {
    val deadlineNanos = System.nanoTime() + timeoutMillis * 1_000_000L
    while (true) {
        if (tryConsumeRouted(priority)) return
        val remainingNanos = deadlineNanos - System.nanoTime()
        if (remainingNanos <= 0L) throw KisRateLimitTimeoutException(priority, timeoutMillis)
        Thread.sleep(props.acquirePollIntervalMillis.coerceAtMost(remainingNanos / 1_000_000L))
    }
}
```

429 시그널은 lock-free CAS aggregator로 **5분 윈도당 1건만** 시스템 이벤트로 승격해, burst 시 알림 spam과 DB 부하를 동시에 차단합니다:

```kotlin
private fun emitSystemEventIfThresholdReached(currentCount: Long) {
    val now = Instant.now()
    val prev = lastEmittedAt.get()
    if (Duration.between(prev, now) < EMIT_AGGREGATOR_WINDOW) return   // 5분 미경과 → skip
    if (!lastEmittedAt.compareAndSet(prev, now)) return                // race → 다른 thread가 emit (단일 보장)
    runCatching { logger.emit(SystemEvent(category = KIS_RATELIMIT, severity = WARN, /* … */)) }
        .onFailure { e -> log.error("SystemEvent emit 실패 — {}", e.message) }
}
```

**설계 포인트** — capacity를 늘리는 게 아니라 *기존 한도를 분할*해 우선순위를 만들었습니다(주문 ≻ 수집 ≻ 백필). `reserveTokens=0`이면 단일 bucket으로 자동 회귀하는 rollback path도 설계에 포함.

---

## 5. 주문 거절 사유 — sealed class 도메인 모델 + 모호한 타임아웃의 명시적 처리

실주문 경로의 모든 거절/보류 사유를 `sealed class`로 닫아 컴파일 타임에 전 분기를 강제합니다. 핵심은 KIS가 주문을 접수했을 *수도* 있는 **모호한 타임아웃**(`PENDING_RECONCILE`)을 REJECTED와 분리한 것 — 자동 정합 워커(1분 cron)가 KIS 체결조회로 사후 검증합니다.

```kotlin
sealed class DenyReason {
    data class RealGateDenied(val condition: String) : DenyReason()  // 3중 게이트(실거래 플래그·동의·자격증명) 미충족
    data object IdempotencyDuplicate : DenyReason()                  // Redis SETNX false — 중복 주문 차단
    data object KillSwitchOn : DenyReason()                          // 비상 정지 스위치 ON
    data class KisRejected(val rtCd: String, val msg: String) : DenyReason()
    data class KisException(val cause: String) : DenyReason()        // 4xx/파싱 실패 — REJECTED 확정

    /** KIS 5xx/timeout — 접수 여부 불명. REJECTED 마킹 대신 PENDING_RECONCILE 보류
     *  + 1분 cron 워커가 KIS 체결조회로 사후 검증. */
    data class KisTimeoutPendingReconcile(val cause: String) : DenyReason()
}
```

**설계 포인트** — "실패"를 단일 boolean이 아니라 *왜 실패했고 다음에 무엇을 해야 하는가*까지 타입에 담았습니다. 금전이 오가는 경로에서 모호한 상태를 코드 구조로 강제 처리하는 안전 설계.

---

> 모듈 경계(헥사고날·domain 모듈 Spring/JPA 의존 0)는 [`master-architecture.md`](master-architecture.md), 결정 이력은 [`ADR-INDEX.md`](ADR-INDEX.md) 참고.
