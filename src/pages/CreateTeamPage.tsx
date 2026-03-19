import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { ArrowLeft, Check } from 'lucide-react';
import { Spinner, Button } from '../themes/uiComponents';
import { colors } from '../themes/designTokens';

interface SubscriptionPlan {
  id: string;
  name: string;
  maxUsers: number;
  description: string;
  price?: string;
  dbValue: string; // wartość dla bazy danych
}

const CreateTeamPage = () => {
  const { t } = useTranslation(['common', 'form', 'plan']);
  const { profile, setProfile } = useAuthStore();
  
  const subscriptionPlans: SubscriptionPlan[] = [
    {
      id: 'one',
      name: 'One Plan',
      maxUsers: 1,
      description: t('plan:plan_one_description'),
      price: 'Free*',
      dbValue: 'basic'
    },
    {
      id: 'two',
      name: 'Two Plan',
      maxUsers: 2,
      description: t('plan:plan_two_description'),
      price: 'Free*',
      dbValue: 'basic'
    },
    {
      id: 'five',
      name: 'Five Plan',
      maxUsers: 5,
      description: t('plan:plan_five_description'),
      price: 'Free*',
      dbValue: 'pro'
    }
  ];
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('two');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      setError(t('common:team_name_required'));
      return;
    }

    if (!selectedPlan) {
      setError(t('common:plan_required'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        setError(t('common:must_logged_in'));
        return;
      }

      const selectedSubscription = subscriptionPlans.find(p => p.id === selectedPlan);
      if (!selectedSubscription) {
        setError(t('common:invalid_plan'));
        return;
      }

      // Check if company with this name already exists
      const { data: existingCompanies, error: checkError } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', teamName.trim())
        .limit(1);

      if (checkError) {
        throw new Error('Failed to check company name: ' + checkError.message);
      }

      if (existingCompanies && existingCompanies.length > 0) {
        setError(t('common:company_exists', { defaultValue: 'A company with the name "%s" already exists. Please choose a different name.', interpolation: { escapeValue: false } }).replace('%s', teamName));
        setIsLoading(false);
        return;
      }

      // Create company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: teamName,
          subscription_plan: selectedSubscription.dbValue,
          max_users: selectedSubscription.maxUsers
        } as any)
        .select('id, name, subscription_plan, max_users')
        .single();

      if (companyError || !company) {
        throw new Error(companyError?.message || 'Failed to create company');
      }

      // Debug check: verify company.id exists
      if (!company?.id) {
        console.error('Company created but ID is missing:', company);
        throw new Error('Company created but ID is missing: ' + JSON.stringify(company));
      }

      // Update profile with company_id FIRST - needed for RLS policies
      const { error: profileError } = await ((supabase
        .from('profiles')
        .update({ company_id: (company as any).id } as any) as any)
        .eq('id', user.id) as any);

      if (profileError) {
        throw new Error(profileError.message);
      }

      // Update Zustand store so Setup components get company_id immediately
      setProfile({
        ...(profile || { role: 'user', full_name: '', email: '' }),
        company_id: (company as any).id
      } as any);

      // Wait for profile update to propagate in database
      await new Promise(resolve => setTimeout(resolve, 500));

      // Add user as admin member
      const { error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: (company as any).id,
          user_id: user.id,
          status: 'accepted',
          joined_at: new Date().toISOString(),
          role: 'Admin'
        } as any);

      if (memberError) {
        throw new Error(memberError.message);
      }

      // Copy event_tasks from template to company
      const { data: templateTasks, error: fetchTemplateTasksError } = await supabase
        .from('event_tasks_template')
        .select('*');

      if (fetchTemplateTasksError) {
        throw new Error('Failed to fetch event_tasks template: ' + fetchTemplateTasksError.message);
      }

      if (templateTasks && templateTasks.length > 0) {
        const tasksToInsert = (templateTasks as any[]).map(task => ({
          name: task.name,
          description: task.description,
          unit: task.unit,
          estimated_hours: task.estimated_hours,
          is_deletable: task.is_deletable,
          company_id: (company as any).id
        }));

        const { error: insertTasksError } = await supabase
          .from('event_tasks')
          .insert(tasksToInsert);

        if (insertTasksError) {
          throw new Error('Failed to copy event_tasks template: ' + insertTasksError.message);
        }
      }

      // Copy materials from template to company
      const { data: templateMaterials, error: fetchTemplateMaterialsError } = await supabase
        .from('materials_template')
        .select('*');

      if (fetchTemplateMaterialsError) {
        throw new Error('Failed to fetch materials template: ' + fetchTemplateMaterialsError.message);
      }

      if (templateMaterials && templateMaterials.length > 0) {
        const materialsToInsert = (templateMaterials as any[]).map(material => ({
          name: material.name,
          description: material.description,
          unit: material.unit,
          is_deletable: material.is_deletable ?? false,
          company_id: (company as any).id
        }));

        const { error: insertMaterialsError } = await supabase
          .from('materials')
          .insert(materialsToInsert);

        if (insertMaterialsError) {
          throw new Error('Failed to copy materials template: ' + insertMaterialsError.message);
        }
      }

      // Copy equipment from template to company
      const { data: templateEquipment, error: fetchTemplateEquipmentError } = await supabase
        .from('equipment_template')
        .select('*');

      if (fetchTemplateEquipmentError) {
        throw new Error('Failed to fetch equipment template: ' + fetchTemplateEquipmentError.message);
      }

      if (templateEquipment && templateEquipment.length > 0) {
        const equipmentToInsert = (templateEquipment as any[]).map(item => ({
          name: item.name,
          description: item.description,
          status: item.status,
          company_id: (company as any).id
        }));

        const { error: insertEquipmentError } = await supabase
          .from('equipment')
          .insert(equipmentToInsert);

        if (insertEquipmentError) {
          throw new Error('Failed to copy equipment template: ' + insertEquipmentError.message);
        }
      }

      // Navigate to company setup wizard
      navigate('/company-setup');
    } catch (err) {
      console.error('Error creating team:', err);
      setError(err instanceof Error ? err.message : t('common:failed_create_team'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(to bottom right, ${colors.accentBlueBg}, ${colors.bgMain})` }}>
      <div className="max-w-4xl w-full">
        {/* Back Button */}
        <button
          onClick={() => navigate('/no-team')}
          className="flex items-center gap-2 mb-8 transition-colors"
          style={{ color: colors.textSubtle }}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.textPrimary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colors.textSubtle; }}
        >
          <ArrowLeft className="w-5 h-5" />
          {t('common:back')}
        </button>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: colors.textPrimary }}>{t('common:create_team_title')}</h1>
          <p className="text-xl" style={{ color: colors.textSubtle }}>
            {t('common:create_team_subtitle')}
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-lg shadow-lg p-8" style={{ backgroundColor: colors.bgCard }}>
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 border rounded-lg" style={{ backgroundColor: colors.redLight, borderColor: colors.red }}>
              <p style={{ color: colors.red }}>{error}</p>
            </div>
          )}

          {/* Team Name Input */}
          <div className="mb-8">
            <label className="block text-sm font-semibold mb-3" style={{ color: colors.textMuted }}>
              {t('common:team_name')} *
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder={t('common:team_name_placeholder')}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all"
              style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated, color: colors.textPrimary }}
              disabled={isLoading}
            />
          </div>

          {/* Subscription Plans */}
          <div className="mb-8">
            <label className="block text-sm font-semibold mb-4" style={{ color: colors.textMuted }}>
              {t('common:select_subscription')} *
            </label>
            <div className="grid md:grid-cols-3 gap-4">
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className="p-6 rounded-lg border-2 cursor-pointer transition-all transform"
                  style={{
                    borderColor: selectedPlan === plan.id ? colors.accentBlue : colors.borderDefault,
                    backgroundColor: selectedPlan === plan.id ? colors.accentBlueBg : colors.bgElevated,
                    transform: selectedPlan === plan.id ? 'scale(1.05)' : 'none'
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: colors.textPrimary }}>{plan.name}</h3>
                      <p className="text-sm" style={{ color: colors.textSubtle }}>{plan.description}</p>
                    </div>
                    {selectedPlan === plan.id && (
                      <Check className="w-6 h-6 flex-shrink-0" style={{ color: colors.accentBlue }} />
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold" style={{ color: colors.textPrimary }}>
                        {plan.maxUsers}
                      </span>
                      <span style={{ color: colors.textSubtle }}>
                        {plan.maxUsers === 1 ? t('common:member') : t('common:members')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: colors.accentBlue }}>
                      {plan.price}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: colors.textSubtle }}>
              {t('common:currently_beta')}
            </p>
          </div>

          {/* Create Button */}
          <div className="flex gap-4">
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => navigate('/no-team')} disabled={isLoading}>
              {t('common:cancel')}
            </Button>
            <Button variant="primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleCreateTeam} disabled={isLoading || !teamName.trim()}>
              {isLoading && <Spinner size={20} />}
              {isLoading ? t('common:creating_team') : t('common:create_team_btn')}
            </Button>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 border rounded-lg p-6" style={{ backgroundColor: colors.accentBlueBg, borderColor: colors.accentBlueBorder }}>
          <h3 className="font-semibold mb-2" style={{ color: colors.accentBlue }}>{t('common:beta_notice')}</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {t('common:beta_notice_text')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CreateTeamPage;
