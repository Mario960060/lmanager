import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';
import { useAuthStore } from './store';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Helper function to automatically add company_id to insert/update operations
 * Usage: const { data, error } = await insertWithCompanyId('table_name', { field: 'value' })
 */
export async function insertWithCompanyId<T extends keyof Database['public']['Tables']>(
  tableName: T,
  values: any
) {
  const companyId = useAuthStore.getState().getCompanyId();
  
  if (!companyId) {
    throw new Error('No company_id available. User must be logged in with a company.');
  }

  return supabase
    .from(tableName as string)
    .insert({ ...values, company_id: companyId });
}
