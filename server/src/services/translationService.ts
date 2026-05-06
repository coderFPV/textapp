const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:8000/v1';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'Qwen2.5-7B-Instruct-4bit';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || 'LOVE';
const MAX_RETRIES = 2;

// Simple in-memory cache to avoid redundant calls within the same session
const translationCache = new Map<string, string>();

/**
 * Language code → Unicode range for validation
 * Used to verify the model didn't hallucinate a mixed-script response.
 */
const LANG_SCRIPT_RANGES: Record<string, [number, number][]> = {
  // Latin-script languages: allow ASCII + Latin-1 Supplement + Latin Extended-A/B (accents, umlauts, ¿¡, etc.) + common punctuation
  en: [[0x0020, 0x024F], [0x2000, 0x206F], [0x3000, 0x303F]], // Latin + punctuation
  es: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  fr: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  de: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  it: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  pt: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  nl: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  pl: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  cs: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  tr: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  vi: [[0x0020, 0x024F], [0x2000, 0x206F]], // Latin + punctuation
  // Cyrillic (Russian)
  ru: [[0x0400, 0x04FF], [0x0460, 0x04FF], [0x0020, 0x007E], [0x2000, 0x206F]], // Cyrillic + space/punctuation
  // Japanese
  ja: [[0x3040, 0x309F], [0x30A0, 0x30FF], [0x4E00, 0x9FFF], [0x3000, 0x303F], [0xFF00, 0xFFEF]], // Hiragana, Katakana, Kanji, punctuation, fullwidth
  // Chinese
  zh: [[0x4E00, 0x9FFF], [0x3000, 0x303F], [0x2000, 0x206F]], // Kanji + punctuation
  // Korean
  ko: [[0xAC00, 0xD7AF], [0x1100, 0x11FF], [0x3000, 0x303F]], // Hangul + punctuation
  // Arabic
  ar: [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0x2000, 0x206F]],
  // Hindi / Devanagari
  hi: [[0x0900, 0x097F], [0x2000, 0x206F], [0x0964, 0x0965]],
  // Greek
  el: [[0x0370, 0x03FF], [0x1F00, 0x1FFF], [0x2000, 0x206F]],
  // Thai
  th: [[0x0E00, 0x0E7F], [0x2000, 0x206F]],
};

/**
 * Check if the response contains ONLY characters expected for the target language,
 * AND contains at least one character from the target language's primary script.
 * This catches hallucinated mixed-script output (e.g., Russian with Japanese kanji).
 */
function isValidTranslation(output: string, targetLang: string): boolean {
  if (!output || output.trim().length === 0) return false;
  
  const ranges = LANG_SCRIPT_RANGES[targetLang];
  if (!ranges) return true; // No validation rules for this language
  
  const trimmed = output.trim();
  
  // For non-ASCII primary script languages, require at least one character
  // from the target's main script range. This prevents the model from
  // hallucinating the source text unchanged.
  const primaryScriptRanges: [number, number][] = {
    ru: [[0x0400, 0x04FF]],
    ja: [[0x3040, 0x309F], [0x30A0, 0x30FF], [0x4E00, 0x9FFF]],
    zh: [[0x4E00, 0x9FFF]],
    ko: [[0xAC00, 0xD7AF]],
    ar: [[0x0600, 0x06FF]],
    hi: [[0x0900, 0x097F]],
    el: [[0x0370, 0x03FF], [0x1F00, 0x1FFF]],
    th: [[0x0E00, 0x0E7F]],
  };
  
  const primaryRanges = primaryScriptRanges[targetLang];
  if (primaryRanges) {
    const hasPrimaryScript = trimmed.split('').some(ch => {
      const code = ch.codePointAt(0)!;
      return primaryRanges.some(([start, end]) => code >= start && code <= end);
    });
    if (!hasPrimaryScript) {
      console.log(`[translate] Output has no ${targetLang} primary script chars: "${trimmed}"`);
      return false;
    }
  }
  
  // Check that EVERY character is within allowed ranges for this language
  for (const char of trimmed) {
    const code = char.codePointAt(0)!;
    if (!ranges.some(([start, end]) => code >= start && code <= end)) {
      // Character is from an unexpected script
      console.log(`[translate] Invalid script char U+${code.toString(16).toUpperCase()} in ${targetLang} output`);
      return false;
    }
  }
  return true;
}

/**
 * Translates a given text from one language to another using the configured AI model.
 * Uses an in-memory cache to minimize latency and local API overhead.
 * 
 * FIXED: Returns a structured result with `success` flag so the caller can distinguish
 * between successful translation and failure. When translation fails (API error or
 * empty response), the function now returns `{ success: false, text: originalText }`
 * instead of silently returning the original text, allowing callers to emit appropriate
 * warnings to clients.
 */
export type TranslateResult = {
  text: string;
  success: true;
  fromLang: string;
  toLang: string;
} | {
  text: string;
  success: false;
  fromLang: string;
  toLang: string;
  error: string;
};

/**
 * Extracts the translation content from an Ollama API response.
 * Handles extended thinking/reasoning fields if present.
 */
function extractTranslation(data: any): string {
  let text = data.choices?.[0]?.message?.content?.trim() || '';
  
  // If content is empty but model provided extended reasoning, try to extract
  // from reasoning field (only applies to models with extended thinking support)
  if (!text && data.choices?.[0]?.message?.reasoning) {
    const reasoning = data.choices[0].message.reasoning;
    
    // Try to extract non-reasoning text from reasoning output
    // Look for the last block of text that looks like actual translation
    const lines = reasoning.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    
    // Find lines that look like translations (not reasoning markers)
    const reasoningKeywords = [
      'thinking', 'analyze', 'consider', 'translate', 'translate to', 
      'need to', 'should', 'first', 'next', 'then', 'so', 'therefore',
      'так как', 'потому что', 'значит', 'итак', 'хорошо', 'ладно',
      'хочу', 'думаю', 'начну', 'проверю', 'найду'
    ];
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      // Skip lines that look like reasoning markers
      const isReasoningMarker = reasoningKeywords.some(kw => 
        line.toLowerCase().startsWith(kw.toLowerCase()) || line.toLowerCase().includes(kw + ':')
      );
      // Skip empty or very short lines
      if (line.length > 0 && line.length < 500 && !isReasoningMarker) {
        text = line;
        break;
      }
    }
    
    // If still empty, try to find non-English, non-source text in reasoning
    if (!text) {
      const reasoningLower = reasoning.toLowerCase();
      
      // Russian text detection
      const RussianWords = /[\u0400-\u04FF]+/;
      const hasRussian = RussianWords.test(reasoning);
      if (hasRussian) {
        const russianMatches = reasoning.match(/[\u0400-\u04FF][\u0400-\u04FF\s.,!?»«"']/g);
        if (russianMatches) {
          russianMatches.sort((a: string, b: string) => b.length - a.length);
          const candidate = russianMatches[0];
          if (candidate.length > 2) {
            text = candidate.trim();
          }
        }
      }
    }
  }
  
  return text;
}

/**
 * Call the Ollama translation API once.
 */
async function callOllama(text: string, fromLang: string, toLang: string): Promise<{ ok: boolean; content: string }> {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OLLAMA_API_KEY}`,
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Your ONLY job is to translate text from one language to another.

RULES:
1. Identify the source language from the text automatically.
2. Translate the text to ${toLang}.
3. Output ONLY the translated text. No explanations, no quotes, no labels, no reasoning.
4. Preserve the original tone, formality level, and punctuation.
5. If the text is already in ${toLang}, return it unchanged.

Example:
Input (en → es): "Good morning, how are you?"
Output: "Buenos días, ¿cómo estás?"

Input (es → en): "¿Dónde está la biblioteca?"
Output: "Where is the library?"

Input (ja → fr): "ありがとうございます"
Output: "Merci"

Translate ONLY. Never add commentary. Never explain your choice. Never output the source language.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
      options: {
        num_ctx: 2048,
      },
    }),
  });

  if (!response.ok) {
    return { ok: false, content: '' };
  }

  const data = await response.json();
  return { ok: true, content: extractTranslation(data) };
}

export async function translate(
  text: string,
  fromLang: string,
  toLang: string
): Promise<TranslateResult> {
  // If languages are the same, no translation needed
  if (fromLang.toLowerCase() === toLang.toLowerCase()) {
    return { text, success: true, fromLang, toLang };
  }

  const cacheKey = `${fromLang}:${toLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    return { text: translationCache.get(cacheKey)!, success: true, fromLang, toLang };
  }

  // Try translation with retries on bad output (mixed-script hallucination)
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { ok, content } = await callOllama(text, fromLang, toLang);
    
    if (!ok) {
      const errorMsg = `Ollama API error: ${content} for ${fromLang}→${toLang}: "${text.substring(0, 50)}"`;
      console.error(`[translate] ${errorMsg}`);
      continue; // retry
    }

    let translatedText = content.trim();
    if (!translatedText) {
      console.log(`[translate] Empty result for ${fromLang}→${toLang}: "${text.substring(0, 50)}" (attempt ${attempt + 1})`);
      continue; // retry on empty
    }

    // Strip surrounding quotes
    translatedText = translatedText
      .replace(/^[""`'](.+)[""`']$/, '$1')
      .replace(/^[""`'](.+)[""`']$/, '$1')
      .trim();

    // Check for hallucinated mixed-script output
    if (!isValidTranslation(translatedText, toLang)) {
      console.log(`[translate] Mixed-script hallucination on attempt ${attempt + 1} for ${fromLang}→${toLang}, retrying`);
      continue; // retry with different generation
    }

    // Check if model failed to translate (returned original text)
    if (translatedText.toLowerCase() === text.toLowerCase()) {
      // On first attempt, try the aggressive fallback prompt
      if (attempt === 0) {
        const { ok: fallbackOk, content: fallbackContent } = await callOllama(text, fromLang, toLang);
        if (fallbackOk) {
          const fbText = fallbackContent
            .replace(/^[""`'](.+)[""`']$/, '$1')
            .trim();
          if (fbText && fbText.toLowerCase() !== text.toLowerCase() && isValidTranslation(fbText, toLang)) {
            translatedText = fbText;
          } else {
            // Still bad, treat as final failure after retry
            console.log(`[translate] Fallback prompt also failed for ${fromLang}→${toLang}`);
            continue;
          }
        }
      } else {
        // No more retries
        console.log(`[translate] Translation failed (returned original) for ${fromLang}→${toLang}: "${text.substring(0, 50)}"`);
        return { text, success: false, fromLang, toLang, error: 'Model returned original text without translating' };
      }
    }

    // Success — cache and return
    translationCache.set(cacheKey, translatedText);
    return { text: translatedText, success: true, fromLang, toLang };
  }

  // Exhausted all retries
  console.error(`[translate] All ${MAX_RETRIES + 1} attempts failed for ${fromLang}→${toLang}: "${text.substring(0, 50)}"`);
  return { text, success: false, fromLang, toLang, error: 'All translation attempts failed' };
}

/**
 * Extract translations from the sender's message based on receiver's language.
 * Returns the message with translations if both languages are available and different.
 * FIXED: This function is now async and properly awaits the translation before
 * returning the message, eliminating the TOCTOU race condition where the caller
 * would receive the message before translations were populated.
 */
export async function getTranslatedMessage(
  message: any,
  senderLanguage: string,
  receiverLanguage: string,
): Promise<any> {
  if (!message?.text || !senderLanguage || !receiverLanguage) {
    return message;
  }

  // If languages are the same, don't translate
  if (senderLanguage.toLowerCase() === receiverLanguage.toLowerCase()) {
    return message;
  }

  // If the message already has translations for this language, don't re-translate
  if (message.translations?.[receiverLanguage]) {
    return message;
  }

  // Translate the message - FIX: use async/await instead of fire-and-forget .then()
  const result = await translate(message.text, senderLanguage, receiverLanguage);

  if (message.translations) {
    message.translations[receiverLanguage] = result.text;
    if (!result.success) {
      message.translationFailed = true;
      message.translationError = result.error;
    }
  } else {
    message.translations = { [receiverLanguage]: result.text };
    if (!result.success) {
      message.translationFailed = true;
      message.translationError = result.error;
    }
  }

  return message;
}

/**
 * Re-translate a message to a specific language.
 * Returns the updated message with the new translation.
 */
export async function reTranslateMessage(
  message: any,
  senderLanguage: string,
  targetLanguage: string
): Promise<any> {
  if (!message?.text || !senderLanguage) {
    return message;
  }

  const result = await translate(message.text, senderLanguage, targetLanguage);
  
  // Update the translations object with the new translation
  const updatedTranslations = {
    ...message.translations,
    [targetLanguage]: result.text,
  };

  const updatedMessage = {
    ...message,
    translations: updatedTranslations,
  };

  // Preserve translation failure info
  if (!result.success) {
    updatedMessage.translationFailed = true;
    updatedMessage.translationError = result.error;
  } else {
    delete updatedMessage.translationFailed;
    delete updatedMessage.translationError;
  }

  return updatedMessage;
}
