import { NextRequest, NextResponse } from 'next/server';

// In-memory user store (matches DB seed data)
const users: Record<string, Record<string, unknown>> = {
  'user1': { id: 'user1', name: 'Alice', username: 'Alice', role: 'student', preferredLanguage: 'ru', userId: 'alice-socket-id' },
  'user2': { id: 'user2', name: 'Bob', username: 'Bob', role: 'student', preferredLanguage: 'es', userId: 'bob-socket-id' },
  'user3': { id: 'user3', name: 'Charlie', username: 'Charlie', role: 'student', preferredLanguage: 'zh', userId: 'charlie-socket-id' },
  'user4': { id: 'user4', name: 'Dan', username: 'Dan', role: 'teacher', preferredLanguage: 'ja', userId: 'dan-socket-id' },
  'me-id': { id: 'me-id', name: 'me', username: 'me', role: 'student', preferredLanguage: 'en', userId: 'me-socket-id' },
};

// GET /api/users?role=student
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const userList = Object.values(users);
  const filtered = role ? userList.filter((u) => u.role === role) : userList;
  return NextResponse.json(filtered);
}

// PUT /api/users/:id — handle when client sends PUT to /api/users/user1
// This route takes priority over rewrites for PUT requests
export async function PUT(request: NextRequest) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/users/:id
  if (parts.length >= 3) {
    const id = parts[2];
    const body = await request.json();
    const user = users[id];
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (body.preferredLanguage) {
      (user as Record<string, unknown>).preferredLanguage = body.preferredLanguage;
    }
    return NextResponse.json(user);
  }
  return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
}
