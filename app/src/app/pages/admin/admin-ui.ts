/** Small helpers shared by the admin screens. */

export type UserKind = 'admin' | 'owner' | 'customer';

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function userKind(user: { roles: string[] }): UserKind {
  if (user.roles.includes('PlatformAdmin')) return 'admin';
  return user.roles.includes('ShopOwner') ? 'owner' : 'customer';
}

export function kindLabel(user: { roles: string[] }): string {
  return { admin: 'Admin', owner: 'Shop owner', customer: 'Customer' }[userKind(user)];
}

export function kindColor(user: { roles: string[] }): string {
  return { admin: 'dark', owner: 'primary', customer: 'muted' }[userKind(user)];
}

/** Picks an icon and colour for an activity log entry from its action name. */
export function activityLook(action: string): { icon: string; tone: '' | 'ok' | 'warn' | 'bad' } {
  if (['user.sign_in_failed', 'user.locked_out'].includes(action)) return { icon: 'warning', tone: 'bad' };
  if (['user.suspended', 'shop.deactivated'].includes(action)) return { icon: 'prohibit', tone: 'bad' };
  if (['user.reactivated', 'shop.activated'].includes(action)) return { icon: 'check-circle', tone: 'ok' };
  if (action === 'order.payment_verified') return { icon: 'seal-check', tone: 'ok' };
  if (action === 'order.payment_rejected') return { icon: 'x-circle', tone: 'bad' };
  if (action === 'user.registered' || action === 'user.shop_owner_created') return { icon: 'user-plus', tone: 'ok' };
  if (action.includes('shop_owner')) return { icon: 'user-switch', tone: '' };
  if (action === 'user.renamed') return { icon: 'pen', tone: '' };
  if (action.startsWith('user.sign')) return { icon: 'sign-in', tone: '' };
  if (action.includes('password')) return { icon: 'key', tone: 'warn' };
  if (action.includes('email')) return { icon: 'envelope-simple', tone: '' };
  if (action.startsWith('shop.')) return { icon: 'storefront', tone: '' };
  if (action.startsWith('order.')) return { icon: 'receipt', tone: '' };
  return { icon: 'user-gear', tone: '' };
}
