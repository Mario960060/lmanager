import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import Modal from '../../../components/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';

interface SetupMaterialUsageProps {
  onClose: () => void;
  wizardMode?: boolean;
}

interface Material {
  id: string;
  name: string;
  type: string;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id?: string;
  company_id: string;
}

const calculators = [
  { id: 'wall', name: 'Wall Calculator', nameKey: 'form:wall_calculator', defaultSandName: 'Building Sand' },
  { id: 'slab', name: 'Slab Calculator', nameKey: 'form:slab_calculator', defaultSandName: 'Sharp Sand' },
  { id: 'artificial_grass', name: 'Artificial Grass Calculator', nameKey: 'form:artificial_grass_calculator', defaultSandName: 'Granite Sand' },
  { id: 'paving', name: 'Paving Calculator', nameKey: 'form:paving_calculator', defaultSandName: 'Sharp Sand' }
];

const SetupMaterialUsage: React.FC<SetupMaterialUsageProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const [sandSelections, setSandSelections] = useState<Record<string, string>>({});
  const [slabMortarMixRatioSelection, setSlabMortarMixRatioSelection] = useState<string>('1:4');
  const [brickBlockMortarMixRatioSelection, setBrickBlockMortarMixRatioSelection] = useState<string>('1:4');
  const [initialLoad, setInitialLoad] = useState(true);
  const companyId = useAuthStore(state => state.getCompanyId());
  const queryClient = useQueryClient();

  // Fetch all materials
  const { data: materials = [], isLoading: isLoadingMaterials } = useQuery<Material[]>(
    { 
      queryKey: ['materials', companyId],
      queryFn: async () => {
        if (!companyId) return [];
        
        const { data, error } = await supabase
          .from('materials')
          .select('*')
          .eq('company_id', companyId)
          .order('name');

        if (error) throw error;
        return data as Material[];
      },
      enabled: !!companyId
    }
  );

  // Fetch existing material usage configurations
  const { data: existingConfigs = [], isLoading: isLoadingConfigs } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfigs', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id, company_id')
        .eq('company_id', companyId);

      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId
  });

  // Fetch existing mortar mix ratios
  const { data: mortarMixRatios = {} } = useQuery<{ [key: string]: { id: string; mortar_mix_ratio: string } }>({
    queryKey: ['mortarMixRatios', companyId],
    queryFn: async () => {
      if (!companyId) return {};
      
      const { data, error } = await supabase
        .from('mortar_mix_ratios')
        .select('id, type, mortar_mix_ratio')
        .eq('company_id', companyId);

      if (error && error.code !== 'PGRST116') throw error;
      
      // Transform to object by type: { slab: {...}, brick: {...}, blocks: {...} }
      const ratiosByType: { [key: string]: { id: string; mortar_mix_ratio: string } } = {};
      (data || []).forEach((item: any) => {
        ratiosByType[item.type] = { id: item.id, mortar_mix_ratio: item.mortar_mix_ratio };
      });
      return ratiosByType;
    },
    enabled: !!companyId
  });

  // Filter only sand materials and map name to id
  const sandMaterialOptions = useMemo(() => materials.filter((material: Material) => 
    material.name.toLowerCase().includes('sand')
  ).map((sand: Material) => ({ id: sand.id, name: sand.name })), [materials]);

  // Initialize sand selections with existing configs or defaults
  useEffect(() => {
    if (!isLoadingMaterials && !isLoadingConfigs && companyId && initialLoad && sandMaterialOptions.length > 0) {
      const initialSelections: Record<string, string> = {};
      
      calculators.forEach(calc => {
        const existingConfig = existingConfigs.find(config => config.calculator_id === calc.id);
        if (existingConfig && sandMaterialOptions.some(sand => sand.id === existingConfig.material_id)) {
          initialSelections[calc.id] = existingConfig.material_id;
        } else {
          const defaultSand = sandMaterialOptions.find(sand => sand.name === calc.defaultSandName);
          if (defaultSand) {
            initialSelections[calc.id] = defaultSand.id;
          }
        }
      });
      
      setSandSelections(initialSelections);
      
      // Load mortar mix ratios from table
      if (mortarMixRatios.slab?.mortar_mix_ratio) {
        setSlabMortarMixRatioSelection(mortarMixRatios.slab.mortar_mix_ratio);
      }
      if (mortarMixRatios.brick?.mortar_mix_ratio) {
        setBrickBlockMortarMixRatioSelection(mortarMixRatios.brick.mortar_mix_ratio);
      }
      
      setInitialLoad(false);
    }
  }, [isLoadingMaterials, isLoadingConfigs, companyId, initialLoad, sandMaterialOptions.length, existingConfigs.length, mortarMixRatios]);

  const handleSandChange = (calculatorId: string, materialId: string) => {
    setSandSelections((prev: Record<string, string>) => ({
      ...prev,
      [calculatorId]: materialId
    }));
  };

  // Mutation to save the configurations
  const saveConfigMutation = useMutation<void, Error, MaterialUsageConfig[]>({
    mutationFn: async (config: MaterialUsageConfig[]) => {
      if (!companyId) {
        throw new Error(t('form:company_id_required'));
      }

      // Delete existing configurations for these calculators
      const calculatorIdsToUpdate = config.map(c => c.calculator_id);
      const { error: deleteError } = await supabase
        .from('material_usage_configs')
        .delete()
        .in('calculator_id', calculatorIdsToUpdate)
        .eq('company_id', companyId);

      if (deleteError) throw deleteError;
        
      // Insert the new configurations
      const configWithCompanyId = config.map(c => ({ 
        ...c, 
        company_id: companyId 
      }));

      const { error: insertError } = await supabase
        .from('material_usage_configs')
        .insert(configWithCompanyId);

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      console.log('Material usage configuration saved successfully!');
      // Invalidate the query to refetch configs and update UI
      queryClient.invalidateQueries({ queryKey: ['materialUsageConfigs', companyId] });
      onClose();
    },
    onError: (error: Error) => {
      console.error('Failed to save material usage configuration:', error);
    }
  });

  const saveMortarMixRatioMutation = useMutation<void, Error, { type: string; ratio: string }[]>({
    mutationFn: async (ratios: { type: string; ratio: string }[]) => {
      if (!companyId) {
        throw new Error(t('form:company_id_required'));
      }

      // For each type (slab, brick, blocks), upsert the ratio
      for (const item of ratios) {
        const { data: existingRatio } = await supabase
          .from('mortar_mix_ratios')
          .select('id')
          .eq('company_id', companyId)
          .eq('type', item.type)
          .single();

        if (existingRatio) {
          // Update existing
          const { error } = await supabase
            .from('mortar_mix_ratios')
            .update({ mortar_mix_ratio: item.ratio })
            .eq('company_id', companyId)
            .eq('type', item.type);

          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('mortar_mix_ratios')
            .insert([{ 
              company_id: companyId, 
              type: item.type,
              mortar_mix_ratio: item.ratio 
            }]);

          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      console.log('Mortar mix ratios saved successfully!');
      // Invalidate the query to refetch
      queryClient.invalidateQueries({ queryKey: ['mortarMixRatios', companyId] });
    },
    onError: (error: Error) => {
      console.error('Failed to save mortar mix ratios:', error);
    }
  });

  const handleSave = () => {
    // Prepare the data to be saved (array of { calculator_id, material_id })
    const configToSave: (MaterialUsageConfig | Omit<MaterialUsageConfig, 'company_id'> & { company_id?: string })[] = [];
    
    // Add sand selections for each calculator
    Object.keys(sandSelections).forEach((calculatorId: string) => {
      configToSave.push({
        calculator_id: calculatorId,
        material_id: sandSelections[calculatorId],
        company_id: companyId || undefined
      } as any);
    });
    
    // Save material configs first
    saveConfigMutation.mutate(configToSave as MaterialUsageConfig[], {
      onSuccess: () => {
        // Then save both mortar mix ratios
        saveMortarMixRatioMutation.mutate([
          { type: 'slab', ratio: slabMortarMixRatioSelection },
          { type: 'brick', ratio: brickBlockMortarMixRatioSelection }
        ]);
      }
    });
  };

  if (!companyId) {
    const errorContent = (
      <div className="p-6">
        <p className="text-red-600">{t('form:no_company_selected')}</p>
      </div>
    );
    
    if (wizardMode) return errorContent;
    return <Modal isOpen={true} onClose={onClose} title={t('form:material_usage_setup_modal_title')}>{errorContent}</Modal>;
  }

  const contentMarkup = (
    <>
      <h3 className="text-xl font-semibold mb-4">{t('form:material_usage_configuration_title')}</h3>
        
        {/* Sand Usage Section */}
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-medium mb-3">{t('form:sand_usage_configuration')}</h4>
            <p className="text-gray-600 mb-4">
              {t('form:sand_usage_description')}
            </p>
            
            <div className="space-y-4">
              {isLoadingMaterials || isLoadingConfigs ? (
                <p>{t('form:loading_materials')}</p>
              ) : sandMaterialOptions.length === 0 ? (
                <p>{t('form:no_sand_materials_found')}</p>
              ) : (
                calculators.map(calculator => (
                  <div key={calculator.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h5 className="font-medium">{t(calculator.nameKey as any)}</h5>
                      <p className="text-sm text-gray-500">
                        {t('form:current_sand')}: {sandMaterialOptions.find(sand => sand.id === sandSelections[calculator.id])?.name || t('form:not_selected')}
                      </p>
                    </div>
                    <select
                      value={sandSelections[calculator.id] || ''}
                      onChange={(e: FormEvent<HTMLSelectElement>) => handleSandChange(calculator.id, e.currentTarget.value)}
                      className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">{t('form:select_sand')}</option>
                      {sandMaterialOptions.map((sand: { id: string; name: string }) => (
                        <option key={sand.id} value={sand.id}>
                          {sand.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mortar Mix Ratio Section */}
          <div>
            <h4 className="text-lg font-medium mb-3">{t('form:mortar_mix_ratio_configuration')}</h4>
            
            {/* Slab Mortar Mix Ratio */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t('form:slab_mortar_mix_ratio')}
              </label>
              <select
                value={slabMortarMixRatioSelection}
                onChange={(e: FormEvent<HTMLSelectElement>) => setSlabMortarMixRatioSelection(e.currentTarget.value)}
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1:4">1:4</option>
                <option value="1:5">1:5</option>
                <option value="1:6">1:6</option>
                <option value="1:7">1:7</option>
                <option value="1:8">1:8</option>
              </select>
              <p className="text-sm text-gray-500 mt-2">
                {t('form:current_selection')}: {slabMortarMixRatioSelection}
              </p>
            </div>

            {/* Brick/Block Mortar Mix Ratio */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t('form:brick_block_mortar_mix_ratio')}
              </label>
              <select
                value={brickBlockMortarMixRatioSelection}
                onChange={(e: FormEvent<HTMLSelectElement>) => setBrickBlockMortarMixRatioSelection(e.currentTarget.value)}
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1:4">1:4</option>
                <option value="1:5">1:5</option>
                <option value="1:6">1:6</option>
                <option value="1:7">1:7</option>
                <option value="1:8">1:8</option>
              </select>
              <p className="text-sm text-gray-500 mt-2">
                {t('form:current_selection')}: {brickBlockMortarMixRatioSelection}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            {t('form:cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            disabled={saveConfigMutation.isPending}
          >
            {saveConfigMutation.isPending ? t('form:saving') : t('form:save_changes')}
          </button>
        </div>
      </>
    );

    if (wizardMode) {
      return <div className="p-6 overflow-y-auto h-full">{contentMarkup}</div>;
    }

  return (
    <Modal isOpen={true} onClose={onClose} title={t('form:material_usage_setup_modal_title')}>
      {contentMarkup}
    </Modal>
  );
};

export default SetupMaterialUsage;
