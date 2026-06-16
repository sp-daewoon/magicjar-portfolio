#!/usr/bin/env node
// 채용 첨부용 1페이지 핸드오프 PDF — 라이브 포트폴리오 사이트로 유도
// 자체 완결(QR 인라인). 사용: node scripts/gen-portfolio-onepager.mjs
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import QRCode from 'qrcode';

const OUT_DIR = process.env.OUT_DIR || 'docs/portfolio';
const BASE = 'magicjar-portfolio-link';
const SITE = 'https://sp-daewoon.github.io/magicjar-portfolio/';
const EMAIL = 'spong0095@gmail.com';
const htmlPath = resolve(join(OUT_DIR, `${BASE}.html`));
const pdfPath = resolve(join(OUT_DIR, `${BASE}.pdf`));
const pngPath = resolve(join(OUT_DIR, `${BASE}-preview.png`));

const qrSvg = await QRCode.toString(SITE, {
  type: 'svg', errorCorrectionLevel: 'M', margin: 0,
  color: { dark: '#0f1320', light: '#ffffff' },
});

const css = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:"Apple SD Gothic Neo","Pretendard","Noto Sans KR",-apple-system,system-ui,sans-serif;
  color:#1a1d24;letter-spacing:-0.01em;width:210mm;height:297mm;padding:24mm 22mm;
  display:flex;flex-direction:column;word-break:keep-all;line-break:strict;overflow-wrap:break-word}
.brand{font-size:13pt;font-weight:800;color:#2f6df0;letter-spacing:.02em}
h1{font-size:30pt;font-weight:800;margin:.15em 0 .1em;letter-spacing:-0.03em;line-height:1.15}
.sub{font-size:12pt;color:#0f1320;font-weight:600}
.tag{font-size:10.5pt;color:#5b6472;margin-top:.5em;line-height:1.6}
hr{border:0;border-top:1px solid #e4e8ee;margin:7mm 0}
.lead{font-size:10.5pt;line-height:1.75;color:#2a2f3a}
.lead b{color:#0f1320}
.stats{display:flex;flex-wrap:wrap;gap:6px 0;margin:6mm 0 0}
.stat{font-size:9.5pt;color:#3a414e;padding:0 12px;border-right:1px solid #d7dde6}
.stat:last-child{border:0}
.stat b{color:#0f1320;font-size:11pt}
.cta{margin:9mm 0;display:flex;align-items:center;gap:9mm}
.btn{display:inline-block;background:#2f6df0;color:#fff;font-size:13pt;font-weight:800;
  padding:16px 30px;border-radius:12px;text-decoration:none;box-shadow:0 6px 18px rgba(47,109,240,.28)}
.cta-text{flex:1}
.cta-text .u{font-size:11pt;color:#2f6df0;font-weight:700;word-break:break-all}
.cta-text .hint{font-size:9pt;color:#8a929e;margin-top:3px}
.qr{width:34mm;height:34mm}
.qr svg{width:100%;height:100%}
.qr-cap{font-size:8pt;color:#8a929e;text-align:center;margin-top:3px}
.links{font-size:9.5pt;line-height:2;color:#3a414e}
.links a{color:#2f6df0;text-decoration:none}
.links .k{display:inline-block;width:7em;color:#5b6472}
.foot{margin-top:auto;padding-top:7mm;border-top:1px solid #e4e8ee;
  display:flex;justify-content:space-between;font-size:9pt;color:#8a929e}
.foot a{color:#5b6472;text-decoration:none}
`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>magicJar 포트폴리오</title><style>${css}</style></head><body>
  <div class="brand">ENGINEERING PORTFOLIO</div>
  <h1>magicJar <span style="font-size:18pt;font-weight:600;color:#5b6472">마법의항아리</span></h1>
  <div class="sub">개인 맞춤형 한국 주식 자동매매 시스템</div>
  <div class="tag">룰 기반 quant trading 본체 + AI 분석 보조 · 실시간 시세부터 주문·리스크 가드레일까지 end-to-end<br>
    기간 2026년 4월 ~ 진행 중 · 1인 개발 (AI 멀티에이전트 하네스 오케스트레이션)</div>

  <hr>
  <p class="lead">한국투자증권(KIS) OpenAPI로 <b>실시간 시세·호가·체결을 수집</b>하고, 사용자가 정의한
    <b>기술적 지표·차트 조건식(DSL)</b>으로 전략을 표현한 뒤, 과거 데이터로 백테스트하고
    <b>시그널 생성 → 주문 실행 → 포지션·리스크 관리</b>까지 이어지는 엔드투엔드 파이프라인입니다.</p>
  <p class="lead">특히 전 종목 실시간 tick을 <b>Kafka 스트림</b>으로 흘려보내고
    <b>Redis 분산 rate limiter·정합 워커</b>로 조율하는 <b>대규모 분산·동시성 처리</b>에 특화되어 있습니다.
    핵심 원칙은 <b>“룰이 본체, AI는 보조”</b> — 매매 결정권은 규칙에 있고, 실계좌 주문은
    이중 게이트(<code>MODE=REAL</code> + <code>ALLOW_REAL=true</code>)로 코드 구조상 차단됩니다.</p>

  <div class="stats">
    <span class="stat"><b>1,850+</b> 커밋</span>
    <span class="stat"><b>120+</b> PR</span>
    <span class="stat"><b>55</b> 릴리즈</span>
    <span class="stat"><b>ADR 121</b>건</span>
    <span class="stat"><b>257K+</b> LOC</span>
    <span class="stat"><b>7</b> 모듈</span>
  </div>

  <div class="cta">
    <div class="cta-text">
      <a class="btn" href="${SITE}">▶ 라이브 포트폴리오 보기</a>
      <div class="u" style="margin-top:10px"><a href="${SITE}" style="color:#2f6df0;text-decoration:none">${SITE}</a></div>
      <div class="hint">실제 동작 화면·대표 코드·아키텍처·개발일지를 웹에서 바로 확인하실 수 있습니다.</div>
    </div>
    <div>
      <div class="qr">${qrSvg}</div>
      <div class="qr-cap">QR 스캔</div>
    </div>
  </div>

  <div class="links">
    <div><span class="k">📊 통계</span><a href="${SITE}stats.html">${SITE}stats.html</a></div>
    <div><span class="k">🖥️ 화면 갤러리</span><a href="${SITE}showcase/screens/">${SITE}showcase/screens/</a></div>
    <div><span class="k">📓 개발일지</span><a href="${SITE}showcase/devlog/">${SITE}showcase/devlog/</a></div>
  </div>

  <div class="foot">
    <span>Kotlin · Spring Boot 3.3 · JDK 21 · React 19 · TypeScript · KIS OpenAPI · Kafka · PostgreSQL · Redis · Prometheus/Grafana</span>
    <a href="mailto:${EMAIL}">${EMAIL}</a>
  </div>
</body></html>`;

writeFileSync(htmlPath, html);
console.log(`✓ HTML  ${htmlPath}`);

const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fileUrl = `file://${htmlPath}`;
const common = ['--headless=new', '--disable-gpu', '--no-sandbox'];

execFileSync(CHROME, [...common, '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`, fileUrl], { stdio: 'inherit' });
console.log(`✓ PDF   ${pdfPath}`);

execFileSync(CHROME, [...common, '--hide-scrollbars',
  '--window-size=900,1273', `--screenshot=${pngPath}`, fileUrl], { stdio: 'inherit' });
console.log(`✓ PNG   ${pngPath}`);
