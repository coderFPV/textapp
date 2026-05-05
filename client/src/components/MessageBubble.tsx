'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Message } from '@/types';
import { Languages } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  receiverPreferredLanguage?: string;
  currentUserPreferredLanguage?: string;
  debugMode?: boolean;
  onMessageUpdated?: (updatedMsg: Message) => void;
}

export function MessageBubble({
  message,
  isMe,
  receiverPreferredLanguage,
  currentUserPreferredLanguage,
  debugMode,
  onMessageUpdated,
}: MessageBubbleProps) {
  // Derive sender language from translatingRole if available, otherwise use current user's language for own messages
  const senderLang = (() => {
    if (message.translatingRole) {
      const langMap: Record<string, string> = {
        'JAPANESE': 'ja',
        'JAPANESE_WRITING': 'ja',
        'ADMIN': 'en',
        'USER': 'ja',
      };
      return langMap[message.translatingRole.toUpperCase()] || 'en';
    }
    return currentUserPreferredLanguage || 'en';
  })();
  
  // Target language is always the receiver's language - this shows what THEY see
  const targetLang = receiverPreferredLanguage || (isMe ? (currentUserPreferredLanguage || 'en') : (receiverPreferredLanguage || 'en'));
  
  // Get the translated text for the receiver's language
  const translatedText = message.translations?.[targetLang] || '';
  const hasTranslationForReceiver = !!message.translations?.[targetLang];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex w-full mb-2',
        isMe ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative max-w-[85%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed shadow-sm transition-all duration-200',
          isMe
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
        )}
      >
        <div className="flex flex-col gap-0.5">
          <p className="whitespace-pre-wrap break-words font-normal">
            {translatedText || message.originalText}
          </p>

          <div className={cn(
            'flex items-center gap-1 mt-1 opacity-60 text-[10px]',
            isMe ? 'justify-end' : 'justify-start'
          )}>
            <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {hasTranslationForReceiver ? (
              <span className="flex items-center gap-0.5 italic">
                <Languages size={10} className="text-green-500" />
                Translated
              </span>
            ) : (
              <span className="italic">Original</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
