#!/usr/bin/env node
/**
 * gen-devlogs.mjs — magicJar 비공개 레포의 커밋 로그를 일자별로 분석해
 * 빠진 날짜의 개발일지 HTML(_workspace/devlog/YYYY-MM-DD.html)을 자동 재구성한다.
 *
 * - 이미 존재하는 devlog는 절대 덮어쓰지 않는다 (수기 작성본 보존).
 * - index.html은 기존 항목을 보존하면서 신규 일자를 병합 후 재생성한다.
 * - 소스코드/시크릿은 출력하지 않는다. 커밋 제목·작성자(역할)·파일 통계만 사용.
 *
 * 사용: REPO=~/magic_ch1 OUT=~/magic_ch1/_workspace/devlog node scripts/gen-devlogs.mjs
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO = process.env.REPO || join(homedir(), 'magic_ch1')
const OUT = process.env.OUT || join(REPO, '_workspace', 'devlog')
const WD = ['일', '월', '화', '수', '목', '금', '토']
const env = { ...process.env, TZ: 'Asia/Seoul' }
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 30, env })

const agentOf = (email) => {
  const m = email.match(/^bot\+([a-z-]+)@magicjar\.local$/)
  return m ? m[1] : 'human-lead'
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const moduleOf = (p) => {
  const seg = p.split('/')[0]
  const known = ['domain', 'api', 'batch', 'consumer', 'persistence-shared', 'indicator-impl',
    'strategy-engine', 'frontend', 'docker', 'observability', 'docs', '_workspace', 'scripts']
  return known.includes(seg) ? seg : (p.includes('/') ? seg : 'root')
}

// --- 1) 전체 커밋 + numstat 수집 (1회 호출) ----------------------------------
const raw = git('log', '--no-merges', '--date=format-local:%Y-%m-%d',
  '--format=__C__%H|%ad|%ae|%s', '--numstat')
const commits = []
let cur = null
for (const line of raw.split('\n')) {
  if (line.startsWith('__C__')) {
    const [h, date, email, ...rest] = line.slice(5).split('|')
    cur = { h, date, agent: agentOf(email), subj: rest.join('|'), add: 0, del: 0, files: [] }
    commits.push(cur)
  } else if (line.trim() && cur) {
    const [a, d, ...fp] = line.split('\t')
    const path = fp.join('\t')
    if (!path) continue
    cur.add += a === '-' ? 0 : (parseInt(a) || 0)
    cur.del += d === '-' ? 0 : (parseInt(d) || 0)
    cur.files.push(path)
  }
}

// --- 2) 머지(PR) 수집 --------------------------------------------------------
const merges = git('log', '--merges', '--date=format-local:%Y-%m-%d', '--format=%ad|%s').trim().split('\n')
const prByDate = {}
for (const m of merges) {
  if (!m) continue
  const [date, ...rest] = m.split('|')
  const subj = rest.join('|')
  const pr = subj.match(/#(\d+)/)
  if (pr) (prByDate[date] ||= []).push(pr[1])
}

// --- 3) 일자별 버킷 ----------------------------------------------------------
const byDate = {}
for (const c of commits) (byDate[c.date] ||= []).push(c)
const allDates = Object.keys(byDate).sort()

// --- 4) 기존 index 항목 보존 -------------------------------------------------
const idxPath = join(OUT, 'index.html')
const existingLi = {} // date -> raw <li> html
if (existsSync(idxPath)) {
  const idx = readFileSync(idxPath, 'utf8')
  for (const m of idx.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const href = m[1].match(/href="(\d{4}-\d{2}-\d{2}(?:-\d+)?)\.html"/)
    if (href) existingLi[href[1].slice(0, 10)] = `<li>${m[1]}</li>`
  }
}

// --- 5) 일자별 HTML 생성 (없는 날만) ----------------------------------------
const STYLE = `:root{--brown:#5b3a1f;--cream:#fff8ed;--paper:#fafaf7;--line:#d8d4c8;--ok:#2f7a3a;--warn:#b58606;--pending:#1c5fa6;--todo:#b03060;--mute:#6a6a6a}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Pretendard","Apple SD Gothic Neo",sans-serif;background:var(--paper);color:#222;max-width:1080px;margin:0 auto;padding:36px 24px 80px;line-height:1.65}
h1{color:var(--brown);border-bottom:2px solid var(--brown);padding-bottom:8px;margin-bottom:6px;font-size:1.55rem}
.subtitle{color:var(--mute);font-size:.95rem;margin-bottom:24px}
h2{color:var(--brown);margin-top:34px;border-left:4px solid var(--brown);padding-left:10px;font-size:1.15rem}
table{width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:.88rem}
th,td{padding:6px 10px;border:1px solid var(--line);text-align:left;vertical-align:top}
th{background:var(--cream);color:var(--brown);font-weight:600}
tr:nth-child(even) td{background:#fcfcf8}
code{background:#f3efe6;padding:1px 6px;border-radius:3px;font-size:.85em;color:#333}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.72rem;font-weight:600;margin:0 2px}
.b-ok{background:#e3f1e6;color:var(--ok);border:1px solid var(--ok)}
.b-pending{background:#e3edf7;color:var(--pending);border:1px solid var(--pending)}
.b-todo{background:#fce6ec;color:var(--todo);border:1px solid var(--todo)}
.b-mute{background:#f0f0f0;color:var(--mute);border:1px solid var(--mute)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
.card{background:var(--cream);border:1px solid var(--line);border-radius:6px;padding:12px 14px}
.card .n{font-size:1.5rem;font-weight:700;color:var(--brown)} .card .l{font-size:.82rem;color:var(--mute)}
.nav-back{display:inline-block;margin-bottom:18px;color:var(--brown);text-decoration:none;font-size:.9rem}
.nav-back:hover{text-decoration:underline}
.cmt{font-size:.86rem;margin:3px 0;padding-left:4px}
.cmt code{font-size:.8em}
ul.bare{list-style:none;padding:0}`

const ROLE_LABEL = {
  architect: '수석 설계', 'backend-core': '백엔드 코어', 'market-data': '시세 데이터',
  strategy: '전략 엔진', ai: 'AI', frontend: '프런트', qa: '품질', 'chart-curator': '차트',
  orchestrator: '오케스트라', 'human-lead': '사람(지휘)',
}
const created = []
for (const date of allDates) {
  const file = `${date}.html`
  if (existsSync(join(OUT, file))) continue // 기존 보존
  const cs = byDate[date]
  const dow = WD[new Date(`${date}T12:00:00+09:00`).getDay()]
  const agents = {}
  let add = 0, del = 0
  const mods = {}, adrs = new Set(), flyway = new Set()
  for (const c of cs) {
    ;(agents[c.agent] ||= []).push(c)
    add += c.add; del += c.del
    for (const f of c.files) {
      mods[moduleOf(f)] = (mods[moduleOf(f)] || 0) + 1
      const adr = f.match(/_workspace\/arch\/adr\/(\d{4})-/)
      if (adr) adrs.add(adr[1])
      if (/db\/migration\/.*\.sql$/.test(f)) flyway.add(f.split('/').pop())
    }
  }
  const prs = [...new Set(prByDate[date] || [])].sort((a, b) => a - b)
  const fileCount = new Set(cs.flatMap((c) => c.files)).size
  const agentRows = Object.entries(agents).sort((a, b) => b[1].length - a[1].length)

  // 주요 커밋 (에이전트 다양성 우선, 최대 16)
  const top = cs.slice().sort((a, b) => (b.add + b.del) - (a.add + a.del)).slice(0, 16)

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>magicJar devlog · ${date} (${dow})</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLE}</style></head><body>
<a class="nav-back" href="index.html">← 개발일지 목록</a>
<h1>${date} (${dow})</h1>
<div class="subtitle">커밋 로그 기반 자동 재구성 (backfill) · magicJar 한국 주식 자동매매 시스템</div>

<div class="grid">
  <div class="card"><div class="n">${cs.length}</div><div class="l">커밋</div></div>
  <div class="card"><div class="n">${agentRows.length}</div><div class="l">활동 에이전트</div></div>
  <div class="card"><div class="n">${prs.length}</div><div class="l">머지 PR</div></div>
  <div class="card"><div class="n">${fileCount}</div><div class="l">변경 파일</div></div>
  <div class="card"><div class="n" style="color:var(--ok)">+${add.toLocaleString()}</div><div class="l">추가 라인</div></div>
  <div class="card"><div class="n" style="color:var(--todo)">−${del.toLocaleString()}</div><div class="l">삭제 라인</div></div>
</div>

<h2>👥 에이전트별 작업</h2>
<table><thead><tr><th>에이전트</th><th>역할</th><th>커밋</th><th>대표 작업</th></tr></thead><tbody>
${agentRows.map(([a, list]) => `<tr><td><code>${a}</code></td><td>${ROLE_LABEL[a] || a}</td><td>${list.length}</td><td>${esc(list[0].subj.slice(0, 70))}</td></tr>`).join('\n')}
</tbody></table>

${adrs.size ? `<h2>📐 아키텍처 결정 (ADR)</h2><p>${[...adrs].sort().map((n) => `<span class="badge b-pending">ADR ${n}</span>`).join(' ')}</p>` : ''}

${flyway.size ? `<h2>🗄️ DB 스키마 (Flyway)</h2><p>${[...flyway].sort().map((f) => `<code>${esc(f)}</code>`).join(' · ')}</p>` : ''}

<h2>🧩 모듈별 변경 파일</h2>
<p>${Object.entries(mods).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class="badge b-mute">${m} · ${n}</span>`).join(' ')}</p>

<h2>📝 주요 커밋 (변경량 상위)</h2>
<ul class="bare">
${top.map((c) => `<li class="cmt"><span class="badge b-mute">${c.agent}</span> ${esc(c.subj.slice(0, 110))} <code>${c.h.slice(0, 7)}</code> <span style="color:var(--mute)">+${c.add}/−${c.del}</span></li>`).join('\n')}
</ul>

${prs.length ? `<h2>🔀 머지된 PR (${prs.length})</h2><p>${prs.map((n) => `<a class="badge b-ok" href="https://github.com/sp-daewoon/magicJar/pull/${n}" style="text-decoration:none">#${n}</a>`).join(' ')}</p>` : ''}

<footer style="margin-top:40px;padding-top:14px;border-top:1px solid var(--line);color:#888;font-size:.82rem">
자동 생성 · <code>scripts/gen-devlogs.mjs</code> · 비공개 레포 커밋 메타데이터 집계 (소스·시크릿 미포함)
</footer></body></html>`
  writeFileSync(join(OUT, file), html)
  created.push({ date, dow, commits: cs.length, prs: prs.length, agents: agentRows.length })
}

// --- 6) index.html 재생성 (기존 항목 보존 + 신규 병합) ----------------------
const summaryFor = (date) => {
  if (existingLi[date]) return existingLi[date]
  const cs = byDate[date]
  const dow = WD[new Date(`${date}T12:00:00+09:00`).getDay()]
  const agents = new Set(cs.map((c) => c.agent))
  const prs = [...new Set(prByDate[date] || [])]
  const topAgent = [...agents].length
  return `<li>
      <span class="date">${date} (${dow})</span>
      <a href="${date}.html">${cs.length} 커밋 · ${topAgent} 에이전트${prs.length ? ` · PR ${prs.length}건` : ''}</a>
      <div class="summary">${[...agents].slice(0, 6).map((a) => `<code>${a}</code>`).join(' ')} 활동. 커밋 로그 기반 자동 재구성.</div>
    </li>`
}
const items = allDates.slice().sort((a, b) => b.localeCompare(a)).map(summaryFor).join('\n    ')
const idxHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>magicJar devlog · index</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo",sans-serif;background:#fafaf7;color:#222;max-width:820px;margin:0 auto;padding:40px 24px 80px;line-height:1.6}
h1{color:#5b3a1f;border-bottom:2px solid #5b3a1f;padding-bottom:10px;margin-bottom:18px}
.meta{color:#666;font-size:.9rem;margin-bottom:24px}
ul{list-style:none;padding:0}
li{padding:12px 16px;margin:8px 0;background:#fff8ed;border:1px solid #d8d4c8;border-radius:6px}
li a{color:#5b3a1f;text-decoration:none;font-weight:600}li a:hover{text-decoration:underline}
.date{color:#666;font-size:.85rem;margin-right:8px}
.summary{color:#444;font-size:.88rem;margin-top:4px}
code{background:#f3efe6;padding:1px 5px;border-radius:3px;font-size:.82em}
footer{margin-top:40px;padding-top:14px;border-top:1px solid #d8d4c8;color:#888;font-size:.82rem}
</style></head><body>
<h1>magicJar 개발일지</h1>
<div class="meta">Spring Boot 3.3 + Spring AI + KIS OpenAPI · 한국 주식 자동매매 시스템<br/>
${allDates.length}개 활동일 (${allDates[0]} ~ ${allDates[allDates.length - 1]}) · 최신순. 일부는 커밋 로그 기반 자동 재구성.</div>
<ul>
    ${items}
</ul>
<footer>SoT: <code>docs/architecture/tracks-roadmap.md</code> · 자동 생성 <code>scripts/gen-devlogs.mjs</code></footer>
</body></html>`
writeFileSync(idxPath, idxHtml)

console.log(`✓ ${created.length}개 신규 devlog 생성 (기존 ${allDates.length - created.length}개 보존), index ${allDates.length}일 갱신`)
for (const c of created) console.log(`  + ${c.date}(${c.dow}) — ${c.commits}커밋 ${c.agents}에이전트 PR${c.prs}`)
