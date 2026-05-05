# Translation Chat App

A real-time multilingual messaging application where language barriers are removed through seamless, automatic AI translation.

## Core Value Proposition

Every user has a `preferredLanguage`. When a message is sent, the recipient automatically sees it in their preferred language via high-fidelity local AI translation, while retaining the ability to toggle back to the original text with a single click ("Peek Original").

### Demo

Two browser windows: one signed in as **userr** (Spanish), the other as **me** (English).
- userr types "Hola" — me sees "Hello".
- me types "¡Hola!" — userr sees "Hello".

Translation happens automatically in the background. If translation fails (e.g. Ollama is down), the original text still displays.

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│  Next.js App    │  HTTP   │  Node.js Server      │
│  (port 3000)    │◄──────►│  (port 3001)         │
│                 │ WebSocket│                     │
│  React 19       │         │  Fastify REST API   │
│  TypeScript     │         │  Socket.IO          │
│  Tailwind CSS 4 │         │                     │
└─────────────────┘         └──────────┬─────────┘
                                       │
                              ┌────────▼─────────┐
                              │  PostgreSQL + Prisma │
                              └────────────────────┘
                                       │
                              ┌────────▼─────────┐
                              │  Ollama (local LLM)│
                              │  (e.g. Qwen2.5-7B) │
                              └──────────────────┘
```

## Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **UI:** React 19 + TypeScript
- **Styling:** Tailwind CSS 4
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Real-time:** Socket.io-client

### Backend
- **Runtime:** Node.js (v22+)
- **Framework:** Fastify (REST API)
- **Real-time:** Socket.io (WebSockets)
- **ORM:** Prisma
- **Database:** PostgreSQL
- **AI Translation:** Ollama / LM Studio (local LLM via OpenAI-compatible API)

## Features

- **Real-time messaging** with instant delivery via Socket.io
- **Automatic AI translation** between sender and receiver languages
- **Peek Original** — click a message to toggle between translated and original text
- **Debug mode** (double-click app title) — toggle translation raw data display
- **User management** — create, view, and update user profiles
- **Translation history** — stored in PostgreSQL, viewable in Prisma Studio
- **Graceful degradation** — messages display even if translation fails
- **Seed script** — pre-configured users with different languages for testing

## Project Structure

```
textapp/
├── src/                           # Frontend (Next.js)
│   ├── app/
│   │   ├── api/users/             # User REST endpoints
│   │   └── page.tsx               # Main chat page (Socket.io client)
│   ├── components/
│   │   ├── ChatWindow.tsx         # Chat UI with message list and input
│   │   ├── MessageBubble.tsx      # Message with translation toggle
│   │   ├── SettingsView.tsx       # User settings (language, profile)
│   │   └── UserManagement.tsx     # User create/view/edit forms
│   ├── services/
│   │   └── socketService.ts       # Socket.io client wrapper
│   └── types/
│       └── index.ts               # TypeScript types (Message, User)
│
├── server/                        # Backend (Node.js)
│   ├── src/
│   │   ├── index.ts               # Server entry: Fastify + Socket.io
│   │   ├── lib/
│   │   │   └── prisma.ts          # Prisma client singleton
│   │   └── services/
│   │       ├── socketService.ts   # Socket.io event handlers
│   │       └── translationService.ts  # Ollama translation engine
│   ├── prisma/
│   │   └── schema.prisma          # DB schema: User, Message
│   ├── seed.ts                    # Seed script with demo users
│   └── .env                       # Environment config
│
├── docs/
│   └── howto.md                   # Setup guide for fresh systems
└── README.md                      # This file
```

## Quick Start

See [docs/howto.md](docs/howto.md) for detailed setup instructions on a fresh system.

### TL;DR

```bash
# 1. Clone repo
git clone <repo-url> && cd textapp

# 2. Start Ollama with a translation-capable model
ollama serve &
ollama pull Qwen2.5-7B-Instruct

# 3. Start PostgreSQL
brew services start postgresql
createdb textapp

# 4. Setup backend
cd server
cp .env.example .env  # edit DATABASE_URL
npm install
npx prisma migrate dev
npx tsx seed.ts        # create demo users
npm run dev            # port 3001

# 5. Setup frontend (new terminal)
cd client
npm install
npm run dev            # port 3000

# 6. Open two browser windows
#    - http://localhost:3000 (signed in as me)
#    - http://localhost:3000 (signed in as userr)
```

## Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `es` | Spanish |
| `zh` | Chinese |
| `ja` | Japanese |

Additional languages supported by your Ollama model (the model handles automatic source language detection).

## API Reference

### REST Endpoints (Fastify)

| Endpoint | Method | Description |
|---|---|---|
| `/api/users` | GET | List all users |
| `/api/users/:id` | GET | Get user by ID |
| `/api/users/:id` | PUT | Update user (name, preferredLanguage, username) |
| `/api/messages` | GET | Get messages for a chat (`?chatId=`) |
| `/api/messages` | POST | Create a message programmatically |
| `/api/messages/:id/translate` | POST | Re-translate a specific message |
| `/api/chats/:id` | GET | Get chat messages (alias for `/api/messages`) |
| `/api/channels/:id` | GET | Get channel messages (alias for `/api/messages`) |

### Socket.io Events

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join` | `{ userId, chatId? }` | Join user room and optionally a chat room |
| `sendMessage` | `{ senderId, receiverId, text }` | Send a chat message |
| `sendTranslation` | `{ messageId, translatedText, targetLanguage, senderId, receiverId, chatId }` | Manual translation for existing message |
| `clearChat` | `{ chatId }` | Delete all messages in a chat |
| `fetchOnlineUsers` | `{ chatId }` | Get online users in a chat room |

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `currentMessages` | `Message[]` | Message history for the user |
| `newMessage` | `Message` | New incoming message |
| `messageUpdated` | `Message` | Message updated (e.g. re-translation) |
| `chatCleared` | `{ chatId }` | All messages in chat deleted |
| `messageError` | `{ error }` | Message send failed |
| `translationError` | `{ error }` | Translation failed |

## Data Model (Prisma)

### User
| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `role` | String | User role (default: "USER") |
| `name` | String | Display name |
| `username` | String | Unique username |
| `email` | String | Unique email |
| `passwordHash` | String | Password hash |
| `preferredLanguage` | String | User's language (default: "en") |
| `createdAt` | DateTime | Account creation time |

### Message
| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `chatId` | String | Room identifier (sorted user IDs) |
| `position` | Int | Message order in chat |
| `originalText` | String | Message in sender's language |
| `translations` | JSON | `{ [languageCode]: translatedText }` |
| `translatingRole` | String? | Who translated the message |
| `senderId` | String | Message author |
| `receiverId` | String | Message recipient |
| `senderLanguage` | String | Sender's language |
| `createdAt` | DateTime | Message creation time |

## Translation Engine

The translation service calls a local LLM via the OpenAI-compatible API (Ollama/LM Studio):

1. **Trigger:** Server receives `sendMessage` via Socket.io
2. **Context:** Fetch sender and receiver languages from database
3. **Translation:** Call Ollama with a system prompt instructing the model to translate without extra text
4. **Response Parsing:** Strip quotes, reasoning tokens, and formatting artifacts
5. **Fallback:** Second attempt with a simpler prompt if the first returns unchanged text
6. **Storage:** Store all translations in the `translations` JSON field
7. **Error handling:** If translation fails, original text still displays

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:8000/v1` | Ollama/LM Studio API endpoint |
| `OLLAMA_MODEL` | `Qwen2.5-7B-Instruct-4bit` | Model name for translation |
| `OLLAMA_API_KEY` | `LOVE` | API key (or empty for Ollama) |
| `PORT` | `3001` | Backend server port |
| `CLIENT_URL` | `http://localhost:3000` | Frontend URL (CORS) |

## Debug Mode

Double-click the "Messages" title in the app to toggle debug mode. This shows:
- Raw message data (original text + all translations)
- Translation quality indicators
- Sender/receiver language information
- Translation error messages

This is useful for verifying translation quality and debugging issues.

## Seeded Users (Demo)

| ID | Username | Language |
|---|---|---|
| `me-id` | me | English |
| `userr-id` | userr | Spanish |
| `userr2-id` | userr2 | Chinese |
| `user3-id` | user3 | Japanese |

## Development Tools

- **Prisma Studio:** `npx prisma studio` → http://localhost:5555
- **API health check:** `curl http://localhost:3001/`
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001

## Contributing

This project uses TypeScript throughout. Both frontend and backend must be started separately:

```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev

# Terminal 3 (optional) - Prisma Studio
cd server && npx prisma studio
```

---

*Built with Fastify + Socket.io + Next.js + Prisma + Ollama*
