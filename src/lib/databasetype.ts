export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          title: string;
          description: string;
          start_date: string;
          end_date: string;
          status: 'planned' | 'scheduled' | 'in_progress' | 'finished';
          has_equipment: boolean;
          has_materials: boolean;
          project_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          start_date: string;
          end_date: string;
          status?: 'planned' | 'scheduled' | 'in_progress' | 'finished';
          has_equipment?: boolean;
          has_materials?: boolean;
          project_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          start_date?: string;
          end_date?: string;
          status?: 'planned' | 'scheduled' | 'in_progress' | 'finished';
          has_equipment?: boolean;
          has_materials?: boolean;
          project_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      event_tasks: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          description: string;
          status: 'pending' | 'completed';
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          description: string;
          status?: 'pending' | 'completed';
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          title?: string;
          description?: string;
          status?: 'pending' | 'completed';
          created_at?: string;
        };
      };
      event_materials: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          quantity: number;
          unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          quantity: number;
          unit: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          name?: string;
          quantity?: number;
          unit?: string;
          created_at?: string;
        };
      };
    };
  };
}
