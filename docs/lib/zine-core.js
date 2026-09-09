// ============================================================
//  zine-core.js — CLI とブラウザ版で共有する「純粋ロジック」
//  Node の API は一切使わない（fs / path 等を import しない）。
//    - Word(HTML) の構造整形（見出し繰り上げ・章の section 化・扉抽出）
//    - 目次 HTML の生成
//    - テーマ CSS の生成（新潮文庫を目安）
//    - 奥付 HTML の生成
//    - 1冊ぶんの HTML への組み立て
// ============================================================

// ---- プリセット -------------------------------------------------------
export const FONT_PRESETS = {
  'mincho-yu': {
    label: '明朝体（游明朝）',
    stack:
      '"游明朝", "YuMincho", "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
  },
  'mincho-hiragino': {
    label: '明朝体（ヒラギノ明朝）',
    stack: '"Hiragino Mincho ProN", "游明朝", "Noto Serif JP", serif',
  },
  'mincho-noto': {
    label: '明朝体（Noto Serif JP）',
    stack: '"Noto Serif JP", "游明朝", "Hiragino Mincho ProN", serif',
  },
  'gothic-hiragino': {
    label: 'ゴシック体（ヒラギノ角ゴ）',
    stack: '"Hiragino Kaku Gothic ProN", "YuGothic", "Noto Sans JP", sans-serif',
  },
  'gothic-noto': {
    label: 'ゴシック体（Noto Sans JP）',
    stack: '"Noto Sans JP", "YuGothic", "Hiragino Kaku Gothic ProN", sans-serif',
  },
};

export const SIZE_PRESETS = {
  bunko: { label: '文庫判 A6（105×148mm）', value: '105mm 148mm' },
  shinsho: { label: '新書判（103×182mm）', value: '103mm 182mm' },
  b6: { label: 'B6（128×182mm）', value: 'B6' },
  a5: { label: 'A5（148×210mm）', value: 'A5' },
  a6: { label: 'A6', value: 'A6' },
};

export const DEFAULT_SETTINGS = {
  title: 'わたしの ZINE',
  author: '',
  language: 'ja',
  direction: 'vertical',
  size: '105mm 148mm',
  columns: 1,
  fontFamily: FONT_PRESETS['mincho-yu'].stack,
  headingFontFamily: FONT_PRESETS['mincho-yu'].stack,
  fontSize: '8.7pt',
  lineHeight: 1.85,
  letterSpacing: '0.04em',
  margin: '16mm 13mm 18mm 13mm',
  columnGap: '9mm',
  pageNumber: true,
  runningHead: true,
  tocTitle: '目次',
  cropMarks: false,
  bleed: '3mm',
  colophon: {
    enabled: true,
    pubDate: '',
    edition: '初版第1刷',
    publisher: '',
    printer: '',
    contact: '',
    copyright: '',
  },
};

// Word の段落スタイル → HTML タグ（mammoth の styleMap）
export const WORD_STYLE_MAP = [
  "p[style-name='Title'] => p.book-title:fresh",
  "p[style-name='Subtitle'] => p.book-subtitle:fresh",
  "p[style-name='表題'] => p.book-title:fresh",
  "p[style-name='サブタイトル'] => p.book-subtitle:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='見出し 1'] => h1:fresh",
  "p[style-name='見出し 2'] => h2:fresh",
  "p[style-name='見出し 3'] => h3:fresh",
  "p[style-name='見出し 4'] => h4:fresh",
];

// ---- HTML ユーティリティ -------------------------------------------
export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]),
  );

const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '');

// ---- 構造整形 ----------------------------------------------------
// 実際に使われている最も浅い見出しレベルが h1 になるよう全見出しをシフト。
export function normalizeHeadingLevels(html) {
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  if (levels.length === 0) return html;
  const shift = Math.min(...levels) - 1;
  if (shift <= 0) return html;
  return html.replace(/<(\/?)h([1-6])\b/g, (_, slash, n) => {
    const lv = Math.max(1, Math.min(6, Number(n) - shift));
    return `<${slash}h${lv}`;
  });
}

// 見出しに本文が続けて打ち込まれている場合、最初の「：」で見出しと本文に分ける。
// 「第一章：学生時代」のような短い副題は分けない。末尾に残った「：」は削る。
export function splitOverlongHeadings(html) {
  return html.replace(
    /<h([1-3])>((?:(?!<\/h\1>).)*)<\/h\1>/g,
    (whole, lv, inner) => {
      const text = stripTags(inner);
      if (text.length < 40) return whole;
      const m = inner.match(/^(.*?)([：:])\s*(.+)$/s);
      if (!m) return whole;
      const rest = stripTags(m[3]);
      if (rest.length < 30) return whole;
      return `<h${lv}>${m[1].trim()}</h${lv}>\n<p>${m[3]}</p>`;
    },
  );
}

// 先頭の Title / Subtitle を扉ページとして取り出す。
export function extractTitlepage(html) {
  let bookTitle = '';
  let titlepageHtml = '';
  const rest = html.replace(
    /^\s*<p class="book-title">([\s\S]*?)<\/p>\s*(?:<p class="book-subtitle">([\s\S]*?)<\/p>)?/,
    (_, t, sub = '') => {
      bookTitle = stripTags(t).trim();
      titlepageHtml =
        `<div class="titlepage"><p class="book-title">${t}</p>` +
        (sub ? `<p class="book-subtitle">${sub}</p>` : '') +
        `</div>`;
      return '';
    },
  );
  return { bookTitle, titlepageHtml, rest };
}

// 各章（h1 〜 次の h1 の直前）を <section class="chapter"> で囲む。
export function wrapChapters(html) {
  const parts = html.split(/(?=<h1[ >])/);
  if (parts.length <= 1) return html;
  return parts
    .map((part) => {
      const p = part.trim();
      if (!p) return '';
      if (/^<h1[ >]/.test(p)) return `<section class="chapter">\n${p}\n</section>`;
      return `<section class="frontmatter">\n${p}\n</section>`;
    })
    .join('\n');
}

// 章 section に id を振り、章見出しの一覧を返す。
export function injectChapterIds(bodyHtml) {
  let i = 0;
  const html = bodyHtml.replace(
    /<section class="chapter">\s*<h1([ >])/g,
    (_, after) => `<section class="chapter" id="ch-${++i}"><h1${after}`,
  );
  const chapters = [
    ...html.matchAll(
      /<section class="chapter" id="(ch-\d+)">\s*<h1[^>]*>([\s\S]*?)<\/h1>/g,
    ),
  ].map((m) => ({ id: m[1], text: stripTags(m[2]).trim() }));
  return { html, chapters };
}

// mammoth 変換後の HTML を、扉・本文・章一覧に整形する。
export function transformManuscript(rawHtml) {
  let html = normalizeHeadingLevels(rawHtml);
  html = splitOverlongHeadings(html);
  const { bookTitle, titlepageHtml, rest } = extractTitlepage(html);
  const withSections = wrapChapters(rest.trim());
  const { html: bodyHtml, chapters } = injectChapterIds(withSections);
  const paragraphs = (bodyHtml.match(/<p[ >]/g) || []).length;
  const extraTitles = (bodyHtml.match(/<p class="book-title">/g) || []).length;
  const warnings = [];
  if (extraTitles)
    warnings.push(
      `本文中に別のタイトル書式が ${extraTitles} 個あります（1つの原稿に複数作品？）`,
    );
  return { bookTitle, titlepageHtml, bodyHtml, chapters, paragraphs, warnings };
}

// 目次 HTML を章一覧から生成する。
export function buildTocHtml(chapters, tocTitle = '目次') {
  if (!chapters || !chapters.length) return '';
  const items = chapters
    .map((c) => `    <li><a href="#${c.id}">${escapeHtml(c.text)}</a></li>`)
    .join('\n');
  return `<nav class="toc" role="doc-toc" aria-label="${escapeHtml(tocTitle)}">
  <h2>${escapeHtml(tocTitle)}</h2>
  <ol>
${items}
  </ol>
</nav>`;
}

// ---- 奥付 -------------------------------------------------------
export function buildColophonHtml(s) {
  const c = (s && s.colophon) || {};
  if (!c.enabled) return null;
  const esc = (v) =>
    String(v ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  const yearMatch = String(c.pubDate || '').match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : String(new Date().getFullYear());
  const copyright =
    (c.copyright && c.copyright.trim()) || (s.author ? `© ${year} ${s.author}` : '');
  const rows = [
    ['発行日', [c.pubDate, c.edition].filter((x) => x && String(x).trim()).join('　')],
    ['著　者', s.author],
    ['発　行', c.publisher],
    ['印　刷', c.printer],
    ['連絡先', c.contact],
  ].filter(([, v]) => v && String(v).trim());
  const list = rows
    .map(([k, v]) => `      <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('\n');
  return `<div class="colophon">
  <hr class="cl-rule">
  <p class="cl-title">${esc(s.title)}</p>
  <dl class="cl-list">
${list}
  </dl>
${copyright ? `  <p class="cl-copy">${esc(copyright)}</p>\n` : ''}  <hr class="cl-rule">
</div>`;
}

// ---- テーマ CSS -------------------------------------------------
export function buildTheme(s) {
  const vertical = s.direction === 'vertical';
  const writingMode = vertical ? 'vertical-rl' : 'horizontal-tb';
  const cols = Number(s.columns) > 1 ? Number(s.columns) : 1;
  const pageNumber = s.pageNumber !== false;
  const runningHead = s.runningHead !== false;
  const bodyFont = s.fontFamily;
  const headFont = s.headingFontFamily || s.fontFamily;
  const fontSize = s.fontSize || '8.7pt';
  const lineHeight = s.lineHeight ?? 1.85;
  const letterSpacing = s.letterSpacing ?? '0.04em';

  const marginBoxes = [
    pageNumber &&
      `  @bottom-center {
    content: counter(page);
    font-family: ${bodyFont};
    font-size: 7pt;
    color: #555;
    letter-spacing: 0.1em;
  }`,
    runningHead &&
      `  @top-center {
    content: string(chaptertitle);
    font-family: ${bodyFont};
    font-size: 6pt;
    color: #999;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }`,
  ]
    .filter(Boolean)
    .join('\n');

  const columnRules =
    cols > 1
      ? `
  column-count: ${cols};
  column-gap: ${s.columnGap || '9mm'};
  column-fill: auto;`
      : '';

  const tcy = vertical
    ? `
/* 縦中横（半角2桁の数字などを横に並べる）: <span class="tcy">15</span> */
.tcy { text-combine-upright: all; }
`
    : '';

  return `/* AUTO-GENERATED — direction=${s.direction} size=${s.size} columns=${cols}
   fontSize=${fontSize} lineHeight=${lineHeight} letterSpacing=${letterSpacing} */

@page {
  size: ${s.size};
  margin: ${s.margin || '16mm 13mm 18mm 13mm'};
${marginBoxes}
}

:root {
  writing-mode: ${writingMode};
  font-family: ${bodyFont};
  font-size: ${fontSize};
  line-height: ${lineHeight};
  letter-spacing: ${letterSpacing};${columnRules}
  text-align: justify;
  line-break: strict;
  word-break: normal;
  overflow-wrap: break-word;
  hanging-punctuation: allow-end;
  font-kerning: none;
  font-feature-settings: "palt" 0;
  orphans: 1;
  widows: 1;
}

body { margin: 0; }

p { margin: 0; text-indent: 1em; }
:is(h1, h2, h3, h4, .book-title, .book-subtitle) + p { text-indent: 0; }

/* ---- 章立て ---- */
h1 { break-before: page; }
section.chapter { break-before: page; }
section.chapter > h1 { break-before: avoid; }
body > h1:first-child { break-before: avoid; }
section.chapter > h1 { string-set: chaptertitle content(text); }
nav.toc, nav[role="doc-toc"] { string-set: chaptertitle ""; }

h1 {
  font-family: ${headFont};
  font-weight: 500;
  font-size: 1.5em;
  line-height: 1.5;
  letter-spacing: 0.15em;
  text-align: center;
  margin: 2em 0 3em;
}
h2 { font-family: ${headFont}; font-weight: 600; font-size: 1.25em; margin: 2.4em 0 1.2em; letter-spacing: 0.1em; }
h3 { font-family: ${headFont}; font-weight: 600; font-size: 1.08em; margin: 1.8em 0 1em; }
h1, h2, h3, h4 { break-after: avoid; }

/* ---- 扉ページ ---- */
.titlepage { break-after: page; text-align: center; }
.titlepage .book-title {
  text-indent: 0;
  margin-block-start: 6em;
  margin-block-end: 1.8em;
  font-family: ${headFont};
  font-weight: 500;
  font-size: 1.9em;
  line-height: 1.6;
  letter-spacing: 0.2em;
}
.titlepage .book-subtitle { text-indent: 0; margin: 0; font-size: 1em; color: #333; letter-spacing: 0.1em; }
.book-title {
  text-indent: 0;
  break-before: page;
  text-align: center;
  font-family: ${headFont};
  font-weight: 500;
  font-size: 1.7em;
  letter-spacing: 0.2em;
  margin: 6em 0 1em;
}
.book-subtitle { text-indent: 0; text-align: center; color: #333; margin: 0 0 2em; }

/* ---- 画像 ---- */
img { max-inline-size: 100%; max-block-size: 100%; height: auto; }
figure { margin: 1.5em 0; text-align: center; }
figcaption { font-size: 0.85em; color: #555; margin-top: 0.5em; }

/* ---- 目次 ---- */
nav.toc { break-after: page; }
nav.toc h2, nav[role="doc-toc"] h2 {
  font-family: ${headFont};
  font-weight: 500;
  letter-spacing: 0.3em;
  text-align: center;
  margin: 2em 0 2.5em;
}
nav.toc a, nav[role="doc-toc"] a { text-decoration: none; color: inherit; }
nav.toc ol, nav[role="doc-toc"] ol { list-style: none; padding: 0; margin: 0; }
nav.toc li, nav[role="doc-toc"] li { margin: 0.9em 0; text-indent: 0; }
nav.toc a::after {
  content: leader('・') target-counter(attr(href), page);
  color: #666;
}

/* ---- 引用・強調 ---- */
blockquote { margin: 1.2em 2em; color: #333; }
em { font-style: normal; }
strong { font-weight: 600; }

/* ---- 奥付（最終ページ） ---- */
.colophon {
  break-before: page;
  writing-mode: horizontal-tb;
  string-set: chaptertitle "";
  font-family: ${bodyFont};
  font-size: 8pt;
  line-height: 1.9;
  letter-spacing: 0.02em;
  text-align: left;
  padding-block-start: 52%;
}
.colophon .cl-rule { border: 0; border-top: 0.5pt solid currentColor; margin: 0 0 1.4em; }
.colophon .cl-rule + * { margin-top: 0; }
.colophon .cl-title { text-indent: 0; font-family: ${headFont}; font-size: 1.35em; font-weight: 600; margin: 0 0 1.4em; }
.colophon .cl-list { margin: 0; }
.colophon .cl-list > div { display: flex; gap: 1.4em; margin: 0.35em 0; }
.colophon .cl-list dt { flex: none; inline-size: 5em; color: #333; }
.colophon .cl-list dd { margin: 0; }
.colophon .cl-copy { text-indent: 0; color: #333; margin: 1.6em 0 1.4em; }
${tcy}`;
}

// ---- 1冊ぶんの HTML へ組み立て --------------------------------
export function assembleBook({ lang = 'ja', title = '', themeCss = '', parts = [] }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${themeCss}
</style>
</head>
<body>
${parts.filter(Boolean).join('\n')}
</body>
</html>
`;
}
