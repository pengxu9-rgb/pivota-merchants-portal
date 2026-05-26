const INVITE_REF_KEY = 'pivota_invite_ref';

export function captureInviteRef(): void {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref && ref.trim()) {
    localStorage.setItem(INVITE_REF_KEY, ref.trim());
  }
}

export function getStoredInviteRef(): string | null {
  return localStorage.getItem(INVITE_REF_KEY);
}

export function clearInviteRef(): void {
  localStorage.removeItem(INVITE_REF_KEY);
}
