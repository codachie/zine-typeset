// 奥付 HTML 生成は docs/lib/zine-core.js（CLI とブラウザ版で共有）に集約。
import { buildColophonHtml as _build } from '../docs/lib/zine-core.js';

// CLI 側は完全な HTML ドキュメントとして書き出す。
export function buildColophonHtml(s) {
  const inner = _build(s);
  if (!inner) return null;
  return `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>奥付</title></head>
<body>
${inner}
</body>
</html>
`;
}
