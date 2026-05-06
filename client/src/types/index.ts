export interface Message {
  id: string;
  chatId: string;
  position: number;
  originalText: string;
  translations: Record<string, string>;
  translatingRole: string | null;
  senderId: string;
  receiverId: string;
  senderLanguage?: string;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  name: string;
  preferredLanguage: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh' | 'ja'; // etc.
