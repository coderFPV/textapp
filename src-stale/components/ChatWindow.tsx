"use client";

import { useState, useEffect } from 'react';
import { User, Message } from "@/types";
import { socketService } from "@/services/socketService";

interface ChatWindowProps {
  users: User[];
  me: User | null;
  messages: Message[];
  selectedChatId: string;
  setSelectedChatId: (id: string) => void;
  sendMessage: (text: string) => void;
  sendTranslation: (messageId: string, targetLanguage: string) => void;
  selectUser: (user: User) => Promise<void>;
  newMessage: string;
  setNewMessage: (text: string) => void;
  debugViewAs: string | null;
  setDebugViewAs: (id: string | null) => void;
  debugAvailable: User[];
}

export function ChatWindow({
  users,
  me,
  messages,
  selectedChatId,
  setSelectedChatId,
  sendMessage,
  sendTranslation,
  selectUser,
  newMessage,
  setNewMessage,
  debugViewAs,
  setDebugViewAs,
  debugAvailable,
}: ChatWindowProps) {
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  // Fetch online users when chat changes
  useEffect(() => {
    if (selectedChatId) {
      socketService.fetchOnlineUsers(selectedChatId).then(data => {
        setOnlineUsers(data.users || []);
      }).catch(console.error);
    }
  }, [selectedChatId]);

  if (!selectedChatId || !me) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>Select a contact to start chatting</p>
      </div>
    );
  }

  const viewUserId = debugViewAs || me.id;
  const viewingUser = debugAvailable.find(u => u.id === viewUserId) || me;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white rounded-t-lg">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Chat with {onlineUsers.find(u => u.id === selectedChatId.replace(me.id + '-', '').replace(me.id, ''))?.name || 'User'}
          </h2>
          <p className="text-xs text-gray-500">
            {debugViewAs ? `Debugging as ${viewingUser.name}` : `You are viewing in ${me.preferredLanguage}`}
          </p>
        </div>
      </div>

      {/* Debug view bar */}
      {debugAvailable.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs font-semibold text-amber-700 uppercase">Debug View:</span>
          <select
            value={debugViewAs || ''}
            onChange={(e) => setDebugViewAs(e.target.value || null)}
            className="px-2 py-1 text-sm border rounded bg-white border-amber-300"
          >
            <option value="">— As myself —</option>
            {debugAvailable.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          {(debugViewAs) && (
            <button
              onClick={() => setDebugViewAs(null)}
              className="ml-auto text-xs text-amber-600 hover:text-amber-800"
            >
              ← Back to self
            </button>
          )}
        </div>
      )}

      {/* Users sidebar */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h3 className="font-semibold text-gray-900">Contact List</h3>
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => selectUser(user)}
            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
              selectedChatId.includes(user.id)
                ? "bg-blue-100 text-blue-800"
                : "hover:bg-gray-100 text-gray-700"
            }`}
          >
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-gray-500">
              Language: {user.preferredLanguage}
            </div>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="bg-[#e5ddd5] flex-1 rounded-lg shadow p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === viewUserId;
            
            // Translation logic:
            // - If viewing user is the sender, show the original text
            // - If viewing user is the receiver, show the translation in their preferred language
            // - Fallback to original text if no translation exists
            let displayText: string;
            if (msg.senderId === viewUserId) {
              // I sent this message - show original text
              displayText = msg.originalText;
            } else {
              // Someone else sent this message
              // If I'm the receiver for this message, show the translation in my language
              if (msg.receiverId === viewUserId && msg.translations && Object.keys(msg.translations).length > 0) {
                displayText = msg.translations[viewingUser.preferredLanguage] || Object.values(msg.translations)[0];
              } else {
                // Just show the original text
                displayText = msg.originalText;
              }
            }
            
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                    isMe
                      ? "bg-[#dcf8c6] text-gray-900 rounded-br-none"
                      : "bg-white text-gray-900 rounded-bl-none"
                  }`}
                >
                  <p className="text-sm break-words">{displayText}</p>
                  <p className="text-[10px] text-gray-500 mt-1 text-right">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {/* Show Translate button for received messages without translation */}
                  {!isMe && !msg.translations?.[viewingUser?.preferredLanguage || 'en'] && (
                    <button
                      onClick={() => sendTranslation(msg.id, viewingUser?.preferredLanguage || 'en')}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Translate to {viewingUser?.preferredLanguage}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Message input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newMessage.trim()) {
            sendMessage(newMessage.trim());
            setNewMessage("");
          }
        }}
        className="flex gap-2 p-4 bg-white border-t rounded-b-lg"
      >
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
