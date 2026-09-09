# ZINE 組版プレビュー（プロトタイプ）

Google ドキュメント / Word の原稿を、**縦書き・右開き / 横書き・左開き**で
プレビューしながら判型・文字サイズ・行間・段組みを検討し、**PDF** まで書き出す。
原稿は1系統だけが「正」なので、InDesign のような二重管理は発生しない。

既定の体裁は**新潮文庫**を目安にしている（A6 / 明朝体 / 本文約 8.7pt / 縦組み）。

使い方は3通り:

| | 何 | データの扱い |
|---|---|---|
| **Web版** (`docs/`) | ブラウザだけで完結。友達に URL を渡して試してもらう用 | `.docx` はブラウザ内で処理。サーバーに送らない |
| **操作パネル** (`npm run app`) | ローカルの操作画面 | 自分の PC の中だけ |
| **コマンド** (`npm run import` / `pdf`) | CLI。入稿 PDF（トンボ対応）まで | 自分の PC の中だけ |

3つとも組版ロジックは共通（`docs/lib/zine-core.js`）。

---

## Web版（GitHub Pages で公開）

`docs/` が公開用の静的サイト。ローカル確認:

```bash
npm run web      # → http://localhost:5173
```

原稿を渡す → ブラウザ内で解析・組版 → Vivliostyle でプレビュー → 「PDF にする」で保存。
**アップロードした原稿はブラウザから外に出ない**（`fetch` も外部へは飛ばない、同梱ライブラリのみ）。

取り込める原稿:

- **Word（.docx）** … 「見出し1」などの段落スタイルから章・扉を判定
- **テキスト（.txt / .md）／貼り付け** … メモ・Evernote などの見出し設定のない文章。
  行頭の記号で構造を指定:
  - `@ 書名` … 扉の書名（`＠` 全角も可）
  - `@@ 副題` … 扉の副題
  - `# 章タイトル` … 章（`##` `###` で小見出し）
  - 「第一章」「はじめに」「序章」などは記号なしでも自動で章見出しに
  - どの記号も該当語も無ければ、1行目も本文扱い・目次なしの通し組みでプレビュー
  - 先頭を `---` … `書名: …` / `副題: …` … `---` で囲む書き方も可

### GitHub Pages にデプロイ

1. GitHub の repo 設定 → **Settings → Pages**
2. Source: **Deploy from a branch**、Branch: `main`、フォルダ: **`/docs`** → Save
3. 数分後 `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される
4. 以後は `git push` するだけで更新

無料枠は **public リポジトリ** が条件。`input/` の .docx は `.gitignore` 済みなので公開されない。
`docs/.nojekyll` を置いてあるので Jekyll 処理は無効。

---

## 操作パネル（推奨）

```bash
npm run app
```

ブラウザで <http://localhost:4321> を開くと、**判型・フォント・文字サイズ・行送り・字間・
段組み・余白をフォームで選び、右に組版プレビュー**が出る画面になる。
「原稿を取り込む」「プレビュー更新」「PDF を書き出す」ボタンで一通り完結する。

- **完全にローカル（localhost）で動く。外部には公開されない。**
- フォームの変更は `zine.settings.mjs` に書き戻されるので、下記のコマンド操作とも共存できる。

以下はコマンドだけで使う場合の手順。

## 使い方（コマンド）

### 1. 原稿を取り込む

Google ドキュメントは「ファイル → ダウンロード → Microsoft Word (.docx)」で書き出し、
その `.docx` を `input/` に置く。

```bash
npm run import
```

`manuscript/` に HTML が作られる（`目次 → 扉 → 本文` の順で組まれる）。
複数ファイルを置くときはファイル名の先頭に `10_` `20_` … と番号を付けると、その順に綴じられる。
（Markdown を直接 `manuscript/xx.md` に置いてもよい。）

取り込み時に自動でやる「構造の判定」:

| Word 側 | 変換結果 |
|---|---|
| 「表題 / Title」書式 | 扉ページの書名 |
| 「サブタイトル / Subtitle」書式 | 扉の副題 |
| 見出し（一番浅いレベル） | `<h1>` = 章。`<section class="chapter">` で囲み、改ページ |
| それより深い見出し | `<h2>` `<h3>` = 節（改ページしない） |
| それ以外の段落 | 本文 `<p>`（字下げ付き） |

- 章見出しが「見出し4」など深いレベルでも、一番浅い見出しが `<h1>` になるよう全体を繰り上げる。
- 見出しに本文が続けて打ち込まれている場合、最初の「：」で見出しと本文に分割する。
- 取り込み後、**どの行を章・節・本文と判定したか**を端末に一覧表示する。ここがズレていたら
  Word 側で段落スタイル（見出し1 / 標準 など）を正しく当て直すのが確実。

**1つの .docx に複数の作品が入っている場合**は警告が出る。`manuscript/` の HTML を
作品ごとに分け、`10_作品A.html` `20_作品B.html` のように番号を付け直す。

### 2. 設定を書き換える

`zine.settings.mjs` の値を変えるだけ:

| 項目 | 内容 | 新潮文庫の目安 |
|------|------|------|
| `direction` | `'vertical'`（縦書き・右開き）/ `'horizontal'`（横書き・左開き） | vertical |
| `size` | `'105mm 148mm'`（文庫=A6）/ `'103mm 182mm'`（新書）/ `'A5'` `'B6'` … | `105mm 148mm` |
| `columns` | `1` / `2`（B6〜A5 の大きめ判なら 2 段組も可） | 1 |
| `fontFamily` | 本文フォント（明朝系）。PDF に埋め込まれる | 游明朝 / ヒラギノ明朝 |
| `fontSize` | 本文の文字サイズ | 約 8.5〜9pt |
| `lineHeight` | 行送り（＝文字サイズの倍率）。大きいほど行間が開く | 約 1.75（本書は 1.85 でやや広め） |
| `letterSpacing` | 字間。`'0'` でベタ組、`'0.03'〜'0.06em'` で少し開く | 0（ここでは 0.04em） |
| `margin` | ページ余白 `'天 小口 地 ノド'` | `16mm 13mm 18mm 13mm` |
| `columnGap` | 段間（`columns: 2` のとき） | — |
| `pageNumber` | ノンブル（ページ番号）表示 | true |
| `runningHead` | 柱（各ページ上部に章タイトルを小さく表示） | true |
| `cropMarks` / `bleed` | 入稿用トンボ＋塗り足し（プレビュー中は `false` でよい） | false |
| `colophon` | 奥付を最終ページに自動生成（下記） | enabled |

### 奥付（最終ページ）

`zine.settings.mjs` の `colophon` で本の最後に奥付ページを自動生成する（縦組みの本でも
奥付だけは横書き。上下に罫線、下寄せ）。操作パネルの「奥付」欄からも編集できる。

| 項目 | 内容 |
|---|---|
| `enabled` | `false` で奥付を付けない |
| `pubDate` | 発行日（例 `"2026年9月9日"`） |
| `edition` | 版数（例 `"初版第1刷"`） |
| `publisher` | 発行者・サークル名 |
| `printer` | 印刷所 |
| `contact` | メール / URL / SNS |
| `copyright` | 空欄なら「© 発行年 著者」を自動で入れる |

空欄の項目は行ごと省略される。

> ぴったり新潮文庫の密度（40字 × 16行前後）にしたいときは
> `fontSize: '8pt'` + `lineHeight: 1.75` + `letterSpacing: '0'`。
> 読みやすさ優先で少しゆったりさせたいときは既定のまま `lineHeight` を 1.9 まで上げる。

### 3. プレビュー

```bash
npm run preview
```

ブラウザが開き、リアルタイムで組版結果を確認できる。
**総ページ数は画面右下**に表示される。`zine.settings.mjs` を保存すると自動で組み直される。
（`npm run pdf` でも書き出しの最後に総ページ数を表示する。）

### 4. 入稿用 PDF を書き出す

```bash
npm run pdf
```

`dist/zine-tategaki.pdf`（または `-yokogaki.pdf`）ができる。
本文フォントは PDF に埋め込まれる。

## 仕組み

- 組版エンジン: [Vivliostyle](https://vivliostyle.org/)（CSS 組版・オープンソース）
- `.docx` 取り込み: [mammoth](https://github.com/mwilliamson/mammoth.js)
- `zine.settings.mjs` → `scripts/gen-theme.mjs` が `themes/generated.css` を生成 →
  `vivliostyle.config.js` が `manuscript/` を並べて組む
- `scripts/import-docx.mjs` … .docx → HTML（構造の判定・章の `<section>` 化・レポート）
- `scripts/build-pdf.mjs` … `npm run pdf` の本体。書き出し後に総ページ数を表示
- `scripts/app.mjs` + `app/index.html` … `npm run app` の操作パネル（localhost 専用の小さな Node サーバー）

## メモ

- 初回の `preview` / `pdf` は Chromium を自動ダウンロードする（数分）。
- 縦組みで半角数字を横に並べたい箇所は、原稿で `<span class="tcy">15</span>` と書く。
- 入稿先がトンボ・塗り足しを要求する場合は `zine.settings.mjs` の `cropMarks: true` に。
