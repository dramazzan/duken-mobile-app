import { Platform } from 'react-native';

const MAX_CANDIDATES = 8;
const MIN_CANDIDATE_LENGTH = 3;
const MAX_CANDIDATE_LENGTH = 72;
const LETTER_PATTERN = /[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
const NON_NAME_BOUNDARY_PATTERN = /^[^0-9A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+|[^0-9A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+$/g;

type MlKitTextElement = {
  text?: string;
};

type MlKitTextLine = {
  text?: string;
  elements?: MlKitTextElement[];
};

type MlKitTextBlock = {
  text?: string;
  lines?: MlKitTextLine[];
};

type MlKitTextResult = {
  text?: string;
  blocks?: MlKitTextBlock[];
};

export type ProductTextRecognitionResult = {
  candidates: string[];
  rawText: string;
};

function normalizeTextFragment(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(NON_NAME_BOUNDARY_PATTERN, '')
    .trim();
}

function isLikelyNoise(value: string) {
  const normalized = normalizeTextFragment(value);

  if (normalized.length < MIN_CANDIDATE_LENGTH || normalized.length > MAX_CANDIDATE_LENGTH) {
    return true;
  }

  if (!LETTER_PATTERN.test(normalized)) {
    return true;
  }

  if (/^\d+([.,]\d+)?$/.test(normalized)) {
    return true;
  }

  if (/^\d{6,}$/.test(normalized.replace(/\D/g, ''))) {
    return true;
  }

  return false;
}

function scoreCandidate(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  const letters = value.replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/g, '').length;
  const digits = value.replace(/\D/g, '').length;
  const hasBrandLikeLength = value.length >= 4 && value.length <= 36;
  const hasUsefulWordCount = words.length >= 1 && words.length <= 5;
  const digitRatio = digits / Math.max(value.length, 1);

  let score = 0;
  score += letters * 2;
  score += hasBrandLikeLength ? 18 : 0;
  score += hasUsefulWordCount ? 12 : 0;
  score += words.length >= 2 ? 6 : 0;
  score -= digitRatio > 0.45 ? 18 : 0;
  score -= /(^|\s)(тг|kzt|₸|\d+[.,]\d{2})(\s|$)/i.test(value) ? 12 : 0;

  return score;
}

function collectTextFragments(result: MlKitTextResult) {
  const fragments: string[] = [];

  if (result.text) {
    fragments.push(...result.text.split(/\r?\n/));
  }

  for (const block of result.blocks ?? []) {
    if (block.text) {
      fragments.push(block.text);
    }

    for (const line of block.lines ?? []) {
      if (line.text) {
        fragments.push(line.text);
      }

      for (const element of line.elements ?? []) {
        if (element.text) {
          fragments.push(element.text);
        }
      }
    }
  }

  return fragments;
}

export function buildProductNameCandidates(result: MlKitTextResult) {
  const seen = new Set<string>();

  return collectTextFragments(result)
    .map(normalizeTextFragment)
    .filter((fragment) => {
      if (isLikelyNoise(fragment)) {
        return false;
      }

      const key = fragment.toLocaleLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((left, right) => scoreCandidate(right) - scoreCandidate(left))
    .slice(0, MAX_CANDIDATES);
}

export async function recognizeProductText(imageUri: string): Promise<ProductTextRecognitionResult> {
  if (Platform.OS === 'web') {
    return { candidates: [], rawText: '' };
  }

  try {
    const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
    const result = await TextRecognition.recognize(imageUri);
    const rawText = result.text?.trim() ?? '';

    return {
      candidates: buildProductNameCandidates(result),
      rawText,
    };
  } catch (error) {
    console.warn('Product OCR failed', error);
    return { candidates: [], rawText: '' };
  }
}
