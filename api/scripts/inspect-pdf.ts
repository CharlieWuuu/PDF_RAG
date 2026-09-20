/**
 * 階段 1 的檢查工具：逐頁印出擷取到的文字，不碰資料庫。
 * 目的是在投入 embedding 成本之前，先用肉眼確認課本的擷取品質。
 *
 * 用法：npm run inspect -- ./sample.pdf [起始頁] [結束頁]
 */
import { readFile } from 'node:fs/promises';
import { extractPages } from '../src/pdf/pdf-extract.js';
import { removeHeadersFooters } from '../src/pdf/header-footer.js';

async function main() {
  const [path, fromArg, toArg] = process.argv.slice(2);
  if (!path) {
    console.error('用法：npm run inspect -- <PDF 路徑> [起始頁] [結束頁]');
    process.exit(1);
  }

  const raw = await extractPages(new Uint8Array(await readFile(path)));
  const { pages, removed } = removeHeadersFooters(raw);

  console.log(`檔案：${path}`);
  console.log(`總頁數：${pages.length}`);
  console.log(`偵測到的頁首／頁尾樣板（# 代表數字）：`);
  if (removed.length === 0) console.log('  （無）');
  else removed.forEach((line) => console.log(`  - ${line}`));

  const from = fromArg ? Number(fromArg) : 1;
  const to = toArg ? Number(toArg) : pages.length;

  for (const p of pages.filter((p) => p.page >= from && p.page <= to)) {
    const chars = p.lines.join('').length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`第 ${p.page} 頁（${p.lines.length} 行、${chars} 字）`);
    console.log('='.repeat(60));
    // 空頁通常代表掃描版或純圖片，是需要及早發現的問題
    if (p.lines.length === 0) console.log('（此頁沒有可擷取的文字，可能是掃描圖片）');
    else p.lines.forEach((line) => console.log(line));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
