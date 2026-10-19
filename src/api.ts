let csrfToken = '';
export async function api<T = { message: string; id: number }>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (data.csrfToken) csrfToken = data.csrfToken;
  if (!response.ok) throw new ApiError(data.error || 'Terjadi kendala. Coba lagi.', response.status);
  return data as T;
}
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export function dateText(value: string | null, withTime = false) {
  return value ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' as const } : {}), timeZone: 'Asia/Makassar' }).format(new Date(value)) : 'Belum ditentukan';
}
export const numberText = (n: number) => new Intl.NumberFormat('id-ID').format(n);
