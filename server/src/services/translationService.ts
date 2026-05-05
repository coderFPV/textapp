const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:8000/v1';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'Qwen2.5-7B-Instruct-4bit';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || 'LOVE';

// Simple in-memory cache to avoid redundant calls within the same session
const translationCache = new Map<string, string>();

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

  try {
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
      const errorMsg = `Ollama API error: ${response.status} ${response.statusText}`;
      console.error(`[translate] ${errorMsg} for ${fromLang}→${toLang}: "${text.substring(0, 50)}"`);
      return { text, success: false, fromLang, toLang, error: errorMsg };
    }

    const data = await response.json();
    let translatedText = data.choices?.[0]?.message?.content?.trim() || '';

    // If content is empty but model provided extended reasoning, try to extract
    // from reasoning field (only applies to models with extended thinking support)
    if (!translatedText && data.choices?.[0]?.message?.reasoning) {
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
          translatedText = line;
          break;
        }
      }
      
      // If still empty, try to find non-English, non-source text in reasoning
      if (!translatedText) {
        const reasoningLower = reasoning.toLowerCase();
        const textLower = text.toLowerCase();
        
        // Russian text detection
        const RussianWords = /[\u0400-\u04FF]+/;
        const hasRussian = RussianWords.test(reasoning);
        if (hasRussian && textLower.match(/^[a-z\s.,!?]+$/)) {
          const russianMatches = reasoning.match(/[\u0400-\u04FF][\u0400-\u04FF\s.,!?»«"']/g);
          if (russianMatches) {
            russianMatches.sort((a: string, b: string) => b.length - a.length);
            const candidate = russianMatches[0];
            if (candidate.length > 2) {
              translatedText = candidate.trim();
            }
          }
        }
      }
    }

    if (translatedText) {
      // Strip surrounding quotes (model may add them by accident)
      translatedText = translatedText
        .replace(/^[""`'](.+)[""`']$/, '$1')
        .replace(/^[""`'](.+)[""`']$/, '$1')
        .trim();

      // If the result is identical to the source text AND languages differ, 
      // the model failed to translate - try a second approach
      if (translatedText.toLowerCase() === text.toLowerCase() && 
          fromLang.toLowerCase() !== toLang.toLowerCase()) {
        
        // Second attempt: explicit language labels in prompt
        const response2 = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
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
                content: `TRANSLATION TASK:

Translate this text to ${toLang}.

CRITICAL: Output ONLY the translated words. NOTHING ELSE.
- No labels like "Spanish:" or "French:"
- No quotes around the answer
- No explanations
- No reasoning process
- Just the translated text, exactly as it would appear in ${toLang}

Example formats:
"hello" → "hola" (output just: hola)
"bonjour" → "good morning" (output just: good morning)
"你好" → "hello" (output just: hello)`,
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

        if (response2.ok) {
          const data2 = await response2.json();
          const fallbackText = (data2.choices?.[0]?.message?.content || '').trim();
          if (fallbackText && fallbackText.toLowerCase() !== text.toLowerCase()) {
            translatedText = fallbackText;
            // Strip quotes again
            translatedText = translatedText
              .replace(/^[""`'](.+)[""`']$/, '$1')
              .trim();
          }
        }
      }
    }

    // Only cache successful translations (not empty results from failures)
    if (translatedText && translatedText !== text) {
      translationCache.set(cacheKey, translatedText);
      return { text: translatedText, success: true, fromLang, toLang };
    } else if (translatedText) {
      // Languages are the same OR model returned original text - cache the original
      // For same-language case, this is correct
      // For cross-language case where model failed, don't cache
      if (fromLang.toLowerCase() === toLang.toLowerCase()) {
        translationCache.set(cacheKey, translatedText);
        return { text: translatedText, success: true, fromLang, toLang };
      } else {
        console.log(`[translate] Translation failed (returned original) for ${fromLang}→${toLang}: "${text.substring(0, 50)}" - returning original text`);
        return { text, success: false, fromLang, toLang, error: 'Model returned original text without translating' };
      }
    } else {
      console.log(`[translate] Empty result for ${fromLang}→${toLang}: "${text.substring(0, 50)}" - returning original text`);
      return { text, success: false, fromLang, toLang, error: 'Empty translation result' };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown translation error';
    console.error(`[translate] Exception for ${fromLang}→${toLang}: "${text.substring(0, 50)}"`);
    // Fallback: return original text with failure flag to avoid breaking the chat flow
    return { text, success: false, fromLang, toLang, error: errorMsg };
  }
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
