import { Request, Response, NextFunction } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

export async function authenticate(req: AuthRequest, _reply: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Allow unauthenticated requests (some endpoints are public)
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { 
      id: string; 
      username: string; 
      email: string 
    };
    
    req.user = decoded;
    return next();
  } catch (error) {
    console.error('Auth error:', error);
    return next(); // Allow unauthenticated on invalid token
  }
}

export function generateToken(user: { id: string; username: string; email: string }): string {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
