const fetchEquipment = async (): Promise<void> => {
  try {
    setIsLoading(true);
    setError(null);

    // Fetch excavators
    const { data: excavatorData, error: excavatorError } = await supabase
      .from('setup_digging')
      .select('*')
      .eq('type', 'excavator');

    if (excavatorError) throw excavatorError;

    // Fetch carriers (barrows/dumpers)
    const { data: carrierData, error: carrierError } = await supabase
      .from('setup_digging')
      .select('*')
      .eq('type', 'barrows_dumpers');

    if (carrierError) throw carrierError;

    // Fetch existing tasks to check for duplicates
    const { data: taskData, error: taskError } = await supabase
      .from('event_tasks')
      .select('name');

    if (taskError) throw taskError;

    // Store all excavators and carriers that have valid sizes
    const validExcavators = (excavatorData || []).filter(exc => exc["size (in tones)"] !== null);
    const validCarriers = (carrierData || []).filter(car => car["size (in tones)"] !== null);
    
    setExcavators(excavatorData || []);
    setCarriers(carrierData || []);
    setExistingTasks((taskData || []).map((task: any) => task.name));
    
    // Use all valid machinery instead of just new ones
    setNewExcavators(validExcavators);
    setNewCarriers(validCarriers);

  } catch (error) {
    console.error('Error fetching equipment:', error);
    setError(t('calculator:failed_fetch_equipment'));
  } finally {
    setIsLoading(false);
  }
};
