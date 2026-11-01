import './env';
import { createClerkClient, verifyToken } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error('CLERK_SECRET_KEY is missing. Add it to .env.');

const clerk = createClerkClient({ secretKey });
const authorizedParties = (process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:8787')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export async function userIdFrom(header: string): Promise<string | null> {
  if (!header.startsWith('Bearer ')) return null;
  try {
    const { sub } = await verifyToken(header.slice(7), { secretKey, authorizedParties });
    return sub || null;
  } catch (error) {
    console.warn(`Rejected session token: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function displayName(userId: string): Promise<string> {
  try {
    const user = await clerk.users.getUser(userId);
    return user.fullName || user.username || user.firstName || 'Anonymous';
  } catch {
    return 'Anonymous';
  }
}
