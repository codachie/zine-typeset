// Vivliostyle CLI 設定。
// zine.settings.mjs を読み、テーマ CSS を生成し、manuscript/ の中身を
// ファイル名順に本文として並べる。原稿はこの1系統だけが「正」= 二重管理なし。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import settings from './zine.settings.mjs';
import { buildTheme } from './scripts/gen-theme.mjs';
import { buildColophonHtml } from './scripts/gen-colophon.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

// 1) 設定からテーマ CSS を書き出す
fs.mkdirSync(path.join(root, 'themes'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'themes/generated.css'),
  buildTheme(settings),
);

// 2) manuscript/ の .md / .html をファイル名順に収集。
//    目次は先頭に自動生成され、そのあとに扉・本文が続く。
const manuscriptDir = path.join(root, 'manuscript');
const entry = fs
  .readdirSync(manuscriptDir)
  .filter((f) => /\.(md|html?)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'ja'))
  .map((f) => `manuscript/${f}`);

// 3) 奥付ページを生成して最後に足す
const colophonHtml = buildColophonHtml(settings);
if (colophonHtml) {
  fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
  fs.writeFileSync(path.join(root, 'generated/okuduke.html'), colophonHtml);
  entry.push('generated/okuduke.html');
}

const suffix = settings.direction === 'vertical' ? 'tategaki' : 'yokogaki';

export default {
  title: settings.title,
  author: settings.author,
  language: settings.language ?? 'ja',
  size: settings.size,
  theme: './themes/generated.css',
  entry,
  toc: {
    title: settings.tocTitle ?? '目次',
    sectionDepth: 2, // 章(h1)＋節(h2)まで目次に載せる
  },
  // 右開き / 左開き（見開きの読み進み方向）
  readingProgression: settings.direction === 'vertical' ? 'rtl' : 'ltr',
  // 入稿用トンボ・塗り足し（zine.settings.mjs で切り替え）
  ...(settings.cropMarks
    ? { cropMarks: true, bleed: settings.bleed ?? '3mm' }
    : {}),
  output: [`dist/zine-${suffix}.pdf`],
  workspaceDir: '.vivliostyle',
};
