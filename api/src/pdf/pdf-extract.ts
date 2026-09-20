import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** pdfjs 的文字碎片：str 是內容，transform[4]/[5] 是頁面上的 x/y 座標 */
interface TextItem {
  str: string;
  transform: number[];
}

export interface PageText {
  /** 頁碼從 1 開始，對使用者顯示時不需再換算 */
  page: number;
  /** 該頁的文字行，已依視覺由上而下排序 */
  lines: string[];
}

/**
 * 為什麼用 pdfjs-dist 而不是 pdf-parse：
 * pdf-parse 會把整份 PDF 併成單一字串，拿不到頁碼；
 * 而「回答要標註頁碼」是本專案的硬需求，所以必須逐頁抽取。
 */
export async function extractPages(data: Uint8Array): Promise<PageText[]> {
  // 停用 worker：CLI 與後端都是單次批次處理，多開 worker 反而增加相依與啟動成本
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  const pages: PageText[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const p = await doc.getPage(page);
    const content = await p.getTextContent();
    pages.push({ page, lines: groupItemsIntoLines(content.items as TextItem[]) });
    // 逐頁釋放，避免整本課本的頁面物件同時留在記憶體
    p.cleanup();
  }
  await doc.destroy();
  return pages;
}

/**
 * PDF 的文字是一堆帶座標的碎片，不是「行」。
 * 這裡用 transform 的 y 座標把碎片分群成行，再依 x 排序串接，
 * 這樣後續偵測頁首頁尾才有「整行」可以比對。
 */
function groupItemsIntoLines(items: TextItem[]): string[] {
  const rows = new Map<number, { x: number; text: string }[]>();

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    // 同一行的 y 會有微小浮動，取整到 2 單位作為分群鍵
    const key = Math.round(y / 2) * 2;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push({ x, text: item.str });
  }

  return [...rows.entries()]
    // y 越大越靠頁面上方，所以由大到小排序才是閱讀順序
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length > 0);
}
