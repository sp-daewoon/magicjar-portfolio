---
description: 본소스(magic_ch1) 작업을 포트폴리오에 동기화 — devlog/stats 재생성 + KPI 갱신 + PR 머지(배포)
---

본소스 레포(`~/magic_ch1`)의 최신 작업을 이 포트폴리오 레포에 동기화하고 배포(main 머지)한다.
기존 sync PR(#4~#8) 패턴을 그대로 따른다.

## 1. 본소스 현황 파악

```bash
cd ~/magic_ch1
git log --oneline --since="$(date +%F) 00:00" | head -30   # 오늘 작업 요약
ls _workspace/arch/adr/ | grep -cE '^[0-9]{4}-'            # ADR 개수
git tag --sort=-creatordate | head -1                       # 최신 버전 (예: v3.12.5)
```

오늘 커밋 주제(ADR·기능·hotfix)를 훑어 커밋 메시지에 쓸 하이라이트 2~3개를 뽑는다.

## 2. devlog 재생성

오늘 날짜의 devlog가 **이미 존재하면**(같은 날 재실행) 먼저 지워서 최신 커밋까지 반영되게 한다.
이때 `showcase/devlog/index.html`에서 해당 날짜의 `<li>...</li>` 항목도 함께 지워야 집계가 갱신된다
(gen 스크립트는 기존 파일·기존 index 항목을 절대 덮어쓰지 않음).

```bash
cd ~/magicjar-portfolio
TODAY=$(date +%F)
rm -f showcase/devlog/$TODAY.html   # 존재할 때만 의미 있음 + index의 해당 <li> 수동 제거
REPO=$HOME/magic_ch1 OUT=$PWD/showcase/devlog node scripts/gen-devlogs.mjs
```

## 3. stats 재집계

```bash
REPO=$HOME/magic_ch1 OUT=$PWD/stats.html node scripts/gen-stats.mjs
# 출력의 커밋/PR/릴리즈 수 메모. LOC는 stats.html의 "Lines (Kotlin+TS)" 값 참조
```

## 4. KPI/버전 문자열 갱신 (3곳)

스크립트 출력 수치 기준으로 갱신한다 (커밋·PR·LOC는 십 단위 내림 + `+` 표기, 릴리즈·ADR은 정확값):

1. `index.html` — `.kpis` 블록: commits / PRs / releases / ADRs / LOC
2. `README.md` — `**규모**` 행: 동일 수치
3. `showcase/screens/index.html` — `<p class="sub">` 끝의 `vX.Y.Z · YYYY-MM-DD 갱신`
   → 본소스 최신 태그 + 오늘 날짜

## 5. (조건부) 화면 재캡처 확인

오늘 본소스 작업에 **사용자가 보는 화면 변경**(신규 화면·UI 개편·Grafana 패널 추가)이 있으면
사용자에게 "갤러리 스크린샷 재캡처가 필요해 보인다"고 알린다. 캡처는 로컬 풀스택 기동 +
Playwright 수동 작업이므로 이 커맨드에서 자동화하지 않는다 — 알림만 하고 진행.

## 6. 커밋 → PR → 머지 (배포)

브랜치명 `sync/<버전>-<주제>`, 커밋 제목 `sync(<버전>): <요약>` 패턴.

```bash
git checkout -b sync/vX.Y.Z-devlog-MMDD
git add -A
git commit -m "sync(vX.Y.Z): devlog YYYY-MM-DD + KPI/stats 갱신"   # 본문에 하이라이트·수치 변화 기록
git push -u origin HEAD
gh pr create --fill
gh pr merge --squash --delete-branch
git checkout main && git pull
```

커밋 본문에는 (a) devlog 신규 일자·커밋 수, (b) KPI 변화(이전→이후), (c) 본소스 하이라이트를 적는다.
머지가 곧 GitHub Pages 배포다. 머지 후 main 기준으로 정리됐는지 확인하고 결과를 보고한다.
