'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '@/types';
import { MessageBubble } from './MessageBubble';
import { socketService } from '@/services/socketService';
import { Send, Trash2 } from 'lucide-react';

interface ChatWindowProps {
  currentUser: { id: string; username: string; preferredLanguage?: string } | null;
  activeChatId: string | null;
  sendMessage: (text: string) => void;
  debugMode?: boolean;
  previewLanguage?: string | null;
}

export function ChatWindow({ currentUser, activeChatId, sendMessage, debugMode, previewLanguage }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(false);

  // Connect once when component mounts
  useEffect(() => {
    socketService.connect().then(() => {
      connectedRef.current = true;
    }).catch(console.error);
  }, []);

  // Listen for message history from server when user/chat changes
  useEffect(() => {
    if (!currentUser || !activeChatId) return;

    // Match server's format: sorted sender-receiver chatId
    // Server stores chatId as [senderId, receiverId].sort().join('-')
    const userIds = [currentUser.id, activeChatId].sort();
    const chatId = `${userIds[0]}-${userIds[1]}`;
    let cancelled = false;
    const socket = socketService.getSocket();

    const handleCurrentMessages = (msgs: Message[]) => {
      if (!cancelled) {
        // Filter messages for this specific chat only
        const filtered = (Array.isArray(msgs) ? msgs : [])
          .filter(m => m.chatId === chatId);
        
        // Apply translation for the preview/actual language.
        // In debug mode with previewLanguage set, show what that user would see.
        // Otherwise show the current user's preferred language.
        const targetLang = previewLanguage || (currentUser?.preferredLanguage || 'en');
        
        const processedMessages = filtered.map((msg) => {
          const senderLang = msg.senderLanguage || 'en';
          const translation = msg.translations?.[targetLang];
          if (translation && senderLang !== targetLang) {
            return { ...msg, originalText: translation };
          }
          return msg;
        });
        
        // Replace ALL messages - this is the history for the NEW chat
        // (not appending to prevent cross-chat leakage)
        setMessages(processedMessages);
      }
    };

    if (socket) {
      socket.on('currentMessages', handleCurrentMessages);
      // Fix: pass chatId to join so the receiver can receive messages
      socketService.join(currentUser.id, chatId);
    }

    return () => {
      cancelled = true;
      socket?.off('currentMessages', handleCurrentMessages);
    };
  }, [currentUser?.id, activeChatId, previewLanguage]);

  // Real-time listener for new messages (filtered by current chat)
  useEffect(() => {
    if (!activeChatId || !currentUser) return;
    const userIds = [currentUser.id, activeChatId].sort().filter(Boolean);
    const chatId = `${userIds[0]}-${userIds[1]}`;

    const targetLang = previewLanguage || (currentUser.preferredLanguage || 'en');

    const cleanup = socketService.onMessage(async (newMsg: Message) => {
      if (newMsg.chatId !== chatId) return;

      const senderLang = newMsg.senderLanguage || 'en';

      if (senderLang !== targetLang) {
        const translation = newMsg.translations?.[targetLang];
        if (translation) {
          const translatedMsg: Message = {
            ...newMsg,
            originalText: translation,
          };
          setMessages(prev => {
            if (prev.some(m => m.id === translatedMsg.id)) return prev;
            return [...prev, translatedMsg];
          });
          return;
        }
      }

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });
    return () => { cleanup(); };
  }, [currentUser?.id, currentUser?.preferredLanguage, activeChatId, previewLanguage]);

  // Real-time listener for message updates (filtered by current chat)
  useEffect(() => {
    if (!activeChatId) return;
    const userIds = [currentUser?.id || '', activeChatId].sort().filter(Boolean);
    const chatId = `${userIds[0]}-${userIds[1]}`;

    const cleanup = socketService.onMessageUpdated((updatedMsg: Message) => {
      if (updatedMsg.chatId !== chatId) return;
      setMessages(prev =>
        prev.map(m => (m.id === updatedMsg.id ? updatedMsg : m)),
      );
    });
    return () => { cleanup(); };
  }, [currentUser?.id, activeChatId]);

  // Listen for chatCleared events (all messages deleted remotely)
  useEffect(() => {
    if (!activeChatId || !currentUser) return;
    const userIds = [currentUser.id, activeChatId].sort();
    const chatId = `${userIds[0]}-${userIds[1]}`;

    const cleanup = socketService.onChatCleared((clearedChatId: string) => {
      if (clearedChatId === chatId) {
        console.log('[ChatWindow] Chat cleared, updating local state');
        setMessages([]);
      }
    });
    return () => { cleanup(); };
  }, [currentUser?.id, activeChatId]);

  // Handle clearing chat (local action)
  const handleClearChat = useCallback(() => {
    if (!activeChatId || !currentUser) return;
    const userIds = [currentUser.id, activeChatId].sort();
    const chatId = `${userIds[0]}-${userIds[1]}`;
    socketService.clearChat(chatId);
    setMessages([]);
  }, [activeChatId, currentUser]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !currentUser) return;
    sendMessage(inputText);
    setInputText('');
    // Focus textarea after sending
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full border-x bg-[#f0f2f5] shadow-inner">
      {/* Chat Header */}
      <div className="p-4 bg-white/80 backdrop-blur-md border-b flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-sm">
            {currentUser?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 leading-tight">
              {currentUser?.username || 'Chat'}
            </h2>
            <p className="text-[11px] text-green-500 font-medium">Online</p>
          </div>
        </div>
        {/* Clear Chat Button */}
        <button
          type="button"
          onClick={handleClearChat}
          title="Clear chat"
          disabled={!activeChatId}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-1"
      >
        {messages.length === 0 ? (
          <p className="text-center text-gray-500 italic">No messages yet. Say hello!</p>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isMe={msg.senderId === currentUser?.id}
              receiverPreferredLanguage={previewLanguage || currentUser?.preferredLanguage}
              currentUserPreferredLanguage={currentUser?.preferredLanguage}
              debugMode={debugMode}
              onMessageUpdated={(updatedMsg) => {
                setMessages(prev =>
                  prev.map(m => (m.id === updatedMsg.id ? updatedMsg : m)),
                );
              }}
            />
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#e2e4e0] border-t border-gray-300 flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="w-full px-4 py-2.5 bg-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none max-h-[120px] overflow-y-auto text-[15px] leading-relaxed text-gray-900 placeholder-gray-400"
            style={{ minHeight: '40px' }}
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95"
        >
          <Send size={20} className="text-white" />
        </button>
      </div>
    </div>
  );
}
