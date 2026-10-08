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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_sessions: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          organisation_id: string
          starts_on: string
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          organisation_id: string
          starts_on: string
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          organisation_id?: string
          starts_on?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_sessions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_content: {
        Row: {
          created_at: string
          error: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["ai_content_kind"]
          organisation_id: string
          payload: Json
          status: Database["public"]["Enums"]["ai_content_status"]
          student_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["ai_content_kind"]
          organisation_id: string
          payload: Json
          status: Database["public"]["Enums"]["ai_content_status"]
          student_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["ai_content_kind"]
          organisation_id?: string
          payload?: Json
          status?: Database["public"]["Enums"]["ai_content_status"]
          student_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_content_job_id_organisation_id_fkey"
            columns: ["job_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "ai_content_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_diagnostics: {
        Row: {
          created_at: string
          findings: Json
          id: string
          job_id: string
          model: string | null
          organisation_id: string
          review_state: Database["public"]["Enums"]["ai_review_state"]
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string
          summary: string
        }
        Insert: {
          created_at?: string
          findings: Json
          id?: string
          job_id: string
          model?: string | null
          organisation_id: string
          review_state?: Database["public"]["Enums"]["ai_review_state"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id: string
          summary: string
        }
        Update: {
          created_at?: string
          findings?: Json
          id?: string
          job_id?: string
          model?: string | null
          organisation_id?: string
          review_state?: Database["public"]["Enums"]["ai_review_state"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_diagnostics_job_id_organisation_id_fkey"
            columns: ["job_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "ai_diagnostics_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_diagnostics_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_diagnostics_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          attempts: number
          cost_usd_micros: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input: Json
          input_tokens: number | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          model: string | null
          organisation_id: string
          output_tokens: number | null
          priority: number
          requested_by: string | null
          result_summary: Json | null
          run_after: string
          started_at: string | null
          status: Database["public"]["Enums"]["ai_job_status"]
          student_id: string | null
          target_id: string | null
          target_type: string | null
          type: Database["public"]["Enums"]["ai_job_type"]
        }
        Insert: {
          attempts?: number
          cost_usd_micros?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input: Json
          input_tokens?: number | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          model?: string | null
          organisation_id: string
          output_tokens?: number | null
          priority?: number
          requested_by?: string | null
          result_summary?: Json | null
          run_after?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          student_id?: string | null
          target_id?: string | null
          target_type?: string | null
          type: Database["public"]["Enums"]["ai_job_type"]
        }
        Update: {
          attempts?: number
          cost_usd_micros?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          input_tokens?: number | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          model?: string | null
          organisation_id?: string
          output_tokens?: number | null
          priority?: number
          requested_by?: string | null
          result_summary?: Json | null
          run_after?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          student_id?: string | null
          target_id?: string | null
          target_type?: string | null
          type?: Database["public"]["Enums"]["ai_job_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      ai_prompt_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          job_type: Database["public"]["Enums"]["ai_job_type"]
          notes: string | null
          output_schema: Json
          system_prompt: string
          user_template: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type: Database["public"]["Enums"]["ai_job_type"]
          notes?: string | null
          output_schema: Json
          system_prompt: string
          user_template: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          job_type?: Database["public"]["Enums"]["ai_job_type"]
          notes?: string | null
          output_schema?: Json
          system_prompt?: string
          user_template?: string
          version?: number
        }
        Relationships: []
      }
      ai_recommendations: {
        Row: {
          clicked_at: string | null
          created_at: string
          dismissed_at: string | null
          exam_id: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["recommendation_kind"]
          note_id: string | null
          organisation_id: string
          priority: number
          reason: string
          shown_at: string | null
          source: Database["public"]["Enums"]["recommendation_source"]
          student_id: string
          title: string
          topic_key: string
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          exam_id?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["recommendation_kind"]
          note_id?: string | null
          organisation_id: string
          priority?: number
          reason: string
          shown_at?: string | null
          source?: Database["public"]["Enums"]["recommendation_source"]
          student_id: string
          title: string
          topic_key: string
        }
        Update: {
          clicked_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          exam_id?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["recommendation_kind"]
          note_id?: string | null
          organisation_id?: string
          priority?: number
          reason?: string
          shown_at?: string | null
          source?: Database["public"]["Enums"]["recommendation_source"]
          student_id?: string
          title?: string
          topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "ai_recommendations_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_current"
            referencedColumns: ["note_id", "organisation_id"]
          },
          {
            foreignKeyName: "ai_recommendations_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "ai_recommendations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      ai_usage_daily: {
        Row: {
          cost_usd_micros: number
          day: string
          input_tokens: number
          jobs: number
          organisation_id: string
          output_tokens: number
        }
        Insert: {
          cost_usd_micros?: number
          day: string
          input_tokens?: number
          jobs?: number
          organisation_id: string
          output_tokens?: number
        }
        Update: {
          cost_usd_micros?: number
          day?: string
          input_tokens?: number
          jobs?: number
          organisation_id?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_daily_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_blueprint_items: {
        Row: {
          blueprint_id: string
          cognitive_level: Database["public"]["Enums"]["cognitive_level"] | null
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_level"] | null
          id: string
          marks_per_question: number
          organisation_id: string
          position: number
          question_count: number
          topic_id: string
        }
        Insert: {
          blueprint_id: string
          cognitive_level?:
            | Database["public"]["Enums"]["cognitive_level"]
            | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"] | null
          id?: string
          marks_per_question?: number
          organisation_id: string
          position?: number
          question_count: number
          topic_id: string
        }
        Update: {
          blueprint_id?: string
          cognitive_level?:
            | Database["public"]["Enums"]["cognitive_level"]
            | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"] | null
          id?: string
          marks_per_question?: number
          organisation_id?: string
          position?: number
          question_count?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_blueprint_items_blueprint_id_organisation_id_fkey"
            columns: ["blueprint_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assessment_blueprints"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assessment_blueprint_items_blueprint_id_organisation_id_fkey"
            columns: ["blueprint_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "blueprint_summary"
            referencedColumns: ["blueprint_id", "organisation_id"]
          },
          {
            foreignKeyName: "assessment_blueprint_items_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_blueprint_items_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assessment_blueprint_items_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      assessment_blueprints: {
        Row: {
          created_at: string
          created_by: string | null
          curriculum_version_id: string | null
          deleted_at: string | null
          description: string | null
          difficulty_mix: Json
          duration_min: number | null
          id: string
          name: string
          organisation_id: string
          status: Database["public"]["Enums"]["curriculum_status"]
          subject_id: string
          total_marks: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          curriculum_version_id?: string | null
          deleted_at?: string | null
          description?: string | null
          difficulty_mix?: Json
          duration_min?: number | null
          id?: string
          name: string
          organisation_id: string
          status?: Database["public"]["Enums"]["curriculum_status"]
          subject_id: string
          total_marks: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          curriculum_version_id?: string | null
          deleted_at?: string | null
          description?: string | null
          difficulty_mix?: Json
          duration_min?: number | null
          id?: string
          name?: string
          organisation_id?: string
          status?: Database["public"]["Enums"]["curriculum_status"]
          subject_id?: string
          total_marks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_blueprints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_blueprints_curriculum_version_id_organisation_i_fkey"
            columns: ["curriculum_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assessment_blueprints_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_blueprints_subject_id_organisation_id_fkey"
            columns: ["subject_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      assessment_events: {
        Row: {
          attempt_id: string
          class_id: string | null
          exam_id: string
          exam_kind: Database["public"]["Enums"]["exam_kind"]
          id: string
          marking_complete: boolean
          occurred_at: string
          organisation_id: string
          percentage: number
          released_at: string | null
          score: number
          student_id: string
          subject_id: string | null
          total_marks: number
          updated_at: string
          voided: boolean
        }
        Insert: {
          attempt_id: string
          class_id?: string | null
          exam_id: string
          exam_kind: Database["public"]["Enums"]["exam_kind"]
          id?: string
          marking_complete?: boolean
          occurred_at: string
          organisation_id: string
          percentage: number
          released_at?: string | null
          score: number
          student_id: string
          subject_id?: string | null
          total_marks: number
          updated_at?: string
          voided?: boolean
        }
        Update: {
          attempt_id?: string
          class_id?: string | null
          exam_id?: string
          exam_kind?: Database["public"]["Enums"]["exam_kind"]
          id?: string
          marking_complete?: boolean
          occurred_at?: string
          organisation_id?: string
          percentage?: number
          released_at?: string | null
          score?: number
          student_id?: string
          subject_id?: string | null
          total_marks?: number
          updated_at?: string
          voided?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assessment_events_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "assessment_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_events_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      attempts: {
        Row: {
          attempt_no: number
          deadline_at: string
          device: string | null
          exam_id: string
          id: string
          ip_address: unknown
          layout: Json
          organisation_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at: string | null
          void_reason: string | null
        }
        Insert: {
          attempt_no: number
          deadline_at: string
          device?: string | null
          exam_id: string
          id?: string
          ip_address?: unknown
          layout?: Json
          organisation_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at?: string | null
          void_reason?: string | null
        }
        Update: {
          attempt_no?: number
          deadline_at?: string
          device?: string | null
          exam_id?: string
          id?: string
          ip_address?: unknown
          layout?: Json
          organisation_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id?: string
          submitted_at?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "attempts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_role: string | null
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          ip_address: unknown
          occurred_at: string
          organisation_id: string | null
          source: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: never
          ip_address?: unknown
          occurred_at?: string
          organisation_id?: string | null
          source?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip_address?: unknown
          occurred_at?: string
          organisation_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          created_at: string
          id: string
          organisation_id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          organisation_id: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          organisation_id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_organisation_id_fkey"
            columns: ["class_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "class_subjects_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_organisation_id_fkey"
            columns: ["subject_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_organisation_id_fkey"
            columns: ["teacher_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_session_id: string
          capacity: number | null
          created_at: string
          form_teacher_id: string | null
          id: string
          name: string
          organisation_id: string
          programme_id: string | null
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          capacity?: number | null
          created_at?: string
          form_teacher_id?: string | null
          id?: string
          name: string
          organisation_id: string
          programme_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          capacity?: number | null
          created_at?: string
          form_teacher_id?: string | null
          id?: string
          name?: string
          organisation_id?: string
          programme_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "classes_form_teacher_id_organisation_id_fkey"
            columns: ["form_teacher_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "classes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_programme_id_organisation_id_fkey"
            columns: ["programme_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      curricula: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          exam_body: string
          id: string
          level: string | null
          name: string
          organisation_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          exam_body?: string
          id?: string
          level?: string | null
          name: string
          organisation_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          exam_body?: string
          id?: string
          level?: string | null
          name?: string
          organisation_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curricula_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curricula_subject_id_organisation_id_fkey"
            columns: ["subject_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      curriculum_outcomes: {
        Row: {
          organisation_id: string
          outcome_id: string
          topic_id: string
        }
        Insert: {
          organisation_id: string
          outcome_id: string
          topic_id: string
        }
        Update: {
          organisation_id?: string
          outcome_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_outcomes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_outcomes_outcome_id_organisation_id_fkey"
            columns: ["outcome_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "learning_outcomes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_outcomes_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_outcomes_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      curriculum_prerequisites: {
        Row: {
          organisation_id: string
          requires_topic_id: string
          strength: number
          topic_id: string
        }
        Insert: {
          organisation_id: string
          requires_topic_id: string
          strength?: number
          topic_id: string
        }
        Update: {
          organisation_id?: string
          requires_topic_id?: string
          strength?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_prerequisites_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_prerequisites_requires_topic_id_organisation_id_fkey"
            columns: ["requires_topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_prerequisites_requires_topic_id_organisation_id_fkey"
            columns: ["requires_topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_prerequisites_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_prerequisites_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      curriculum_topics: {
        Row: {
          class_level: string | null
          code: string
          created_at: string
          exam_weight: number | null
          id: string
          organisation_id: string
          position: number
          suggested_periods: number | null
          term: Database["public"]["Enums"]["term_hint"]
          title: string
          topic_key: string
          unit_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          class_level?: string | null
          code: string
          created_at?: string
          exam_weight?: number | null
          id?: string
          organisation_id: string
          position?: number
          suggested_periods?: number | null
          term?: Database["public"]["Enums"]["term_hint"]
          title: string
          topic_key?: string
          unit_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          class_level?: string | null
          code?: string
          created_at?: string
          exam_weight?: number | null
          id?: string
          organisation_id?: string
          position?: number
          suggested_periods?: number | null
          term?: Database["public"]["Enums"]["term_hint"]
          title?: string
          topic_key?: string
          unit_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_topics_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_topics_unit_id_organisation_id_fkey"
            columns: ["unit_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_units"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_topics_unit_id_version_id_fkey"
            columns: ["unit_id", "version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_units"
            referencedColumns: ["id", "version_id"]
          },
        ]
      }
      curriculum_units: {
        Row: {
          created_at: string
          id: string
          organisation_id: string
          position: number
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id: string
          position?: number
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string
          position?: number
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_units_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_units_version_id_organisation_id_fkey"
            columns: ["version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      curriculum_versions: {
        Row: {
          created_at: string
          curriculum_id: string
          effective_from: string | null
          id: string
          organisation_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["curriculum_status"]
          updated_at: string
          version_label: string
        }
        Insert: {
          created_at?: string
          curriculum_id: string
          effective_from?: string | null
          id?: string
          organisation_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["curriculum_status"]
          updated_at?: string
          version_label: string
        }
        Update: {
          created_at?: string
          curriculum_id?: string
          effective_from?: string | null
          id?: string
          organisation_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["curriculum_status"]
          updated_at?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_versions_curriculum_id_organisation_id_fkey"
            columns: ["curriculum_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "curriculum_versions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          organisation_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          organisation_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          organisation_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      customer_invoice_items: {
        Row: {
          description: string
          discount_amount: number
          discount_id: string | null
          gross: number
          id: string
          invoice_id: string
          line_total: number
          organisation_id: string
          product_id: string
          quantity: number
          scholarship_amount: number
          scholarships_applied: Json
          unit_price: number
        }
        Insert: {
          description: string
          discount_amount?: number
          discount_id?: string | null
          gross: number
          id?: string
          invoice_id: string
          line_total: number
          organisation_id: string
          product_id: string
          quantity?: number
          scholarship_amount?: number
          scholarships_applied?: Json
          unit_price: number
        }
        Update: {
          description?: string
          discount_amount?: number
          discount_id?: string | null
          gross?: number
          id?: string
          invoice_id?: string
          line_total?: number
          organisation_id?: string
          product_id?: string
          quantity?: number
          scholarship_amount?: number
          scholarships_applied?: Json
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoice_items_discount_id_organisation_id_fkey"
            columns: ["discount_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoice_items_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoice_items_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoice_items_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_product_id_organisation_id_fkey"
            columns: ["product_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          academic_session_id: string | null
          account_id: string
          balance: number
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          due_on: string | null
          id: string
          issued_at: string | null
          notes: string | null
          number: string | null
          organisation_id: string
          paid_at: string | null
          scholarship_total: number
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          subtotal: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          academic_session_id?: string | null
          account_id: string
          balance?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_on?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string | null
          organisation_id: string
          paid_at?: string | null
          scholarship_total?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          subtotal?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          academic_session_id?: string | null
          account_id?: string
          balance?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_on?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string | null
          organisation_id?: string
          paid_at?: string | null
          scholarship_total?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoices_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoices_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["account_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      customer_payment_attempts: {
        Row: {
          account_id: string
          amount: number
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          invoice_id: string
          organisation_id: string
          payer_email: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          reference: string
          status: Database["public"]["Enums"]["payment_attempt_state"]
          student_id: string
        }
        Insert: {
          account_id: string
          amount: number
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          organisation_id: string
          payer_email?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          reference: string
          status?: Database["public"]["Enums"]["payment_attempt_state"]
          student_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          organisation_id?: string
          payer_email?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["payment_attempt_state"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_attempts_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["account_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      customer_payment_transactions: {
        Row: {
          account_id: string
          amount: number
          applied_amount: number
          attempt_id: string | null
          channel: string | null
          created_at: string
          currency: string
          fee: number
          id: string
          invoice_id: string | null
          note: string | null
          organisation_id: string
          paid_at: string
          payer_email: string | null
          payer_name: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_txn_id: string | null
          recorded_by: string | null
          student_id: string
          verified_at: string
          wallet_amount: number
        }
        Insert: {
          account_id: string
          amount: number
          applied_amount?: number
          attempt_id?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          fee?: number
          id?: string
          invoice_id?: string | null
          note?: string | null
          organisation_id: string
          paid_at?: string
          payer_email?: string | null
          payer_name?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_txn_id?: string | null
          recorded_by?: string | null
          student_id: string
          verified_at?: string
          wallet_amount?: number
        }
        Update: {
          account_id?: string
          amount?: number
          applied_amount?: number
          attempt_id?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          fee?: number
          id?: string
          invoice_id?: string | null
          note?: string | null
          organisation_id?: string
          paid_at?: string
          payer_email?: string | null
          payer_name?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_txn_id?: string | null
          recorded_by?: string | null
          student_id?: string
          verified_at?: string
          wallet_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_transactions_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["account_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_payment_attempts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "payments_needing_review"
            referencedColumns: ["attempt_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_transactions_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      customer_payment_webhooks: {
        Row: {
          delivery_count: number
          event_id: string
          event_type: string
          id: number
          organisation_id: string | null
          outcome: string | null
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          received_at: string
          reference: string | null
          signature_valid: boolean
        }
        Insert: {
          delivery_count?: number
          event_id: string
          event_type: string
          id?: never
          organisation_id?: string | null
          outcome?: string | null
          payload: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          received_at?: string
          reference?: string | null
          signature_valid: boolean
        }
        Update: {
          delivery_count?: number
          event_id?: string
          event_type?: string
          id?: never
          organisation_id?: string | null
          outcome?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          received_at?: string
          reference?: string | null
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_webhooks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_receipts: {
        Row: {
          amount: number
          id: string
          invoice_id: string | null
          issued_at: string
          number: string
          organisation_id: string
          student_id: string
          transaction_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_id?: string | null
          issued_at?: string
          number: string
          organisation_id: string
          student_id: string
          transaction_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string | null
          issued_at?: string
          number?: string
          organisation_id?: string
          student_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_receipts_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_receipts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_receipts_transaction_id_organisation_id_fkey"
            columns: ["transaction_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_payment_transactions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      customer_refunds: {
        Row: {
          amount: number
          approved_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          invoice_id: string | null
          organisation_id: string
          provider_refund_id: string | null
          reason: string
          requested_by: string | null
          source: Database["public"]["Enums"]["refund_source"]
          status: Database["public"]["Enums"]["refund_status"]
          student_id: string
          transaction_id: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          invoice_id?: string | null
          organisation_id: string
          provider_refund_id?: string | null
          reason: string
          requested_by?: string | null
          source?: Database["public"]["Enums"]["refund_source"]
          status?: Database["public"]["Enums"]["refund_status"]
          student_id: string
          transaction_id: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          invoice_id?: string | null
          organisation_id?: string
          provider_refund_id?: string | null
          reason?: string
          requested_by?: string | null
          source?: Database["public"]["Enums"]["refund_source"]
          status?: Database["public"]["Enums"]["refund_status"]
          student_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_refunds_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_refunds_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_refunds_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_refunds_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_refunds_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_refunds_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_refunds_transaction_id_organisation_id_fkey"
            columns: ["transaction_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_payment_transactions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      diagnoses: {
        Row: {
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          dismissed_reason: string | null
          evidence: Json
          finding: string
          generated_by: Database["public"]["Enums"]["diagnosis_source"]
          id: string
          kind: Database["public"]["Enums"]["diagnosis_kind"]
          narrative: string | null
          organisation_id: string
          resolved_at: string | null
          root_topic_key: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["diagnosis_status"]
          student_id: string
          topic_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          dismissed_reason?: string | null
          evidence?: Json
          finding: string
          generated_by?: Database["public"]["Enums"]["diagnosis_source"]
          id?: string
          kind: Database["public"]["Enums"]["diagnosis_kind"]
          narrative?: string | null
          organisation_id: string
          resolved_at?: string | null
          root_topic_key?: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["diagnosis_status"]
          student_id: string
          topic_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          dismissed_reason?: string | null
          evidence?: Json
          finding?: string
          generated_by?: Database["public"]["Enums"]["diagnosis_source"]
          id?: string
          kind?: Database["public"]["Enums"]["diagnosis_kind"]
          narrative?: string | null
          organisation_id?: string
          resolved_at?: string | null
          root_topic_key?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["diagnosis_status"]
          student_id?: string
          topic_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      discounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["amount_kind"]
          name: string
          organisation_id: string
          product_id: string | null
          usage_limit: number | null
          used_count: number
          valid_from: string | null
          valid_to: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["amount_kind"]
          name: string
          organisation_id: string
          product_id?: string | null
          usage_limit?: number | null
          used_count?: number
          valid_from?: string | null
          valid_to?: string | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["amount_kind"]
          name?: string
          organisation_id?: string
          product_id?: string | null
          usage_limit?: number | null
          used_count?: number
          valid_from?: string | null
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_product_id_organisation_id_fkey"
            columns: ["product_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      enrolments: {
        Row: {
          academic_session_id: string
          class_id: string
          created_at: string
          ended_on: string | null
          enrolled_on: string
          id: string
          organisation_id: string
          status: Database["public"]["Enums"]["enrolment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          class_id: string
          created_at?: string
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          organisation_id: string
          status?: Database["public"]["Enums"]["enrolment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          class_id?: string
          created_at?: string
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          organisation_id?: string
          status?: Database["public"]["Enums"]["enrolment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "enrolments_class_id_organisation_id_fkey"
            columns: ["class_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "enrolments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      exam_eligibility: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string | null
          exam_id: string
          extra_attempts: number
          extra_time_min: number
          id: string
          is_blocked: boolean
          organisation_id: string
          reason: string | null
          student_id: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          exam_id: string
          extra_attempts?: number
          extra_time_min?: number
          id?: string
          is_blocked?: boolean
          organisation_id: string
          reason?: string | null
          student_id?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          exam_id?: string
          extra_attempts?: number
          extra_time_min?: number
          id?: string
          is_blocked?: boolean
          organisation_id?: string
          reason?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_eligibility_class_id_organisation_id_fkey"
            columns: ["class_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "exam_eligibility_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_eligibility_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "exam_eligibility_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_eligibility_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          marks: number | null
          organisation_id: string
          position: number
          question_version_id: string
          topic_id: string | null
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          marks?: number | null
          organisation_id: string
          position?: number
          question_version_id: string
          topic_id?: string | null
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          marks?: number | null
          organisation_id?: string
          position?: number
          question_version_id?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "exam_questions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_version_id_organisation_id_fkey"
            columns: ["question_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_session_id: string | null
          allow_review: boolean
          attempt_policy: Database["public"]["Enums"]["attempt_policy"]
          attempts_allowed: number
          blueprint_id: string | null
          closes_at: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_min: number
          hard_close: boolean
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["exam_kind"]
          opens_at: string
          organisation_id: string
          pass_mark_pct: number
          release_policy: Database["public"]["Enums"]["release_policy"]
          requires_fees_cleared: boolean
          shuffle_options: boolean
          shuffle_questions: boolean
          status: Database["public"]["Enums"]["exam_status"]
          subject_id: string | null
          title: string
          total_marks: number
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          allow_review?: boolean
          attempt_policy?: Database["public"]["Enums"]["attempt_policy"]
          attempts_allowed?: number
          blueprint_id?: string | null
          closes_at: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_min: number
          hard_close?: boolean
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["exam_kind"]
          opens_at: string
          organisation_id: string
          pass_mark_pct?: number
          release_policy?: Database["public"]["Enums"]["release_policy"]
          requires_fees_cleared?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["exam_status"]
          subject_id?: string | null
          title: string
          total_marks?: number
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          allow_review?: boolean
          attempt_policy?: Database["public"]["Enums"]["attempt_policy"]
          attempts_allowed?: number
          blueprint_id?: string | null
          closes_at?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_min?: number
          hard_close?: boolean
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["exam_kind"]
          opens_at?: string
          organisation_id?: string
          pass_mark_pct?: number
          release_policy?: Database["public"]["Enums"]["release_policy"]
          requires_fees_cleared?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["exam_status"]
          subject_id?: string | null
          title?: string
          total_marks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "exams_blueprint_id_organisation_id_fkey"
            columns: ["blueprint_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "assessment_blueprints"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "exams_blueprint_id_organisation_id_fkey"
            columns: ["blueprint_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "blueprint_summary"
            referencedColumns: ["blueprint_id", "organisation_id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_organisation_id_fkey"
            columns: ["subject_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      interventions: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          baseline_mastery: number | null
          completed_at: string | null
          created_at: string
          description: string | null
          diagnosis_id: string | null
          due_on: string | null
          id: string
          organisation_id: string
          status: Database["public"]["Enums"]["intervention_status"]
          student_id: string
          target_note_id: string | null
          target_topic_key: string
          title: string
          type: Database["public"]["Enums"]["intervention_type"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          baseline_mastery?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          diagnosis_id?: string | null
          due_on?: string | null
          id?: string
          organisation_id: string
          status?: Database["public"]["Enums"]["intervention_status"]
          student_id: string
          target_note_id?: string | null
          target_topic_key: string
          title: string
          type: Database["public"]["Enums"]["intervention_type"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          baseline_mastery?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          diagnosis_id?: string | null
          due_on?: string | null
          id?: string
          organisation_id?: string
          status?: Database["public"]["Enums"]["intervention_status"]
          student_id?: string
          target_note_id?: string | null
          target_topic_key?: string
          title?: string
          type?: Database["public"]["Enums"]["intervention_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_diagnosis_id_organisation_id_fkey"
            columns: ["diagnosis_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "diagnoses"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "interventions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "interventions_target_note_id_organisation_id_fkey"
            columns: ["target_note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_current"
            referencedColumns: ["note_id", "organisation_id"]
          },
          {
            foreignKeyName: "interventions_target_note_id_organisation_id_fkey"
            columns: ["target_note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      learning_outcomes: {
        Row: {
          code: string
          cognitive_level: Database["public"]["Enums"]["cognitive_level"]
          created_at: string
          id: string
          organisation_id: string
          statement: string
          updated_at: string
        }
        Insert: {
          code: string
          cognitive_level?: Database["public"]["Enums"]["cognitive_level"]
          created_at?: string
          id?: string
          organisation_id: string
          statement: string
          updated_at?: string
        }
        Update: {
          code?: string
          cognitive_level?: Database["public"]["Enums"]["cognitive_level"]
          created_at?: string
          id?: string
          organisation_id?: string
          statement?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_outcomes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_snapshots: {
        Row: {
          confidence: number
          evidence_n: number
          id: number
          mastery_score: number
          organisation_id: string
          released_mastery: number | null
          student_id: string
          taken_at: string
          topic_key: string
        }
        Insert: {
          confidence: number
          evidence_n: number
          id?: never
          mastery_score: number
          organisation_id: string
          released_mastery?: number | null
          student_id: string
          taken_at?: string
          topic_key: string
        }
        Update: {
          confidence?: number
          evidence_n?: number
          id?: never
          mastery_score?: number
          organisation_id?: string
          released_mastery?: number | null
          student_id?: string
          taken_at?: string
          topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_snapshots_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_snapshots_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      membership_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organisation_id: string
          revoked_at: string | null
          role_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organisation_id: string
          revoked_at?: string | null
          role_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organisation_id?: string
          revoked_at?: string | null
          role_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_invitations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      note_publications: {
        Row: {
          id: string
          note_id: string
          note_version_id: string
          organisation_id: string
          published_at: string
          published_by: string | null
          unpublished_at: string | null
          visibility: Database["public"]["Enums"]["content_visibility"]
        }
        Insert: {
          id?: string
          note_id: string
          note_version_id: string
          organisation_id: string
          published_at?: string
          published_by?: string | null
          unpublished_at?: string | null
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Update: {
          id?: string
          note_id?: string
          note_version_id?: string
          organisation_id?: string
          published_at?: string
          published_by?: string | null
          unpublished_at?: string | null
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "note_publications_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_current"
            referencedColumns: ["note_id", "organisation_id"]
          },
          {
            foreignKeyName: "note_publications_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "note_publications_note_version_id_organisation_id_fkey"
            columns: ["note_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_versions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "note_publications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      note_reviews: {
        Row: {
          comments: string | null
          decision: Database["public"]["Enums"]["review_decision"]
          id: string
          note_version_id: string
          organisation_id: string
          reviewed_at: string
          reviewer_id: string
        }
        Insert: {
          comments?: string | null
          decision: Database["public"]["Enums"]["review_decision"]
          id?: string
          note_version_id: string
          organisation_id: string
          reviewed_at?: string
          reviewer_id: string
        }
        Update: {
          comments?: string | null
          decision?: Database["public"]["Enums"]["review_decision"]
          id?: string
          note_version_id?: string
          organisation_id?: string
          reviewed_at?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_reviews_note_version_id_organisation_id_fkey"
            columns: ["note_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_versions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "note_reviews_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      note_versions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          media: Json
          note_id: string
          organisation_id: string
          reading_minutes: number | null
          search_vector: unknown
          status: Database["public"]["Enums"]["content_status"]
          summary: string | null
          version_no: number | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          media?: Json
          note_id: string
          organisation_id: string
          reading_minutes?: number | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          version_no?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          media?: Json
          note_id?: string
          organisation_id?: string
          reading_minutes?: number | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          version_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "note_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_versions_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_current"
            referencedColumns: ["note_id", "organisation_id"]
          },
          {
            foreignKeyName: "note_versions_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "note_versions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_views: {
        Row: {
          duration_s: number | null
          id: string
          note_id: string
          organisation_id: string
          student_id: string
          viewed_at: string
        }
        Insert: {
          duration_s?: number | null
          id?: string
          note_id: string
          organisation_id: string
          student_id: string
          viewed_at?: string
        }
        Update: {
          duration_s?: number | null
          id?: string
          note_id?: string
          organisation_id?: string
          student_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_views_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_current"
            referencedColumns: ["note_id", "organisation_id"]
          },
          {
            foreignKeyName: "note_views_note_id_organisation_id_fkey"
            columns: ["note_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "note_views_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_views_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          deleted_at: string | null
          id: string
          organisation_id: string
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["content_status"]
          title: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          organisation_id: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          organisation_id?: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notes_current_version"
            columns: ["current_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "note_versions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "notes_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      org_counters: {
        Row: {
          key: string
          next_value: number
          organisation_id: string
        }
        Insert: {
          key: string
          next_value?: number
          organisation_id: string
        }
        Update: {
          key?: string
          next_value?: number
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_counters_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          organisation_id: string
          role_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organisation_id: string
          role_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organisation_id?: string
          role_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_memberships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_settings: {
        Row: {
          key: string
          organisation_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          organisation_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          organisation_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organisation_settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          country: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          type: Database["public"]["Enums"]["org_type"]
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          type: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          type?: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Relationships: []
      }
      parent_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          period_end: string
          period_start: string
          sent_at: string | null
          sent_via: string | null
          status: Database["public"]["Enums"]["report_status"]
          student_id: string
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          period_end: string
          period_start: string
          sent_at?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          student_id: string
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          period_end?: string
          period_start?: string
          sent_at?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_reports_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_reports_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          organisation_id: string
          phone: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          organisation_id: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          organisation_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string | null
          id: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      programmes: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          level: string | null
          name: string
          organisation_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          level?: string | null
          name: string
          organisation_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          level?: string | null
          name?: string
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programmes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      question_publications: {
        Row: {
          id: string
          organisation_id: string
          published_at: string
          published_by: string | null
          question_id: string
          question_version_id: string
          unpublished_at: string | null
          visibility: Database["public"]["Enums"]["content_visibility"]
        }
        Insert: {
          id?: string
          organisation_id: string
          published_at?: string
          published_by?: string | null
          question_id: string
          question_version_id: string
          unpublished_at?: string | null
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Update: {
          id?: string
          organisation_id?: string
          published_at?: string
          published_by?: string | null
          question_id?: string
          question_version_id?: string
          unpublished_at?: string | null
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "question_publications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_publications_question_id_organisation_id_fkey"
            columns: ["question_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_current"
            referencedColumns: ["question_id", "organisation_id"]
          },
          {
            foreignKeyName: "question_publications_question_id_organisation_id_fkey"
            columns: ["question_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "question_publications_question_version_id_organisation_id_fkey"
            columns: ["question_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      question_reviews: {
        Row: {
          comments: string | null
          decision: Database["public"]["Enums"]["review_decision"]
          id: string
          organisation_id: string
          question_version_id: string
          reviewed_at: string
          reviewer_id: string
        }
        Insert: {
          comments?: string | null
          decision: Database["public"]["Enums"]["review_decision"]
          id?: string
          organisation_id: string
          question_version_id: string
          reviewed_at?: string
          reviewer_id: string
        }
        Update: {
          comments?: string | null
          decision?: Database["public"]["Enums"]["review_decision"]
          id?: string
          organisation_id?: string
          question_version_id?: string
          reviewed_at?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_reviews_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_reviews_question_version_id_organisation_id_fkey"
            columns: ["question_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "question_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_versions: {
        Row: {
          answer_key: Json | null
          cognitive_level: Database["public"]["Enums"]["cognitive_level"]
          created_at: string
          created_by: string | null
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          estimated_seconds: number | null
          explanation: string | null
          id: string
          marks: number
          options: Json | null
          organisation_id: string
          question_id: string
          search_vector: unknown
          status: Database["public"]["Enums"]["content_status"]
          stem: string
          stem_media: Json
          version_no: number | null
        }
        Insert: {
          answer_key?: Json | null
          cognitive_level?: Database["public"]["Enums"]["cognitive_level"]
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          estimated_seconds?: number | null
          explanation?: string | null
          id?: string
          marks?: number
          options?: Json | null
          organisation_id: string
          question_id: string
          search_vector?: unknown
          status?: Database["public"]["Enums"]["content_status"]
          stem: string
          stem_media?: Json
          version_no?: number | null
        }
        Update: {
          answer_key?: Json | null
          cognitive_level?: Database["public"]["Enums"]["cognitive_level"]
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          estimated_seconds?: number | null
          explanation?: string | null
          id?: string
          marks?: number
          options?: Json | null
          organisation_id?: string
          question_id?: string
          search_vector?: unknown
          status?: Database["public"]["Enums"]["content_status"]
          stem?: string
          stem_media?: Json
          version_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_versions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_versions_question_id_organisation_id_fkey"
            columns: ["question_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_current"
            referencedColumns: ["question_id", "organisation_id"]
          },
          {
            foreignKeyName: "question_versions_question_id_organisation_id_fkey"
            columns: ["question_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          deleted_at: string | null
          id: string
          organisation_id: string
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["content_status"]
          topic_id: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          organisation_id: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          topic_id: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          organisation_id?: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          topic_id?: string
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_questions_current_version"
            columns: ["current_version_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "questions_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      reassessments: {
        Row: {
          assessed_at: string
          baseline_mastery: number | null
          delta: number | null
          id: string
          intervention_id: string
          organisation_id: string
          outcome: Database["public"]["Enums"]["reassessment_outcome"]
          result_mastery: number
          student_id: string
          topic_key: string
        }
        Insert: {
          assessed_at?: string
          baseline_mastery?: number | null
          delta?: number | null
          id?: string
          intervention_id: string
          organisation_id: string
          outcome: Database["public"]["Enums"]["reassessment_outcome"]
          result_mastery: number
          student_id: string
          topic_key: string
        }
        Update: {
          assessed_at?: string
          baseline_mastery?: number | null
          delta?: number | null
          id?: string
          intervention_id?: string
          organisation_id?: string
          outcome?: Database["public"]["Enums"]["reassessment_outcome"]
          result_mastery?: number
          student_id?: string
          topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "reassessments_intervention_id_organisation_id_fkey"
            columns: ["intervention_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "intervention_board"
            referencedColumns: ["intervention_id", "organisation_id"]
          },
          {
            foreignKeyName: "reassessments_intervention_id_organisation_id_fkey"
            columns: ["intervention_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "interventions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "reassessments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reassessments_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      response_events: {
        Row: {
          attempt_id: string
          cognitive_level: Database["public"]["Enums"]["cognitive_level"] | null
          correct: boolean
          difficulty: Database["public"]["Enums"]["difficulty_level"] | null
          exam_id: string
          fraction: number
          id: string
          is_current: boolean
          kind_weight: number
          marks_awarded: number
          marks_possible: number
          occurred_at: string
          organisation_id: string
          question_id: string | null
          response_id: string
          student_id: string
          time_spent_s: number | null
          topic_id: string
          topic_key: string
          updated_at: string
        }
        Insert: {
          attempt_id: string
          cognitive_level?:
            | Database["public"]["Enums"]["cognitive_level"]
            | null
          correct: boolean
          difficulty?: Database["public"]["Enums"]["difficulty_level"] | null
          exam_id: string
          fraction: number
          id?: string
          is_current?: boolean
          kind_weight?: number
          marks_awarded: number
          marks_possible: number
          occurred_at: string
          organisation_id: string
          question_id?: string | null
          response_id: string
          student_id: string
          time_spent_s?: number | null
          topic_id: string
          topic_key: string
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          cognitive_level?:
            | Database["public"]["Enums"]["cognitive_level"]
            | null
          correct?: boolean
          difficulty?: Database["public"]["Enums"]["difficulty_level"] | null
          exam_id?: string
          fraction?: number
          id?: string
          is_current?: boolean
          kind_weight?: number
          marks_awarded?: number
          marks_possible?: number
          occurred_at?: string
          organisation_id?: string
          question_id?: string | null
          response_id?: string
          student_id?: string
          time_spent_s?: number | null
          topic_id?: string
          topic_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_events_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "response_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_events_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: true
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_events_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      responses: {
        Row: {
          answer: Json | null
          answered_at: string | null
          attempt_id: string
          exam_id: string
          exam_question_id: string
          feedback: string | null
          flagged: boolean
          id: string
          is_correct: boolean | null
          marked_at: string | null
          marked_by: string | null
          marking_status: Database["public"]["Enums"]["marking_state"]
          marks_awarded: number | null
          organisation_id: string
          student_id: string
          time_spent_s: number | null
          topic_id: string | null
        }
        Insert: {
          answer?: Json | null
          answered_at?: string | null
          attempt_id: string
          exam_id: string
          exam_question_id: string
          feedback?: string | null
          flagged?: boolean
          id?: string
          is_correct?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          marking_status?: Database["public"]["Enums"]["marking_state"]
          marks_awarded?: number | null
          organisation_id: string
          student_id: string
          time_spent_s?: number | null
          topic_id?: string | null
        }
        Update: {
          answer?: Json | null
          answered_at?: string | null
          attempt_id?: string
          exam_id?: string
          exam_question_id?: string
          feedback?: string | null
          flagged?: boolean
          id?: string
          is_correct?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          marking_status?: Database["public"]["Enums"]["marking_state"]
          marks_awarded?: number | null
          organisation_id?: string
          student_id?: string
          time_spent_s?: number | null
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "responses_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "responses_exam_question_id_organisation_id_fkey"
            columns: ["exam_question_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "responses_exam_question_id_organisation_id_fkey"
            columns: ["exam_question_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "question_performance"
            referencedColumns: ["exam_question_id", "organisation_id"]
          },
          {
            foreignKeyName: "responses_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      results: {
        Row: {
          attempt_id: string
          class_id: string | null
          computed_at: string
          exam_id: string
          grade: string | null
          id: string
          marking_complete: boolean
          organisation_id: string
          passed: boolean | null
          percentage: number
          position_in_class: number | null
          released_at: string | null
          score: number
          student_id: string
          total_marks: number
        }
        Insert: {
          attempt_id: string
          class_id?: string | null
          computed_at?: string
          exam_id: string
          grade?: string | null
          id?: string
          marking_complete?: boolean
          organisation_id: string
          passed?: boolean | null
          percentage: number
          position_in_class?: number | null
          released_at?: string | null
          score: number
          student_id: string
          total_marks: number
        }
        Update: {
          attempt_id?: string
          class_id?: string | null
          computed_at?: string
          exam_id?: string
          grade?: string | null
          id?: string
          marking_complete?: boolean
          organisation_id?: string
          passed?: boolean | null
          percentage?: number
          position_in_class?: number | null
          released_at?: string | null
          score?: number
          student_id?: string
          total_marks?: number
        }
        Relationships: [
          {
            foreignKeyName: "results_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "results_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "results_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          organisation_id: string | null
          scope: Database["public"]["Enums"]["role_scope"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          organisation_id?: string | null
          scope?: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          organisation_id?: string | null
          scope?: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          description: string
          version: string
        }
        Insert: {
          applied_at?: string
          description: string
          version: string
        }
        Update: {
          applied_at?: string
          description?: string
          version?: string
        }
        Relationships: []
      }
      scholarships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["amount_kind"]
          name: string
          organisation_id: string
          product_id: string | null
          sponsor: string | null
          student_id: string
          valid_from: string | null
          valid_to: string | null
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["amount_kind"]
          name: string
          organisation_id: string
          product_id?: string | null
          sponsor?: string | null
          student_id: string
          valid_from?: string | null
          valid_to?: string | null
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["amount_kind"]
          name?: string
          organisation_id?: string
          product_id?: string | null
          sponsor?: string | null
          student_id?: string
          valid_from?: string | null
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scholarships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_product_id_organisation_id_fkey"
            columns: ["product_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "scholarships_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      student_parents: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          organisation_id: string
          parent_id: string
          relationship: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organisation_id: string
          parent_id: string
          relationship?: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organisation_id?: string
          parent_id?: string
          relationship?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_parents_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_parents_parent_id_organisation_id_fkey"
            columns: ["parent_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "student_parents_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      students: {
        Row: {
          admission_no: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"]
          id: string
          organisation_id: string
          phone: string | null
          status: Database["public"]["Enums"]["person_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admission_no?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          organisation_id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admission_no?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          organisation_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organisation_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organisation_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          organisation_id: string
          phone: string | null
          staff_no: string | null
          status: Database["public"]["Enums"]["person_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          organisation_id: string
          phone?: string | null
          staff_no?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          organisation_id?: string
          phone?: string | null
          staff_no?: string | null
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ledger: {
        Row: {
          account_id: string
          amount: number
          balance_after: number
          currency: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: number
          invoice_id: string | null
          kind: Database["public"]["Enums"]["ledger_kind"]
          memo: string | null
          organisation_id: string
          posted_at: string
          posted_by: string | null
          refund_id: string | null
          student_id: string
          transaction_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          balance_after: number
          currency?: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          invoice_id?: string | null
          kind: Database["public"]["Enums"]["ledger_kind"]
          memo?: string | null
          organisation_id: string
          posted_at?: string
          posted_by?: string | null
          refund_id?: string | null
          student_id: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          balance_after?: number
          currency?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["ledger_kind"]
          memo?: string | null
          organisation_id?: string
          posted_at?: string
          posted_by?: string | null
          refund_id?: string | null
          student_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ledger_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["account_id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_refund_id_organisation_id_fkey"
            columns: ["refund_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_refunds"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_transaction_id_organisation_id_fkey"
            columns: ["transaction_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_payment_transactions"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      tenant_prices: {
        Row: {
          academic_session_id: string | null
          amount: number
          created_at: string
          currency: string
          id: string
          is_active: boolean
          organisation_id: string
          product_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          academic_session_id?: string | null
          amount: number
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          organisation_id: string
          product_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          academic_session_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          organisation_id?: string
          product_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_prices_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_prices_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_prices_product_id_organisation_id_fkey"
            columns: ["product_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      tenant_products: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organisation_id: string
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organisation_id: string
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organisation_id?: string
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_products_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_mastery: {
        Row: {
          confidence: number
          evidence_n: number
          first_assessed_at: string | null
          last_assessed_at: string | null
          level: string
          mastery_score: number
          organisation_id: string
          released_confidence: number | null
          released_evidence_n: number
          released_mastery: number | null
          student_id: string
          subject_id: string | null
          topic_id_latest: string | null
          topic_key: string
          updated_at: string
        }
        Insert: {
          confidence: number
          evidence_n: number
          first_assessed_at?: string | null
          last_assessed_at?: string | null
          level: string
          mastery_score: number
          organisation_id: string
          released_confidence?: number | null
          released_evidence_n?: number
          released_mastery?: number | null
          student_id: string
          subject_id?: string | null
          topic_id_latest?: string | null
          topic_key: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          evidence_n?: number
          first_assessed_at?: string | null
          last_assessed_at?: string | null
          level?: string
          mastery_score?: number
          organisation_id?: string
          released_confidence?: number | null
          released_evidence_n?: number
          released_mastery?: number | null
          student_id?: string
          subject_id?: string | null
          topic_id_latest?: string | null
          topic_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_mastery_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_mastery_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          email_verified_at: string | null
          full_name: string
          id: string
          is_platform_admin: boolean
          last_login_at: string | null
          phone: string | null
          phone_verified_at: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_verified_at?: string | null
          full_name: string
          id: string
          is_platform_admin?: boolean
          last_login_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_verified_at?: string | null
          full_name?: string
          id?: string
          is_platform_admin?: boolean
          last_login_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_statement: {
        Row: {
          account_id: string | null
          amount: number | null
          balance_after: number | null
          entry_id: number | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"] | null
          invoice_number: string | null
          kind: Database["public"]["Enums"]["ledger_kind"] | null
          memo: string | null
          organisation_id: string | null
          posted_at: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ledger_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["account_id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      ai_review_outcomes: {
        Row: {
          awaiting_review: number | null
          generated: number | null
          kept_by_reviewers: number | null
          kind: Database["public"]["Enums"]["ai_content_kind"] | null
          model: string | null
          organisation_id: string | null
          rejected_by_checks: number | null
          rejected_by_reviewers: number | null
        }
        Relationships: []
      }
      ai_usage_this_month: {
        Row: {
          cost_usd: number | null
          failed: number | null
          input_tokens: number | null
          jobs: number | null
          organisation_id: string | null
          output_tokens: number | null
          type: Database["public"]["Enums"]["ai_job_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_summary: {
        Row: {
          blueprint_id: string | null
          marks_match: boolean | null
          name: string | null
          organisation_id: string | null
          planned_marks: number | null
          planned_questions: number | null
          total_marks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_blueprints_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_mastery_summary: {
        Row: {
          avg_mastery: number | null
          class_id: string | null
          class_name: string | null
          organisation_id: string | null
          students_assessed: number | null
          students_weak: number | null
          subject_id: string | null
          topic_key: string | null
          topic_title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_class_id_organisation_id_fkey"
            columns: ["class_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "enrolments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_roster: {
        Row: {
          academic_session_id: string | null
          admission_no: string | null
          class_id: string | null
          class_name: string | null
          full_name: string | null
          organisation_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "enrolments_class_id_organisation_id_fkey"
            columns: ["class_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "enrolments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_final_results: {
        Row: {
          attempt_id: string | null
          attempt_no: number | null
          class_id: string | null
          exam_id: string | null
          grade: string | null
          id: string | null
          marking_complete: boolean | null
          organisation_id: string | null
          passed: boolean | null
          percentage: number | null
          position_in_class: number | null
          released_at: string | null
          score: number | null
          student_id: string | null
          total_marks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "results_attempt_id_organisation_id_fkey"
            columns: ["attempt_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "results_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "results_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      fee_collection_summary: {
        Row: {
          academic_session_id: string | null
          billed: number | null
          collected: number | null
          discounts_given: number | null
          invoices: number | null
          organisation_id: string | null
          outstanding: number | null
          overdue: number | null
          scholarships_given: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoices_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_board: {
        Row: {
          diagnosis_kind: Database["public"]["Enums"]["diagnosis_kind"] | null
          due_on: string | null
          intervention_id: string | null
          is_overdue: boolean | null
          organisation_id: string | null
          severity: Database["public"]["Enums"]["severity_level"] | null
          status: Database["public"]["Enums"]["intervention_status"] | null
          student_id: string | null
          student_name: string | null
          title: string | null
          type: Database["public"]["Enums"]["intervention_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "interventions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      intervention_effectiveness: {
        Row: {
          avg_change: number | null
          declined: number | null
          improved: number | null
          organisation_id: string | null
          reassessed: number | null
          type: Database["public"]["Enums"]["intervention_type"] | null
          unchanged: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reassessments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_summary: {
        Row: {
          academic_session_id: string | null
          admission_no: string | null
          balance: number | null
          days_overdue: number | null
          due_on: string | null
          invoice_id: string | null
          is_overdue: boolean | null
          issued_at: string | null
          number: string | null
          organisation_id: string | null
          paid: number | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          student_id: string | null
          student_name: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_academic_session_id_organisation_id_fkey"
            columns: ["academic_session_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_invoices_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      mastery_trend: {
        Row: {
          delta: number | null
          direction: string | null
          latest: number | null
          organisation_id: string | null
          previous: number | null
          student_id: string | null
          taken_at: string | null
          topic_key: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mastery_snapshots_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_snapshots_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      my_ai_drafts: {
        Row: {
          ai_content_id: string | null
          created_at: string | null
          kind: Database["public"]["Enums"]["ai_content_kind"] | null
          organisation_id: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["ai_content_status"] | null
          target_id: string | null
          target_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_content_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      note_current: {
        Row: {
          note_id: string | null
          note_status: Database["public"]["Enums"]["content_status"] | null
          organisation_id: string | null
          reading_minutes: number | null
          summary: string | null
          title: string | null
          topic_id: string | null
          version_id: string | null
          version_no: number | null
          version_status: Database["public"]["Enums"]["content_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "notes_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      outstanding_balances: {
        Row: {
          account_balance: number | null
          account_id: string | null
          organisation_id: string | null
          outstanding: number | null
          overdue: number | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      payments_needing_review: {
        Row: {
          amount: number | null
          attempt_id: string | null
          created_at: string | null
          currency: string | null
          failure_reason: string | null
          invoice_id: string | null
          organisation_id: string | null
          provider: Database["public"]["Enums"]["payment_provider"] | null
          reference: string | null
          student_id: string | null
        }
        Insert: {
          amount?: number | null
          attempt_id?: string | null
          created_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          invoice_id?: string | null
          organisation_id?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"] | null
          reference?: string | null
          student_id?: string | null
        }
        Update: {
          amount?: number | null
          attempt_id?: string | null
          created_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          invoice_id?: string | null
          organisation_id?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"] | null
          reference?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_attempts_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_invoice_id_organisation_id_fkey"
            columns: ["invoice_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "invoice_summary"
            referencedColumns: ["invoice_id", "organisation_id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      question_current: {
        Row: {
          cognitive_level: Database["public"]["Enums"]["cognitive_level"] | null
          difficulty: Database["public"]["Enums"]["difficulty_level"] | null
          marks: number | null
          options: Json | null
          organisation_id: string | null
          question_id: string | null
          question_status: Database["public"]["Enums"]["content_status"] | null
          stem: string | null
          topic_id: string | null
          type: Database["public"]["Enums"]["question_type"] | null
          version_id: string | null
          version_no: number | null
          version_status: Database["public"]["Enums"]["content_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "questions_topic_id_organisation_id_fkey"
            columns: ["topic_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "topic_tree"
            referencedColumns: ["topic_id", "organisation_id"]
          },
        ]
      }
      question_performance: {
        Row: {
          answered: number | null
          avg_time_s: number | null
          correct: number | null
          exam_id: string | null
          exam_question_id: string | null
          organisation_id: string | null
          pct_correct: number | null
          position: number | null
          responses: number | null
          topic_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_organisation_id_fkey"
            columns: ["exam_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "exam_questions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_mastery_detail: {
        Row: {
          admission_no: string | null
          confidence: number | null
          evidence_n: number | null
          last_assessed_at: string | null
          level: string | null
          mastery_score: number | null
          organisation_id: string | null
          student_id: string | null
          student_name: string | null
          subject_name: string | null
          topic_key: string | null
          topic_title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_mastery_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_mastery_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      topic_tree: {
        Row: {
          class_level: string | null
          curriculum_id: string | null
          curriculum_name: string | null
          organisation_id: string | null
          subject_name: string | null
          term: Database["public"]["Enums"]["term_hint"] | null
          topic_code: string | null
          topic_id: string | null
          topic_position: number | null
          topic_title: string | null
          unit_id: string | null
          unit_position: number | null
          unit_title: string | null
          version_id: string | null
          version_label: string | null
          version_status:
            | Database["public"]["Enums"]["curriculum_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_topics_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_balances: {
        Row: {
          account_id: string | null
          organisation_id: string | null
          student_id: string | null
          wallet_balance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ledger_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_account_id_organisation_id_fkey"
            columns: ["account_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances"
            referencedColumns: ["account_id", "organisation_id"]
          },
          {
            foreignKeyName: "tenant_ledger_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ledger_student_id_organisation_id_fkey"
            columns: ["student_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      account_for_student: { Args: { p_student_id: string }; Returns: string }
      add_intervention: {
        Args: {
          p_description?: string
          p_due_on?: string
          p_note_id?: string
          p_student_id: string
          p_title: string
          p_topic_key: string
          p_type: Database["public"]["Enums"]["intervention_type"]
        }
        Returns: string
      }
      anonymise_student: { Args: { p_student_id: string }; Returns: undefined }
      answer_matches: {
        Args: { p_key: Json; p_text: string }
        Returns: boolean
      }
      apply_payment: { Args: { p_txn_id: string }; Returns: undefined }
      apply_wallet_internal: {
        Args: { p_amount: number; p_invoice_id: string }
        Returns: number
      }
      apply_wallet_to_invoice: {
        Args: { p_amount?: number; p_invoice_id: string }
        Returns: number
      }
      approve_parent_report: {
        Args: { p_content?: Json; p_report_id: string }
        Returns: undefined
      }
      approve_refund: {
        Args: { p_note?: string; p_refund_id: string }
        Returns: undefined
      }
      assert_owner_authority: { Args: never; Returns: string }
      assert_service_context: { Args: never; Returns: undefined }
      assign_intervention: {
        Args: {
          p_assignee?: string
          p_due_on?: string
          p_intervention_id: string
        }
        Returns: undefined
      }
      attach_checkout: {
        Args: {
          p_attempt_id: string
          p_checkout_url: string
          p_provider_ref?: string
        }
        Returns: undefined
      }
      audit_finance: {
        Args: {
          p_action: string
          p_after: Json
          p_entity: string
          p_entity_id: string
          p_org: string
        }
        Returns: undefined
      }
      audit_redact: { Args: { p: Json }; Returns: Json }
      available_exams: {
        Args: never
        Returns: {
          attempts_allowed: number
          attempts_used: number
          closes_at: string
          duration_min: number
          exam_id: string
          kind: Database["public"]["Enums"]["exam_kind"]
          open_attempt_id: string
          opens_at: string
          subject_name: string
          title: string
        }[]
      }
      build_ai_context: {
        Args: { j: Database["public"]["Tables"]["ai_jobs"]["Row"] }
        Returns: Json
      }
      build_report_content: {
        Args: { p_from: string; p_student_id: string; p_to: string }
        Returns: Json
      }
      can_manage_exam: { Args: { p_exam_id: string }; Returns: boolean }
      can_manage_membership: { Args: { p_org_id: string }; Returns: boolean }
      can_manage_organisation: { Args: { p_org_id: string }; Returns: boolean }
      can_manage_role: {
        Args: { p_is_system: boolean; p_org_id: string; p_role_id: string }
        Returns: boolean
      }
      can_manage_role_permissions: {
        Args: { p_role_id: string }
        Returns: boolean
      }
      can_manage_settings: { Args: { p_org_id: string }; Returns: boolean }
      can_pay_for_student: { Args: { p_student_id: string }; Returns: boolean }
      can_read_audit: { Args: { p_org_id: string }; Returns: boolean }
      can_read_membership: {
        Args: { p_membership_org_id: string; p_user_id: string }
        Returns: boolean
      }
      can_read_role: { Args: { p_role_id: string }; Returns: boolean }
      can_read_role_permissions: {
        Args: { p_role_id: string }
        Returns: boolean
      }
      can_read_settings: { Args: { p_org_id: string }; Returns: boolean }
      can_read_user: { Args: { p_user_id: string }; Returns: boolean }
      can_view_student: { Args: { p_student_id: string }; Returns: boolean }
      cancel_ai_job: { Args: { p_job_id: string }; Returns: undefined }
      claim_ai_job: {
        Args: { p_lease_seconds?: number; p_worker: string }
        Returns: Json
      }
      close_exam: { Args: { p_exam_id: string }; Returns: undefined }
      complete_ai_job: {
        Args: { p_job_id: string; p_outputs: Json; p_usage?: Json }
        Returns: Json
      }
      complete_refund: {
        Args: { p_provider_refund_id?: string; p_refund_id: string }
        Returns: undefined
      }
      create_invoice: {
        Args: {
          p_academic_session_id?: string
          p_due_on?: string
          p_items: Json
          p_notes?: string
          p_student_id: string
        }
        Returns: string
      }
      create_organisation: {
        Args: {
          p_country?: string
          p_name: string
          p_slug: string
          p_type?: Database["public"]["Enums"]["org_type"]
        }
        Returns: string
      }
      current_org_id: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      dismiss_diagnosis: {
        Args: { p_diagnosis_id: string; p_reason: string }
        Returns: undefined
      }
      draft_parent_report: {
        Args: {
          p_from: string
          p_student_id: string
          p_title?: string
          p_to: string
        }
        Returns: string
      }
      draft_parent_reports_for_class: {
        Args: { p_class_id: string; p_from: string; p_to: string }
        Returns: number
      }
      enqueue_ai_job: {
        Args: {
          p_idempotency_key: string
          p_input: Json
          p_priority?: number
          p_student_id: string
          p_target_id: string
          p_target_type: string
          p_type: Database["public"]["Enums"]["ai_job_type"]
        }
        Returns: string
      }
      fail_ai_job: {
        Args: {
          p_error: string
          p_job_id: string
          p_retry?: boolean
          p_usage?: Json
        }
        Returns: undefined
      }
      fees_cleared: { Args: { p_student_id: string }; Returns: boolean }
      finalize_attempt: {
        Args: {
          p_attempt_id: string
          p_status: Database["public"]["Enums"]["attempt_status"]
        }
        Returns: undefined
      }
      generate_exam_from_blueprint: {
        Args: { p_exam_id: string }
        Returns: {
          out_found: number
          out_requested: number
          out_topic_id: string
        }[]
      }
      get_attempt_paper: { Args: { p_attempt_id: string }; Returns: Json }
      grade_for: { Args: { p_org: string; p_pct: number }; Returns: string }
      grant_organisation_owner: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      has_permission: { Args: { perm: string }; Returns: boolean }
      ingest_payment_event: {
        Args: {
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_raw_body: string
          p_signature: string
          p_verification?: Json
        }
        Returns: string
      }
      initiate_payment: {
        Args: {
          p_amount?: number
          p_idempotency_key?: string
          p_invoice_id: string
          p_payer_email?: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
        }
        Returns: Json
      }
      invite_member: {
        Args: { p_email: string; p_role_code: string }
        Returns: string
      }
      is_active_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_eligible: {
        Args: { p_exam_id: string; p_student_id: string }
        Returns: boolean
      }
      is_org_member: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_self_or_parent: { Args: { p_student_id: string }; Returns: boolean }
      issue_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      learning_dashboard: { Args: { p_student_id?: string }; Returns: Json }
      mark_intervention_done: {
        Args: { p_intervention_id: string }
        Returns: undefined
      }
      mark_report_sent: {
        Args: { p_channel: string; p_report_id: string }
        Returns: undefined
      }
      mark_response: {
        Args: { p_feedback?: string; p_marks: number; p_response_id: string }
        Returns: undefined
      }
      mastery_level: {
        Args: { p_conf: number; p_score: number }
        Returns: string
      }
      migration_begin: {
        Args: { p_requires: string; p_version: string }
        Returns: undefined
      }
      my_attempt_review: { Args: { p_attempt_id: string }; Returns: Json }
      my_recommendations: { Args: { p_refresh?: boolean }; Returns: Json }
      next_number: {
        Args: { p_org: string; p_prefix: string; p_scope: string }
        Returns: string
      }
      normalise_auth_email: { Args: { p_email: string }; Returns: string }
      normalise_auth_phone: { Args: { p_phone: string }; Returns: string }
      org_setting: {
        Args: { p_default: Json; p_key: string; p_org: string }
        Returns: Json
      }
      post_ledger: {
        Args: {
          p_account_id: string
          p_amount: number
          p_invoice_id: string
          p_kind: Database["public"]["Enums"]["ledger_kind"]
          p_memo?: string
          p_refund_id?: string
          p_txn_id?: string
          p_type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Returns: number
      }
      price_for: {
        Args: { p_product_id: string; p_session_id?: string }
        Returns: {
          academic_session_id: string | null
          amount: number
          created_at: string
          currency: string
          id: string
          is_active: boolean
          organisation_id: string
          product_id: string
          valid_from: string | null
          valid_to: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_prices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      provision_public_user: {
        Args: { p: Database["public"]["Tables"]["users"]["Row"] }
        Returns: undefined
      }
      publish_exam: { Args: { p_exam_id: string }; Returns: undefined }
      publish_note_version: {
        Args: {
          p_version_id: string
          p_visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Returns: undefined
      }
      publish_question_version: {
        Args: {
          p_version_id: string
          p_visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Returns: undefined
      }
      rebuild_mastery: { Args: { p_student_id?: string }; Returns: number }
      recompute_topic_mastery: {
        Args: { p_student_id: string; p_topic_key: string }
        Returns: undefined
      }
      record_ai_usage: {
        Args: { p_org: string; p_usage: Json }
        Returns: undefined
      }
      record_manual_payment: {
        Args: {
          p_amount: number
          p_invoice_id?: string
          p_note?: string
          p_paid_at?: string
          p_payer_name?: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_reference?: string
          p_student_id: string
        }
        Returns: string
      }
      record_reassessments: {
        Args: { p_student_id: string; p_topic_key: string }
        Returns: undefined
      }
      record_recommendation_event: {
        Args: { p_event: string; p_id: string }
        Returns: undefined
      }
      refresh_all_recommendations: {
        Args: { p_limit?: number }
        Returns: number
      }
      refresh_mastery_for_attempt: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      refresh_recommendations: {
        Args: { p_student_id: string }
        Returns: number
      }
      reject_refund: {
        Args: { p_note?: string; p_refund_id: string }
        Returns: undefined
      }
      release_results: {
        Args: { p_exam_id: string; p_force?: boolean }
        Returns: number
      }
      release_results_internal: {
        Args: { p_exam_id: string; p_force: boolean }
        Returns: number
      }
      request_ai_diagnosis_explanation: {
        Args: { p_diagnosis_id: string }
        Returns: string
      }
      request_ai_note: {
        Args: {
          p_idempotency_key?: string
          p_instructions?: string
          p_style?: string
          p_topic_id: string
        }
        Returns: string
      }
      request_ai_questions: {
        Args: {
          p_cognitive?: Database["public"]["Enums"]["cognitive_level"]
          p_count?: number
          p_difficulty?: Database["public"]["Enums"]["difficulty_level"]
          p_idempotency_key?: string
          p_instructions?: string
          p_topic_id: string
          p_type?: Database["public"]["Enums"]["question_type"]
        }
        Returns: string
      }
      request_ai_report_comment: {
        Args: { p_report_id: string }
        Returns: string
      }
      request_ai_student_review: {
        Args: { p_idempotency_key?: string; p_student_id: string }
        Returns: string
      }
      request_refund: {
        Args: {
          p_amount: number
          p_reason: string
          p_source?: Database["public"]["Enums"]["refund_source"]
          p_transaction_id: string
        }
        Returns: string
      }
      results_for_student: {
        Args: { p_student_id: string }
        Returns: {
          attempt_no: number
          exam_id: string
          exam_title: string
          grade: string
          is_official: boolean
          kind: Database["public"]["Enums"]["exam_kind"]
          passed: boolean
          percentage: number
          position_in_class: number
          released_at: string
          score: number
          total_marks: number
        }[]
      }
      review_ai_diagnostic: {
        Args: { p_accept: boolean; p_id: string }
        Returns: undefined
      }
      revoke_organisation_owner: {
        Args: { p_new_role_code?: string; p_user_id: string }
        Returns: undefined
      }
      role_within_caller_ceiling: {
        Args: { p_role_id: string }
        Returns: boolean
      }
      run_ai_maintenance: { Args: never; Returns: Json }
      run_cbt_maintenance: { Args: never; Returns: Json }
      run_diagnosis: {
        Args: { p_student_id: string; p_topic_key: string }
        Returns: undefined
      }
      run_finance_maintenance: { Args: never; Returns: number }
      save_response: {
        Args: {
          p_answer: Json
          p_attempt_id: string
          p_exam_question_id: string
          p_flagged?: boolean
          p_time_spent_s?: number
        }
        Returns: string
      }
      score_attempt: { Args: { p_attempt_id: string }; Returns: undefined }
      search_notes: {
        Args: { p_query: string; p_topic_id?: string }
        Returns: {
          note_id: string
          rank: number
          snippet: string
          title: string
          topic_id: string
        }[]
      }
      security_expected_client_functions: { Args: never; Returns: string[] }
      security_verify: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          object_name: string
        }[]
      }
      set_intervention_status: {
        Args: {
          p_intervention_id: string
          p_status: Database["public"]["Enums"]["intervention_status"]
        }
        Returns: undefined
      }
      set_payment_provider_secret: {
        Args: {
          p_organisation_id?: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_secret: string
        }
        Returns: undefined
      }
      staff_can_view_results: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      start_attempt: {
        Args: { p_device?: string; p_exam_id: string; p_ip?: unknown }
        Returns: string
      }
      submit_attempt: { Args: { p_attempt_id: string }; Returns: Json }
      submit_note_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      submit_question_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      suggest_interventions: {
        Args: { p_diagnosis_id: string }
        Returns: undefined
      }
      topic_prerequisite_chain: {
        Args: { p_topic_id: string }
        Returns: {
          depth: number
          strength: number
          topic_id: string
          topic_title: string
        }[]
      }
      transfer_organisation_ownership: {
        Args: { p_new_owner_id: string; p_previous_owner_role?: string }
        Returns: undefined
      }
      unpublish_note: { Args: { p_note_id: string }; Returns: undefined }
      unpublish_question: {
        Args: { p_question_id: string }
        Returns: undefined
      }
      upsert_assessment_event: {
        Args: { p_result_id: string }
        Returns: undefined
      }
      upsert_response_event: {
        Args: { p_response_id: string }
        Returns: undefined
      }
      void_attempt: {
        Args: { p_attempt_id: string; p_reason: string }
        Returns: undefined
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      wallet_balance_of: { Args: { p_account_id: string }; Returns: number }
      write_off_balance: {
        Args: { p_amount: number; p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_content_kind:
        | "question_draft"
        | "note_draft"
        | "student_review"
        | "diagnosis_narrative"
        | "report_comment"
        | "mark_suggestion"
      ai_content_status:
        | "draft_created"
        | "applied"
        | "invalid"
        | "duplicate"
        | "discarded"
      ai_credit_kind:
        | "grant"
        | "reserve"
        | "settle"
        | "release"
        | "refund"
        | "adjust"
        | "expire"
      ai_job_status:
        | "awaiting_approval"
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "expired"
        | "rejected"
      ai_job_type:
        | "generate_questions"
        | "generate_note"
        | "review_student"
        | "explain_diagnosis"
        | "report_comment"
      ai_model_state: "enabled" | "disabled" | "retired"
      ai_prompt_state: "draft" | "active" | "retired"
      ai_review_state: "pending_review" | "accepted" | "discarded"
      ai_safety_class:
        | "staff_generation"
        | "staff_assist"
        | "student_facing"
        | "analytics"
      amount_kind: "percent" | "fixed"
      attempt_policy: "best" | "latest" | "first"
      attempt_status: "in_progress" | "submitted" | "auto_submitted" | "voided"
      audit_actor_type:
        | "user"
        | "service_role"
        | "webhook"
        | "worker"
        | "system"
      cognitive_level:
        | "recall"
        | "understand"
        | "apply"
        | "analyse"
        | "evaluate"
      content_source: "manual" | "ai" | "imported" | "adopted"
      content_status:
        | "draft"
        | "in_review"
        | "approved"
        | "published"
        | "archived"
      content_visibility: "private" | "organisation" | "shared"
      curriculum_status: "draft" | "published" | "archived"
      diagnosis_kind: "weak_topic" | "prerequisite_gap" | "declining"
      diagnosis_source: "rule" | "ai"
      diagnosis_status: "open" | "resolved" | "superseded" | "dismissed"
      difficulty_level: "easy" | "medium" | "hard"
      enrolment_status: "active" | "completed" | "withdrawn" | "transferred"
      exam_kind: "test" | "exam" | "practice" | "mock"
      exam_status: "draft" | "published" | "closed" | "archived"
      gender_type: "female" | "male" | "other" | "undisclosed"
      intervention_status:
        | "suggested"
        | "assigned"
        | "in_progress"
        | "completed"
        | "cancelled"
      intervention_type:
        | "note"
        | "practice"
        | "teacher_action"
        | "parent_message"
        | "remedial_class"
      invoice_status: "draft" | "issued" | "partially_paid" | "paid" | "void"
      ledger_entry_type: "debit" | "credit"
      ledger_kind:
        | "invoice"
        | "invoice_void"
        | "payment"
        | "wallet_credit"
        | "wallet_apply"
        | "wallet_transfer"
        | "refund"
        | "adjustment"
      marking_state: "pending" | "auto" | "marked"
      membership_status: "invited" | "active" | "suspended" | "removed"
      org_status: "active" | "suspended" | "closed"
      org_type: "school" | "individual" | "partner"
      payment_attempt_state:
        | "initiated"
        | "pending"
        | "succeeded"
        | "failed"
        | "abandoned"
        | "expired"
        | "needs_review"
      payment_provider:
        | "paystack"
        | "flutterwave"
        | "bank_transfer"
        | "cash"
        | "pos"
        | "other"
      person_status: "active" | "inactive" | "graduated" | "withdrawn"
      product_type:
        | "tuition"
        | "registration"
        | "exam_fee"
        | "coaching"
        | "materials"
        | "subscription"
        | "other"
      question_type:
        | "mcq"
        | "multi_select"
        | "true_false"
        | "fill_blank"
        | "short_answer"
        | "theory"
      reassessment_outcome: "improved" | "unchanged" | "declined"
      recommendation_kind: "note" | "practice_exam"
      recommendation_source: "rule" | "ai"
      refund_source: "invoice" | "wallet"
      refund_status: "requested" | "approved" | "rejected" | "completed"
      release_policy: "manual" | "immediate" | "after_close"
      report_status: "draft" | "approved" | "sent"
      review_decision: "approved" | "changes_requested" | "rejected"
      role_scope: "platform" | "organisation"
      severity_level: "low" | "medium" | "high"
      term_hint: "first" | "second" | "third" | "any"
      user_status: "invited" | "active" | "suspended" | "deleted"
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
    Enums: {
      ai_content_kind: [
        "question_draft",
        "note_draft",
        "student_review",
        "diagnosis_narrative",
        "report_comment",
        "mark_suggestion",
      ],
      ai_content_status: [
        "draft_created",
        "applied",
        "invalid",
        "duplicate",
        "discarded",
      ],
      ai_credit_kind: [
        "grant",
        "reserve",
        "settle",
        "release",
        "refund",
        "adjust",
        "expire",
      ],
      ai_job_status: [
        "awaiting_approval",
        "queued",
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "expired",
        "rejected",
      ],
      ai_job_type: [
        "generate_questions",
        "generate_note",
        "review_student",
        "explain_diagnosis",
        "report_comment",
      ],
      ai_model_state: ["enabled", "disabled", "retired"],
      ai_prompt_state: ["draft", "active", "retired"],
      ai_review_state: ["pending_review", "accepted", "discarded"],
      ai_safety_class: [
        "staff_generation",
        "staff_assist",
        "student_facing",
        "analytics",
      ],
      amount_kind: ["percent", "fixed"],
      attempt_policy: ["best", "latest", "first"],
      attempt_status: ["in_progress", "submitted", "auto_submitted", "voided"],
      audit_actor_type: ["user", "service_role", "webhook", "worker", "system"],
      cognitive_level: ["recall", "understand", "apply", "analyse", "evaluate"],
      content_source: ["manual", "ai", "imported", "adopted"],
      content_status: [
        "draft",
        "in_review",
        "approved",
        "published",
        "archived",
      ],
      content_visibility: ["private", "organisation", "shared"],
      curriculum_status: ["draft", "published", "archived"],
      diagnosis_kind: ["weak_topic", "prerequisite_gap", "declining"],
      diagnosis_source: ["rule", "ai"],
      diagnosis_status: ["open", "resolved", "superseded", "dismissed"],
      difficulty_level: ["easy", "medium", "hard"],
      enrolment_status: ["active", "completed", "withdrawn", "transferred"],
      exam_kind: ["test", "exam", "practice", "mock"],
      exam_status: ["draft", "published", "closed", "archived"],
      gender_type: ["female", "male", "other", "undisclosed"],
      intervention_status: [
        "suggested",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
      ],
      intervention_type: [
        "note",
        "practice",
        "teacher_action",
        "parent_message",
        "remedial_class",
      ],
      invoice_status: ["draft", "issued", "partially_paid", "paid", "void"],
      ledger_entry_type: ["debit", "credit"],
      ledger_kind: [
        "invoice",
        "invoice_void",
        "payment",
        "wallet_credit",
        "wallet_apply",
        "wallet_transfer",
        "refund",
        "adjustment",
      ],
      marking_state: ["pending", "auto", "marked"],
      membership_status: ["invited", "active", "suspended", "removed"],
      org_status: ["active", "suspended", "closed"],
      org_type: ["school", "individual", "partner"],
      payment_attempt_state: [
        "initiated",
        "pending",
        "succeeded",
        "failed",
        "abandoned",
        "expired",
        "needs_review",
      ],
      payment_provider: [
        "paystack",
        "flutterwave",
        "bank_transfer",
        "cash",
        "pos",
        "other",
      ],
      person_status: ["active", "inactive", "graduated", "withdrawn"],
      product_type: [
        "tuition",
        "registration",
        "exam_fee",
        "coaching",
        "materials",
        "subscription",
        "other",
      ],
      question_type: [
        "mcq",
        "multi_select",
        "true_false",
        "fill_blank",
        "short_answer",
        "theory",
      ],
      reassessment_outcome: ["improved", "unchanged", "declined"],
      recommendation_kind: ["note", "practice_exam"],
      recommendation_source: ["rule", "ai"],
      refund_source: ["invoice", "wallet"],
      refund_status: ["requested", "approved", "rejected", "completed"],
      release_policy: ["manual", "immediate", "after_close"],
      report_status: ["draft", "approved", "sent"],
      review_decision: ["approved", "changes_requested", "rejected"],
      role_scope: ["platform", "organisation"],
      severity_level: ["low", "medium", "high"],
      term_hint: ["first", "second", "third", "any"],
      user_status: ["invited", "active", "suspended", "deleted"],
    },
  },
} as const
