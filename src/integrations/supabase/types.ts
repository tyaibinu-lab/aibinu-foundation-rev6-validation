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
    }
    Functions: {
      answer_matches: {
        Args: { p_key: Json; p_text: string }
        Returns: boolean
      }
      assert_owner_authority: { Args: never; Returns: string }
      assert_service_context: { Args: never; Returns: undefined }
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
      close_exam: { Args: { p_exam_id: string }; Returns: undefined }
      current_org_id: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
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
      is_active_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_eligible: {
        Args: { p_exam_id: string; p_student_id: string }
        Returns: boolean
      }
      is_org_member: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_self_or_parent: { Args: { p_student_id: string }; Returns: boolean }
      mark_response: {
        Args: { p_feedback?: string; p_marks: number; p_response_id: string }
        Returns: undefined
      }
      migration_begin: {
        Args: { p_requires: string; p_version: string }
        Returns: undefined
      }
      my_attempt_review: { Args: { p_attempt_id: string }; Returns: Json }
      normalise_auth_email: { Args: { p_email: string }; Returns: string }
      normalise_auth_phone: { Args: { p_phone: string }; Returns: string }
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
      release_results: {
        Args: { p_exam_id: string; p_force?: boolean }
        Returns: number
      }
      release_results_internal: {
        Args: { p_exam_id: string; p_force: boolean }
        Returns: number
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
      revoke_organisation_owner: {
        Args: { p_new_role_code?: string; p_user_id: string }
        Returns: undefined
      }
      role_within_caller_ceiling: {
        Args: { p_role_id: string }
        Returns: boolean
      }
      run_cbt_maintenance: { Args: never; Returns: Json }
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
      void_attempt: {
        Args: { p_attempt_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
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
      difficulty_level: "easy" | "medium" | "hard"
      enrolment_status: "active" | "completed" | "withdrawn" | "transferred"
      exam_kind: "test" | "exam" | "practice" | "mock"
      exam_status: "draft" | "published" | "closed" | "archived"
      gender_type: "female" | "male" | "other" | "undisclosed"
      marking_state: "pending" | "auto" | "marked"
      membership_status: "invited" | "active" | "suspended" | "removed"
      org_status: "active" | "suspended" | "closed"
      org_type: "school" | "individual" | "partner"
      person_status: "active" | "inactive" | "graduated" | "withdrawn"
      question_type:
        | "mcq"
        | "multi_select"
        | "true_false"
        | "fill_blank"
        | "short_answer"
        | "theory"
      release_policy: "manual" | "immediate" | "after_close"
      review_decision: "approved" | "changes_requested" | "rejected"
      role_scope: "platform" | "organisation"
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
      difficulty_level: ["easy", "medium", "hard"],
      enrolment_status: ["active", "completed", "withdrawn", "transferred"],
      exam_kind: ["test", "exam", "practice", "mock"],
      exam_status: ["draft", "published", "closed", "archived"],
      gender_type: ["female", "male", "other", "undisclosed"],
      marking_state: ["pending", "auto", "marked"],
      membership_status: ["invited", "active", "suspended", "removed"],
      org_status: ["active", "suspended", "closed"],
      org_type: ["school", "individual", "partner"],
      person_status: ["active", "inactive", "graduated", "withdrawn"],
      question_type: [
        "mcq",
        "multi_select",
        "true_false",
        "fill_blank",
        "short_answer",
        "theory",
      ],
      release_policy: ["manual", "immediate", "after_close"],
      review_decision: ["approved", "changes_requested", "rejected"],
      role_scope: ["platform", "organisation"],
      term_hint: ["first", "second", "third", "any"],
      user_status: ["invited", "active", "suspended", "deleted"],
    },
  },
} as const
