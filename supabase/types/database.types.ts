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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      airtable_sync_jobs: {
        Row: {
          attempts: number
          last_attempted_at: string | null
          last_dispatched_at: string | null
          last_enqueued_at: string
          last_error: string | null
          source_id: string
          source_table: string
          status: string
        }
        Insert: {
          attempts?: number
          last_attempted_at?: string | null
          last_dispatched_at?: string | null
          last_enqueued_at?: string
          last_error?: string | null
          source_id: string
          source_table: string
          status?: string
        }
        Update: {
          attempts?: number
          last_attempted_at?: string | null
          last_dispatched_at?: string | null
          last_enqueued_at?: string
          last_error?: string | null
          source_id?: string
          source_table?: string
          status?: string
        }
        Relationships: []
      }
      availability_state: {
        Row: {
          available_from: string | null
          available_until: string | null
          human_readable: string | null
          id: boolean
          status: string
          timezone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          human_readable?: string | null
          id?: boolean
          status?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          human_readable?: string | null
          id?: boolean
          status?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_at: string
          id: string
          location: string | null
          metadata: Json
          owner_contact_id: string | null
          source: string
          start_at: string
          status: string
          timezone: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_at: string
          id?: string
          location?: string | null
          metadata?: Json
          owner_contact_id?: string | null
          source?: string
          start_at: string
          status?: string
          timezone?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          owner_contact_id?: string | null
          source?: string
          start_at?: string
          status?: string
          timezone?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "calendar_events_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_shares: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          share_level: string
          subject_contact_id: string | null
          updated_at: string
          viewer_contact_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          share_level: string
          subject_contact_id?: string | null
          updated_at?: string
          viewer_contact_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          share_level?: string
          subject_contact_id?: string | null
          updated_at?: string
          viewer_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_shares_subject_contact_id_fkey"
            columns: ["subject_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "calendar_shares_subject_contact_id_fkey"
            columns: ["subject_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_shares_viewer_contact_id_fkey"
            columns: ["viewer_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "calendar_shares_viewer_contact_id_fkey"
            columns: ["viewer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_answering_restrictions: {
        Row: {
          clear_note: string | null
          cleared_at: string | null
          cleared_by: string | null
          contact_id: string | null
          created_at: string
          id: string
          imposed_at: string
          imposed_by: string
          metadata: Json
          normalized_phone: string
          reason_code: string
          reason_summary: string | null
          reentry_notice_consumed_at: string | null
          reentry_notice_pending: boolean
          status: string
          trigger_call_history_id: string | null
          trigger_conversation_id: string | null
          updated_at: string
        }
        Insert: {
          clear_note?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          imposed_at?: string
          imposed_by?: string
          metadata?: Json
          normalized_phone: string
          reason_code: string
          reason_summary?: string | null
          reentry_notice_consumed_at?: string | null
          reentry_notice_pending?: boolean
          status?: string
          trigger_call_history_id?: string | null
          trigger_conversation_id?: string | null
          updated_at?: string
        }
        Update: {
          clear_note?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          imposed_at?: string
          imposed_by?: string
          metadata?: Json
          normalized_phone?: string
          reason_code?: string
          reason_summary?: string | null
          reentry_notice_consumed_at?: string | null
          reentry_notice_pending?: boolean
          status?: string
          trigger_call_history_id?: string | null
          trigger_conversation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_answering_restrictions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "call_answering_restrictions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_answering_restrictions_trigger_call_history_id_fkey"
            columns: ["trigger_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      call_history: {
        Row: {
          agent_phone_number_id: string | null
          call_duration_secs: number | null
          call_outcome: string | null
          call_successful: string | null
          callback_number: string | null
          caller_name: string | null
          caller_organization: string | null
          caller_relationship: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          detected_tone_profile: string | null
          direction: string | null
          ended_at: string | null
          id: string
          metadata: Json
          normalized_phone: string | null
          provider_call_id: string | null
          relationship_context_and_notes: string | null
          request_summary: string | null
          request_urgency: string | null
          started_at: string | null
          telegram_message_id: number | null
          telegram_notification_attempts: number
          telegram_notification_error: string | null
          telegram_notification_status: string
          telegram_notified_at: string | null
          telephony_provider: string | null
          termination_reason: string | null
          transcript: Json
        }
        Insert: {
          agent_phone_number_id?: string | null
          call_duration_secs?: number | null
          call_outcome?: string | null
          call_successful?: string | null
          callback_number?: string | null
          caller_name?: string | null
          caller_organization?: string | null
          caller_relationship?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detected_tone_profile?: string | null
          direction?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          normalized_phone?: string | null
          provider_call_id?: string | null
          relationship_context_and_notes?: string | null
          request_summary?: string | null
          request_urgency?: string | null
          started_at?: string | null
          telegram_message_id?: number | null
          telegram_notification_attempts?: number
          telegram_notification_error?: string | null
          telegram_notification_status?: string
          telegram_notified_at?: string | null
          telephony_provider?: string | null
          termination_reason?: string | null
          transcript?: Json
        }
        Update: {
          agent_phone_number_id?: string | null
          call_duration_secs?: number | null
          call_outcome?: string | null
          call_successful?: string | null
          callback_number?: string | null
          caller_name?: string | null
          caller_organization?: string | null
          caller_relationship?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detected_tone_profile?: string | null
          direction?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          normalized_phone?: string | null
          provider_call_id?: string | null
          relationship_context_and_notes?: string | null
          request_summary?: string | null
          request_urgency?: string | null
          started_at?: string | null
          telegram_message_id?: number | null
          telegram_notification_attempts?: number
          telegram_notification_error?: string | null
          telegram_notification_status?: string
          telegram_notified_at?: string | null
          telephony_provider?: string | null
          termination_reason?: string | null
          transcript?: Json
        }
        Relationships: [
          {
            foreignKeyName: "call_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "call_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      caroline_integration_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      commitments: {
        Row: {
          calendar_event_id: string | null
          call_history_id: string | null
          contact_id: string | null
          created_at: string
          description: string
          due_at: string | null
          id: string
          metadata: Json
          owner_side: string
          project_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          call_history_id?: string | null
          contact_id?: string | null
          created_at?: string
          description: string
          due_at?: string | null
          id?: string
          metadata?: Json
          owner_side?: string
          project_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          call_history_id?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          metadata?: Json
          owner_side?: string
          project_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_call_history_id_fkey"
            columns: ["call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "commitments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_card_details: {
        Row: {
          access_changed_at: string | null
          access_changed_by: string | null
          access_reason: string | null
          access_status: string
          assigned_persona_tag: string | null
          behavior_notes: string | null
          contact_id: string
          created_at: string
          key_dates: Json
          last_reviewed_at: string | null
          last_reviewed_by: string | null
          metadata: Json
          source_call_history_id: string | null
          source_conversation_id: string | null
          swearing_intensity: string | null
          updated_at: string
        }
        Insert: {
          access_changed_at?: string | null
          access_changed_by?: string | null
          access_reason?: string | null
          access_status?: string
          assigned_persona_tag?: string | null
          behavior_notes?: string | null
          contact_id: string
          created_at?: string
          key_dates?: Json
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          metadata?: Json
          source_call_history_id?: string | null
          source_conversation_id?: string | null
          swearing_intensity?: string | null
          updated_at?: string
        }
        Update: {
          access_changed_at?: string | null
          access_changed_by?: string | null
          access_reason?: string | null
          access_status?: string
          assigned_persona_tag?: string | null
          behavior_notes?: string | null
          contact_id?: string
          created_at?: string
          key_dates?: Json
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          metadata?: Json
          source_call_history_id?: string | null
          source_conversation_id?: string | null
          swearing_intensity?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_card_details_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_card_details_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_card_details_source_call_history_id_fkey"
            columns: ["source_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_card_field_provenance: {
        Row: {
          contact_id: string
          created_at: string
          field_key: string | null
          field_name: string
          id: string
          metadata: Json
          reviewed_at: string
          reviewed_by: string
          source_call_history_id: string | null
          source_conversation_id: string | null
          source_kind: string
          source_memory_item_id: string | null
          value_snapshot: Json | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          field_key?: string | null
          field_name: string
          id?: string
          metadata?: Json
          reviewed_at?: string
          reviewed_by: string
          source_call_history_id?: string | null
          source_conversation_id?: string | null
          source_kind: string
          source_memory_item_id?: string | null
          value_snapshot?: Json | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          field_key?: string | null
          field_name?: string
          id?: string
          metadata?: Json
          reviewed_at?: string
          reviewed_by?: string
          source_call_history_id?: string | null
          source_conversation_id?: string | null
          source_kind?: string
          source_memory_item_id?: string | null
          value_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_card_field_provenance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_card_field_provenance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_card_field_provenance_source_call_history_id_fkey"
            columns: ["source_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_card_field_provenance_source_memory_item_id_fkey"
            columns: ["source_memory_item_id"]
            isOneToOne: false
            referencedRelation: "memory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_permissions: {
        Row: {
          allowed: boolean
          contact_id: string
          created_at: string
          id: string
          notes: string | null
          permission_key: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          contact_id: string
          created_at?: string
          id?: string
          notes?: string | null
          permission_key: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          contact_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          permission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_permissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_permissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          contact_type: string
          created_at: string
          display_name: string
          first_name: string | null
          id: string
          last_name: string | null
          metadata: Json
          normalized_phone: string | null
          notes: string | null
          relationship_to_owner: string | null
          tone_profile: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          contact_type?: string
          created_at?: string
          display_name: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          normalized_phone?: string | null
          notes?: string | null
          relationship_to_owner?: string | null
          tone_profile?: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          contact_type?: string
          created_at?: string
          display_name?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          normalized_phone?: string | null
          notes?: string | null
          relationship_to_owner?: string | null
          tone_profile?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: []
      }
      events_processed: {
        Row: {
          call_history_id: string | null
          conversation_id: string | null
          details: Json
          event_id: string
          event_type: string | null
          processed_at: string
          telegram_message_id: number | null
          telegram_notification_attempts: number
          telegram_notification_error: string | null
          telegram_notification_status: string
          telegram_notified_at: string | null
        }
        Insert: {
          call_history_id?: string | null
          conversation_id?: string | null
          details?: Json
          event_id: string
          event_type?: string | null
          processed_at?: string
          telegram_message_id?: number | null
          telegram_notification_attempts?: number
          telegram_notification_error?: string | null
          telegram_notification_status?: string
          telegram_notified_at?: string | null
        }
        Update: {
          call_history_id?: string | null
          conversation_id?: string | null
          details?: Json
          event_id?: string
          event_type?: string | null
          processed_at?: string
          telegram_message_id?: number | null
          telegram_notification_attempts?: number
          telegram_notification_error?: string | null
          telegram_notification_status?: string
          telegram_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_processed_call_history_id_fkey"
            columns: ["call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      instructions: {
        Row: {
          active_from: string
          active_until: string | null
          contact_id: string | null
          created_at: string
          durable: boolean
          id: string
          instruction: string
          priority: number
          scope_type: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          active_from?: string
          active_until?: string | null
          contact_id?: string | null
          created_at?: string
          durable?: boolean
          id?: string
          instruction: string
          priority?: number
          scope_type: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_from?: string
          active_until?: string | null
          contact_id?: string | null
          created_at?: string
          durable?: boolean
          id?: string
          instruction?: string
          priority?: number
          scope_type?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "instructions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_items: {
        Row: {
          authority: string
          confidence: number
          confirmed_at: string | null
          confirmed_by: string | null
          content: string
          created_at: string
          expires_at: string | null
          id: string
          memory_type: string
          metadata: Json
          observed_at: string
          project_id: string | null
          source_calendar_event_id: string | null
          source_call_history_id: string | null
          source_conversation_id: string | null
          source_kind: string
          status: string
          subject_contact_id: string | null
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          authority?: string
          confidence?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          memory_type: string
          metadata?: Json
          observed_at?: string
          project_id?: string | null
          source_calendar_event_id?: string | null
          source_call_history_id?: string | null
          source_conversation_id?: string | null
          source_kind?: string
          status?: string
          subject_contact_id?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          authority?: string
          confidence?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          memory_type?: string
          metadata?: Json
          observed_at?: string
          project_id?: string | null
          source_calendar_event_id?: string | null
          source_call_history_id?: string | null
          source_conversation_id?: string | null
          source_kind?: string
          status?: string
          subject_contact_id?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_source_calendar_event_id_fkey"
            columns: ["source_calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_source_call_history_id_fkey"
            columns: ["source_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_subject_contact_id_fkey"
            columns: ["subject_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "memory_items_subject_contact_id_fkey"
            columns: ["subject_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "memory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_admission_events: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string
          event_type: string
          id: string
          metadata: Json
          new_status: string | null
          normalized_phone: string
          previous_status: string | null
          reason: string | null
          source_call_history_id: string | null
          source_conversation_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          metadata?: Json
          new_status?: string | null
          normalized_phone: string
          previous_status?: string | null
          reason?: string | null
          source_call_history_id?: string | null
          source_conversation_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          normalized_phone?: string
          previous_status?: string | null
          reason?: string | null
          source_call_history_id?: string | null
          source_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_admission_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "phone_admission_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_admission_events_source_call_history_id_fkey"
            columns: ["source_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          notes: string | null
          project_id: string
          role: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          role?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          metadata: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      relationships: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          from_contact_id: string
          id: string
          notes: string | null
          relationship_type: string
          status: string
          to_contact_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          from_contact_id: string
          id?: string
          notes?: string | null
          relationship_type: string
          status?: string
          to_contact_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          from_contact_id?: string
          id?: string
          notes?: string | null
          relationship_type?: string
          status?: string
          to_contact_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_from_contact_id_fkey"
            columns: ["from_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "relationships_from_contact_id_fkey"
            columns: ["from_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_to_contact_id_fkey"
            columns: ["to_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "relationships_to_contact_id_fkey"
            columns: ["to_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_actions: {
        Row: {
          action_type: string
          attempt_count: number
          calendar_event_id: string | null
          call_history_id: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          desired_outcome: string | null
          execute_at: string
          execution_context_snapshot: Json
          facts_to_convey: Json
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          metadata: Json
          original_instruction: string | null
          project_id: string | null
          purpose: string | null
          questions_to_ask: Json
          reserved_at: string | null
          special_instructions: string | null
          started_at: string | null
          status: string
          talking_points: Json
          target_contact_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          action_type: string
          attempt_count?: number
          calendar_event_id?: string | null
          call_history_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          desired_outcome?: string | null
          execute_at: string
          execution_context_snapshot?: Json
          facts_to_convey?: Json
          failed_at?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          metadata?: Json
          original_instruction?: string | null
          project_id?: string | null
          purpose?: string | null
          questions_to_ask?: Json
          reserved_at?: string | null
          special_instructions?: string | null
          started_at?: string | null
          status?: string
          talking_points?: Json
          target_contact_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          attempt_count?: number
          calendar_event_id?: string | null
          call_history_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          desired_outcome?: string | null
          execute_at?: string
          execution_context_snapshot?: Json
          facts_to_convey?: Json
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          metadata?: Json
          original_instruction?: string | null
          project_id?: string | null
          purpose?: string | null
          questions_to_ask?: Json
          reserved_at?: string | null
          special_instructions?: string | null
          started_at?: string | null
          status?: string
          talking_points?: Json
          target_contact_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_actions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_call_history_id_fkey"
            columns: ["call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_target_contact_id_fkey"
            columns: ["target_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "scheduled_actions_target_contact_id_fkey"
            columns: ["target_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_history: {
        Row: {
          body: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          id: string
          linked_call_history_id: string | null
          normalized_phone: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          telegram_message_id: number | null
          telegram_notification_status: string
          telegram_notified_at: string | null
        }
        Insert: {
          body: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          id?: string
          linked_call_history_id?: string | null
          normalized_phone: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: number | null
          telegram_notification_status?: string
          telegram_notified_at?: string | null
        }
        Update: {
          body?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          id?: string
          linked_call_history_id?: string | null
          normalized_phone?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: number | null
          telegram_notification_status?: string
          telegram_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_cards"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "sms_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_history_linked_call_history_id_fkey"
            columns: ["linked_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      test_documentation: {
        Row: {
          category: string
          elevenlabs_test_id: string
          id: string
          known_issues: string | null
          last_reviewed_at: string
          notes: string | null
          purpose: string
          status: string
          superseded_by: string | null
          test_name: string
          test_type: string
        }
        Insert: {
          category: string
          elevenlabs_test_id: string
          id?: string
          known_issues?: string | null
          last_reviewed_at?: string
          notes?: string | null
          purpose: string
          status: string
          superseded_by?: string | null
          test_name: string
          test_type: string
        }
        Update: {
          category?: string
          elevenlabs_test_id?: string
          id?: string
          known_issues?: string | null
          last_reviewed_at?: string
          notes?: string | null
          purpose?: string
          status?: string
          superseded_by?: string | null
          test_name?: string
          test_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      contact_cards: {
        Row: {
          access_status: string | null
          active_project_count: number | null
          assigned_persona_tag: string | null
          behavior_notes: string | null
          candidate_memory_count: number | null
          card_created_at: string | null
          card_metadata: Json | null
          card_updated_at: string | null
          confirmed_memory_count: number | null
          contact_id: string | null
          contact_notes: string | null
          display_name: string | null
          first_name: string | null
          key_dates: Json | null
          last_name: string | null
          last_reviewed_at: string | null
          last_reviewed_by: string | null
          normalized_phone: string | null
          open_commitment_count: number | null
          relationship_tier: string | null
          relationship_to_owner: string | null
          source_call_history_id: string | null
          source_conversation_id: string | null
          swearing_intensity: string | null
          tone_profile: string | null
          verification_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_card_details_source_call_history_id_fkey"
            columns: ["source_call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      promote_contact_card_candidate: {
        Args: {
          p_memory_id: string
          p_mode?: string
          p_reviewed_by: string
          p_target_field: string
          p_value: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

