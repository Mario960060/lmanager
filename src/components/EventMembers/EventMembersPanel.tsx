import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, UserPlus, UserMinus, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { invalidateEventMembersQueries, isMissingRestRelationError } from '../../lib/eventMembers';
import { Button, Spinner, Label } from '../../themes/uiComponents';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../themes/designTokens';

type ProfileLite = { id: string; email: string | null; full_name: string | null };

type CompanyMemberRow = {
  user_id: string;
  role: string;
  profile: ProfileLite | null;
};

type AssignedRow = {
  id: string;
  user_id: string;
  role: string;
  profile: { full_name: string | null; email: string | null } | null;
};

const PROJECT_ROLES = ['member', 'leader', 'viewer'] as const;

type EventMembersQueryResult = { assigned: AssignedRow[]; schemaMissing: boolean };

function displayName(p: { full_name?: string | null; email?: string | null }, fallback: string) {
  const n = (p.full_name || '').trim();
  if (n) return n;
  const e = (p.email || '').trim();
  if (e) return e;
  return fallback;
}

export function EventMembersPanel({ eventId }: { eventId: string | null }) {
  const { t } = useTranslation(['common']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [search, setSearch] = useState('');

  const { data: membersQuery, isLoading: loadingAssigned, isError: membersQueryFailed, error: membersQueryError } = useQuery({
    queryKey: ['event_members', eventId],
    queryFn: async (): Promise<EventMembersQueryResult> => {
      if (!eventId) return { assigned: [], schemaMissing: false };
      const { data: rows, error } = await supabase.from('event_members').select('id, user_id, role').eq('event_id', eventId);
      if (error) {
        if (isMissingRestRelationError(error)) return { assigned: [], schemaMissing: true };
        throw error;
      }
      const list = rows ?? [];
      if (list.length === 0) return { assigned: [], schemaMissing: false };
      const uids = list.map((r) => r.user_id);
      const { data: profs, error: pe } = await supabase.from('profiles').select('id, full_name, email').in('id', uids);
      if (pe) throw pe;
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return {
        assigned: list.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          profile: byId.get(r.user_id) ?? null,
        })) as AssignedRow[],
        schemaMissing: false,
      };
    },
    enabled: !!eventId,
    retry: false,
  });

  const assigned = membersQuery?.assigned ?? [];
  const schemaMissing =
    (membersQuery?.schemaMissing ?? false) ||
    (membersQueryFailed && membersQueryError != null && isMissingRestRelationError(membersQueryError));

  const { data: companyPeople = [], isLoading: loadingPeople } = useQuery({
    queryKey: ['company_members_for_event_assign', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: rows, error } = await supabase
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', companyId)
        .eq('status', 'accepted')
        .not('user_id', 'is', null);
      if (error) throw error;
      const uids = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
      if (uids.length === 0) return [];
      const { data: profs, error: pe } = await supabase.from('profiles').select('id, email, full_name').in('id', uids);
      if (pe) throw pe;
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => ({
        user_id: r.user_id as string,
        role: r.role,
        profile: byId.get(r.user_id as string) ?? null,
      })) as CompanyMemberRow[];
    },
    enabled: !!companyId,
    retry: false,
  });

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.user_id)), [assigned]);

  const filteredAssigned = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assigned;
    return assigned.filter((a) => {
      const p = a.profile;
      const name = displayName({ full_name: p?.full_name, email: p?.email }, a.user_id).toLowerCase();
      return name.includes(q);
    });
  }, [assigned, search]);

  const available = useMemo(() => {
    return companyPeople.filter((m) => !assignedIds.has(m.user_id));
  }, [companyPeople, assignedIds]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((m) => {
      const p = m.profile;
      const name = displayName({ full_name: p?.full_name, email: p?.email }, m.user_id).toLowerCase();
      return name.includes(q);
    });
  }, [available, search]);

  const addMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      if (!eventId || !companyId) throw new Error('missing');
      const { error } = await supabase.from('event_members').insert({
        event_id: eventId,
        user_id: userId,
        role,
        assigned_by: user?.id ?? null,
      });
      if (error) {
        if (isMissingRestRelationError(error)) {
          throw new Error('SCHEMA_MISSING');
        }
        throw error;
      }
    },
    onSuccess: () => {
      if (eventId) invalidateEventMembersQueries(queryClient, companyId, eventId);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from('event_members').delete().eq('id', rowId);
      if (error) {
        if (isMissingRestRelationError(error)) throw new Error('SCHEMA_MISSING');
        throw error;
      }
    },
    onSuccess: () => {
      if (eventId) invalidateEventMembersQueries(queryClient, companyId, eventId);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ rowId, role }: { rowId: string; role: string }) => {
      const { error } = await supabase.from('event_members').update({ role }).eq('id', rowId);
      if (error) {
        if (isMissingRestRelationError(error)) throw new Error('SCHEMA_MISSING');
        throw error;
      }
    },
    onSuccess: () => {
      if (eventId) invalidateEventMembersQueries(queryClient, companyId, eventId);
    },
  });

  const showSchemaMissingUi =
    schemaMissing ||
    [addMutation.error, removeMutation.error, updateRoleMutation.error].some(
      (err) =>
        err != null &&
        (isMissingRestRelationError(err) || (err instanceof Error && err.message === 'SCHEMA_MISSING'))
    );

  if (!eventId) {
    return (
      <p style={{ color: colors.textDim, fontSize: fontSizes.sm, margin: 0 }}>
        {t('common:event_members_empty_project')}
      </p>
    );
  }

  const busy = loadingAssigned || loadingPeople;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      {showSchemaMissingUi ? (
        <div
          role="alert"
          style={{
            display: 'flex',
            gap: 10,
            padding: 12,
            borderRadius: radii.lg,
            border: '1px solid rgba(245, 158, 11, 0.45)',
            background: 'rgba(245, 158, 11, 0.12)',
            color: colors.textPrimary,
            fontSize: fontSizes.md,
            lineHeight: 1.45,
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0, color: '#f59e0b', marginTop: 2 }} />
          <span>{t('common:event_members_schema_missing')}</span>
        </div>
      ) : null}
      <div>
        <Label>{t('common:event_members_search')}</Label>
        <div style={{ position: 'relative', marginTop: 6 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common:event_members_search')}
            disabled={showSchemaMissingUi}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px 10px 34px',
              borderRadius: 12,
              border: `1px solid ${colors.borderDefault}`,
              background: colors.bgInput,
              color: colors.textPrimary,
              fontSize: fontSizes.sm,
              opacity: showSchemaMissingUi ? 0.6 : 1,
            }}
          />
        </div>
      </div>

      {busy ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: spacing['2xl'] }}>
          <Spinner size={28} />
        </div>
      ) : (
        <>
          <div>
            <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing.sm }}>
              {t('common:event_members_assigned')} ({filteredAssigned.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {filteredAssigned.length === 0 ? (
                <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>—</span>
              ) : (
                filteredAssigned.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${colors.borderDefault}`,
                      background: colors.bgElevated,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 120, fontSize: fontSizes.sm, color: colors.textPrimary }}>
                      {displayName(
                        { full_name: row.profile?.full_name, email: row.profile?.email },
                        row.user_id
                      )}
                    </span>
                    <select
                      value={row.role}
                      onChange={(e) => updateRoleMutation.mutate({ rowId: row.id, role: e.target.value })}
                      disabled={showSchemaMissingUi || updateRoleMutation.isPending}
                      style={{
                        fontSize: fontSizes.sm,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: `1px solid ${colors.borderDefault}`,
                        background: colors.bgCard,
                        color: colors.textPrimary,
                      }}
                    >
                      {PROJECT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`common:event_members_role_${r}`)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => removeMutation.mutate(row.id)}
                      disabled={showSchemaMissingUi || removeMutation.isPending}
                      style={{ padding: '6px 10px', minWidth: 'auto' }}
                    >
                      <UserMinus size={16} style={{ marginRight: 4 }} />
                      {t('common:event_members_remove')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing.sm }}>
              {t('common:event_members_available')} ({filteredAvailable.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {filteredAvailable.length === 0 ? (
                <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>—</span>
              ) : (
                filteredAvailable.map((m) => (
                  <div
                    key={m.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${colors.borderDefault}`,
                      background: 'transparent',
                    }}
                  >
                    <span style={{ fontSize: fontSizes.sm, color: colors.textPrimary }}>
                      {displayName(
                        { full_name: m.profile?.full_name, email: m.profile?.email },
                        m.user_id
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{m.role}</span>
                    <Button
                      type="button"
                      onClick={() => addMutation.mutate({ userId: m.user_id, role: 'member' })}
                      disabled={showSchemaMissingUi || addMutation.isPending}
                      style={{ padding: '6px 10px', minWidth: 'auto' }}
                    >
                      <UserPlus size={16} style={{ marginRight: 4 }} />
                      {t('common:event_members_add')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
