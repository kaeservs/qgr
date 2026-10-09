// Generated from the deployed schema (Supabase-QGR, generate_typescript_types).
// Regenerate after every migration; do not edit by hand.

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
      ad_sets: {
        Row: {
          created_at: string
          id: string
          run_id: string
          strategy_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          run_id: string
          strategy_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          run_id?: string
          strategy_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_variants: {
        Row: {
          ad_set_id: string
          angle: string
          approved_at: string | null
          approved_by: string | null
          copy: Json
          creative_style: string
          creative_text: string
          id: string
          image_prompt: string | null
          image_url: string | null
          label: string
          updated_at: string
          updated_by: string | null
          video_edit: Json | null
          warnings: string[]
        }
        Insert: {
          ad_set_id: string
          angle: string
          approved_at?: string | null
          approved_by?: string | null
          copy: Json
          creative_style: string
          creative_text: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          label: string
          updated_at?: string
          updated_by?: string | null
          video_edit?: Json | null
          warnings?: string[]
        }
        Update: {
          ad_set_id?: string
          angle?: string
          approved_at?: string | null
          approved_by?: string | null
          copy?: Json
          creative_style?: string
          creative_text?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          label?: string
          updated_at?: string
          updated_by?: string | null
          video_edit?: Json | null
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ad_variants_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          run_id: string
          stage: string
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          run_id: string
          stage: string
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          run_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_usage_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profile: {
        Row: {
          audience: string
          company: string
          guardrails: string[]
          id: number
          offer: string
          page_name: string
          updated_at: string
          voice: string[]
          website: string
          x_handle: string
        }
        Insert: {
          audience: string
          company: string
          guardrails?: string[]
          id?: number
          offer: string
          page_name: string
          updated_at?: string
          voice?: string[]
          website: string
          x_handle: string
        }
        Update: {
          audience?: string
          company?: string
          guardrails?: string[]
          id?: number
          offer?: string
          page_name?: string
          updated_at?: string
          voice?: string[]
          website?: string
          x_handle?: string
        }
        Relationships: []
      }
      competitor_ads: {
        Row: {
          ad_url: string | null
          days_running: number
          format: string
          id: string
          media_url: string | null
          platform: string
          report_id: string
          text: string
        }
        Insert: {
          ad_url?: string | null
          days_running: number
          format: string
          id?: string
          media_url?: string | null
          platform: string
          report_id: string
          text: string
        }
        Update: {
          ad_url?: string | null
          days_running?: number
          format?: string
          id?: string
          media_url?: string | null
          platform?: string
          report_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_ads_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "competitor_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_reports: {
        Row: {
          active_ads: number
          angles: Json
          competitor_id: string
          created_at: string
          data_source: string
          id: string
          insights: string[]
          platforms: string[]
          run_id: string
          summary: string
          website_summary: string | null
        }
        Insert: {
          active_ads: number
          angles: Json
          competitor_id: string
          created_at?: string
          data_source: string
          id?: string
          insights: string[]
          platforms: string[]
          run_id: string
          summary: string
          website_summary?: string | null
        }
        Update: {
          active_ads?: number
          angles?: Json
          competitor_id?: string
          created_at?: string
          data_source?: string
          id?: string
          insights?: string[]
          platforms?: string[]
          run_id?: string
          summary?: string
          website_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_reports_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          name: string
          tracked: boolean
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          name: string
          tracked?: boolean
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          name?: string
          tracked?: boolean
        }
        Relationships: []
      }
      hooks: {
        Row: {
          days_running: number
          format: string
          id: string
          platform: string
          rank: number
          report_id: string
          text: string
          variations: number
        }
        Insert: {
          days_running: number
          format: string
          id?: string
          platform: string
          rank: number
          report_id: string
          text: string
          variations: number
        }
        Update: {
          days_running?: number
          format?: string
          id?: string
          platform?: string
          rank?: number
          report_id?: string
          text?: string
          variations?: number
        }
        Relationships: [
          {
            foreignKeyName: "hooks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "competitor_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      post_targets: {
        Row: {
          attempts: number
          claimed_at: string | null
          error: string | null
          media_kind: string | null
          media_path: string | null
          place: string
          post_id: string
          posted_at: string | null
          remote_id: string | null
          remote_url: string | null
          stand_in: boolean
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          error?: string | null
          media_kind?: string | null
          media_path?: string | null
          place: string
          post_id: string
          posted_at?: string | null
          remote_id?: string | null
          remote_url?: string | null
          stand_in?: boolean
          status?: string
          text: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          error?: string | null
          media_kind?: string | null
          media_path?: string | null
          place?: string
          post_id?: string
          posted_at?: string | null
          remote_id?: string | null
          remote_url?: string | null
          stand_in?: boolean
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          scheduled_for: string
          thumbnail: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          scheduled_for: string
          thumbnail?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          scheduled_for?: string
          thumbnail?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ad_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      run_events: {
        Row: {
          at: string
          id: number
          run_id: string
          text: string
        }
        Insert: {
          at?: string
          id?: never
          run_id: string
          text: string
        }
        Update: {
          at?: string
          id?: never
          run_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_stages: {
        Row: {
          error: string | null
          finished_at: string | null
          run_id: string
          stage: string
          started_at: string | null
          status: string
          summary: string | null
          waiting_since: string | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          run_id: string
          stage: string
          started_at?: string | null
          status: string
          summary?: string | null
          waiting_since?: string | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          run_id?: string
          stage?: string
          started_at?: string | null
          status?: string
          summary?: string | null
          waiting_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_stages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          approved_at: string | null
          competitor_id: string | null
          competitor_name: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          files: string[] | null
          goal: string
          id: string
          input: string
          kind: string
          media: Json | null
          media_path: string | null
          page: Json | null
          platforms: string[]
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          approved_at?: string | null
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          files?: string[] | null
          goal: string
          id?: string
          input: string
          kind: string
          media?: Json | null
          media_path?: string | null
          page?: Json | null
          platforms: string[]
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          approved_at?: string | null
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          files?: string[] | null
          goal?: string
          id?: string
          input?: string
          kind?: string
          media?: Json | null
          media_path?: string | null
          page?: Json | null
          platforms?: string[]
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          approved_at: string | null
          audiences: string[]
          channels: Json
          competitor_id: string | null
          created_at: string
          goal: string
          guardrails: string[]
          id: string
          positioning: string
          run_id: string
          source_label: string | null
          title: string
        }
        Insert: {
          approved_at?: string | null
          audiences: string[]
          channels: Json
          competitor_id?: string | null
          created_at?: string
          goal: string
          guardrails: string[]
          id?: string
          positioning: string
          run_id: string
          source_label?: string | null
          title: string
        }
        Update: {
          approved_at?: string | null
          audiences?: string[]
          channels?: Json
          competitor_id?: string | null
          created_at?: string
          goal?: string
          guardrails?: string[]
          id?: string
          positioning?: string
          run_id?: string
          source_label?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_angles: {
        Row: {
          based_on_hook: string | null
          hook: string
          id: string
          name: string
          position: number
          strategy_id: string
          why: string
        }
        Insert: {
          based_on_hook?: string | null
          hook: string
          id?: string
          name: string
          position: number
          strategy_id: string
          why: string
        }
        Update: {
          based_on_hook?: string | null
          hook?: string
          id?: string
          name?: string
          position?: number
          strategy_id?: string
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_angles_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          added_at: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      team_settings: {
        Row: {
          content_auto: boolean
          facebook_page_id: string | null
          facebook_page_name: string | null
          id: number
          instagram_account_id: string | null
          instagram_username: string | null
          last_scan_at: string | null
          linkedin_org_id: string | null
          linkedin_page_name: string | null
          scan_changed_at: string
          scan_day: number
          scan_every: string
          scan_hour: number
          strategist_auto: boolean
          time_zone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_auto?: boolean
          facebook_page_id?: string | null
          facebook_page_name?: string | null
          id?: number
          instagram_account_id?: string | null
          instagram_username?: string | null
          last_scan_at?: string | null
          linkedin_org_id?: string | null
          linkedin_page_name?: string | null
          scan_changed_at?: string
          scan_day?: number
          scan_every?: string
          scan_hour?: number
          strategist_auto?: boolean
          time_zone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_auto?: boolean
          facebook_page_id?: string | null
          facebook_page_name?: string | null
          id?: number
          instagram_account_id?: string | null
          instagram_username?: string | null
          last_scan_at?: string | null
          linkedin_org_id?: string | null
          linkedin_page_name?: string | null
          scan_changed_at?: string
          scan_day?: number
          scan_every?: string
          scan_hour?: number
          strategist_auto?: boolean
          time_zone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_begin: {
        Args: { p_run_id: string; p_stage: string }
        Returns: Json
      }
      agent_fail: {
        Args: {
          p_error: string
          p_run_id: string
          p_stage: string
          p_usage?: Json
        }
        Returns: undefined
      }
      agent_finish_content: {
        Args: { p_ad_set: Json; p_run_id: string; p_usage?: Json }
        Returns: string
      }
      agent_finish_strategist: {
        Args: { p_run_id: string; p_strategy: Json; p_usage?: Json }
        Returns: string
      }
      agent_finish_tracker: {
        Args: { p_report: Json; p_run_id: string; p_usage?: Json }
        Returns: string
      }
      agent_name: { Args: { p_stage: string }; Returns: string }
      approve_variant: { Args: { p_variant_id: string }; Returns: undefined }
      assert_stage_running: {
        Args: { p_run_id: string; p_stage: string }
        Returns: undefined
      }
      cancel_post: { Args: { p_post_id: string }; Returns: string[] }
      continue_run: { Args: { p_run_id: string }; Returns: string }
      create_run: {
        Args: {
          p_competitor_name?: string
          p_excerpt?: string
          p_files?: string[]
          p_goal: string
          p_input: string
          p_kind: string
          p_media?: Json
          p_media_path?: string
          p_page?: Json
          p_platforms: string[]
          p_title: string
          p_url?: string
        }
        Returns: string
      }
      finish_stage: {
        Args: { p_run_id: string; p_stage: string; p_summary: string }
        Returns: undefined
      }
      next_scan_at: { Args: never; Returns: string }
      pipeline_next: {
        Args: { p_run_id: string; p_stage: string }
        Returns: boolean
      }
      place_name: { Args: { p_place: string }; Returns: string }
      publisher_fail: {
        Args: {
          p_error: string
          p_place: string
          p_post_id: string
          p_unknown?: boolean
        }
        Returns: undefined
      }
      publisher_finish: {
        Args: {
          p_place: string
          p_post_id: string
          p_remote_id?: string
          p_remote_url?: string
          p_stand_in?: boolean
        }
        Returns: Json
      }
      publisher_take_due: { Args: { p_limit?: number }; Returns: Json }
      record_usage: {
        Args: { p_run_id: string; p_stage: string; p_usage: Json }
        Returns: undefined
      }
      report_continue_failure: {
        Args: { p_error: string; p_run_id: string; p_stage: string }
        Returns: undefined
      }
      report_start_failure: {
        Args: { p_error: string; p_run_id: string }
        Returns: undefined
      }
      retry_post: {
        Args: { p_place: string; p_post_id: string }
        Returns: undefined
      }
      run_of_variant: { Args: { p_variant_id: string }; Returns: string }
      save_variant: {
        Args: {
          p_copy: Json
          p_creative_text: string
          p_variant_id: string
          p_warnings: string[]
        }
        Returns: undefined
      }
      save_video_edit: {
        Args: { p_edit: Json; p_variant_id: string }
        Returns: undefined
      }
      scan_slot: {
        Args: {
          p_at: string
          p_day: number
          p_every: string
          p_hour: number
          p_time_zone: string
        }
        Returns: string
      }
      schedule_post: {
        Args: {
          p_local_time?: string
          p_targets: Json
          p_thumbnail?: string
          p_variant_id: string
        }
        Returns: string
      }
      set_competitor_tracked: {
        Args: { p_competitor_id: string; p_tracked: boolean }
        Returns: undefined
      }
      start_due_scans: { Args: { p_max?: number }; Returns: Json }
      start_run: {
        Args: {
          p_competitor_name?: string
          p_excerpt?: string
          p_files?: string[]
          p_goal: string
          p_input: string
          p_kind: string
          p_media?: Json
          p_media_path?: string
          p_page?: Json
          p_platforms: string[]
          p_title: string
          p_url?: string
        }
        Returns: string
      }
      unapproved: {
        Args: {
          p_run: string
          p_was: Database["public"]["Tables"]["ad_variants"]["Row"]
          p_what: string
        }
        Returns: undefined
      }
      update_agent_settings: {
        Args: {
          p_content_auto: boolean
          p_scan_day: number
          p_scan_every: string
          p_scan_hour: number
          p_strategist_auto: boolean
          p_time_zone: string
        }
        Returns: undefined
      }
      update_brand_profile: {
        Args: {
          p_audience: string
          p_company: string
          p_guardrails: string[]
          p_offer: string
          p_page_name: string
          p_voice: string[]
          p_website: string
          p_x_handle: string
        }
        Returns: undefined
      }
      update_publishing_settings: {
        Args: {
          p_facebook_page_id: string
          p_facebook_page_name: string
          p_instagram_account_id: string
          p_instagram_username: string
          p_linkedin_org_id: string
          p_linkedin_page_name: string
        }
        Returns: undefined
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
