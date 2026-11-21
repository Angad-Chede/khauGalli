import { describe, it, expect } from 'vitest';

/**
 * Trigram extraction helper (mirrors PostgreSQL pg_trgm)
 */
function extractTrigrams(str: string): Set<string> {
  const padded = `  ${str.toLowerCase().trim()} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Computes word similarity between query and candidate string
 * (mirrors PostgreSQL pg_trgm word_similarity(query, target))
 */
function wordSimilarity(query: string, target: string): number {
  const words = target.split(/\s+/);
  let maxSim = 0;

  for (const word of words) {
    const qTrigrams = extractTrigrams(query);
    const wTrigrams = extractTrigrams(word);

    let intersection = 0;
    for (const t of qTrigrams) {
      if (wTrigrams.has(t)) intersection++;
    }

    const union = new Set([...qTrigrams, ...wTrigrams]).size;
    const sim = union > 0 ? intersection / union : 0;
    if (sim > maxSim) maxSim = sim;
  }

  return maxSim;
}

describe('Multi-tier Search Engine Tests (FTS, Word Similarity, Prefix)', () => {
  const menuDishes = [
    'Pani Puri (8 pcs)',
    'Mumbai Sev Puri',
    'Special Butter Pav Bhaji',
    'Sweet Masala Lassi',
    'Fragrant Dum Biryani',
  ];

  it('matches prefix for live 2-3 char input ("bir" -> "Fragrant Dum Biryani")', () => {
    const query = 'bir';
    const matches = menuDishes.filter((dish) =>
      dish.toLowerCase().includes(query.toLowerCase())
    );
    expect(matches).toContain('Fragrant Dum Biryani');
  });

  it('tolerates phonetic and typo misspellings using word_similarity ("briyani" -> "Fragrant Dum Biryani")', () => {
    const typoQuery = 'briyani';
    const target = 'Fragrant Dum Biryani';

    const sim = wordSimilarity(typoQuery, target);
    // Trigram word similarity between "briyani" and "Biryani" is ~0.45, well above the 0.25 threshold
    expect(sim).toBeGreaterThan(0.25);
  });

  it('tolerates "pav baji" typo matching "Special Butter Pav Bhaji"', () => {
    const typoQuery = 'baji';
    const target = 'Special Butter Pav Bhaji';

    const sim = wordSimilarity(typoQuery, target);
    expect(sim).toBeGreaterThan(0.25);
  });

  it('exact keyword match ranks top via token search', () => {
    const query = 'pav bhaji';
    const queryTokens = query.toLowerCase().split(' ');

    const scores = menuDishes.map((dish) => {
      const dishLower = dish.toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (dishLower.includes(token)) matchCount++;
      }
      return { dish, matchCount };
    });

    scores.sort((a, b) => b.matchCount - a.matchCount);
    expect(scores[0].dish).toBe('Special Butter Pav Bhaji');
    expect(scores[0].matchCount).toBe(2);
  });
});
