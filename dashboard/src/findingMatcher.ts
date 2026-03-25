import type { Finding } from "./types";

function extractWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function wordOverlap(a: string, b: string): number {
  const wordsA = extractWords(a);
  const wordsB = extractWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  const smaller = Math.min(wordsA.size, wordsB.size);
  return matches / smaller;
}

/** Normalize categories like "Oracle Manipulation" and "oracle-manipulation" */
function normalizeCategory(cat: string): string {
  return cat.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Category similarity: exact normalized match = 1, word overlap otherwise */
function categorySimilarity(a: string, b: string): number {
  const na = normalizeCategory(a);
  const nb = normalizeCategory(b);
  if (na === nb) return 1;
  return wordOverlap(na, nb);
}

/** Normalize file path for comparison (strip leading src/ etc.) */
function normalizeFile(f: string): string {
  return f.replace(/^(src\/|contracts\/|\.\/)/i, "").toLowerCase();
}

/** Check if two findings reference the same file */
function sameFile(a: Finding, b: Finding): boolean {
  const fa = a.location?.file;
  const fb = b.location?.file;
  if (!fa || !fb) return false;
  return normalizeFile(fa) === normalizeFile(fb);
}

/** Score how well an AI finding matches a human finding (0-1) */
export function matchScore(ai: Finding, human: Finding): number {
  const catSim = categorySimilarity(ai.category, human.category);
  const titleSim = wordOverlap(ai.title, human.title);
  const descSim = wordOverlap(ai.description, human.description);
  const fileMatch = sameFile(ai, human);
  const textSim = titleSim * 0.4 + descSim * 0.6;

  // Same file + strong text evidence = high confidence match
  if (fileMatch && descSim >= 0.4) return 0.55 + textSim * 0.45;
  if (fileMatch && descSim >= 0.3 && titleSim >= 0.2) return 0.45 + textSim * 0.45;

  // Strong title match alone — require 3+ shared words to avoid
  // generic security terms ("reentrancy", "token") creating false matches
  const titleWordsA = extractWords(ai.title);
  const titleWordsB = extractWords(human.title);
  const sharedTitleWords = [...titleWordsA].filter((w) => titleWordsB.has(w)).length;
  if (titleSim >= 0.5 && sharedTitleWords >= 3) return 0.4 + titleSim * 0.6;

  // Strong description + title or category support (no file match)
  if (descSim >= 0.45 && titleSim >= 0.25) {
    return catSim * 0.1 + titleSim * 0.3 + descSim * 0.6;
  }

  // Default: conservative
  return catSim * 0.1 + titleSim * 0.4 + descSim * 0.3;
}

export function countMatches(aiFindings: Finding[], humanFindings: Finding[]): number {
  const THRESHOLD = 0.5;
  let matched = 0;
  const used = new Set<number>();

  for (const hf of humanFindings) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < aiFindings.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(aiFindings[i]!, hf);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= THRESHOLD) {
      matched++;
      used.add(bestIdx);
    }
  }
  return matched;
}

/** Returns a Set of AI finding IDs that match human findings */
export function getMatchedFindingIds(aiFindings: Finding[], humanFindings: Finding[]): Set<string> {
  const THRESHOLD = 0.5;
  const matchedIds = new Set<string>();
  const used = new Set<number>();

  for (const hf of humanFindings) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < aiFindings.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(aiFindings[i]!, hf);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= THRESHOLD) {
      matchedIds.add(aiFindings[bestIdx]!.id);
      used.add(bestIdx);
    }
  }
  return matchedIds;
}

/** Counts unique findings across all AI findings by clustering duplicates */
export function countUniqueFindings(allFindings: Finding[]): number {
  const THRESHOLD = 0.5;
  const assigned = new Set<number>();
  let groups = 0;

  for (let i = 0; i < allFindings.length; i++) {
    if (assigned.has(i)) continue;
    assigned.add(i);
    groups++;

    for (let j = i + 1; j < allFindings.length; j++) {
      if (assigned.has(j)) continue;
      const score = matchScore(allFindings[j]!, allFindings[i]!);
      if (score >= THRESHOLD) {
        assigned.add(j);
      }
    }
  }
  return groups;
}
