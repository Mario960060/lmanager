import { SupabaseClient } from '@supabase/supabase-js';

export async function up(supabase: SupabaseClient) {
  console.log('Running migration: 20240305_admin_delete_policies - Adding admin delete policies');

  try {
    // Enable RLS on all tables
    await supabase.rpc('execute_sql', {
      sql: `
        ALTER TABLE day_notes ENABLE ROW LEVEL SECURITY;
        ALTER TABLE additional_tasks ENABLE ROW LEVEL SECURITY;
        ALTER TABLE additional_materials ENABLE ROW LEVEL SECURITY;
        ALTER TABLE task_progress_entries ENABLE ROW LEVEL SECURITY;
        ALTER TABLE materials_delivered ENABLE ROW LEVEL SECURITY;
        ALTER TABLE material_deliveries ENABLE ROW LEVEL SECURITY;
      `
    });

    // Create policies for Admin users to delete records in day_notes
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE POLICY "Allow admins to delete day notes" 
        ON day_notes 
        FOR DELETE 
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Admin'
          )
        );
      `
    });

    // Create policies for Admin users to delete records in additional_tasks
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE POLICY "Allow admins to delete additional tasks" 
        ON additional_tasks 
        FOR DELETE 
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Admin'
          )
        );
      `
    });

    // Create policies for Admin users to delete records in additional_materials
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE POLICY "Allow admins to delete additional materials" 
        ON additional_materials 
        FOR DELETE 
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Admin'
          )
        );
      `
    });

    // Create policies for Admin users to delete records in task_progress_entries
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE POLICY "Allow admins to delete task progress entries" 
        ON task_progress_entries 
        FOR DELETE 
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Admin'
          )
        );
      `
    });

    // Create policies for Admin users to delete records in materials_delivered
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE POLICY "Allow admins to delete materials delivered" 
        ON materials_delivered 
        FOR DELETE 
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Admin'
          )
        );
      `
    });

    // Create policies for Admin users to delete records in material_deliveries
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE POLICY "Allow admins to delete material deliveries" 
        ON material_deliveries 
        FOR DELETE 
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Admin'
          )
        );
      `
    });

    console.log('Migration completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error };
  }
}

export async function down(supabase: SupabaseClient) {
  console.log('Running down migration: 20240305_admin_delete_policies - Removing admin delete policies');

  try {
    // Drop all policies
    await supabase.rpc('execute_sql', {
      sql: `
        DROP POLICY IF EXISTS "Allow admins to delete day notes" ON day_notes;
        DROP POLICY IF EXISTS "Allow admins to delete additional tasks" ON additional_tasks;
        DROP POLICY IF EXISTS "Allow admins to delete additional materials" ON additional_materials;
        DROP POLICY IF EXISTS "Allow admins to delete task progress entries" ON task_progress_entries;
        DROP POLICY IF EXISTS "Allow admins to delete materials delivered" ON materials_delivered;
        DROP POLICY IF EXISTS "Allow admins to delete material deliveries" ON material_deliveries;
      `
    });

    console.log('Down migration completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Down migration failed:', error);
    return { success: false, error };
  }
}
