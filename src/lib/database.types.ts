Need to install the following packages:
supabase@2.72.8
Ok to proceed? (y) 
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      additional_materials: {
        Row: {
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
          material: string
          quantity: number
          unit: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          material: string
          quantity: number
          unit?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          material?: string
          quantity?: number
          unit?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "additional_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_materials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_materials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_task_materials: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          material: string
          quantity: number
          task_id: string | null
          unit: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          material: string
          quantity: number
          task_id?: string | null
          unit: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          material?: string
          quantity?: number
          task_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_task_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_task_materials_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "additional_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_task_progress_entries: {
        Row: {
          amount_completed: number
          company_id: string | null
          created_at: string
          event_id: string
          hours_spent: number
          id: string
          notes: string | null
          progress_percentage: number
          task_id: string | null
          user_id: string
        }
        Insert: {
          amount_completed?: number
          company_id?: string | null
          created_at?: string
          event_id: string
          hours_spent: number
          id?: string
          notes?: string | null
          progress_percentage: number
          task_id?: string | null
          user_id: string
        }
        Update: {
          amount_completed?: number
          company_id?: string | null
          created_at?: string
          event_id?: string
          hours_spent?: number
          id?: string
          notes?: string | null
          progress_percentage?: number
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_task_progress_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_task_progress_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_task_progress_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "additional_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_task_progress_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_tasks: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string
          end_date: string
          event_id: string | null
          hours_needed: number
          hours_spent: number | null
          id: string
          is_finished: boolean | null
          materials_needed: string | null
          progress: number | null
          quantity: number | null
          start_date: string
          unit: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description: string
          end_date: string
          event_id?: string | null
          hours_needed: number
          hours_spent?: number | null
          id?: string
          is_finished?: boolean | null
          materials_needed?: string | null
          progress?: number | null
          quantity?: number | null
          start_date: string
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string
          end_date?: string
          event_id?: string | null
          hours_needed?: number
          hours_spent?: number | null
          id?: string
          is_finished?: boolean | null
          materials_needed?: string | null
          progress?: number | null
          quantity?: number | null
          start_date?: string
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "additional_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_equipment: {
        Row: {
          company_id: string | null
          created_at: string
          date: string
          equipment_id: string | null
          event_id: string | null
          id: string
          notes: string | null
          quantity: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          date: string
          equipment_id?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          quantity?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          date?: string
          equipment_id?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          quantity?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_equipment_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_equipment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_materials: {
        Row: {
          company_id: string | null
          created_at: string | null
          date: string
          event_id: string | null
          id: string
          material: string
          notes: string | null
          quantity: number
          unit: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          date: string
          event_id?: string | null
          id?: string
          material: string
          notes?: string | null
          quantity: number
          unit: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          date?: string
          event_id?: string | null
          id?: string
          material?: string
          notes?: string | null
          quantity?: number
          unit?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_materials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_materials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          max_users: number
          name: string
          subscription_plan: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_users?: number
          name: string
          subscription_plan?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          max_users?: number
          name?: string
          subscription_plan?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          invited_email: string | null
          joined_at: string | null
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          invited_email?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          invited_email?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      day_notes: {
        Row: {
          company_id: string | null
          content: string
          created_at: string | null
          date: string
          event_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          content: string
          created_at?: string | null
          date: string
          event_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          content?: string
          created_at?: string | null
          date?: string
          event_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "day_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_notes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          record_details: Json
          record_id: string
          record_type: string
          status: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          record_details: Json
          record_id: string
          record_type: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          record_details?: Json
          record_id?: string
          record_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          broken_quantity: number | null
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          in_use_quantity: number
          name: string
          quantity: number
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          broken_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          in_use_quantity?: number
          name: string
          quantity?: number
          status?: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          broken_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          in_use_quantity?: number
          name?: string
          quantity?: number
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_template: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      equipment_usage: {
        Row: {
          company_id: string | null
          created_at: string | null
          end_date: string
          equipment_id: string | null
          event_id: string | null
          id: string
          is_returned: boolean
          quantity: number | null
          return_date: string | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          end_date: string
          equipment_id?: string | null
          event_id?: string | null
          id?: string
          is_returned?: boolean
          quantity?: number | null
          return_date?: string | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          end_date?: string
          equipment_id?: string | null
          event_id?: string | null
          id?: string
          is_returned?: boolean
          quantity?: number | null
          return_date?: string | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_usage_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_usage_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          estimated_hours: number
          id: string
          name: string
          unit: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_hours: number
          id?: string
          name: string
          unit: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_hours?: number
          id?: string
          name?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks_template: {
        Row: {
          created_at: string | null
          description: string | null
          estimated_hours: number
          id: string
          name: string
          unit: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          estimated_hours: number
          id?: string
          name: string
          unit: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          estimated_hours?: number
          id?: string
          name?: string
          unit?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          has_equipment: boolean | null
          has_materials: boolean | null
          id: string
          start_date: string
          status: string | null
          title: string
          total_hours: number
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          has_equipment?: boolean | null
          has_materials?: boolean | null
          id?: string
          start_date: string
          status?: string | null
          title: string
          total_hours?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          has_equipment?: boolean | null
          has_materials?: boolean | null
          id?: string
          start_date?: string
          status?: string | null
          title?: string
          total_hours?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hours_entries: {
        Row: {
          company_id: string | null
          created_at: string | null
          date: string
          event_id: string | null
          hours: number
          id: string
          notes: string | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          date?: string
          event_id?: string | null
          hours: number
          id?: string
          notes?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          date?: string
          event_id?: string | null
          hours?: number
          id?: string
          notes?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hours_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_done"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          additional_costs: Json | null
          company_id: string | null
          created_at: string | null
          extra_materials: Json | null
          id: string
          main_breakdown: Json | null
          main_materials: Json | null
          main_tasks: Json | null
          minor_tasks: Json | null
          project_id: string | null
          totals: Json | null
        }
        Insert: {
          additional_costs?: Json | null
          company_id?: string | null
          created_at?: string | null
          extra_materials?: Json | null
          id?: string
          main_breakdown?: Json | null
          main_materials?: Json | null
          main_tasks?: Json | null
          minor_tasks?: Json | null
          project_id?: string | null
          totals?: Json | null
        }
        Update: {
          additional_costs?: Json | null
          company_id?: string | null
          created_at?: string | null
          extra_materials?: Json | null
          id?: string
          main_breakdown?: Json | null
          main_materials?: Json | null
          main_tasks?: Json | null
          minor_tasks?: Json | null
          project_id?: string | null
          totals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      material_deliveries: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string | null
          delivery_date: string | null
          event_id: string | null
          id: string
          material_id: string | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          event_id?: string | null
          id?: string
          material_id?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          event_id?: string | null
          id?: string
          material_id?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_deliveries_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_delivered"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_usage_configs: {
        Row: {
          calculator_id: string
          company_id: string | null
          created_at: string
          id: string
          material_id: string | null
          updated_at: string
        }
        Insert: {
          calculator_id: string
          company_id?: string | null
          created_at?: string
          id?: string
          material_id?: string | null
          updated_at?: string
        }
        Update: {
          calculator_id?: string
          company_id?: string | null
          created_at?: string
          id?: string
          material_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_usage_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_usage_configs_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          price: number | null
          unit: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          price?: number | null
          unit: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_delivered: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
          name: string | null
          status: string
          total_amount: number | null
          unit: string
          user_id: string | null
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          name?: string | null
          status?: string
          total_amount?: number | null
          unit: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          name?: string | null
          status?: string
          total_amount?: number | null
          unit?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_delivered_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_delivered_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_template: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          unit: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          unit: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          unit?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string | null
          deactivated_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_digging: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          in_use_quantity: number
          name: string
          quantity: number
          "size (in tones)": number | null
          speed_m_per_hour: number | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          in_use_quantity?: number
          name: string
          quantity?: number
          "size (in tones)"?: number | null
          speed_m_per_hour?: number | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          in_use_quantity?: number
          name?: string
          quantity?: number
          "size (in tones)"?: number | null
          speed_m_per_hour?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_digging_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_folders: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
          name: string
          parent_folder_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          name: string
          parent_folder_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          name?: string
          parent_folder_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_folders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "task_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      task_progress_entries: {
        Row: {
          amount_completed: number
          company_id: string | null
          created_at: string | null
          event_id: string | null
          event_tasks_id: string | null
          hours_spent: number
          id: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_completed: number
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          event_tasks_id?: string | null
          hours_spent: number
          id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_completed?: number
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          event_tasks_id?: string | null
          hours_spent?: number
          id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_tasks"
            columns: ["event_tasks_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_tasks"
            columns: ["event_tasks_id"]
            isOneToOne: false
            referencedRelation: "event_tasks_with_dynamic_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_progress_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_progress_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_progress_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_done"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_progress_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_requirements: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          materials: Json | null
          name: string
          tools: Json | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          materials?: Json | null
          name: string
          tools?: Json | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          materials?: Json | null
          name?: string
          tools?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "task_requirements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks_done: {
        Row: {
          amount: string
          company_id: string | null
          created_at: string | null
          description: string | null
          event_id: string | null
          event_task_id: string | null
          folder_id: string | null
          hours_worked: number
          id: string
          is_finished: boolean | null
          name: string | null
          task_name: string | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          amount: string
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          event_id?: string | null
          event_task_id?: string | null
          folder_id?: string | null
          hours_worked: number
          id?: string
          is_finished?: boolean | null
          name?: string | null
          task_name?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: string
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          event_id?: string | null
          event_task_id?: string | null
          folder_id?: string | null
          hours_worked?: number
          id?: string
          is_finished?: boolean | null
          name?: string | null
          task_name?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_done_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_event_task_id_fkey"
            columns: ["event_task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_event_task_id_fkey"
            columns: ["event_task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks_with_dynamic_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "task_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_tasks_with_dynamic_estimates: {
        Row: {
          calculated_estimated_hours: number | null
          created_at: string | null
          description: string | null
          estimated_hours: number | null
          id: string | null
          name: string | null
          unit: string | null
        }
        Insert: {
          calculated_estimated_hours?: never
          created_at?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string | null
          name?: string | null
          unit?: string | null
        }
        Update: {
          calculated_estimated_hours?: never
          created_at?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string | null
          name?: string | null
          unit?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      manually_update_all_estimated_hours: { Args: never; Returns: undefined }
      release_equipment: {
        Args: { equipment_usage_id: string }
        Returns: boolean
      }
      release_equipment_by_ids: {
        Args: { equipment_id: string; event_id: string }
        Returns: boolean
      }
      sync_estimated_hours: { Args: never; Returns: undefined }
      update_all_estimated_hours: { Args: never; Returns: undefined }
      update_all_event_tasks_estimated_hours: {
        Args: never
        Returns: undefined
      }
      update_estimated_hours_for_task: {
        Args: { task_id: string }
        Returns: undefined
      }
    }
    Enums: {
      machine_status: "free_to_use" | "In_use" | "broken"
      status: "in_progress" | "planned" | "scheduled" | "finished"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      machine_status: ["free_to_use", "In_use", "broken"],
      status: ["in_progress", "planned", "scheduled", "finished"],
    },
  },
} as const
