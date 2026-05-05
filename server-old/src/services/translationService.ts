const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:8000/v1';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'Qwen3.6-35B-A3B-4bit';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || 'LOVE';

// Simple in-memory cache to avoid redundant calls within the same session
const translationCache = new Map<string, string>();

/**
 * Translates a given text from one language to another using the configured AI model.
 * Uses an in-memory cache to minimize latency and local API overhead.
 */
export async function translate(
  text: string,
  fromLang: string,
  toLang: string
): Promise<string> {
  // If languages are the same, no translation needed
  if (fromLang.toLowerCase() === toLang.toLowerCase()) {
    return text;
  }

  const cacheKey = `${fromLang}:${toLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
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
            content: `You are a professional translator. Translate the user's text from ${fromLang} to ${toLang}.

RULES:
- Return ONLY the translated text, exactly as-is.
- Do NOT wrap the translation in quotes.
- Do NOT include reasoning, explanations, examples, or metadata.
- Do NOT prefix with "Final:" or "Result:" or any label.
- If the text is already in ${toLang}, return it as-is.
- For Chinese/Japanese/Korean text, return the characters directly.

IMPORTANT: Your ENTIRE response must be the translated text only. Nothing else.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let translatedText = data.choices?.[0]?.message?.content || '';

    if (translatedText) {
      // Strip surrounding quotes (model may add them by accident)
      translatedText = translatedText
        .replace(/^["「'](.+)["」']$/, '$1')
        .trim();
      
      // Also strip any "Final:" or "Result:" markers the model might still add
      const markerPatterns = [
        /(?:Final|Result|Output|Translation)\s*[:：]\s*(.+)$/s,
      ];
      for (const pattern of markerPatterns) {
        const match = translatedText.match(pattern);
        if (match && match[1]) {
          translatedText = match[1].trim();
          break;
        }
      }

      // Cache the result before returning
      translationCache.set(cacheKey, translatedText);
      return translatedText;
    }

    throw new Error('Failed to get valid text from AI response');
  } catch (error) {
    console.error('Translation Error:', error);
    // Fallback: return original text if translation fails to avoid breaking the chat flow
    return text;
  }
}

/**
 * Extract translations from the sender's message based on receiver's language.
 * Returns the message with translations if both languages are available and different.
 */
export function getTranslatedMessage(message: any, senderLanguage: string, receiverLanguage: string): any {
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

  // Translate the message
  const translateTo = async (lang: string) => {
    const translated = await translate(message.text, senderLanguage, lang);
    return translated;
  };

  // If the message has translations object, add the new translation
  if (message.translations) {
    translateTo(receiverLanguage).then((translated) => {
      message.translations[receiverLanguage] = translated;
    });
  } else {
    // Create new translations object with the new translation
    translateTo(receiverLanguage).then((translated) => {
      message.translations = { [receiverLanguage]: translated };
    });
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

  const translated = await translate(message.text, senderLanguage, targetLanguage);
  
  // Update the translations object with the new translation
  const updatedTranslations = {
    ...message.translations,
    [targetLanguage]: translated,
  };

  return {
    ...message,
    translations: updatedTranslations,
  };
}
