// ブラウザ完結の組版プレビュー。
// .docx はここ（ブラウザ）で mammoth が解析し、docs/lib/zine-core.js で
// 整形・目次生成・テーマCSS生成・1冊への組み立てを行い、
// 生成した HTML を Blob URL にして Vivliostyle Viewer に渡す。
// サーバーには何も送らない。

import {
  FONT_PRESETS, SIZE_PRESETS, DEFAULT_SETTINGS, WORD_STYLE_MAP,
  transformManuscript, plainTextToHtml, buildTocHtml, buildTheme, buildColophonHtml,
  buildImageFigure, assembleBook,
} from './lib/zine-core.js';

const $ = (id) => document.getElementById(id);
const VIEWER = 'vendor/vivliostyle-viewer/index.html';

// 原稿ソース：'sample' / 'docx'(ArrayBuffer) / 'text'(文字列)
let source = { kind: 'sample', data: null };
let lastBlobUrl = null;

// 別丁画像：{ id, name, dataUri, page, mono, widthPct, valign, caption }
let images = [];

const norm = (s) => String(s || '').replace(/\s+/g, '');

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
  $('bodyImgMono').checked = false;
  $('bodyImgMaxW').value = '';
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
  s.bodyImageMono = $('bodyImgMono').checked;
  s.bodyImageMaxWidth = Number($('bodyImgMaxW').value) || 0;
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

// blob URL は素のまま渡す（encode すると Viewer が相対パス扱いして 404 になる）
// renderAllPages=true …… 目次のページ数(target-counter)は全ページ組んで初めて確定する。
// spread=true …… 常に見開き2ページ表示。進み方向は本文の writing-mode から自動。
async function renderBook(html) {
  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  $('viewer').src =
    `${VIEWER}?t=${Date.now()}#src=${lastBlobUrl}&bookMode=false&renderAllPages=true&spread=true`;
  return waitForViewerComplete();
}

// パス1で組んだプレビューから、各ページ先頭までの累積文字数を測る
function measurePageText() {
  const d = $('viewer').contentWindow.document;
  const pages = [...d.querySelectorAll('[data-vivliostyle-page-container]')];
  const pageStartCum = [];
  let cum = 0;
  for (const pg of pages) { pageStartCum.push(cum); cum += norm(pg.textContent).length; }
  return { pageStartCum, totalPages: pages.length };
}

// 別丁画像を「指定ページあたり」に差し込む。
function insertFiguresByPage(bodyHtml, imgs, frontOffset, pageStartCum, totalPages) {
  const doc = new DOMParser().parseFromString(
    `<body><div id="__r">${bodyHtml}</div></body>`, 'text/html');
  const root = doc.getElementById('__r');
  const sorted = [...imgs].sort((a, b) => Number(a.page) - Number(b.page));
  let insertedBefore = 0;
  for (const im of sorted) {
    // 先に入れた別丁のぶんページがずれるので補正
    const adj = Math.max(1, Math.min(totalPages + 1, Number(im.page) - insertedBefore));
    const cumAt = pageStartCum[adj - 1] ?? pageStartCum[pageStartCum.length - 1] ?? 0;
    const target = cumAt - frontOffset;
    const blocks = [...root.querySelectorAll('section > *')];
    const fig = doc.createElement('div');
    fig.innerHTML = buildImageFigure(im);
    const node = fig.firstElementChild;
    let acc = 0, placed = false;
    for (const el of blocks) {
      if (acc >= target) { el.parentNode.insertBefore(node, el); placed = true; break; }
      acc += norm(el.textContent).length;
    }
    if (!placed) (root.querySelector('section:last-of-type') || root).appendChild(node);
    insertedBefore++;
  }
  return root.innerHTML;
}

// build() は同時に走らせない。呼び出しはチェーンして順に実行する。
let buildChain = Promise.resolve();
function build() {
  buildChain = buildChain.then(doBuild).catch((e) => console.error('build error', e));
  return buildChain;
}

async function doBuild() {
  setBusy(true);
  try {
    const raw = await toManuscriptHtml();
    const t = transformManuscript(raw);
    const s = collectSettings();
    if (!s.title) s.title = t.bookTitle || '';

    const toc = buildTocHtml(t.chapters, s.tocTitle);
    const colophon = buildColophonHtml(s);
    const themeCss = buildTheme(s);
    const mk = (body) => assembleBook({
      lang: 'ja', title: s.title || '無題', themeCss,
      parts: [t.titlepageHtml, toc, body, colophon],
    });

    const summary =
      `${s.size} ／ ${s.direction === 'vertical' ? '縦書き' : '横書き'} ／ ${s.columns}段組 ／ ${s.fontSize}`;

    let bodyHtml = t.bodyHtml;
    const imgs = images.filter((im) => im.dataUri && Number(im.page) >= 1);
    if (imgs.length) {
      $('buildInfo').textContent = `組版中…（画像の位置を計算）　${summary}`;
      await renderBook(mk(t.bodyHtml)); // パス1：画像なし
      const { pageStartCum, totalPages } = measurePageText();
      const frontOffset = norm(t.titlepageHtml + toc).length;
      bodyHtml = insertFiguresByPage(t.bodyHtml, imgs, frontOffset, pageStartCum, totalPages);
    }

    $('buildInfo').textContent = `組版中…　${summary}`;
    const pages = await renderBook(mk(bodyHtml)); // 本番
    $('buildInfo').textContent = pages
      ? `全 ${pages} ページ　${summary}${imgs.length ? `　／ 画像 ${imgs.length} 枚` : ''}`
      : summary;

    // レポート
    $('report').textContent =
      `扉: ${t.titlepageHtml ? 'あり' : 'なし'} ／ 章: ${t.chapters.length} ／ 本文段落: ${t.paragraphs}`;
    const warns = [...t.warnings];
    for (const m of window.__mammothMessages || []) {
      if (m.type === 'warning') warns.push(`Word: ${m.message}`);
    }
    if (warns.length) { $('warn').hidden = false; $('warn').textContent = warns.join('\n'); }
    else { $('warn').hidden = true; }
  } finally {
    setBusy(false);
  }
}

function setBusy(on) {
  for (const b of document.querySelectorAll('button')) b.disabled = on;
}

// ---- 画像パネル ----------------------------------------------
function renderImgList() {
  const box = $('imgList');
  if (!images.length) { box.innerHTML = '<p class="hint">まだありません。上のボタンから追加。</p>'; return; }
  box.innerHTML = images.map((im, i) => `
    <div class="imgrow" data-i="${i}" style="border:1px solid var(--line);border-radius:6px;padding:8px;margin:6px 0;display:flex;gap:8px">
      <img src="${im.dataUri}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex:none">
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;align-items:center;font-size:11px;color:var(--muted)">
        <label>ページ <input type="number" min="1" class="im-page" value="${im.page || ''}" style="width:54px"></label>
        <label>色 <select class="im-mono"><option value="0"${im.mono ? '' : ' selected'}>カラー</option><option value="1"${im.mono ? ' selected' : ''}>白黒</option></select></label>
        <label>幅% <input type="number" min="5" max="100" step="5" class="im-w" value="${im.widthPct || 80}" style="width:54px"></label>
        <label>配置 <select class="im-v">
          <option value="top"${im.valign === 'top' ? ' selected' : ''}>上</option>
          <option value="center"${im.valign !== 'top' && im.valign !== 'bottom' ? ' selected' : ''}>中央</option>
          <option value="bottom"${im.valign === 'bottom' ? ' selected' : ''}>下</option></select></label>
        <label style="grid-column:1/3">説明 <input type="text" class="im-cap" value="${(im.caption || '').replace(/"/g, '&quot;')}" style="width:100%"></label>
      </div>
      <button type="button" class="im-del" title="削除" style="flex:none;align-self:start;padding:2px 7px">×</button>
    </div>`).join('');
  box.querySelectorAll('.imgrow').forEach((row) => {
    const i = +row.dataset.i;
    const apply = () => {
      images[i].page = +row.querySelector('.im-page').value || 0;
      images[i].mono = row.querySelector('.im-mono').value === '1';
      images[i].widthPct = +row.querySelector('.im-w').value || 80;
      images[i].valign = row.querySelector('.im-v').value;
      images[i].caption = row.querySelector('.im-cap').value;
    };
    row.querySelectorAll('input,select').forEach((el) =>
      el.addEventListener('change', () => { apply(); build(); }));
    row.querySelector('.im-del').addEventListener('click', () => {
      images.splice(i, 1); renderImgList(); build();
    });
  });
}

// ビューアが全ページ組み終えるまで待つ。総ページ数を返す。
// status=complete で確定。complete が来ない版もあるので、
// interactive のままページ数が数回変わらなければ完了とみなす。
function waitForViewerComplete(timeoutMs = 120000) {
  const iframe = $('viewer');
  const started = Date.now();
  let lastPages = -1;
  let stable = 0;
  return new Promise((resolve) => {
    const tick = () => {
      let status = '';
      let pages = 0;
      try {
        const d = iframe.contentWindow.document;
        status = d.body.getAttribute('data-vivliostyle-viewer-status') || '';
        pages = d.querySelectorAll('[data-vivliostyle-page-container]').length;
      } catch { /* 読み込み中 */ }
      if (pages === lastPages && pages > 0) stable++;
      else { stable = 0; lastPages = pages; }
      const done =
        status === 'complete' ||
        (status === 'interactive' && stable >= 6 && Date.now() - started > 3000) ||
        Date.now() - started > timeoutMs;
      if (done) resolve(pages);
      else setTimeout(tick, 500);
    };
    setTimeout(tick, 800);
  });
}

// 組版完了後に印刷（PDFで保存）
async function toPdf() {
  await build();
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
$('imgFile').addEventListener('change', async (e) => {
  const files = [...e.target.files].filter((f) => /^image\//.test(f.type));
  for (const f of files) {
    const dataUri = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(f);
    });
    images.push({
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()),
      name: f.name, dataUri, page: 0, mono: false, widthPct: 80, valign: 'center', caption: '',
    });
  }
  e.target.value = '';
  renderImgList();
});
$('btnBuild').addEventListener('click', () => build());
$('btnPdf').addEventListener('click', () => toPdf());

initForm();
renderImgList();
build();
