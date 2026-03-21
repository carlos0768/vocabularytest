import type { Request } from 'express';

export function requireBearerToken(req: Request, expectedToken: string): boolean {
  const provided = req.headers.authorization?.replace('Bearer ', '').trim();
  return Boolean(expectedToken && provided && provided === expectedToken);
}

export function extractSafeRequestMetadata(req: Request): Record<string, string | undefined> {
  return {
    githubEvent: req.headers['x-github-event']?.toString(),
    githubDelivery: req.headers['x-github-delivery']?.toString(),
    requestId: req.headers['x-request-id']?.toString(),
    userAgent: req.headers['user-agent']?.toString(),
  };
}
