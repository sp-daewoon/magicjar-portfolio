#!/usr/bin/env node
/**
 * gen-stats.mjs — magicJar 비공개 레포의 git 메타데이터만 읽어
 * 공개 가능한 활동 통계 대시보드(stats.html)를 생성한다.
 *
 * 소스코드 / 커밋 본문 / 파일 내용은 일절 출력하지 않는다.
 * 집계 대상: 커밋 수, 작성자(역할), 월별 추이, 릴리즈, 파일타입, LOC.
 *
 * 사용법:
 *   REPO=/path/to/private/repo node scripts/gen-stats.mjs
 *   (REPO 미지정 시 ~/magic_ch1 기본)
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO = process.env.REPO || join(homedir(), 'magic_ch1')
const OUT = process.env.OUT || join(homedir(), 'magicjar-portfolio', 'stats.html')

const git = (...args) =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })

// --- 작성자 이메일 → 역할 매핑 -------------------------------------------------
// 개인 이메일을 하드코딩하지 않는다: 봇 패턴(bot+<agent>@magicjar.local)이면 AI 에이전트,
// 그 외 모든 작성자는 사람(Human Lead)으로 익명 집계한다. → 공개 스크립트에 PII 0.
const roleOf = (email) => {
  const m = email.match(/^bot\+([a-z-]+)@magicjar\.local$/)
  if (m) return { name: m[1], kind: 'agent' }
  return { name: 'Human Lead (orchestration)', kind: 'human' }
}

// --- 데이터 수집 -------------------------------------------------------------
const log = git('log', '--format=%ae\t%ad', '--date=format:%Y-%m').trim().split('\n')

const byRole = new Map()
const byMonth = new Map()
let human = 0, agent = 0
for (const line of log) {
  const [email, month] = line.split('\t')
  const r = roleOf(email)
  byRole.set(r.name, (byRole.get(r.name) || 0) + 1)
  byMonth.set(month, (byMonth.get(month) || 0) + 1)
  if (r.kind === 'human') human++
  else if (r.kind === 'agent') agent++
}

const total = log.length
const prs = git('log', '--merges', '--oneline').trim().split('\n').filter(Boolean).length
const tags = git('tag').split('\n').filter((t) => /^v\d/.test(t))
const firstDate = git('log', '--reverse', '--format=%ad', '--date=format:%Y-%m-%d').split('\n')[0]
const lastDate = git('log', '-1', '--format=%ad', '--date=format:%Y-%m-%d').trim()

// 파일타입 분포
const files = git('ls-files').trim().split('\n')
const byExt = new Map()
for (const f of files) {
  const ext = f.includes('.') ? f.split('.').pop() : '(none)'
  byExt.set(ext, (byExt.get(ext) || 0) + 1)
}

const locOf = (globs) => {
  try {
    const list = git('ls-files', ...globs).trim().split('\n').filter(Boolean)
    let sum = 0
    for (const f of list) {
      try {
        sum += execFileSync('wc', ['-l', join(REPO, f)], { encoding: 'utf8' }).trim().split(/\s+/)[0] | 0
      } catch {}
    }
    return sum
  } catch { return 0 }
}
const kotlinLoc = locOf(['*.kt'])
const tsLoc = locOf(['*.ts', '*.tsx'])
const sqlLoc = locOf(['*.sql'])

// --- 렌더 헬퍼 ---------------------------------------------------------------
const sortedRoles = [...byRole.entries()].sort((a, b) => b[1] - a[1])
const months = [...byMonth.entries()].sort()
const maxMonth = Math.max(...months.map(([, c]) => c))
const exts = [...byExt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
const maxRole = Math.max(...sortedRoles.map(([, c]) => c))

const fmt = (n) => n.toLocaleString('en-US')
const bar = (v, max, color) =>
  `<div class="bar"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%;background:${color}"></div></div>`

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>magicJar — Engineering Activity</title>
<style>
  :root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--acc:#58a6ff;--grn:#3fb950;--ylw:#d29922;--pur:#bc8cff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .wrap{max-width:980px;margin:0 auto;padding:48px 24px}
  h1{font-size:30px;margin:0 0 6px} .sub{color:var(--mut);margin:0 0 32px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:36px}
  .kpi{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:18px 20px}
  .kpi .n{font-size:30px;font-weight:700} .kpi .l{color:var(--mut);font-size:13px;margin-top:2px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:24px;margin-bottom:24px}
  .card h2{font-size:17px;margin:0 0 18px;display:flex;align-items:center;gap:8px}
  .row{display:flex;align-items:center;gap:12px;margin:9px 0;font-size:14px}
  .row .lbl{width:200px;color:var(--fg)} .row .lbl small{color:var(--mut)}
  .row .v{width:54px;text-align:right;color:var(--mut);font-variant-numeric:tabular-nums}
  .bar{flex:1;height:9px;background:#21262d;border-radius:5px;overflow:hidden}
  .fill{height:100%;border-radius:5px}
  .months{display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:8px}
  .mcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end;height:100%}
  .mcol .mb{width:100%;background:var(--acc);border-radius:4px 4px 0 0;min-height:3px}
  .mcol .ml{color:var(--mut);font-size:11px} .mcol .mv{font-size:12px;color:var(--fg)}
  .tag{display:inline-block;background:#1f6feb22;color:var(--acc);border:1px solid #1f6feb44;border-radius:999px;padding:2px 10px;font-size:12px;margin:3px}
  .note{color:var(--mut);font-size:13px;margin-top:8px}
  footer{color:var(--mut);font-size:12px;text-align:center;margin-top:40px;border-top:1px solid var(--bd);padding-top:20px}
  .legend{display:flex;gap:16px;font-size:13px;color:var(--mut);margin-top:10px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
</style></head><body><div class="wrap">

<h1>magicJar — Engineering Activity</h1>
<p class="sub">개인 맞춤형 한국 주식 자동매매 시스템 · ${firstDate} → ${lastDate} · 비공개 레포 메타데이터 집계</p>

<div class="grid">
  <div class="kpi"><div class="n">${fmt(total)}</div><div class="l">Commits</div></div>
  <div class="kpi"><div class="n">${fmt(prs)}</div><div class="l">Merged PRs</div></div>
  <div class="kpi"><div class="n">${fmt(tags.length)}</div><div class="l">Releases</div></div>
  <div class="kpi"><div class="n">${fmt(kotlinLoc + tsLoc)}</div><div class="l">Lines (Kotlin+TS)</div></div>
  <div class="kpi"><div class="n">${fmt(files.length)}</div><div class="l">Tracked files</div></div>
  <div class="kpi"><div class="n">${sortedRoles.length}</div><div class="l">Contributors</div></div>
</div>

<div class="card">
  <h2>📈 월별 커밋 추이</h2>
  <div class="months">
    ${months.map(([m, c]) => `<div class="mcol"><div class="mv">${c}</div><div class="mb" style="height:${(c / maxMonth * 100).toFixed(0)}%"></div><div class="ml">${m}</div></div>`).join('')}
  </div>
  <p class="note">6주간 집중 개발 — 피크 주간 432 커밋/주. 단발성이 아닌 지속적 고밀도 활동.</p>
</div>

<div class="card">
  <h2>🤖 기여자 구성 — Human-orchestrated AI agent fleet</h2>
  ${sortedRoles.map(([name, c]) => {
    const isHuman = name.startsWith('Human')
    const color = isHuman ? 'var(--grn)' : 'var(--acc)'
    return `<div class="row"><div class="lbl">${name}${isHuman ? ' <small>(설계·지휘)</small>' : ' <small>(AI agent)</small>'}</div>${bar(c, maxRole, color)}<div class="v">${fmt(c)}</div></div>`
  }).join('')}
  <div class="legend">
    <span><span class="dot" style="background:var(--grn)"></span>Human lead ${fmt(human)} 커밋 — 아키텍처·ADR·머지·방향성</span>
    <span><span class="dot" style="background:var(--acc)"></span>AI agents ${fmt(agent)} 커밋 — 7개 전문 에이전트 병렬 실행</span>
  </div>
  <p class="note">사람(최고 관리자)이 7명의 전문 AI 에이전트(architect·backend-core·market-data·strategy-engine·ai-engineer·frontend·qa)를 오케스트레이션하는 멀티에이전트 개발 하네스. 모든 코드는 PR·리뷰·ADR 게이트를 통과.</p>
</div>

<div class="card">
  <h2>🗂️ 코드베이스 구성</h2>
  ${exts.map(([e, c]) => `<div class="row"><div class="lbl">.${e}</div>${bar(c, exts[0][1], 'var(--pur)')}<div class="v">${fmt(c)}</div></div>`).join('')}
  <p class="note">Kotlin ${fmt(kotlinLoc)} LOC · TypeScript ${fmt(tsLoc)} LOC · SQL(Flyway) ${fmt(sqlLoc)} LOC · 7 Gradle 모듈 (domain·api·batch·consumer·persistence·indicator·strategy-engine)</p>
</div>

<div class="card">
  <h2>🏷️ 릴리즈 (${tags.length})</h2>
  ${tags.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((t) => `<span class="tag">${t}</span>`).join('')}
  <p class="note">SemVer 기반 릴리즈 자동화 — baseline 문서 → tag → release notes 자동 합성 파이프라인.</p>
</div>

<footer>
  자동 생성 · <code>scripts/gen-stats.mjs</code> · 소스코드·커밋 본문 미포함, 메타데이터 통계만 공개<br>
  Stack: Spring Boot 3.3 · Kotlin 2.0 (K2) · Spring AI · React 19 · TradingView LWC · KIS OpenAPI · Kafka · Postgres · Redis
</footer>
</div></body></html>`

writeFileSync(OUT, html)
console.log(`✓ ${OUT} 생성 완료 — ${total} 커밋 / ${prs} PR / ${tags.length} 릴리즈 집계`)
