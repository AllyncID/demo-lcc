export function extractTicketToken(value: string, origin: string): string | null {
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{32,128}$/.test(input)) return input;
  try {
    const url = new URL(input, origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.search || url.hash) return null;
    return /^\/tiket\/verifikasi\/([A-Za-z0-9_-]{32,128})$/.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}

export function ticketReturnPath(value: string | null): string | null {
  return value && /^\/tiket\/verifikasi\/[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
}
