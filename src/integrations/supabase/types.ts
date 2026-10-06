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
      [_ in never]: never
    }
    Functions: {
      assert_owner_authority: { Args: never; Returns: string }
      assert_service_context: { Args: never; Returns: undefined }
      audit_redact: { Args: { p: Json }; Returns: Json }
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
      current_org_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      grant_organisation_owner: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      has_permission: { Args: { perm: string }; Returns: boolean }
      is_active_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      migration_begin: {
        Args: { p_requires: string; p_version: string }
        Returns: undefined
      }
      normalise_auth_email: { Args: { p_email: string }; Returns: string }
      normalise_auth_phone: { Args: { p_phone: string }; Returns: string }
      provision_public_user: {
        Args: { p: Database["public"]["Tables"]["users"]["Row"] }
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
      transfer_organisation_ownership: {
        Args: { p_new_owner_id: string; p_previous_owner_role?: string }
        Returns: undefined
      }
    }
    Enums: {
      audit_actor_type:
        | "user"
        | "service_role"
        | "webhook"
        | "worker"
        | "system"
      membership_status: "invited" | "active" | "suspended" | "removed"
      org_status: "active" | "suspended" | "closed"
      org_type: "school" | "individual" | "partner"
      role_scope: "platform" | "organisation"
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
      audit_actor_type: ["user", "service_role", "webhook", "worker", "system"],
      membership_status: ["invited", "active", "suspended", "removed"],
      org_status: ["active", "suspended", "closed"],
      org_type: ["school", "individual", "partner"],
      role_scope: ["platform", "organisation"],
      user_status: ["invited", "active", "suspended", "deleted"],
    },
  },
} as const
