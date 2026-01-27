// Fetch hours data
const { data: hoursData, error: hoursError } = await supabase
  .from('task_progress_entries')
  .select(`
    user_id,
    task_id,
    hours_spent,
    tasks_done (
      name,
      amount
    ),
    profiles (
      full_name
    )
  `)
  .eq('event_id', selectedProject)
  .gte('created_at', `${startDate}T00:00:00`)
  .lte('created_at', `${endDate}T23:59:59`);

if (hoursError) throw hoursError;

// Fetch additional task progress entries
const { data: additionalProgressData, error: additionalProgressError } = await supabase
  .from('additional_task_progress_entries')
  .select(`
    task_id,
    user_id,
    hours_spent,
    additional_tasks (
      id,
      description
    ),
    profiles (
      full_name
    )
  `)
  .eq('event_id', selectedProject)
  .gte('created_at', `${startDate}T00:00:00`)
  .lte('created_at', `${endDate}T23:59:59`);

if (additionalProgressError) throw additionalProgressError;

// Process hours data
const totalProjectHours = (hoursData?.reduce((sum: number, item: any) => sum + (item.hours_spent || 0), 0) || 0) +
  (additionalProgressData?.reduce((sum: number, item: any) => sum + (item.hours_spent || 0), 0) || 0);

// Group hours by user
const hoursByUser = hoursData?.reduce((acc: Record<string, any>, item: any) => {
  const userId = item.user_id;
  if (!acc[userId]) {
    acc[userId] = {
      userName: item.profiles?.full_name,
      totalHours: 0,
      taskHours: {}
    };
  }
  acc[userId].totalHours += item.hours_spent || 0;

  // Group by task
  const taskName = item.tasks_done?.name || 'Unknown Task';
  if (!acc[userId].taskHours[taskName]) {
    acc[userId].taskHours[taskName] = 0;
  }
  acc[userId].taskHours[taskName] += item.hours_spent || 0;

  return acc;
}, {}) || {};

// Add additional task progress to hoursByUser
additionalProgressData?.forEach((item: any) => {
  const userId = item.user_id;
  if (!hoursByUser[userId]) {
    hoursByUser[userId] = {
      userName: item.profiles?.full_name,
      totalHours: 0,
      taskHours: {}
    };
  }
  hoursByUser[userId].totalHours += item.hours_spent || 0;

  // Group by task description from additional_tasks
  const taskName = item.additional_tasks?.description || 'Unknown Additional Task';
  if (!hoursByUser[userId].taskHours[taskName]) {
    hoursByUser[userId].taskHours[taskName] = 0;
  }
  hoursByUser[userId].taskHours[taskName] += item.hours_spent || 0;
});

// Fetch additional tasks and materials
const { data: additionalTasks, error: tasksError } = await supabase
  .from('additional_tasks')
  .select(`
    *,
    profiles (
      full_name
    )
  `)
  .eq('event_id', selectedProject)
  .gte('created_at', `${startDate}T00:00:00`)
  .lte('created_at', `${endDate}T23:59:59`);

if (tasksError) throw tasksError;

// Fetch additional materials
const { data: additionalMaterials, error: materialsError } = await supabase
  .from('additional_materials')
  .select(`
    *,
    profiles (
      full_name
    )
  `)
  .eq('event_id', selectedProject)
  .gte('created_at', `${startDate}T00:00:00`)
  .lte('created_at', `${endDate}T23:59:59`);

if (materialsError) throw materialsError;

return {
  totalHours: totalProjectHours,
  byUser: hoursByUser,
  additionalTasks,
  additionalMaterials
};
