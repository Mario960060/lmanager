import i18n from 'i18next';
import { show403Modal } from '../components/Error403Modal';

/**
 * Check if error indicates 403 Forbidden / access denied (RLS policy violation)
 */
export function is403Error(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '');
  const status = err.status ?? err.statusCode;

  return (
    status === 403 ||
    status === '403' ||
    code === '42501' || // PostgreSQL: insufficient_privilege
    code === 'PGRST301' || // PostgREST
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('permission denied') ||
    msg.includes('policy') ||
    msg.includes('rls') ||
    msg.includes('brak uprawnień') ||
    msg.includes('odmowa dostępu')
  );
}

/**
 * Show user-friendly modal for 403/access denied errors
 */
export function handle403Error(error: unknown): boolean {
  if (!is403Error(error)) return false;
  const message = i18n.t('common:no_access_403', {
    defaultValue: 'Nie masz uprawnień do wykonania tej akcji. Skontaktuj się z administratorem, jeśli uważasz, że to błąd.',
  });
  show403Modal(message);
  return true;
}
