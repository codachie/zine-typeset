// ブラウザ完結の組版プレビュー。
// .docx はここ（ブラウザ）で mammoth が解析し、docs/lib/zine-core.js で
// 整形・目次生成・テーマCSS生成・1冊への組み立てを行い、
// 生成した HTML を Blob URL にして Vivliostyle Viewer に渡す。
// サーバーには何も送らない。

import {
  FONT_PRESETS, SIZE_PRESETS, DEFAULT_SETTINGS, WORD_STYLE_MAP,
  transformManuscript, buildTocHtml, buildTheme, buildColophonHtml, assembleBook,
} from './lib/zine-core.js';

const $ = (id) => document.getElementById(id);
const VIEWER = 'vendor/vivliostyle-viewer/index.html';

let docxBuffer = null;   // アップロードされた .docx の ArrayBuffer
let lastBlobUrl = null;

const SAMPLE_HTML = `
<p class="book-title">見本の本</p>
<p class="book-subtitle">組版プレビューのサンプル</p>
<h1>第一章　流し込みの見本</h1>
<p>吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。</p>
<p>この文章は、判型・フォント・文字サイズ・行送り・字間・段組みを変えたときの見え方を確かめるためのサンプルです。左のフォームを変えて「プレビュー更新」を押してください。</p>
<h2>節の見出し</h2>
<p>二〇二六年、午後三時。半角数字（<span class="tcy">15</span>）は縦中横で組めます。禁則処理・行末揃え・ノンブル（ページ番号）・柱が反映されます。</p>
<h1>第二章　もう一つの章</h1>
<p>章が変わると改ページします。目次は章見出しから自動で作られ、先頭は「扉 → 目次 → 本文 → 奥付」の順に並びます。</p>
<p>自分の原稿で試すには、Google ドキュメントを「ファイル → ダウンロード → Microsoft Word (.docx)」で書き出し、左上から選択してください。</p>
`;

// ---- フォーム初期化 ------------------------------------------------
function initForm() {
  $('fontPreset').innerHTML =
    Object.entries(FONT_PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('') +
    `<option value="__custom">（カスタム）</option>`;
  $('sizePreset').innerHTML =
    Object.entries(SIZE_PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('') +
    `<option value="__custom">カスタム（自由入力）</option>`;

  const s = DEFAULT_SETTINGS;
  $('direction').value = s.direction;
  const sk = sizeKey(s.size);
  $('sizePreset').value = sk || '__custom';
  $('sizeCustom').value = s.size;
  $('sizeCustomRow').hidden = !!sk;
  $('columns').value = String(s.columns);
  $('fontPreset').value = fontKey(s.fontFamily) || 'mincho-yu';
  $('fontSize').value = parseFloat(s.fontSize);
  $('lineHeight').value = s.lineHeight;
  $('lineHeightVal').textContent = s.lineHeight.toFixed(2);
  $('letterSpacing').value = s.letterSpacing;
  const m = parseMargin(s.margin);
  $('mT').value = m.t; $('mO').value = m.o; $('mB').value = m.b; $('mN').value = m.n;
  $('runningHead').checked = s.runningHead;
  $('pageNumber').checked = s.pageNumber;
  $('fwLatin').checked = s.fullwidthLatin;
  $('title').value = '';
  $('author').value = '';
  const c = s.colophon;
  $('clEnabled').checked = c.enabled;
  $('clPubDate').value = c.pubDate;
  $('clEdition').value = c.edition;
  $('clPublisher').value = c.publisher;
  $('clPrinter').value = c.printer;
  $('clContact').value = c.contact;
  $('clCopyright').value = c.copyright;
}

const sizeKey = (v) => Object.keys(SIZE_PRESETS).find((k) => SIZE_PRESETS[k].value === v) || '';
const fontKey = (v) => Object.keys(FONT_PRESETS).find((k) => FONT_PRESETS[k].stack === v) || '';

function parseMargin(str) {
  const p = String(str || '').trim().split(/\s+/).map((v) => parseFloat(v) || 0);
  const [t = 16, o = 13, b = 18, n = 13] = p;
  return { t, o, b, n };
}

function collectSettings() {
  const s = { ...DEFAULT_SETTINGS };
  s.direction = $('direction').value;
  const skv = $('sizePreset').value;
  s.size = skv === '__custom' ? $('sizeCustom').value.trim() : SIZE_PRESETS[skv].value;
  s.columns = Number($('columns').value);
  const fk = $('fontPreset').value;
  if (fk !== '__custom') { s.fontFamily = FONT_PRESETS[fk].stack; s.headingFontFamily = FONT_PRESETS[fk].stack; }
  s.fontSize = (parseFloat($('fontSize').value) || 8.7) + 'pt';
  s.lineHeight = parseFloat($('lineHeight').value);
  s.letterSpacing = $('letterSpacing').value;
  s.margin = `${+$('mT').value}mm ${+$('mO').value}mm ${+$('mB').value}mm ${+$('mN').value}mm`;
  s.runningHead = $('runningHead').checked;
  s.pageNumber = $('pageNumber').checked;
  s.fullwidthLatin = $('fwLatin').checked;
  s.title = $('title').value.trim();
  s.author = $('author').value.trim();
  s.colophon = {
    enabled: $('clEnabled').checked,
    pubDate: $('clPubDate').value.trim(),
    edition: $('clEdition').value.trim(),
    publisher: $('clPublisher').value.trim(),
    printer: $('clPrinter').value.trim(),
    contact: $('clContact').value.trim(),
    copyright: $('clCopyright').value.trim(),
  };
  return s;
}

// ---- 組版 -------------------------------------------------------
async function toManuscriptHtml() {
  if (!docxBuffer) return SAMPLE_HTML;
  const { value, messages } = await window.mammoth.convertToHtml(
    { arrayBuffer: docxBuffer },
    { styleMap: WORD_STYLE_MAP },
  );
  window.__mammothMessages = messages;
  return value;
}

async function build({ forPrint = false } = {}) {
  setBusy(true);
  try {
    const raw = await toManuscriptHtml();
    const t = transformManuscript(raw);
    const s = collectSettings();
    if (!s.title) s.title = t.bookTitle || '';

    const toc = buildTocHtml(t.chapters, s.tocTitle);
    const colophon = buildColophonHtml(s);
    const themeCss = buildTheme(s);
    const html = assembleBook({
      lang: 'ja',
      title: s.title || '無題',
      themeCss,
      parts: [t.titlepageHtml, toc, t.bodyHtml, colophon],
    });

    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

    // blob URL は素のまま渡す（encode すると Viewer が相対パス扱いして 404 になる）
    // spread=spread で常に見開き2ページ表示。
    // ページの進み方向は本文の writing-mode から自動判定される：
    //   縦組み(vertical-rl) → 右開き → 右が1ページ目、左が2ページ目
    //   横組み(horizontal)  → 左開き → 左が1ページ目、右が2ページ目
    const hash =
      `#src=${lastBlobUrl}` +
      `&bookMode=false&renderAllPages=${forPrint ? 'true' : 'false'}&spread=true`;
    $('viewer').src = `${VIEWER}?t=${Date.now()}${hash}`;

    // レポート
    $('report').textContent =
      `扉: ${t.titlepageHtml ? 'あり' : 'なし'} ／ 章: ${t.chapters.length} ／ 本文段落: ${t.paragraphs}`;
    const warns = [...t.warnings];
    for (const m of window.__mammothMessages || []) {
      if (m.type === 'warning') warns.push(`Word: ${m.message}`);
    }
    if (warns.length) { $('warn').hidden = false; $('warn').textContent = warns.join('\n'); }
    else { $('warn').hidden = true; }

    $('buildInfo').textContent =
      `${s.size} ／ ${s.direction === 'vertical' ? '縦書き' : '横書き'} ／ ${s.columns}段組 ／ ${s.fontSize}`;
    return forPrint;
  } finally {
    setBusy(false);
  }
}

function setBusy(on) {
  for (const b of document.querySelectorAll('button')) b.disabled = on;
}

// 全ページ描画で読み込み → 完了を待って印刷
async function toPdf() {
  await build({ forPrint: true });
  const iframe = $('viewer');
  const started = Date.now();
  await new Promise((resolve) => {
    const tick = () => {
      let status = '';
      try { status = iframe.contentWindow.document.body.getAttribute('data-vivliostyle-viewer-status') || ''; }
      catch { /* まだ読み込み中 */ }
      if (status === 'complete' || Date.now() - started > 60000) resolve();
      else setTimeout(tick, 400);
    };
    setTimeout(tick, 800);
  });
  try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
  catch { alert('右のビューア右上の印刷アイコンから「PDFで保存」を選んでください。'); }
}

// ---- イベント --------------------------------------------------
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  docxBuffer = await f.arrayBuffer();
  if (!$('title').value.trim()) { /* 表題は build 時に自動補完 */ }
  build();
});
$('useSample').addEventListener('click', (e) => { e.preventDefault(); docxBuffer = null; $('file').value = ''; build(); });
$('sizePreset').addEventListener('change', () => {
  $('sizeCustomRow').hidden = $('sizePreset').value !== '__custom';
});
$('lineHeight').addEventListener('input', () => {
  $('lineHeightVal').textContent = parseFloat($('lineHeight').value).toFixed(2);
});
$('btnBuild').addEventListener('click', () => build());
$('btnPdf').addEventListener('click', () => toPdf());

initForm();
build();
