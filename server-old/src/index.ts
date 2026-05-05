import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './services/socketService';
import prisma from './lib/prisma';
import { translate } from './services/translationService';

async function registerRoutes(fastify: FastifyInstance, io: any) {
  // Root route
  fastify.get('/', async (_request, reply) => {
    return { name: 'Translation Chat API', version: '1.0.0', status: 'running' };
  });

  // ── Users ──────────────────────────────────────────────

  // PUT /api/users/:id - Update user's preferred language
  fastify.put<{ Params: { id: string }; Body: { name?: string; preferredLanguage?: string; username?: string } }>(
    '/api/users/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { name, preferredLanguage, username } = request.body;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'User not found' });

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (username !== undefined) updateData.username = username;
      if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;

      const updated = await prisma.user.update({ where: { id }, data: updateData });
      return updated;
    },
  );

  // GET /api/users (no role filtering - returns all users)
  fastify.get('/api/users', async (request, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, name: true, preferredLanguage: true },
    });
    return users;
  });

  // ── Messages ──────────────────────────────────────────────

  // GET /api/chats/:chatId (also aliased as /api/channels/:chatId)
  fastify.get<{ Params: { chatId: string } }>('/api/chats/:chatId', async (request, reply) => {
    const { chatId } = request.params;
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: chatId }, { receiverId: chatId }] },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        chatId: true,
        position: true,
        originalText: true,
        translations: true,
        translatingRole: true,
        senderId: true,
        receiverId: true,
        createdAt: true,
        senderLanguage: true,
      },
    });
    return messages;
  });

  // Alias /api/channels/:chatId
  fastify.get<{ Params: { chatId: string } }>('/api/channels/:chatId', async (request, reply) => {
    const { chatId } = request.params;
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: chatId }, { receiverId: chatId }] },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        chatId: true,
        position: true,
        originalText: true,
        translations: true,
        translatingRole: true,
        senderId: true,
        receiverId: true,
        createdAt: true,
        senderLanguage: true,
      },
    });
    return messages;
  });

  // POST /api/messages
  fastify.post<{ Params: { chatId?: string } }, { senderId: string; receiverId: string; text: string; chatId?: string; translatingRole?: string; targetLanguage?: string }>(
    '/api/messages',
    async (request, reply) => {
      const { senderId, receiverId, text, translatingRole, targetLanguage } = request.body as { senderId: string; receiverId: string; text: string; chatId?: string; translatingRole?: string; targetLanguage?: string };

      const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { preferredLanguage: true } });
      const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { preferredLanguage: true } });
      if (!sender) return reply.code(404).send({ error: 'Sender not found' });

      const senderLang = sender.preferredLanguage || 'en';
      const receiverLang = receiver?.preferredLanguage || 'en';
      
      // Derive target language from translatingRole using the role-to-lang mapping,
      // only falling back to a database lookup for preferredLanguage
      const targetLang = targetLanguage || (
        translatingRole
          ? translateRoleToLang(translatingRole)
          : receiverLang
      ) || receiverLang;

      // Translate for BOTH sender's and receiver's preferred languages
      // so each participant can see translations in their own language
      let translations: Record<string, string> = {};
      // Store the original text as the sender's language translation
      translations[senderLang] = text;
      // Also store the translation for the target (receiver's) language
      if (senderLang !== targetLang) {
        const translated = await translate(text, senderLang, targetLang);
        translations[targetLang] = translated;
      }

      // Find next position
      const chatId = (request.body as { chatId?: string }).chatId || `${senderId}-${receiverId}`;
      const lastMsg = await prisma.message.findFirst({
        where: { chatId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const position = lastMsg ? (lastMsg.position ?? -1) + 1 : 0;

      const message = await prisma.message.create({
        data: {
          id: crypto.randomUUID(),
          chatId,
          position,
          translatingRole: translatingRole || null,
          senderId,
          receiverId,
          originalText: text,
          translations,
          senderLanguage: senderLang,
        },
        select: {
          id: true,
          chatId: true,
          position: true,
          originalText: true,
          translations: true,
          translatingRole: true,
          senderId: true,
          receiverId: true,
          createdAt: true,
          senderLanguage: true,
        },
      });

      // Emit via socket.io - send to both chat room and receiver
      const chatRoomId = [senderId, receiverId].sort().join('-');
      const senderUser = await prisma.user.findUnique({ where: { id: senderId } });
      const receiverUser = await prisma.user.findUnique({ where: { id: receiverId } });
      if (senderUser && receiverUser) {
        const msgPayload = {
          ...message,
          senderId: senderUser.username,
          receiverId: receiverUser.username,
        };
        io.to(chatRoomId).emit('newMessage', msgPayload);
        io.to(receiverId).emit('newMessage', msgPayload);
      }

      return message;
    },
  );

  // POST /api/channels (alias for /api/chats)
  fastify.post<{ Params: {} }, { senderId: string; receiverId: string; chatId?: string }>(
    '/api/channels',
    async (request, reply) => {
      const { senderId, receiverId, chatId } = request.body as { senderId: string; receiverId: string; chatId?: string };
      const actualChatId = chatId || `${senderId}-${receiverId}`;
      return { chatId: actualChatId };
    },
  );

  // POST /api/chats (alias for /api/channels)
  fastify.post<{ Params: {} }, { senderId: string; receiverId: string; chatId?: string }>(
    '/api/chats',
    async (request, reply) => {
      const { senderId, receiverId, chatId } = request.body as { senderId: string; receiverId: string; chatId?: string };
      const actualChatId = chatId || `${senderId}-${receiverId}`;
      return { chatId: actualChatId };
    },
  );

  // ── Translations ──────────────────────────────────────────

  // POST /api/messages/:id/translate - Re-translate a specific message
  fastify.post<{ Params: { id: string } }, { targetLanguage?: string; senderLanguage?: string }>(
    '/api/messages/:id/translate',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const body = (request.body || {}) as { targetLanguage?: string; senderLanguage?: string };
        const { targetLanguage, senderLanguage: senderLangFromClient } = body;

        const message = await prisma.message.findUnique({
          where: { id },
          select: {
            id: true,
            chatId: true,
            position: true,
            originalText: true,
            translations: true,
            translatingRole: true,
            senderId: true,
            receiverId: true,
            createdAt: true,
            senderLanguage: true,
          },
        });

        if (!message) {
          return reply.code(404).send({ error: 'Message not found' });
        }

        const sender = await prisma.user.findUnique({
          where: { id: message.senderId },
          select: { preferredLanguage: true },
        });

        if (!sender) {
          return reply.code(404).send({ error: 'Sender not found' });
        }

        // Use sender's preferred language as fallback
        const actualSenderLang = senderLangFromClient || message.senderLanguage || (sender.preferredLanguage || 'en');
        
        // If no targetLanguage provided, try to derive from translatingRole or use senderLang as fallback
        const tgtLang = targetLanguage || (
          message.translatingRole
            ? translateRoleToLang(message.translatingRole)
            : actualSenderLang
        ) || actualSenderLang;

        // Translate if different from sender's language
        let translations: Record<string, string> = (message.translations as Record<string, string>) || {};
        if (actualSenderLang !== tgtLang) {
          const translated = await translate(message.originalText, actualSenderLang, tgtLang);
          translations[tgtLang] = translated;
        }

        const updated = await prisma.message.update({
          where: { id },
          data: { translations },
          select: {
            id: true,
            chatId: true,
            position: true,
            originalText: true,
            translations: true,
            translatingRole: true,
            senderId: true,
            receiverId: true,
            createdAt: true,
            senderLanguage: true,
          },
        });

        // Emit update to all relevant sockets
        const chatId = message.chatId;
        const roomSockets = io.sockets.sockets;
        const senderUser = await prisma.user.findUnique({ where: { id: message.senderId } });
        const receiverUser = await prisma.user.findUnique({ where: { id: message.receiverId } });
        const updatedPayload = {
          ...updated,
          senderId: senderUser?.username || message.senderId,
          receiverId: receiverUser?.username || message.receiverId,
        };
        
        // Notify the chat room - propagate updatedPayload through socket
        io.to(chatId).emit('messageUpdated', updatedPayload);
        // Notify individual users in the chat
        io.to(message.senderId).emit('messageUpdated', updatedPayload);
        io.to(message.receiverId).emit('messageUpdated', updatedPayload);

        return updated;
      } catch (error: unknown) {
        // Log the error and return 404 - translation itself is best-effort
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error(`Error in message translation for message ${request.params.id}: ${errorMessage}`);
        // Return 404 instead of 500 so the client knows the translation failed gracefully
        // The message content itself is still available, just translation may have failed
        return reply.code(404).send({ 
          error: 'Translation failed',
          details: errorMessage,
        });
      }
    },
  );
}

function translateRoleToLang(role: string): string {
  const map: Record<string, string> = {
    JAPANESE: 'ja',
    JAPANESE_WRITING: 'ja',
    ADMIN: 'en',
    USER: 'ja',
  };
  return map[role?.toUpperCase()] || 'en';
}

// ── Socket.io ─────────────────────────────────────────────────

async function start() {
  const fastify = Fastify({ logger: true });

  try {
    await fastify.register(cors, {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    const io = new Server(fastify.server, {
      cors: {
        origin: process.env.CLIENT_URL || '*',
        methods: ['GET', 'POST'],
      },
    });

    setupSocketHandlers(io);

    await registerRoutes(fastify, io);

    await fastify.listen({
      port: Number(process.env.PORT) || 3001,
      host: '0.0.0.0'
    });

    console.log(`Server is running on port ${process.env.PORT || 3001}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}

start();
