// ============================================================
//  ZINE 組版プレビュー設定
//  手で編集しても、操作パネル（npm run app）で変更しても OK。
//  既定値の目安は「新潮文庫」（A6 / 明朝体 / 本文約8.7pt / 縦組み）。
// ============================================================

export default {
  title: "わたしの ZINE",
  author: "codachie",
  language: "ja",

  // 'vertical' = 縦書き・右開き / 'horizontal' = 横書き・左開き
  direction: "vertical",

  // 判型  文庫=A6='105mm 148mm' / 新書='103mm 182mm' / 'A5' 'B6' など
  size: "105mm 148mm",

  // 段組み 1 または 2
  columns: 1,

  // 本文フォント（PDF に埋め込まれる）
  fontFamily: '"游明朝", "YuMincho", "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
  headingFontFamily: '"游明朝", "YuMincho", "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',

  // 本文の文字サイズ（pt）
  fontSize: "8.7pt",

  // 行送り（＝文字サイズの倍率。大きいほど行間が開く）
  lineHeight: 1.85,

  // 字間  '0' でベタ組、'0.03em'〜'0.06em' で少し開く
  letterSpacing: "0.04em",

  // ページ余白  '天 小口 地 ノド'
  margin: "16mm 13mm 18mm 13mm",

  // 段間（columns: 2 のとき）
  columnGap: "9mm",

  // ノンブル（ページ番号）
  pageNumber: true,

  // 柱（各ページ上部の章タイトル）
  runningHead: true,

  // 目次の見出し
  tocTitle: "目次",

  // 入稿用トンボ＋塗り足し
  cropMarks: false,
  bleed: "3mm",

  // 奥付（本の最終ページに自動生成）。enabled: false で付けない。
  colophon: {
    enabled: true,
    pubDate: "2026年9月9日",
    edition: "初版第1刷",
    publisher: "",
    printer: "",
    contact: "",
    copyright: "",
  },
};
