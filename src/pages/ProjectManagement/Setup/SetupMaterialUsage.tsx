import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import Modal from '../../../components/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';

interface SetupMaterialUsageProps {
  onClose: () => void;
}

interface Material {
  id: string;
  name: string;
  type: string;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
  company_id?: string;
}

const calculators = [
  { id: 'wall', name: 'Wall Calculator', defaultSandName: 'Building Sand' },
  { id: 'slab', name: 'Slab Calculator', defaultSandName: 'Sharp Sand' },
  { id: 'artificial_grass', name: 'Artificial Grass Calculator', defaultSandName: 'Granite Sand' },
  { id: 'paving', name: 'Paving Calculator', defaultSandName: 'Sharp Sand' }
];

const SetupMaterialUsage: React.FC<SetupMaterialUsageProps> = ({ onClose }) => {
  const [sandSelections, setSandSelections] = useState<Record<string, string>>({});
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
      setInitialLoad(false);
    }
  }, [isLoadingMaterials, isLoadingConfigs, companyId, initialLoad, sandMaterialOptions.length, existingConfigs.length]);

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
        throw new Error('Company ID is required');
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

  const handleSave = () => {
    // Prepare the data to be saved (array of { calculator_id, material_id })
    const configToSave: MaterialUsageConfig[] = Object.keys(sandSelections).map((calculatorId: string) => ({
      calculator_id: calculatorId,
      material_id: sandSelections[calculatorId],
      company_id: companyId || undefined
    }));
    saveConfigMutation.mutate(configToSave);
  };

  if (!companyId) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Material Usage Setup">
        <div className="p-6">
          <p className="text-red-600">Error: No company selected</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Material Usage Setup">
      <div className="p-6">
        <h3 className="text-xl font-semibold mb-4">Material Usage Configuration</h3>
        
        {/* Sand Usage Section */}
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-medium mb-3">Sand Usage Configuration</h4>
            <p className="text-gray-600 mb-4">
              Configure which type of sand is used by each calculator.
            </p>
            
            <div className="space-y-4">
              {isLoadingMaterials || isLoadingConfigs ? (
                <p>Loading materials and configurations...</p>
              ) : sandMaterialOptions.length === 0 ? (
                <p>No sand materials found. Please add sand materials in the Materials section.</p>
              ) : (
                calculators.map(calculator => (
                  <div key={calculator.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h5 className="font-medium">{calculator.name}</h5>
                      <p className="text-sm text-gray-500">Current: {sandMaterialOptions.find(sand => sand.id === sandSelections[calculator.id])?.name || 'Not selected'}</p>
                    </div>
                    <select
                      value={sandSelections[calculator.id] || ''}
                      onChange={(e: FormEvent<HTMLSelectElement>) => handleSandChange(calculator.id, e.currentTarget.value)}
                      className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select Sand</option>
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
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            disabled={saveConfigMutation.isPending}
          >
            {saveConfigMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SetupMaterialUsage;
