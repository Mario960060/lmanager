import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';

interface SubscriptionPlan {
  id: string;
  name: string;
  maxUsers: number;
  description: string;
  price?: string;
  dbValue: string; // wartość dla bazy danych
}

const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'one',
    name: 'One Plan',
    maxUsers: 1,
    description: 'Perfect for solo entrepreneurs',
    price: 'Free*',
    dbValue: 'basic'
  },
  {
    id: 'two',
    name: 'Two Plan',
    maxUsers: 2,
    description: 'For small teams',
    price: 'Free*',
    dbValue: 'basic'
  },
  {
    id: 'five',
    name: 'Five Plan',
    maxUsers: 5,
    description: 'For growing teams',
    price: 'Free*',
    dbValue: 'pro'
  }
];

const CreateTeamPage = () => {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('two');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    if (!selectedPlan) {
      setError('Please select a subscription plan');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        setError('You must be logged in to create a team');
        return;
      }

      const selectedSubscription = subscriptionPlans.find(p => p.id === selectedPlan);
      if (!selectedSubscription) {
        setError('Invalid subscription plan selected');
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

      console.log('Company created successfully with ID:', company.id);

      // Update profile with company_id FIRST - needed for RLS policies
      const { error: profileError } = await ((supabase
        .from('profiles')
        .update({ company_id: (company as any).id } as any) as any)
        .eq('id', user.id) as any);

      if (profileError) {
        throw new Error(profileError.message);
      }

      console.log('Profile updated with company_id');

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

      // Reload page to trigger AuthGuard check with new company_id
      window.location.href = '/';
    } catch (err) {
      console.error('Error creating team:', err);
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Back Button */}
        <button
          onClick={() => navigate('/no-team')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Create Your Team</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Set up your company and choose a subscription plan
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Team Name Input */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Team Name *
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g., My Landscape Company"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 transition-all"
              disabled={isLoading}
            />
          </div>

          {/* Subscription Plans */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Select Subscription Plan *
            </label>
            <div className="grid md:grid-cols-3 gap-4">
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`p-6 rounded-lg border-2 cursor-pointer transition-all transform ${
                    selectedPlan === plan.id
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-105'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{plan.description}</p>
                    </div>
                    {selectedPlan === plan.id && (
                      <Check className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">
                        {plan.maxUsers}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">member{plan.maxUsers !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {plan.price}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              * Currently in beta. All plans are free during the beta period.
            </p>
          </div>

          {/* Create Button */}
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/no-team')}
              className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-semibold disabled:opacity-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTeam}
              disabled={isLoading || !teamName.trim()}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              {isLoading ? 'Creating Team...' : 'Create Team'}
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">What happens next?</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-2">
            <li>✓ Your team will be created and you'll become the Admin</li>
            <li>✓ You can immediately start inviting team members</li>
            <li>✓ You can upgrade or downgrade your plan anytime</li>
            <li>✓ Full access to all features for your team</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CreateTeamPage;
