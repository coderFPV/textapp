import { Message } from '@/types';
import { socketService } from '@/services/socketService';

/**
 * Translates a message from the sender's language to a target language,
 * then updates the message with the translation via the re-translate API.
 */
export async function translateMessageTo(
  message: Message,
  senderLanguage: string,
  targetLanguage: string,
): Promise<Message | undefined> {
  if (senderLanguage.toLowerCase() === targetLanguage.toLowerCase()) {
    return message;
  }

  // Already has translation for target language? Don't re-translate.
  if (message.translations?.[targetLanguage]) {
    return message;
  }

  const result = await socketService.reTranslateMessage(
    message.id,
    targetLanguage,
    senderLanguage,
  );

  return result;
}
