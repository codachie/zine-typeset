// ブラウザ完結の組版プレビュー。
// .docx はここ（ブラウザ）で mammoth が解析し、docs/lib/zine-core.js で
// 整形・目次生成・テーマCSS生成・1冊への組み立てを行い、
// 生成した HTML を Blob URL にして Vivliostyle Viewer に渡す。
// サーバーには何も送らない。

import {
  FONT_PRESETS, SIZE_PRESETS, DEFAULT_SETTINGS, WORD_STYLE_MAP,
  transformManuscript, plainTextToHtml, buildTocHtml, buildTheme, buildColophonHtml, assembleBook,
} from './lib/zine-core.js';

const $ = (id) => document.getElementById(id);
const VIEWER = 'vendor/vivliostyle-viewer/index.html';

// 原稿ソース：'sample' / 'docx'(ArrayBuffer) / 'text'(文字列)
let source = { kind: 'sample', data: null };
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
  window.__mammothMessages = [];
  if (source.kind === 'docx') {
    const { value, messages } = await window.mammoth.convertToHtml(
      { arrayBuffer: source.data },
      { styleMap: WORD_STYLE_MAP },
    );
    window.__mammothMessages = messages;
    return value;
  }
  if (source.kind === 'text') {
    return plainTextToHtml(source.data);
  }
  return SAMPLE_HTML;
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
    // renderAllPages=true …… 目次のページ数(target-counter)は全ページ組んで初めて
    //   確定するため、常に全ページ描画する。大きい本は数秒〜十数秒かかる。
    // spread=true …… 常に見開き2ページ表示。ページの進み方向は本文の
    //   writing-mode から自動：縦組み=右開き(右が1p目) / 横組み=左開き(左が1p目)
    const hash =
      `#src=${lastBlobUrl}&bookMode=false&renderAllPages=true&spread=true`;
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

    const summary =
      `${s.size} ／ ${s.direction === 'vertical' ? '縦書き' : '横書き'} ／ ${s.columns}段組 ／ ${s.fontSize}`;
    $('buildInfo').textContent = `組版中…　${summary}`;
    waitForViewerComplete().then((pages) => {
      $('buildInfo').textContent = pages ? `全 ${pages} ページ　${summary}` : summary;
    });
    return forPrint;
  } finally {
    setBusy(false);
  }
}

function setBusy(on) {
  for (const b of document.querySelectorAll('button')) b.disabled = on;
}

// ビューアが全ページ組み終える（status=complete）まで待つ。総ページ数を返す。
function waitForViewerComplete(timeoutMs = 120000) {
  const iframe = $('viewer');
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      let status = '';
      let pages = 0;
      try {
        const d = iframe.contentWindow.document;
        status = d.body.getAttribute('data-vivliostyle-viewer-status') || '';
        pages = d.querySelectorAll('[data-vivliostyle-page-container]').length;
      } catch { /* 読み込み中 */ }
      if (status === 'complete' || Date.now() - started > timeoutMs) resolve(pages);
      else setTimeout(tick, 500);
    };
    setTimeout(tick, 800);
  });
}

// 全ページ描画の完了を待って印刷
async function toPdf() {
  await build({ forPrint: true });
  await waitForViewerComplete();
  try { $('viewer').contentWindow.focus(); $('viewer').contentWindow.print(); }
  catch { alert('右のビューア右上の印刷アイコンから「PDFで保存」を選んでください。'); }
}

// ---- イベント --------------------------------------------------
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (/\.docx$/i.test(f.name)) {
    source = { kind: 'docx', data: await f.arrayBuffer() };
  } else {
    // .txt / .md / その他テキスト
    source = { kind: 'text', data: await f.text() };
  }
  build();
});
$('btnPaste').addEventListener('click', () => {
  const txt = $('pasteText').value.trim();
  if (!txt) { alert('本文を貼り付けてください。'); return; }
  source = { kind: 'text', data: txt };
  $('file').value = '';
  build();
});
$('useSample').addEventListener('click', (e) => {
  e.preventDefault();
  source = { kind: 'sample', data: null };
  $('file').value = '';
  build();
});
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
