// ローカル操作パネル。ブラウザで判型・フォント・pt・行間・段組みをフォームで選び、
// 「取り込み」「プレビュー更新」「PDF書き出し」を押す。すべて localhost で動く。
//
//   起動:  npm run app   →  http://localhost:4321 を開く
//
// このサーバーは外部に公開されない（localhost のみ）。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FONT_PRESETS, SIZE_PRESETS } from '../docs/lib/zine-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4321;

// ---- 設定ファイルの読み書き --------------------------------------------
async function loadSettings() {
  const url =
    pathToFileURL(path.join(root, 'zine.settings.mjs')).href + '?t=' + Date.now();
  return (await import(url)).default;
}

function renderSettingsFile(s) {
  const q = (v) => JSON.stringify(v);
  // フォント指定は二重引用符を含むので、外側はシングルクォートで読みやすく
  const qf = (v) => (String(v).includes("'") ? JSON.stringify(v) : `'${v}'`);
  return `// ============================================================
//  ZINE 組版プレビュー設定
//  手で編集しても、操作パネル（npm run app）で変更しても OK。
//  既定値の目安は「新潮文庫」（A6 / 明朝体 / 本文約8.7pt / 縦組み）。
// ============================================================

export default {
  title: ${q(s.title ?? '')},
  author: ${q(s.author ?? '')},
  language: ${q(s.language || 'ja')},

  // 'vertical' = 縦書き・右開き / 'horizontal' = 横書き・左開き
  direction: ${q(s.direction || 'vertical')},

  // 判型  文庫=A6='105mm 148mm' / 新書='103mm 182mm' / 'A5' 'B6' など
  size: ${q(s.size || '105mm 148mm')},

  // 段組み 1 または 2
  columns: ${Number(s.columns) === 2 ? 2 : 1},

  // 本文フォント（PDF に埋め込まれる）
  fontFamily: ${qf(s.fontFamily || FONT_PRESETS['mincho-yu'].stack)},
  headingFontFamily: ${qf(s.headingFontFamily || s.fontFamily || FONT_PRESETS['mincho-yu'].stack)},

  // 本文の文字サイズ（pt）
  fontSize: ${q(s.fontSize || '8.7pt')},

  // 行送り（＝文字サイズの倍率。大きいほど行間が開く）
  lineHeight: ${Number(s.lineHeight) || 1.85},

  // 字間  '0' でベタ組、'0.03em'〜'0.06em' で少し開く
  letterSpacing: ${q(s.letterSpacing ?? '0.04em')},

  // ページ余白  '天 小口 地 ノド'
  margin: ${q(s.margin || '16mm 13mm 18mm 13mm')},

  // 段間（columns: 2 のとき）
  columnGap: ${q(s.columnGap || '9mm')},

  // ノンブル（ページ番号）
  pageNumber: ${s.pageNumber !== false},

  // 柱（各ページ上部の章タイトル）
  runningHead: ${s.runningHead !== false},

  // 目次の見出し
  tocTitle: ${q(s.tocTitle || '目次')},

  // 入稿用トンボ＋塗り足し
  cropMarks: ${!!s.cropMarks},
  bleed: ${q(s.bleed || '3mm')},

  // 奥付（本の最終ページに自動生成）。enabled: false で付けない。
  colophon: {
    enabled: ${(s.colophon?.enabled) !== false},
    pubDate: ${q(s.colophon?.pubDate ?? '')},
    edition: ${q(s.colophon?.edition ?? '初版第1刷')},
    publisher: ${q(s.colophon?.publisher ?? '')},
    printer: ${q(s.colophon?.printer ?? '')},
    contact: ${q(s.colophon?.contact ?? '')},
    copyright: ${q(s.colophon?.copyright ?? '')},
  },
};
`;
}

// ---- 子プロセス実行 ---------------------------------------------------
function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: root, env: process.env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => resolve({ code: -1, out: out + '\n' + e.message }));
    p.on('close', (code) => resolve({ code, out }));
  });
}

let busy = false;

function readLastBuild() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'dist/last-build.json'), 'utf8'));
  } catch {
    return null;
  }
}

function pdfPathFor(settings) {
  const suffix = settings.direction === 'vertical' ? 'tategaki' : 'yokogaki';
  return path.join(root, 'dist', `zine-${suffix}.pdf`);
}

// ---- HTTP ----------------------------------------------------------
const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/') {
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(root, 'app/index.html')));
    }

    if (req.method === 'GET' && p === '/api/state') {
      const settings = await loadSettings();
      const inputDir = path.join(root, 'input');
      const inputFiles = fs
        .readdirSync(inputDir)
        .filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$'));
      const manuscriptFiles = fs
        .readdirSync(path.join(root, 'manuscript'))
        .filter((f) => /\.(md|html?)$/i.test(f));
      return json(res, 200, {
        settings,
        fontPresets: FONT_PRESETS,
        sizePresets: SIZE_PRESETS,
        inputFiles,
        manuscriptFiles,
        pdfReady: fs.existsSync(pdfPathFor(settings)),
        lastBuild: readLastBuild(),
        busy,
      });
    }

    if (req.method === 'POST' && p === '/api/settings') {
      const body = await readBody(req);
      const current = await loadSettings();
      const next = { ...current, ...body };
      fs.writeFileSync(path.join(root, 'zine.settings.mjs'), renderSettingsFile(next));
      return json(res, 200, { ok: true, settings: next });
    }

    if (req.method === 'POST' && (p === '/api/import' || p === '/api/build')) {
      if (busy) return json(res, 409, { ok: false, error: '処理中です。少し待ってください。' });
      busy = true;
      let log = '';
      try {
        if (p === '/api/import') {
          const a = await run('node', ['scripts/import-docx.mjs']);
          log += a.out + '\n';
          if (a.code !== 0) return json(res, 200, { ok: false, log, step: 'import' });
        }
        const b = await run('node', ['scripts/build-pdf.mjs']);
        log += b.out;
        return json(res, 200, { ok: b.code === 0, log, lastBuild: readLastBuild() });
      } finally {
        busy = false;
      }
    }

    if (req.method === 'GET' && (p === '/api/pdf' || p === '/api/pdf/download')) {
      const settings = await loadSettings();
      const file = pdfPathFor(settings);
      if (!fs.existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'PDF はまだありません。');
      const headers = { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' };
      if (p === '/api/pdf/download') {
        const name = `zine-${settings.direction === 'vertical' ? 'tategaki' : 'yokogaki'}.pdf`;
        headers['Content-Disposition'] = `attachment; filename="${name}"`;
      }
      res.writeHead(200, headers);
      return fs.createReadStream(file).pipe(res);
    }

    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (e) {
    json(res, 500, { ok: false, error: e.message });
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => (s += d));
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ZINE 操作パネル  →  http://localhost:${PORT}\n`);
  console.log('  ローカル専用（外部には公開されません）。Ctrl+C で終了。\n');
});
