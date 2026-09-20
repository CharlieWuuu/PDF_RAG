import { describe, it, expect } from 'vitest';
import { isRelevant, type Source } from '../src/ask/retrieval.js';

const source = (distance: number): Source => ({
  filename: 'a.pdf',
  page: 1,
  content: '內容',
  distance,
});

describe('isRelevant', () => {
  it('沒有任何檢索結果時視為不相關', () => {
    expect(isRelevant([], 0.55)).toBe(false);
  });

  it('最佳結果小於門檻時視為相關', () => {
    expect(isRelevant([source(0.3), source(0.9)], 0.55)).toBe(true);
  });

  it('最佳結果超過門檻時視為不相關，不應呼叫 LLM', () => {
    expect(isRelevant([source(0.8), source(0.9)], 0.55)).toBe(false);
  });

  it('剛好等於門檻時視為不相關（門檻採嚴格小於）', () => {
    expect(isRelevant([source(0.55)], 0.55)).toBe(false);
  });
});
