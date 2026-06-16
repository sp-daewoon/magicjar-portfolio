#!/usr/bin/env node
// 포트폴리오 md → 인쇄용 HTML → (Chrome headless) PDF + 미리보기 PNG
// 사용: node scripts/gen-portfolio-pdf.mjs
//   IN=docs/portfolio/magicjar-portfolio.md  OUT_DIR=docs/portfolio  도 지정 가능
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { marked } from 'marked';

const IN = process.env.IN || 'docs/portfolio/magicjar-portfolio.md';
const OUT_DIR = process.env.OUT_DIR || 'docs/portfolio';
const BASE = 'magicjar-portfolio';
const htmlPath = resolve(join(OUT_DIR, `${BASE}.html`));
const pdfPath = resolve(join(OUT_DIR, `${BASE}.pdf`));
const pngPath = resolve(join(OUT_DIR, `${BASE}-preview.png`));

marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(readFileSync(IN, 'utf8'));

const css = `
:root{ --ink:#1a1d24; --muted:#5b6472; --line:#e4e8ee; --accent:#2f6df0; --code-bg:#f6f8fb; }
*{ box-sizing:border-box; }
@page{ size:A4; margin:17mm 15mm; }
html{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body{ font-family:"Apple SD Gothic Neo","Pretendard","Noto Sans KR",-apple-system,system-ui,sans-serif;
  color:var(--ink); font-size:10.5pt; line-height:1.62; margin:0; letter-spacing:-0.01em; }
h1,h2,h3{ line-height:1.3; letter-spacing:-0.02em; }
h1{ font-size:21pt; margin:0 0 .3em; padding-bottom:.25em; border-bottom:3px solid var(--ink); }
h1:not(:first-of-type){ page-break-before:always; padding-top:.1em; }
h2{ font-size:14pt; margin:1.5em 0 .5em; color:#0f1320; }
h3{ font-size:11.5pt; margin:1.2em 0 .4em; color:var(--accent); }
p{ margin:.5em 0; }
a{ color:var(--accent); text-decoration:none; }
hr{ border:0; border-top:1px solid var(--line); margin:1.4em 0; }
strong{ color:#0f1320; }
blockquote{ margin:1em 0; padding:.5em 1em; border-left:3px solid var(--accent);
  background:#f7f9ff; color:var(--muted); font-size:9.8pt; border-radius:0 6px 6px 0; }
ul,ol{ margin:.5em 0; padding-left:1.3em; }
li{ margin:.22em 0; }
table{ border-collapse:collapse; width:100%; margin:1em 0; font-size:9.6pt; page-break-inside:avoid; }
th,td{ border:1px solid var(--line); padding:7px 10px; text-align:left; vertical-align:top; }
th{ background:#f0f3f8; font-weight:700; }
code{ font-family:"SF Mono",ui-monospace,Menlo,monospace; font-size:9pt;
  background:var(--code-bg); padding:1.5px 5px; border-radius:4px; }
pre{ background:var(--code-bg); border:1px solid var(--line); border-radius:8px;
  padding:12px 14px; overflow:hidden; page-break-inside:avoid; margin:1em 0; }
pre code{ background:none; padding:0; font-size:8.2pt; line-height:1.45; white-space:pre; }
div[align="center"]{ text-align:center; color:var(--muted); margin:.6em 0 1.2em; font-size:10pt; }
`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>magicJar 포트폴리오</title><style>${css}</style></head>
<body>${body}</body></html>`;

writeFileSync(htmlPath, html);
console.log(`✓ HTML  ${htmlPath}`);

const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fileUrl = `file://${htmlPath}`;
const common = ['--headless=new', '--disable-gpu', '--no-sandbox'];

execFileSync(CHROME, [...common, '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`, fileUrl], { stdio: 'inherit' });
console.log(`✓ PDF   ${pdfPath}`);

// 스타일 미리보기 — 문서 상단 한 화면 캡처
execFileSync(CHROME, [...common, '--hide-scrollbars',
  '--window-size=960,2480', `--screenshot=${pngPath}`, fileUrl], { stdio: 'inherit' });
console.log(`✓ PNG   ${pngPath}`);
