// vivliostyle build を実行し、できた PDF の総ページ数を表示する。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import settings from '../zine.settings.mjs';

const suffix = settings.direction === 'vertical' ? 'tategaki' : 'yokogaki';
const pdf = path.join('dist', `zine-${suffix}.pdf`);

execFileSync('npx', ['vivliostyle', 'build'], { stdio: 'inherit' });

// 総ページ数（pdf-lib で正確に数える）
let pages = null;
try {
  const doc = await PDFDocument.load(fs.readFileSync(pdf), { updateMetadata: false });
  pages = doc.getPageCount();
} catch (e) {
  console.error('ページ数の取得に失敗:', e.message);
}

const dir = settings.direction === 'vertical' ? '縦書き・右開き' : '横書き・左開き';

// 操作パネル（npm run app）が読む要約
try {
  fs.writeFileSync(
    path.join('dist', 'last-build.json'),
    JSON.stringify(
      {
        pdf,
        pages,
        at: new Date().toISOString(),
        size: settings.size,
        direction: settings.direction,
        columns: settings.columns,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
      },
      null,
      2,
    ),
  );
} catch {}

console.log('\n─────────────────────────────');
console.log(`📄 ${pdf}`);
console.log(`📖 判型 ${settings.size} / ${dir} / ${settings.columns}段組 / 本文 ${settings.fontSize}`);
if (pages) console.log(`🔢 総ページ数: ${pages} ページ`);
console.log('─────────────────────────────');
