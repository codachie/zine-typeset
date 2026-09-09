// input/ に置いた .docx（Googleドキュメント・Word からの書き出し）を
// manuscript/ の HTML に変換する。見出し・太字・箇条書き・画像を引き継ぐ。
//
//   使い方:  Googleドキュメント → ファイル → ダウンロード → Word(.docx)
//            その .docx を input/ に置いて  npm run import

import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import {
  WORD_STYLE_MAP as styleMap,
  escapeHtml,
  normalizeHeadingLevels,
  splitOverlongHeadings,
  extractTitlepage,
  wrapChapters,
} from '../docs/lib/zine-core.js';

const inDir = 'input';
const outDir = 'manuscript';
fs.mkdirSync(outDir, { recursive: true });

const files = fs
  .readdirSync(inDir)
  .filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$'));

if (files.length === 0) {
  console.log(
    'input/ に .docx がありません。\n' +
      'Googleドキュメントは「ファイル → ダウンロード → Microsoft Word(.docx)」で書き出し、\n' +
      'input/ フォルダに置いてから  npm run import  を実行してください。',
  );
  process.exit(0);
}

const htmlDoc = (title, inner) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body>
${inner}
</body>
</html>
`;

let multi = 0;

for (let fi = 0; fi < files.length; fi++) {
  const file = files[fi];
  const src = path.join(inDir, file);
  const { value, messages } = await mammoth.convertToHtml({ path: src }, { styleMap });

  let body = normalizeHeadingLevels(value);
  body = splitOverlongHeadings(body);

  // 先頭のタイトル / サブタイトルを扉ページにまとめる
  const { bookTitle, titlepageHtml, rest } = extractTitlepage(body);
  const titlepage = titlepageHtml ? titlepageHtml + '\n' : '';

  // 各章を <section class="chapter"> で囲み、扉を先頭に戻す
  body = titlepage + wrapChapters(rest.trim());

  const base = file.replace(/\.docx$/i, '');
  const docTitle = bookTitle || base;
  const outFile = path.join(outDir, `${base}.html`);
  fs.writeFileSync(outFile, htmlDoc(docTitle, body));
  const written = [outFile];

  // レポート（見出しを「章」と認識したか、本文段落かを見せる）
  const chapters = (body.match(/<section class="chapter">/g) || []).length;
  const paras = (body.match(/<p[ >]/g) || []).length;
  const headings = [...body.matchAll(/<h([1-3])>([\s\S]*?)<\/h\1>/g)].map(
    (m) => `h${m[1]}  ${m[2].replace(/<[^>]+>/g, '').slice(0, 32)}`,
  );
  const extraTitles = (body.match(/<p class="book-title">/g) || []).length;
  if (extraTitles) multi++;

  console.log(`\n✔ ${src}`);
  for (const w of written) console.log(`  → ${w}`);
  console.log(
    `   タイトル: ${bookTitle || '(なし・ファイル名を使用)'} / 扉: ${titlepage ? 'あり' : 'なし'} / 章: ${chapters} / 本文段落: ${paras}`,
  );
  console.log('   章見出しとして認識:');
  for (const h of headings) console.log(`     ${h}`);
  if (extraTitles)
    console.log(
      `   ⚠ 本文中に別のタイトル書式が ${extraTitles} 個あります（1ファイルに複数作品？ → 分割を検討）`,
    );
  for (const m of messages) console.log(`   [${m.type}] ${m.message}`);
}

console.log(
  '\n完了。目次は見出しから自動生成され、先頭に入ります（目次 → 扉 → 本文）。\n' +
    (multi
      ? '1つの .docx に複数の作品が入っているようです。manuscript/ の HTML を\n' +
        '作品ごとに分け、ファイル名の先頭に 10_ 20_ … と番号を付けて順番を整えてください。\n'
      : '') +
    '次に:  npm run preview',
);
