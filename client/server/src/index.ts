import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Message, User } from '../../src/types';

// Mock user database (mirrors the Next.js API)
const users: Record<string, User> = {
  'user1': { id: 'user1', name: 'Alice', username: 'Alice', email: 'alice@example.com', role: 'student', preferredLanguage: 'en' },
  'user2': { id: 'user2', name: 'Bob', username: 'Bob', email: 'bob@example.com', role: 'student', preferredLanguage: 'es' },
  'user3': { id: 'user3', name: 'Charlie', username: 'Charlie', email: 'charlie@example.com', role: 'student', preferredLanguage: 'zh' },
  'user4': { id: 'user4', name: 'Dan', username: 'Dan', email: 'dan@example.com', role: 'teacher', preferredLanguage: 'ja' },
  'me-id': { id: 'me-id', name: 'me', username: 'me', email: 'me@example.com', role: 'student', preferredLanguage: 'en' },
};

// In-memory message store
const messages: Message[] = [];

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Chat Server');
});

const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:3000' },
});

// Track connected users: userId -> socketId
const userSockets: Map<string, string> = new Map();
// Track socketId -> userId
const socketUsers: Map<string, string> = new Map();

// Mock translation table (module scope so httpServer handler can access it)
const translations: Record<string, Record<string, string>> = {
  'hello': { es: 'hola', zh: '你好', ja: 'こんにちは', fr: 'bonjour', de: 'hallo', it: 'ciao', pt: 'olá' },
  'how are you': { es: '¿cómo estás?', zh: '你好吗？', ja: 'お元気ですか？', fr: 'comment ça va?', de: 'wie geht es dir?', it: 'come stai?', pt: 'como você está?' },
  'good morning': { es: 'buenos días', zh: '早上好', ja: 'おはようございます', fr: 'bonjour', de: 'guten morgen', it: 'buongiorno', pt: 'bom dia' },
  'goodbye': { es: 'adiós', zh: '再见', ja: 'さようなら', fr: 'au revoir', de: 'auf wiedersehen', it: 'arrivederci', pt: 'adeus' },
  'thank you': { es: 'gracias', zh: '谢谢', ja: 'ありがとう', fr: 'merci', de: 'danke', it: 'grazie', pt: 'obrigado' },
  'yes': { es: 'sí', zh: '是', ja: 'はい', fr: 'oui', de: 'ja', it: 'sì', pt: 'sim' },
  'no': { es: 'no', zh: '不', ja: 'いいえ', fr: 'non', de: 'nein', it: 'no', pt: 'não' },
  'i love you': { es: 'te amo', zh: '我爱你', ja: '愛してる', fr: 'je t\'aime', de: 'ich liebe dich', it: 'ti amo', pt: 'eu te amo' },
  'please': { es: 'por favor', zh: '请', ja: 'お願いします', fr: 's\'il vous plaît', de: 'bitte', it: 'per favore', pt: 'por favor' },
  'sorry': { es: 'lo siento', zh: '对不起', ja: 'すみません', fr: 'désolé', de: 'Entschuldigung', it: 'scusa', pt: 'desculpe' },
  'what is your name': { es: '¿cómo te llamas?', zh: '你叫什么名字？', ja: 'お名前は何ですか？', fr: 'comment vous appelez-vous?', de: 'wie heißen sie?', it: 'come ti chiami?', pt: 'qual é o seu nome?' },
  'how old are you': { es: '¿cuántos años tienes?', zh: '你多大了？', ja: 'いくつですか？', fr: 'quel âge avez-vous?', de: 'wie alt sind sie?', it: 'quanti anni hai?', pt: 'quantos anos você tem?' },
  'nice to meet you': { es: 'encantado de conocerte', zh: '很高兴见到你', ja: 'はじめまして', fr: 'enchanté de vous rencontrer', de: 'freut mich', it: 'piacere di conoscerti', pt: 'prazer em conhecê-lo' },
  'where are you from': { es: '¿de dónde eres?', zh: '你从哪里来？', ja: 'どこから来ましたか？', fr: 'woher kommen sie?', it: 'di dove sei?', pt: 'de onde você é?' },
  'i am fine': { es: 'estoy bien', zh: '我很好', ja: '元気です', fr: 'je vais bien', de: 'mir geht es gut', it: 'sto bene', pt: 'estou bem' },
};

function mockTranslate(text: string, targetLang: string): string {
  const lower = text.toLowerCase().trim();
  if (translations[lower] && translations[lower][targetLang]) {
    return translations[lower][targetLang];
  }
  return text;
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle user join
  socket.on('join', ({ userId, chatId }: { userId: string; chatId?: string }) => {
    // Leave previous room if any
    const prevSocketId = userSockets.get(userId);
    if (prevSocketId && prevSocketId !== socket.id) {
      userSockets.delete(userId);
    }
    
    userSockets.set(userId, socket.id);
    socketUsers.set(socket.id, userId);
    socket.join(userId);
    
    // Also join the chat room if provided
    if (chatId) {
      socket.join(chatId);
    }
    
    console.log(`User ${userId} joined on socket ${socket.id}`);

    // Send current messages
    socket.emit('currentMessages', messages.slice(-50));
  });

  // Handle send message
  socket.on('sendMessage', ({ senderId, receiverId, text }) => {
    const sender = users[senderId];
    if (!sender) return;

    const chatId = [senderId, receiverId].sort().join('-');
    const now = new Date().toISOString();

    const receiver = users[receiverId];
    const receiverLang = receiver?.preferredLanguage || 'en';
    const senderLang = sender.preferredLanguage;
    
    // Translate the message to BOTH sender and receiver languages
    const translatedForSender = mockTranslate(text, senderLang);
    const translatedForReceiver = mockTranslate(text, receiverLang);

    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      chatId,
      position: messages.filter((m) => m.chatId === chatId).length,
      originalText: text,
      translations: { 
        [senderLang]: translatedForSender,
        [receiverLang]: translatedForReceiver,
      },
      translatingRole: senderLang,
      senderId,
      receiverId,
      senderLanguage: senderLang,
      createdAt: now,
    };

    messages.push(message);

    // Join the chat room and broadcast to it
    socket.join(chatId);
    io.to(chatId).emit('newMessage', message);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const userId = socketUsers.get(socket.id);
    if (userId) {
      userSockets.delete(userId);
    }
    socketUsers.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
});

// Handle POST /api/messages/:id/translate (REST API on same server as Socket.IO)
httpServer.on('request', (req, res) => {
  // Skip WebSocket upgrade requests from Socket.IO
  if (req.headers.upgrade?.toLowerCase() === 'websocket') return;

  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === 'POST' && path.match(/^\/api\/messages\/[^/]+\/translate$/)) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { messageId, targetLanguage, senderLanguage } = JSON.parse(body);
        const msg = messages.find(m => m.id === decodeURIComponent(messageId));
        if (!msg) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message not found' }));
          return;
        }
        const translatedText = mockTranslate(msg.originalText, targetLanguage || 'en');
        const newTranslations = { ...msg.translations, [targetLanguage || 'en']: translatedText };
        msg.translations = newTranslations;
        msg.translatingRole = targetLanguage || 'en';

        // Broadcast updated message
        io.to(msg.chatId).emit('messageUpdated', {
          ...msg,
          translations: newTranslations,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...msg,
          translations: newTranslations,
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Default: serve the root
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Chat Server');
});
