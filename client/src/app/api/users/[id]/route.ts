import { NextRequest, NextResponse } from 'next/server';

// In-memory user store
const users: Record<string, Record<string, unknown>> = {
  'user1': { id: 'user1', name: 'Alice', username: 'Alice', role: 'student', preferredLanguage: 'en', userId: 'alice-socket-id' },
  'user2': { id: 'user2', name: 'Bob', username: 'Bob', role: 'student', preferredLanguage: 'es', userId: 'bob-socket-id' },
  'user3': { id: 'user3', name: 'Charlie', username: 'Charlie', role: 'student', preferredLanguage: 'zh', userId: 'charlie-socket-id' },
  'user4': { id: 'user4', name: 'Dan', username: 'Dan', role: 'teacher', preferredLanguage: 'ja', userId: 'dan-socket-id' },
  'me-id': { id: 'me-id', name: 'me', username: 'me', role: 'student', preferredLanguage: 'en', userId: 'me-socket-id' },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string }> }
) {
  try {
    const p = await params;
    if (p.id) {
      // Single user GET
      const user = users[p.id];
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      return NextResponse.json(user);
    }
    // List users with optional role filter
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const filtered = role ? Object.values(users).filter((u) => u.role === role) : Object.values(users);
    return NextResponse.json(filtered);
  } catch (e) {
    console.error('GET /api/users error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    const body = await request.json();
    const user = users[id];
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (body.preferredLanguage) {
      (user as Record<string, unknown>).preferredLanguage = body.preferredLanguage;
    }
    return NextResponse.json(user);
  } catch (e) {
    console.error('PUT /api/users/:id error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
