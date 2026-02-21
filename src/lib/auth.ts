'use client';

import { AuthSession } from './types';
import { SESSION_KEY, ADMIN_SESSION_KEY } from './constants';

export async function verifyChallenge(
  name: string,
  phoneNum: string
): Promise<boolean> {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phoneNum }),
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.isChallenge === true;
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(data: Omit<AuthSession, 'isVerified' | 'verifiedAt'>): void {
  const session: AuthSession = {
    ...data,
    isVerified: true,
    verifiedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getAdminSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

export function setAdminSession(): void {
  sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}
