import type { QueryClient } from '@tanstack/react-query';

/**
 * PostgREST zwraca m.in. PGRST205 gdy tabela nie jest w schema cache (np. migracja nie wdrożona).
 * HTTP 404 na /rest/v1/event_members też kończy się obiektem błędu z kodem wiadomości.
 */
export function isMissingRestRelationError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
    status?: number;
  };
  if (e.status === 404) return true;
  const code = String(e.code ?? '');
  if (code === 'PGRST205' || code === '42P01') return true;
  const blob = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();
  if (blob.includes('schema cache') || blob.includes('could not find the table') || blob.includes('does not exist')) {
    return true;
  }
  // Some PostgREST/Supabase versions expose only the message string
  if (blob.includes('event_members') && (blob.includes('not found') || blob.includes('unknown') || blob.includes('relation'))) {
    return true;
  }
  try {
    const s = JSON.stringify(error).toLowerCase();
    if (s.includes('pgrst205') || s.includes('schema cache') || s.includes('could not find')) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function canManageEventAssignmentsRole(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'boss' || role === 'project_manager' || role === 'Team_Leader';
}

export function invalidateEventMembersQueries(queryClient: QueryClient, companyId: string | null, eventId: string) {
  queryClient.invalidateQueries({ queryKey: ['event_members', eventId] });
  queryClient.invalidateQueries({ queryKey: ['event', eventId] });
  if (companyId) {
    queryClient.invalidateQueries({ queryKey: ['dashboard_events', companyId] });
    queryClient.invalidateQueries({ queryKey: ['company_events_for_assignments', companyId] });
    queryClient.invalidateQueries({ queryKey: ['events', companyId] });
  }
}
