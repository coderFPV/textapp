import { io, Socket } from 'socket.io-client';
import { Message } from '@/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class SocketService {
  private socket: Socket | null = null;
  private messageListeners: Set<(message: Message) => void> = new Set();
  private messageUpdatedListeners: Set<(message: Message) => void> = new Set();
  private connectPromise: Promise<void> | null = null;

  connect(): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('[socket] connected:', this.socket?.id);
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        console.error('[socket] connection error:', err.message);
        reject(err);
      });
    });

    return this.connectPromise;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectPromise = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  onMessage(callback: (message: Message) => void): () => void {
    this.messageListeners.add(callback);

    const onNewMessage = (message: Message) => {
      this.messageListeners.forEach(cb => cb(message));
    };

    const onMessageSent = (message: Message) => {
      this.messageListeners.forEach(cb => cb(message));
    };

    if (this.socket) {
      this.socket.on('newMessage', onNewMessage);
      this.socket.on('messageSent', onMessageSent);
    }

    const cleanup = () => {
      if (this.socket) {
        this.socket.off('newMessage', onNewMessage);
        this.socket.off('messageSent', onMessageSent);
      }
    };

    return cleanup;
  }

  join(userId: string, chatId?: string): void {
    if (this.socket) {
      this.socket.emit('join', { userId, chatId });
    }
  }

  async sendMessage(senderId: string, receiverId: string, text: string, chatId: string, translatingRole?: string): Promise<Message | undefined> {
    await this.connect();
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId,
          receiverId,
          text,
          chatId,
          translatingRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('[socketService] sendMessage failed:', err);
        return undefined;
      }
      return (await res.json()) as Message;
    } catch (error) {
      console.error('[socketService] sendMessage error:', error);
      return undefined;
    }
  }

  // Send a translation request for an existing message via REST API
  // The server handles the actual AI translation
  async sendTranslation(
    messageId: string,
    targetLanguage: string,
  ): Promise<Message | undefined> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(
        `${apiUrl}/api/messages/${encodeURIComponent(messageId)}/translate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetLanguage,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        console.error('[socketService] sendTranslation failed:', err);
        return undefined;
      }
      return (await res.json()) as Message;
    } catch (error) {
      console.error('[socketService] sendTranslation error:', error);
      return undefined;
    }
  }

  // Fetch online users (users in the same chat room)
  async fetchOnlineUsers(chatId: string): Promise<{ users: { id: string; name: string }[] }> {
    if (!this.socket) return { users: [] };
    return new Promise((resolve, reject) => {
      this.socket!.emit('fetchOnlineUsers', { chatId }, (response: { users: { id: string; name: string }[] }) => {
        resolve(response);
      });
    });
  }

  // Listener: message updated (e.g. re-translation completed)
  onMessageUpdated(callback: (message: Message) => void): () => void {
    const onUpdated = (message: Message) => {
      this.messageUpdatedListeners.forEach(cb => cb(message));
    };
    if (this.socket) {
      this.socket.on('messageUpdated', onUpdated);
      this.socket.on('translationSent', onUpdated);
    }
    return () => {
      if (this.socket) {
        this.socket.off('messageUpdated', onUpdated);
        this.socket.off('translationSent', onUpdated);
      }
    };
  }

  // Re-translate a specific message via REST API
  async reTranslateMessage(
    messageId: string,
    targetLanguage?: string,
    senderLanguage?: string,
  ): Promise<Message | undefined> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(
        `${apiUrl}/api/messages/${encodeURIComponent(messageId)}/translate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLanguage, senderLanguage }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        console.error('[socketService] reTranslateMessage failed:', err);
        return undefined;
      }
      return (await res.json()) as Message;
    } catch (err) {
      console.error('[socketService] reTranslateMessage error:', err);
      return undefined;
    }
  }
}

export const socketService = new SocketService();
