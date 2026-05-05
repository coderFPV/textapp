"use client";

import { useState, useEffect } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { SettingsView } from "@/components/SettingsView";
import { User, Message } from "@/types";
import { socketService } from "@/services/socketService";

export default function Home() {
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [partnerId, setPartnerId] = useState<string>("");
  const [role, setRole] = useState<string>(() => {
    // Persist role selection across page refreshes
    const saved = typeof window !== 'undefined' ? localStorage.getItem('textapp_role') : '';
    return saved || '';
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>("");
  const [newMessage, setNewMessage] = useState("");
  const [debugViewAs, setDebugViewAs] = useState<string | null>(null);
  const [debugAvailable, setDebugAvailable] = useState<User[]>([]);

  // Initialize socket.io
  useEffect(() => {
    socketService.connect();
    return () => {
      socketService.disconnect();
    };
  }, []);

  // Fetch users based on role
  useEffect(() => {
    if (!role) return;

    const fetchUsers = async () => {
      try {
        const response = await fetch(`/api/users?role=${encodeURIComponent(role)}`);
        const data = await response.json();
        setUsers(data);
      } catch (error) {
        console.error("Failed to fetch users:", error);
      }
    };

    fetchUsers();
  }, [role]);

  // Persist role to localStorage for cross-refresh survival
  useEffect(() => {
    if (role) {
      localStorage.setItem('textapp_role', role);
    }
  }, [role]);

  // Create a chat with the selected partner
  const createChat = async () => {
    if (!me) return null;

    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: me.id,
          receiverId: partnerId,
          chatId: `${me.id}-${partnerId}`,
        }),
      });
      const data = await response.json();
      return data.chatId;
    } catch (error) {
      console.error("Failed to create chat:", error);
      return null;
    }
  };

  // Send a message
  const sendMessage = async (text: string) => {
    if (!me || !selectedChatId || !partnerId) return;

    try {
      const result = await socketService.sendMessage(
        me.id,
        partnerId,
        text,
        selectedChatId,
        role
      );
      
      if (result) {
        setMessages((prev) => [...prev, result]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  // Send a translation request for an existing message (server does AI translation)
  const sendTranslation = async (
    messageId: string,
    targetLanguage: string
  ) => {
    try {
      const result = await socketService.sendTranslation(
        messageId,
        targetLanguage
      );
      
      if (result) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? result! : m))
        );
      }
    } catch (error) {
      console.error("Failed to send translation:", error);
    }
  };

  // Load historical messages when chat is selected (survives page refresh)
  useEffect(() => {
    if (selectedChatId) {
      const loadMessages = async () => {
        try {
          const res = await fetch(`/api/messages?chatId=${encodeURIComponent(selectedChatId)}`);
          const msgs = await res.json();
          // Only load if we have no messages yet (fresh load, not real-time)
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            return msgs;
          });
        } catch (error) {
          console.error('Failed to load messages:', error);
        }
      };
      loadMessages();
    }
  }, [selectedChatId]);

  // Debug view: populate available users for the current chat
  useEffect(() => {
    if (!selectedChatId || !me) {
      setDebugAvailable([]);
      setDebugViewAs(null);
      return;
    }
    // Extract participant IDs from the chatId
    const parts = selectedChatId.split('-');
    const participants = parts.filter(id => id && id !== me.id);
    // Find those users in the users list
    const debugUsers = users.filter(u => participants.includes(u.id) || parts.includes(u.id));
    // Also add me as an option
    const all = me ? [me, ...debugUsers.filter(u => u.id !== me.id)] : debugUsers;
    setDebugAvailable(all);
  }, [selectedChatId, me, users]);

  // Listen for new messages via socket
  useEffect(() => {
    const cleanupNew = socketService.onMessage((message: Message) => {
      if (message.chatId === selectedChatId) {
        setMessages((prev) => {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message].sort((a, b) => a.position - b.position);
        });
      }
    });

    const cleanupUpdated = socketService.onMessageUpdated((updatedMsg: Message) => {
      if (updatedMsg.chatId === selectedChatId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
        );
      }
    });

    if (me) {
      socketService.join(me.id);
    }

    return () => {
      cleanupNew();
      cleanupUpdated();
    };
  }, [selectedChatId, me?.id]);

  const selectUser = async (user: User) => {
    setMe(user);
    setPartnerId(user.id);
    const chatId = await createChat();
    if (chatId) {
      setSelectedChatId(chatId);
      // Also join the chat room
      socketService.join(user.id, chatId);
    }
    setView("chat");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Language Exchange</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {view === "chat" ? (
          <ChatWindow
            users={users}
            me={me}
            messages={messages}
            selectedChatId={selectedChatId}
            setSelectedChatId={setSelectedChatId}
            sendMessage={sendMessage}
            sendTranslation={sendTranslation}
            selectUser={selectUser}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            debugViewAs={debugViewAs}
            setDebugViewAs={setDebugViewAs}
            debugAvailable={debugAvailable}
          />
        ) : (
          <SettingsView
            role={role}
            setRole={setRole}
            onBack={() => setView("chat")}
          />
        )}
      </main>
    </div>
  );
}
