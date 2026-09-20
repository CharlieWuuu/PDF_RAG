import { describe, it, expect } from 'vitest';
import { chunkPages } from '../src/chunking/chunker.js';

const opts = { size: 100, overlap: 20 };

describe('chunkPages', () => {
  it('短文件只產生一塊，且保留頁碼', () => {
    const chunks = chunkPages([{ page: 7, lines: ['短短一段文字。'] }], opts);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].page).toBe(7);
    expect(chunks[0].content).toBe('短短一段文字。');
  });

  it('累積超過目標大小時切開，chunkIndex 連續遞增', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `段落${i}`.padEnd(40, '字'));
    const chunks = chunkPages([{ page: 1, lines }], opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it('相鄰塊之間有重疊，避免答案被切在邊界', () => {
    const lines = Array.from({ length: 6 }, () => 'x'.repeat(45));
    const chunks = chunkPages([{ page: 1, lines }], opts);
    const tail = chunks[0].content.slice(-opts.overlap);
    expect(chunks[1].content.startsWith(tail)).toBe(true);
  });

  it('單一段落超過目標大小時會被強制切分', () => {
    const chunks = chunkPages([{ page: 2, lines: ['a'.repeat(350)] }], opts);
    expect(chunks.length).toBeGreaterThan(1);
    // 每塊都不應超過目標大小
    expect(chunks.every((c) => c.content.length <= opts.size)).toBe(true);
    expect(chunks.every((c) => c.page === 2)).toBe(true);
  });

  it('跨頁時記錄該塊起始所在的頁碼', () => {
    const chunks = chunkPages(
      [
        { page: 3, lines: ['x'.repeat(95)] },
        { page: 4, lines: ['y'.repeat(95)] },
      ],
      opts,
    );
    expect(chunks[0].page).toBe(3);
    expect(chunks.at(-1)!.page).toBe(4);
  });

  it('忽略空白內容，不產生空塊', () => {
    const chunks = chunkPages([{ page: 1, lines: ['   ', ''] }], opts);
    expect(chunks).toHaveLength(0);
  });
});
