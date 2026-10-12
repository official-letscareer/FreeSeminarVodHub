'use client';

import { AuthSession } from './types';
import { SESSION_KEY, ADMIN_SESSION_KEY } from './constants';

export interface VerifyChallengeResult {
  isChallenge: boolean;
  /** 통과하지 못했을 때 서버가 준 안내(LC-3438). 없으면 호출한 쪽의 기본 문구를 쓴다. */
  message?: string;
}

export async function verifyChallenge(
  name: string,
  phoneNum: string
): Promise<VerifyChallengeResult> {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phoneNum }),
  });
  if (!response.ok) return { isChallenge: false };
  const data = await response.json();
  return {
    isChallenge: data.isChallenge === true,
    message: typeof data.message === 'string' ? data.message : undefined,
  };
}

export async function verifyMembership(
  name: string,
  phoneNum: string
): Promise<boolean> {
  const response = await fetch('/api/auth/verify-membership', {
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
  const raw = localStorage.getItem(SESSION_KEY);
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
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getAdminSession(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

export function setAdminSession(): void {
  localStorage.setItem(ADMIN_SESSION_KEY, 'true');
}

export function clearAdminSession(): void {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}
