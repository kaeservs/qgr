/**
 * Where to go after signing in: a path inside this app, or home. Never another
 * site, so `?next=` cannot be used to send someone elsewhere: `//evil.example`
 * and `/\evil.example` are both read by browsers as another host.
 */
export function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}
