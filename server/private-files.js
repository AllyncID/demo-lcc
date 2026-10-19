export function privateFileRequest(url) {
  let path;
  try { path = decodeURIComponent(url.split('?')[0]).replaceAll('\\', '/').toLowerCase(); } catch { return true; }
  return /(?:^|\/)(?:\.local|data|server|scripts|tests|\.npm-cache|\.git)(?:\/|$)/.test(path) || /(?:^|\/)\.env(?:\.|\/|$)/.test(path) || /\.sqlite(?:[-.]|$)/.test(path);
}
