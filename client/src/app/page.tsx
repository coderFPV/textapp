'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChatWindow } from '@/components/ChatWindow';
import { SettingsView } from '@/components/SettingsView';
import { UserCircle, Settings } from 'lucide-react';
import { User, Message } from '@/types';
import { socketService } from '@/services/socketService';
import { translateMessageTo } from '@/hooks/useTranslation';

export default function HomePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [chatContact, setChatContact] = useState<User | null>(null);
  const [chatContactId, setChatContactId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<string | null>(null);

  // Compute effective language: previewLanguage overrides if set, otherwise user's actual preference
  const effectiveLanguage = previewLanguage || me?.preferredLanguage || 'en';

  // Fetch all users (no role filtering)
  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      setUsers(data);

      // Find the current user (me-id from seed)
      const meUser = data.find((u: User) => u.id === 'me-id');
      if (meUser) {
        setMe(meUser);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }

  // Connect socket and join when user is selected
  useEffect(() => {
    if (me) {
      socketService.connect().then(() => {
        socketService.join(me.id);
      }).catch(console.error);
    }
  }, [me]);

  const selectUser = async (user: User) => {
    setChatContact(user);
    setChatContactId(user.id);
    setActiveChatId(user.id);
    setIsSettingsOpen(false);
    
    if (!me) return;
    
    // Ensure socket is connected and join the chat room
    socketService.connect().then(() => {
      const chatId = [me.id, user.id].sort().join('-');
      socketService.join(me.id, chatId);
    }).catch(console.error);
  };

  const handleSettingsSaved = () => {
    // Re-fetch users to update the sidebar with new languages
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(console.error);
  };

  const handleSendMessage = useCallback(async (text: string) => {
    if (!me) return;
    
    try {
      await socketService.sendMessage(me.id, activeChatId!, text);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [me, activeChatId]);

  return (
    <main className="flex h-screen bg-[#f0f2f5] overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r flex flex-col shrink-0 shadow-sm z-20">
        <div className="p-6 border-b flex items-center justify-between">
          <h1
            className="text-xl font-bold text-gray-900 tracking-tight cursor-alias"
            title="Double-click to toggle debug"
            onClick={() => setDebugMode(prev => !prev)}
            onDoubleClick={() => {
              const newDebug = !debugMode;
              setDebugMode(newDebug);
              console.log('[page] Debug mode', newDebug ? 'ON' : 'OFF');
            }}
          >
            <span className="text-gray-400 text-[9px] font-normal font-mono mr-1 opacity-0 hover:opacity-100 transition-opacity">[dc]</span>
            Messages
          </h1>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Settings className="text-gray-500" size={20} />
          </button>
        </div>

        {/* Preview Language Selector (only in debug mode) */}
        {debugMode && (
          <div className="px-4 py-2 border-b bg-purple-50">
            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1">Preview as</p>
            <div className="grid grid-cols-4 gap-1">
              <button
                onClick={() => setPreviewLanguage(null)}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-medium transition-all",
                  !previewLanguage
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-purple-300"
                )}
              >
                🔒 Mine
              </button>
              {[
                { value: 'en', flag: '🇺🇸' },
                { value: 'ru', flag: '🇷🇺' },
                { value: 'ja', flag: '🇯🇵' },
                { value: 'es', flag: '🇪🇸' },
                { value: 'zh', flag: '🇨🇳' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setPreviewLanguage(lang.value)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium transition-all",
                    previewLanguage === lang.value
                      ? "bg-purple-600 text-white"
                      : "bg-white text-gray-600 border border-gray-200 hover:border-purple-300"
                  )}
                >
                  {lang.flag}
                </button>
              ))}
            </div>
            {previewLanguage && (
              <p className="text-[9px] text-purple-500 mt-1">
                👁 Previewing: <span className="font-bold uppercase">{previewLanguage}</span> (actual: <span className="font-bold uppercase">{me?.preferredLanguage}</span>)
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-6 text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Contacts</p>
          {users.length === 0 ? (
            <p className="px-6 text-gray-500 text-sm">No users found.</p>
          ) : (
            users
              .filter((u) => u.id !== 'me-id')
              .map((user) => (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  className={`w-full flex items-center gap-3 px-6 py-3 transition-all ${
                    activeChatId === user.id
                      ? 'bg-blue-50 border-r-4 border-blue-600'
                      : 'hover:bg-gray-50 border-r-4 border-transparent text-gray-600'
                  }`}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center font-bold shadow-sm",
                    activeChatId === user.id ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                  )}>
                    {(user as any).name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="text-left">
                    <div className={cn("font-semibold text-sm", activeChatId === user.id ? "text-blue-700" : "text-gray-900")}>
                      {(user as any).name || user.username}
                    </div>
                    <div className="text-[10px] text-gray-400 capitalize">
                      {user.preferredLanguage} speaker
                    </div>
                  </div>
                </button>
              ))
          )}
        </div>

        {me && (
          <div className="p-4 bg-gray-50 border-t mt-auto">
             <div className="flex items-center gap-3 px-2 py-1">
               <UserCircle className="text-blue-600" size={24} />
               <div className="text-xs">
                  <p className="font-bold text-gray-900">{me.username}</p>
                  <p className="text-gray-500 italic">{me.preferredLanguage}</p>
               </div>
             </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 relative">
        {isSettingsOpen ? (
          <div className="h-full w-full flex items-center justify-center bg-[#f0f2f5] p-4 z-30 absolute inset-0">
             <SettingsView
               onClose={() => {
                 setIsSettingsOpen(false);
                 handleSettingsSaved();
               }}
               currentUser={me}
               debugMode={debugMode}
               onDebugModeChange={(enabled) => {
                 setDebugMode(enabled);
                 localStorage.setItem('debugMode', String(enabled));
               }}
             />
          </div>
        ) : activeChatId ? (
          <ChatWindow
            currentUser={me}
            activeChatId={activeChatId}
            sendMessage={handleSendMessage}
            debugMode={debugMode}
            previewLanguage={previewLanguage}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 flex-col gap-3 bg-[#e5ddd5]">
            <div className="p-6 rounded-full bg-white/50 shadow-sm">
               <UserCircle size={64} strokeWidth={1} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-700">Your Messages</h3>
              <p className="text-sm text-gray-500">Select a contact to start a conversation</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
