import type { PageText } from './pdf-extract.js';

/** 只檢查每頁最前／最後幾行，頁首頁尾不會出現在頁面中央 */
const EDGE_LINES = 3;
/** 出現在超過這個比例的頁面，才視為固定頁首頁尾 */
const REPEAT_RATIO = 0.5;

/**
 * 偵測並移除重複出現的頁首、頁尾。
 * 為什麼需要：課本每頁都有「第 3 章 光合作用」「- 42 -」這類固定行，
 * 若不移除，切塊後每一塊都混入相同雜訊，會稀釋 embedding 的語意。
 */
export function removeHeadersFooters(pages: PageText[]): {
  pages: PageText[];
  removed: string[];
} {
  // 單頁或雙頁無從判斷「重複」，直接原樣回傳
  if (pages.length < 3) return { pages, removed: [] };

  const counts = new Map<string, number>();
  for (const p of pages) {
    const edges = [...p.lines.slice(0, EDGE_LINES), ...p.lines.slice(-EDGE_LINES)];
    // 同一頁重複出現的同一行只計一次，避免單頁灌票
    for (const line of new Set(edges.map(normalize))) {
      if (!line) continue;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const threshold = pages.length * REPEAT_RATIO;
  const repeated = new Set(
    [...counts.entries()].filter(([, n]) => n >= threshold).map(([line]) => line),
  );

  return {
    pages: pages.map((p) => ({
      ...p,
      lines: p.lines.filter((line, i) => {
        const isEdge = i < EDGE_LINES || i >= p.lines.length - EDGE_LINES;
        return !(isEdge && repeated.has(normalize(line)));
      }),
    })),
    removed: [...repeated],
  };
}

/**
 * 把頁碼數字換成佔位符再比對。
 * 因為「- 42 -」和「- 43 -」字面不同但其實是同一個頁尾樣板，
 * 不正規化的話會各自只出現一次，永遠達不到重複門檻。
 */
function normalize(line: string): string {
  return line.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}
