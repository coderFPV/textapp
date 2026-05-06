import bcrypt from 'bcryptjs';
import { AuthRequest, generateToken } from '../middleware/auth';
import type { PrismaClient } from '@prisma/client';

export async function registerAuthRoutes(fastify: any, prisma: PrismaClient) {
  // POST /auth/signup
  fastify.post<{ Body: { username: string; password: string; name: string; email: string; preferredLanguage: string } }>(
    '/auth/signup',
    async (request: AuthRequest, reply) => {
      try {
        const { username, password, name, email, preferredLanguage } = request.body;

        // Validate input
        if (!username || !password || !name || !email) {
          return reply.code(400).send({ error: 'Username, password, name, and email are required' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [{ username }, { email }],
          },
        });

        if (existingUser) {
          return reply.code(409).send({ error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
          data: {
            id: crypto.randomUUID(),
            username,
            passwordHash,
            name,
            email,
            preferredLanguage: preferredLanguage || 'en',
            role: 'student',
          },
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            preferredLanguage: true,
            role: true,
          },
        });

        // Generate token
        const token = generateToken(user);

        return { user, token };
      } catch (error) {
        console.error('Signup error:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );

  // POST /auth/login
  fastify.post<{ Body: { username: string; password: string } }>(
    '/auth/login',
    async (request: AuthRequest, reply) => {
      try {
        const { username, password } = request.body;

        // Validate input
        if (!username || !password) {
          return reply.code(400).send({ error: 'Username and password are required' });
        }

        // Find user
        const user = await prisma.user.findUnique({
          where: { username },
        });

        if (!user) {
          return reply.code(401).send({ error: 'Invalid username or password' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.passwordHash);

        if (!validPassword) {
          return reply.code(401).send({ error: 'Invalid username or password' });
        }

        // Generate token
        const token = generateToken({
          id: user.id,
          username: user.username,
          email: user.email,
        });

        return {
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            preferredLanguage: user.preferredLanguage,
            role: user.role,
          },
          token,
        };
      } catch (error) {
        console.error('Login error:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );

  // GET /auth/me
  fastify.get('/auth/me', async (request: AuthRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          preferredLanguage: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return user;
    } catch (error) {
      console.error('Get current user error:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /auth/update-profile
  fastify.put<{ Body: { name?: string; email?: string; preferredLanguage?: string } }>(
    '/auth/update-profile',
    async (request: AuthRequest, reply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Not authenticated' });
        }

        const { name, email, preferredLanguage } = request.body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;

        const user = await prisma.user.update({
          where: { id: request.user.id },
          data: updateData,
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            preferredLanguage: true,
            role: true,
          },
        });

        return user;
      } catch (error) {
        console.error('Update profile error:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}
