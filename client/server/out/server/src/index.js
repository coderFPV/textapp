"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const socket_io_1 = require("socket.io");
// Mock user database (mirrors the Next.js API)
const users = {
    'user1': { id: 'user1', name: 'Alice', username: 'Alice', email: 'alice@example.com', role: 'student', preferredLanguage: 'en' },
    'user2': { id: 'user2', name: 'Bob', username: 'Bob', email: 'bob@example.com', role: 'student', preferredLanguage: 'es' },
    'user3': { id: 'user3', name: 'Charlie', username: 'Charlie', email: 'charlie@example.com', role: 'student', preferredLanguage: 'zh' },
    'user4': { id: 'user4', name: 'Dan', username: 'Dan', email: 'dan@example.com', role: 'teacher', preferredLanguage: 'ja' },
    'me-id': { id: 'me-id', name: 'me', username: 'me', email: 'me@example.com', role: 'student', preferredLanguage: 'en' },
};
// In-memory message store
const messages = [];
const httpServer = (0, node_http_1.createServer)((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Chat Server');
});
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: 'http://localhost:3000' },
});
// Track connected users: userId -> socketId
const userSockets = new Map();
// Track socketId -> userId
const socketUsers = new Map();
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    // Handle user join
    socket.on('join', ({ userId }) => {
        // Leave previous room if any
        const prevSocketId = userSockets.get(userId);
        if (prevSocketId && prevSocketId !== socket.id) {
            userSockets.delete(userId);
        }
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);
        socket.join(userId);
        console.log(`User ${userId} joined on socket ${socket.id}`);
        // Send current messages
        socket.emit('currentMessages', messages.slice(-50));
    });
    // Handle send message
    socket.on('sendMessage', ({ senderId, receiverId, text }) => {
        const sender = users[senderId];
        if (!sender)
            return;
        const chatId = [senderId, receiverId].sort().join('-');
        const now = new Date().toISOString();
        const message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            chatId,
            position: messages.filter((m) => m.chatId === chatId).length,
            originalText: text,
            translations: {},
            translatingRole: null,
            senderId,
            receiverId,
            createdAt: now,
        };
        messages.push(message);
        // Broadcast to the chat room
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
