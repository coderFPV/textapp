import prisma from './lib/prisma';
import { translate } from './services/translationService';

async function main() {
  const messages = await prisma.message.findMany({
    where: { translations: { not: {} } },
    select: { id: true, originalText: true, senderLanguage: true, receiverId: true, translations: true }
  });

  console.log('Found', messages.length, 'messages to fix');

  for (const msg of messages) {
    const translations: Record<string, string> = {};
    const senderLang = msg.senderLanguage || 'en';
    const receiver = await prisma.user.findUnique({ where: { id: msg.receiverId }, select: { preferredLanguage: true } });
    if (!receiver) continue;
    
    const receiverLang = receiver.preferredLanguage;
    
    // Store the sender's language version (use translate to strip any reasoning tags)
    translations[senderLang] = await translate(msg.originalText, senderLang, senderLang);
    
    // If languages differ, translate to the receiver's language
    if (senderLang !== receiverLang) {
      translations[receiverLang] = await translate(msg.originalText, senderLang, receiverLang);
    }
    
    await prisma.message.update({
      where: { id: msg.id },
      data: { translations }
    });
    console.log('Fixed', msg.id, ':', msg.originalText.substring(0, 50), '(from', senderLang, '→', receiverLang, ') =', JSON.stringify(translations).substring(0, 100));
  }
}

main().catch(console.error);
