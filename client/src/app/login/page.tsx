'use client';

import { LoginForm } from '@/components/LoginForm';
import { socketService } from '@/services/socketService';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();

  const handleAuthSuccess = (user: any, token: string) => {
    login(user, token);
    socketService.setToken(token);
  };

  return <LoginForm onAuthSuccess={handleAuthSuccess} />;
}
