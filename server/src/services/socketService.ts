import { Server as SocketServer } from 'socket.io';
import prisma from '../lib/prisma';
import { translate } from './translationService';
import crypto from 'crypto';

export function setupSocketHandlers(io: SocketServer) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    let claimedUserId: string | null = null;

    // User joins their own private room for receiving messages
    socket.on('join', async ({ userId: claimedUserIdInput, chatId }: { userId: string; chatId?: string }) => {
      claimedUserId = claimedUserIdInput || null;
      if (!claimedUserId) return;
      
      // Set socket data for fetchOnlineUsers to find
      socket.data.userId = claimedUserId;
      
      socket.join(claimedUserId);
      console.log(`User ${claimedUserId} joined their room.`);

      // Also join the chat room if provided
      if (chatId) {
        // The client sends the pre-computed sorted chatId (e.g. "me-id-user1").
        // Don't try to reconstruct it from the userId by splitting on '-' since user
        // IDs can contain hyphens (UUIDs) or multiple parts. Just join the room as-is.
        socket.join(chatId);
        console.log(`User ${claimedUserIdInput} joined chat room: ${chatId}`);
      }

      // Send message history for chats involving this user
      const chats = await prisma.message.findMany({
        where: {
          OR: [{ senderId: claimedUserId }, { receiverId: claimedUserId }],
          ...(chatId ? { chatId } : {}),
        },
        orderBy: { position: 'asc' },
      });
      socket.emit('currentMessages', chats);
      console.log(`Sent ${chats.length} historical messages to ${claimedUserId}.`);
    });

    // Handle sending a message
    socket.on('sendMessage', async (data: { senderId: string; receiverId: string; text: string }) => {
      const { senderId, receiverId, text } = data;

      try {
        // 1. Fetch sender and receiver info from DB
        // Auto-create missing users (e.g. user4/Dan) if they don't exist
        const CLIENT_LANG_MAP: Record<string, string> = {
          'user1': 'en', 'user2': 'es', 'user3': 'zh', 'user4': 'ja',
        };

        const [rawSender, rawReceiver] = await Promise.all([
          prisma.user.findUnique({ where: { id: senderId } }),
          prisma.user.findUnique({ where: { id: receiverId } }),
        ]);

        const senderLang = rawSender?.preferredLanguage || CLIENT_LANG_MAP[senderId] || 'en';
        const receiverLang = rawReceiver?.preferredLanguage || CLIENT_LANG_MAP[receiverId] || 'en';

        const [sender, receiver] = await Promise.all([
          rawSender ? Promise.resolve(rawSender) : prisma.user.create({
            data: {
              id: senderId, username: senderId, name: senderId,
              email: `${senderId}@test.local`, passwordHash: 'skip-for-demo',
              preferredLanguage: senderLang, role: 'student',
            },
          }),
          rawReceiver ? Promise.resolve(rawReceiver) : prisma.user.create({
            data: {
              id: receiverId, username: receiverId, name: receiverId,
              email: `${receiverId}@test.local`, passwordHash: 'skip-for-demo',
              preferredLanguage: receiverLang, role: 'student',
            },
          }),
        ]);

        if (rawSender === null || rawReceiver === null) {
          console.log(`Auto-created users: sender=${senderId}, receiver=${receiverId}`);
        }

        // 2. Create the message in DB with SORTED chatId to match ChatWindow's format
        // ChatWindow computes chatId as `${currentUser.id}-${activeChatId}`, so we need
        // to match that ordering regardless of who is sender/receiver
        const sortedChatId = [senderId, receiverId].sort().join('-');
        const lastMsg = await prisma.message.findFirst({
          where: { chatId: sortedChatId },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        const position = lastMsg ? (lastMsg.position ?? -1) + 1 : 0;

        const newMessage = await prisma.message.create({
          data: {
            id: crypto.randomUUID(),
            chatId: sortedChatId,
            position,
            senderId,
            receiverId,
            originalText: text,
            senderLanguage: sender.preferredLanguage,
            translations: {}, // Will be populated if translation is needed
          },
        });

        // 3. Check for translation needs and persist to DB
        let translatedPayload = {
          original: text,
          translated: text,
          senderLang: sender.preferredLanguage,
        };

        // Build translations: each user sees their preferred language
        // senderLang version = original text, receiverLang version = translated text
        let translations: Record<string, string> = {};
        translations[sender.preferredLanguage] = text; // sender sees original
        if (sender.preferredLanguage !== receiver.preferredLanguage) {
          const translatedResult = await translate(
            text,
            sender.preferredLanguage,
            receiver.preferredLanguage
          );
          translations[receiver.preferredLanguage] = translatedResult.text; // receiver sees translated
          translatedPayload.translated = translatedResult.text;
          if (!translatedResult.success) {
            translatedPayload.translationFailed = true;
            translatedPayload.translationError = translatedResult.error;
          }
        }

        // Persist translations to DB
        await prisma.message.update({
          where: { id: newMessage.id },
          data: { translations },
        });

        // 4. Emit to the chat room so all participants see the message
        // FIXED: Only emit to the room once. Both sender and receiver are in the room,
        // so the room emit reaches all participants. No need for duplicate per-user emits.
        const payload = {
          id: newMessage.id,
          chatId: sortedChatId,
          position: newMessage.position,
          originalText: text,
          translations,
          translatingRole: null,
          senderId: senderId,
          receiverId: receiverId,
          senderLanguage: sender.preferredLanguage,
          createdAt: newMessage.createdAt,
          ...translatedPayload.translationFailed ? { translationFailed: true, translationError: translatedPayload.translationError } : {},
        };
        io.to(sortedChatId).emit('newMessage', payload);

        console.log(`Message from ${senderId} to ${receiverId}: ${text}`);
      } catch (error) {
        console.error('Error in sendMessage handler:', error);
        socket.emit('messageError', { error: 'Failed to send message' });
      }
    });

    // Handle sending a translation for an existing message
    socket.on('sendTranslation', async (data: {
      messageId: string;
      translatedText: string;
      targetLanguage: string;
      senderId: string;
      receiverId: string;
      chatId: string;
    }) => {
      const { messageId, translatedText, targetLanguage, senderId, receiverId, chatId } = data;

      try {
        // 1. Update the message with the translation
        const message = await prisma.message.findUnique({
          where: { id: messageId },
        });

        if (!message) {
          socket.emit('translationError', { error: 'Message not found' });
          return;
        }

        // 2. Update the message's translations
        const existingTranslations = (message.translations || {}) as Record<string, string>;
        const updatedMessage = await prisma.message.update({
          where: { id: messageId },
          data: {
            translations: {
              set: {
                ...existingTranslations,
                [targetLanguage]: translatedText,
              },
            },
          },
        });

        // 3. Emit the updated message to the chat room
        const payload = {
          id: updatedMessage.id,
          chatId: updatedMessage.chatId,
          position: updatedMessage.position,
          originalText: updatedMessage.originalText,
          translations: updatedMessage.translations,
          senderId: updatedMessage.senderId,
          receiverId: updatedMessage.receiverId,
          senderLanguage: updatedMessage.senderLanguage,
          createdAt: updatedMessage.createdAt,
        };

        io.to(chatId).emit('messageUpdated', payload);
        io.to(receiverId).emit('messageUpdated', payload);
        // Emit back to sender
        socket.emit('translationSent', payload);

        console.log(`Translation sent for message ${messageId}: ${translatedText} (${targetLanguage})`);
      } catch (error) {
        console.error('Error in sendTranslation handler:', error);
        socket.emit('translationError', { error: 'Failed to send translation' });
      }
    });

    // Handle clearing all messages in a chat
    socket.on('clearChat', async ({ chatId }: { chatId: string }) => {
      try {
        // Delete messages by chatId (handles the sorted format the client sends)
        await prisma.message.deleteMany({ where: { chatId } });
        
        // Also clean up any orphaned messages from old unsorted chatIds (e.g. user1-me-id)
        // Only do this for 2-part IDs to avoid accidentally deleting from named rooms
        if (chatId.split('-').length === 2) {
          const [userA, userB] = chatId.split('-');
          const sorted = [userA, userB].sort().join('-');
          if (sorted !== chatId) {
            // Delete messages stored with the unsorted key
            await prisma.message.deleteMany({
              where: { chatId: sorted },
            });
          }
        }
        
        // Notify all participants in the chat room
        const payload = { chatId };
        io.to(chatId).emit('chatCleared', payload);
        
        console.log(`Chat ${chatId} cleared via socket.`);
      } catch (error) {
        console.error('Error in clearChat handler:', error);
        socket.emit('clearChatError', { error: 'Failed to clear chat' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      if (claimedUserId) {
        console.log(`User ${claimedUserId} disconnected.`);
        claimedUserId = null;
      }
    });

    // Handle fetching online users in a chat room
    socket.on('fetchOnlineUsers', ({ chatId }: { chatId: string }, callback: (response: { users: { id: string; name: string }[] }) => void) => {
      if (!chatId) {
        callback({ users: [] });
        return;
      }
      
      // Get all sockets that are in this room
      const members = new Map<string, { id: string; name: string }>();
      const roomMembers = io.sockets.adapter?.rooms?.get(chatId);
      if (roomMembers) {
        for (const socketId of roomMembers) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            const userId = socket.data?.userId || '';
            const name = (socket.data as any)?.userName || userId || 'Unknown';
            if (userId && !members.has(userId)) {
              members.set(userId, { id: userId, name });
            }
          }
        }
      }
      
      callback({ users: Array.from(members.values()) });
    });
  });
}
