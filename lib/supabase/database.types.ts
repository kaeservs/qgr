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
          design: Json | null
          id: string
          image_prompt: string | null
          image_url: string | null
          label: string
          picture_attempts: number
          picture_claimed_at: string | null
          picture_error: string | null
          picture_path: string | null
          picture_requested_at: string | null
          picture_status: string
          posts: Json
          updated_at: string
          updated_by: string | null
          video_edit: Json | null
          video_prompt: string | null
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
          design?: Json | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          label: string
          picture_attempts?: number
          picture_claimed_at?: string | null
          picture_error?: string | null
          picture_path?: string | null
          picture_requested_at?: string | null
          picture_status?: string
          posts?: Json
          updated_at?: string
          updated_by?: string | null
          video_edit?: Json | null
          video_prompt?: string | null
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
          design?: Json | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          label?: string
          picture_attempts?: number
          picture_claimed_at?: string | null
          picture_error?: string | null
          picture_path?: string | null
          picture_requested_at?: string | null
          picture_status?: string
          posts?: Json
          updated_at?: string
          updated_by?: string | null
          video_edit?: Json | null
          video_prompt?: string | null
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
      ai_videos: {
        Row: {
          asked_at: string
          asked_by: string | null
          aspect: string
          checked_at: string | null
          claimed_at: string | null
          credits: number
          error: string | null
          finished_at: string | null
          id: string
          job_id: string | null
          model: string
          path: string | null
          picture_path: string | null
          prompt: string
          quality: string
          removed_at: string | null
          seconds: number
          sound: boolean
          status: string
          tries: number
          variant_id: string | null
        }
        Insert: {
          asked_at?: string
          asked_by?: string | null
          aspect: string
          checked_at?: string | null
          claimed_at?: string | null
          credits?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string | null
          model: string
          path?: string | null
          picture_path?: string | null
          prompt: string
          quality: string
          removed_at?: string | null
          seconds: number
          sound?: boolean
          status?: string
          tries?: number
          variant_id?: string | null
        }
        Update: {
          asked_at?: string
          asked_by?: string | null
          aspect?: string
          checked_at?: string | null
          claimed_at?: string | null
          credits?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string | null
          model?: string
          path?: string | null
          picture_path?: string | null
          prompt?: string
          quality?: string
          removed_at?: string | null
          seconds?: number
          sound?: boolean
          status?: string
          tries?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_videos_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ad_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_examples: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          place: string
          post_id: string | null
          removed_at: string | null
          source: string
          text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          place: string
          post_id?: string | null
          removed_at?: string | null
          source: string
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          place?: string
          post_id?: string | null
          removed_at?: string | null
          source?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_examples_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
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
          picture_style: string | null
          post_formats: Json
          topics: string[]
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
          picture_style?: string | null
          post_formats?: Json
          topics?: string[]
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
          picture_style?: string | null
          post_formats?: Json
          topics?: string[]
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
          angle: string | null
          cta: string | null
          days_known: boolean
          days_running: number
          format: string
          headline: string | null
          id: string
          media_url: string | null
          page_name: string | null
          platform: string
          position: number | null
          report_id: string
          screenshot_path: string | null
          text: string
        }
        Insert: {
          ad_url?: string | null
          angle?: string | null
          cta?: string | null
          days_known?: boolean
          days_running: number
          format: string
          headline?: string | null
          id?: string
          media_url?: string | null
          page_name?: string | null
          platform: string
          position?: number | null
          report_id: string
          screenshot_path?: string | null
          text: string
        }
        Update: {
          ad_url?: string | null
          angle?: string | null
          cta?: string | null
          days_known?: boolean
          days_running?: number
          format?: string
          headline?: string | null
          id?: string
          media_url?: string | null
          page_name?: string | null
          platform?: string
          position?: number | null
          report_id?: string
          screenshot_path?: string | null
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
      higgsfield_pictures: {
        Row: {
          asked_at: string
          checked_at: string | null
          credits: number
          error: string | null
          finished_at: string | null
          id: string
          job_id: string | null
          model: string
          path: string
          quality: string
          status: string
          variant_id: string | null
        }
        Insert: {
          asked_at?: string
          checked_at?: string | null
          credits: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string | null
          model?: string
          path: string
          quality: string
          status?: string
          variant_id?: string | null
        }
        Update: {
          asked_at?: string
          checked_at?: string | null
          credits?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string | null
          model?: string
          path?: string
          quality?: string
          status?: string
          variant_id?: string | null
        }
        Relationships: []
      }
      hooks: {
        Row: {
          days_known: boolean
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
          days_known?: boolean
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
          days_known?: boolean
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
      lead_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          id: number
          input_tokens: number
          lead_id: string
          model: string
          output_tokens: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          lead_id: string
          model: string
          output_tokens?: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          lead_id?: string
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_usage_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          answers: Json
          campaign: Json
          created_in_zoho: string
          first_seen_at: string
          id: string
          judge_attempts: number
          judge_claimed_at: string | null
          judge_error: string | null
          judge_status: string
          judged_at: string | null
          judged_criteria_at: string | null
          modified_in_zoho: string
          name: string
          person_at: string | null
          person_by: string | null
          person_note: string | null
          person_verdict: string | null
          place: string | null
          platform: string
          reasons: Json
          run_id: string | null
          updated_at: string
          variant_id: string | null
          verdict: string | null
          zoho_id: string
          zoho_source: string | null
          zoho_status: string | null
        }
        Insert: {
          answers?: Json
          campaign?: Json
          created_in_zoho: string
          first_seen_at?: string
          id?: string
          judge_attempts?: number
          judge_claimed_at?: string | null
          judge_error?: string | null
          judge_status?: string
          judged_at?: string | null
          judged_criteria_at?: string | null
          modified_in_zoho: string
          name: string
          person_at?: string | null
          person_by?: string | null
          person_note?: string | null
          person_verdict?: string | null
          place?: string | null
          platform?: string
          reasons?: Json
          run_id?: string | null
          updated_at?: string
          variant_id?: string | null
          verdict?: string | null
          zoho_id: string
          zoho_source?: string | null
          zoho_status?: string | null
        }
        Update: {
          answers?: Json
          campaign?: Json
          created_in_zoho?: string
          first_seen_at?: string
          id?: string
          judge_attempts?: number
          judge_claimed_at?: string | null
          judge_error?: string | null
          judge_status?: string
          judged_at?: string | null
          judged_criteria_at?: string | null
          modified_in_zoho?: string
          name?: string
          person_at?: string | null
          person_by?: string | null
          person_note?: string | null
          person_verdict?: string | null
          place?: string | null
          platform?: string
          reasons?: Json
          run_id?: string | null
          updated_at?: string
          variant_id?: string | null
          verdict?: string | null
          zoho_id?: string
          zoho_source?: string | null
          zoho_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ad_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      long_video_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          id: number
          input_tokens: number
          long_video_id: string
          model: string
          output_tokens: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          long_video_id: string
          model: string
          output_tokens?: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          long_video_id?: string
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "long_video_usage_long_video_id_fkey"
            columns: ["long_video_id"]
            isOneToOne: false
            referencedRelation: "long_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      long_videos: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          edit: Json | null
          edited_at: string | null
          error: string | null
          file: Json
          finished_at: string | null
          guidance: string | null
          id: string
          moments: Json
          removed_at: string | null
          status: string
          title: string
          transcript: Json
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          edit?: Json | null
          edited_at?: string | null
          error?: string | null
          file: Json
          finished_at?: string | null
          guidance?: string | null
          id?: string
          moments?: Json
          removed_at?: string | null
          status?: string
          title: string
          transcript: Json
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          edit?: Json | null
          edited_at?: string | null
          error?: string | null
          file?: Json
          finished_at?: string | null
          guidance?: string | null
          id?: string
          moments?: Json
          removed_at?: string | null
          status?: string
          title?: string
          transcript?: Json
        }
        Relationships: []
      }
      post_targets: {
        Row: {
          attempts: number
          claimed_at: string | null
          clicks: number | null
          comments: number | null
          error: string | null
          media_kind: string | null
          media_path: string | null
          place: string
          post_id: string
          posted_at: string | null
          reach: number | null
          reactions: number | null
          remote_id: string | null
          remote_url: string | null
          results_at: string | null
          results_error: string | null
          shares: number | null
          stand_in: boolean
          status: string
          text: string
          updated_at: string
          views: number | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          clicks?: number | null
          comments?: number | null
          error?: string | null
          media_kind?: string | null
          media_path?: string | null
          place: string
          post_id: string
          posted_at?: string | null
          reach?: number | null
          reactions?: number | null
          remote_id?: string | null
          remote_url?: string | null
          results_at?: string | null
          results_error?: string | null
          shares?: number | null
          stand_in?: boolean
          status?: string
          text: string
          updated_at?: string
          views?: number | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          clicks?: number | null
          comments?: number | null
          error?: string | null
          media_kind?: string | null
          media_path?: string | null
          place?: string
          post_id?: string
          posted_at?: string | null
          reach?: number | null
          reactions?: number | null
          remote_id?: string | null
          remote_url?: string | null
          results_at?: string | null
          results_error?: string | null
          shares?: number | null
          stand_in?: boolean
          status?: string
          text?: string
          updated_at?: string
          views?: number | null
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
      run_references: {
        Row: {
          claimed_at: string | null
          created_at: string
          error: string | null
          id: string
          media_id: string | null
          note: string | null
          path: string
          position: number
          run_id: string
          status: string
          tries: number
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          media_id?: string | null
          note?: string | null
          path: string
          position: number
          run_id: string
          status?: string
          tries?: number
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          media_id?: string | null
          note?: string | null
          path?: string
          position?: number
          run_id?: string
          status?: string
          tries?: number
        }
        Relationships: [
          {
            foreignKeyName: "run_references_run_id_fkey"
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
          ai_media: string | null
          ai_video: Json | null
          approved_at: string | null
          chosen_ad_ids: string[] | null
          chosen_angle_ids: string[] | null
          competitor_id: string | null
          competitor_name: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          files: string[] | null
          goal: string
          guidance: string | null
          id: string
          input: string
          kind: string
          media: Json | null
          media_path: string | null
          page: Json | null
          pick_first: boolean
          platforms: string[]
          source_report_id: string | null
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          ai_media?: string | null
          ai_video?: Json | null
          approved_at?: string | null
          chosen_ad_ids?: string[] | null
          chosen_angle_ids?: string[] | null
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          files?: string[] | null
          goal: string
          guidance?: string | null
          id?: string
          input: string
          kind: string
          media?: Json | null
          media_path?: string | null
          page?: Json | null
          pick_first?: boolean
          platforms: string[]
          source_report_id?: string | null
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          ai_media?: string | null
          ai_video?: Json | null
          approved_at?: string | null
          chosen_ad_ids?: string[] | null
          chosen_angle_ids?: string[] | null
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          files?: string[] | null
          goal?: string
          guidance?: string | null
          id?: string
          input?: string
          kind?: string
          media?: Json | null
          media_path?: string | null
          page?: Json | null
          pick_first?: boolean
          platforms?: string[]
          source_report_id?: string | null
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
          {
            foreignKeyName: "runs_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "competitor_reports"
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
          ads_source: string
          cloudflare_account: string | null
          content_auto: boolean
          facebook_live: boolean
          facebook_page_id: string | null
          facebook_page_name: string | null
          id: number
          instagram_account_id: string | null
          instagram_live: boolean
          instagram_username: string | null
          last_scan_at: string | null
          lead_criteria: string
          lead_criteria_at: string
          leads_checked_at: string | null
          leads_source: string
          leads_sync_error: string | null
          leads_synced_at: string | null
          linkedin_live: boolean
          linkedin_org_id: string | null
          linkedin_page_name: string | null
          pictures_auto: boolean
          pictures_model: string
          pictures_quality: string
          post_link: string | null
          scan_changed_at: string
          scan_day: number
          scan_every: string
          scan_hour: number
          strategist_auto: boolean
          time_zone: string
          updated_at: string
          updated_by: string | null
          videos_cap: number
          videos_live: boolean
          zoho_org: string | null
          zoho_region: string | null
        }
        Insert: {
          ads_source?: string
          cloudflare_account?: string | null
          content_auto?: boolean
          facebook_live?: boolean
          facebook_page_id?: string | null
          facebook_page_name?: string | null
          id?: number
          instagram_account_id?: string | null
          instagram_live?: boolean
          instagram_username?: string | null
          last_scan_at?: string | null
          lead_criteria?: string
          lead_criteria_at?: string
          leads_checked_at?: string | null
          leads_source?: string
          leads_sync_error?: string | null
          leads_synced_at?: string | null
          linkedin_live?: boolean
          linkedin_org_id?: string | null
          linkedin_page_name?: string | null
          pictures_auto?: boolean
          pictures_model?: string
          pictures_quality?: string
          post_link?: string | null
          scan_changed_at?: string
          scan_day?: number
          scan_every?: string
          scan_hour?: number
          strategist_auto?: boolean
          time_zone?: string
          updated_at?: string
          updated_by?: string | null
          videos_cap?: number
          videos_live?: boolean
          zoho_org?: string | null
          zoho_region?: string | null
        }
        Update: {
          ads_source?: string
          cloudflare_account?: string | null
          content_auto?: boolean
          facebook_live?: boolean
          facebook_page_id?: string | null
          facebook_page_name?: string | null
          id?: number
          instagram_account_id?: string | null
          instagram_live?: boolean
          instagram_username?: string | null
          last_scan_at?: string | null
          lead_criteria?: string
          lead_criteria_at?: string
          leads_checked_at?: string | null
          leads_source?: string
          leads_sync_error?: string | null
          leads_synced_at?: string | null
          linkedin_live?: boolean
          linkedin_org_id?: string | null
          linkedin_page_name?: string | null
          pictures_auto?: boolean
          pictures_model?: string
          pictures_quality?: string
          post_link?: string | null
          scan_changed_at?: string
          scan_day?: number
          scan_every?: string
          scan_hour?: number
          strategist_auto?: boolean
          time_zone?: string
          updated_at?: string
          updated_by?: string | null
          videos_cap?: number
          videos_live?: boolean
          zoho_org?: string | null
          zoho_region?: string | null
        }
        Relationships: []
      }
      variant_pictures: {
        Row: {
          created_at: string
          id: string
          path: string
          prompt: string | null
          removed_at: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          prompt?: string | null
          removed_at?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          prompt?: string | null
          removed_at?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_pictures_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ad_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      video_prompt_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          id: number
          input_tokens: number
          long_video_id: string | null
          model: string
          output_tokens: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          long_video_id?: string | null
          model: string
          output_tokens?: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: never
          input_tokens?: number
          long_video_id?: string | null
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_prompt_usage_long_video_id_fkey"
            columns: ["long_video_id"]
            isOneToOne: false
            referencedRelation: "long_videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_brand_example: {
        Args: { p_note?: string; p_place: string; p_text: string }
        Returns: string
      }
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
      ask_for_picture: {
        Args: { p_prompt: string; p_variant_id: string }
        Returns: undefined
      }
      ask_for_video: {
        Args: {
          p_aspect: string
          p_credits: number
          p_model: string
          p_picture_path?: string
          p_prompt: string
          p_quality: string
          p_seconds: number
          p_sound: boolean
        }
        Returns: string
      }
      ask_moments_again: { Args: { p_id: string }; Returns: undefined }
      assert_stage_running: {
        Args: { p_run_id: string; p_stage: string }
        Returns: undefined
      }
      cancel_post: { Args: { p_post_id: string }; Returns: string[] }
      continue_run: { Args: { p_run_id: string }; Returns: string }
      continue_with_ads: {
        Args: { p_ad_ids: string[]; p_run_id: string }
        Returns: string
      }
      continue_with_angles: {
        Args: { p_angle_ids: string[]; p_run_id: string }
        Returns: string
      }
      create_long_video: {
        Args: {
          p_file: Json
          p_guidance?: string
          p_title: string
          p_transcript: Json
        }
        Returns: string
      }
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
      judge_leads_again: { Args: { p_lead_id?: string }; Returns: number }
      lead_judge_fail: {
        Args: { p_error: string; p_lead_id: string; p_usage?: Json }
        Returns: undefined
      }
      lead_judged: {
        Args: {
          p_lead_id: string
          p_reasons: Json
          p_usage?: Json
          p_verdict: string
        }
        Returns: undefined
      }
      leads_record: {
        Args: { p_leads: Json; p_newest?: string }
        Returns: number
      }
      leads_sync_fail: { Args: { p_error: string }; Returns: undefined }
      leads_sync_plan: { Args: never; Returns: Json }
      leads_take_due: { Args: { p_limit?: number }; Returns: Json }
      moments_fail: {
        Args: { p_error: string; p_id: string; p_usage?: Json }
        Returns: undefined
      }
      moments_finish: {
        Args: { p_id: string; p_moments: Json; p_usage?: Json }
        Returns: undefined
      }
      moments_take_due: { Args: { p_limit?: number }; Returns: Json }
      next_scan_at: { Args: never; Returns: string }
      picture_fail: {
        Args: { p_error: string; p_variant_id: string }
        Returns: undefined
      }
      picture_finish: {
        Args: { p_path?: string; p_stand_in?: boolean; p_variant_id: string }
        Returns: Json
      }
      picture_higgsfield_begin: {
        Args: {
          p_credits: number
          p_path: string
          p_quality: string
          p_variant_id: string
        }
        Returns: Json
      }
      picture_higgsfield_fail: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      picture_higgsfield_finish: {
        Args: { p_id: string; p_path: string }
        Returns: Json
      }
      picture_higgsfield_release: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      picture_higgsfield_started: {
        Args: { p_credits?: number; p_id: string; p_job_id: string }
        Returns: undefined
      }
      picture_higgsfield_unknown: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      picture_in_flight: { Args: { p_variant_id: string }; Returns: boolean }
      picture_not_made: {
        Args: { p_message: string; p_variant_id: string }
        Returns: undefined
      }
      picture_release: {
        Args: { p_error: string; p_variant_id: string }
        Returns: undefined
      }
      picture_take_due: { Args: { p_limit?: number }; Returns: Json }
      picture_take_making: { Args: { p_limit?: number }; Returns: Json }
      pipeline_next: {
        Args: { p_run_id: string; p_stage: string }
        Returns: boolean
      }
      place_name: { Args: { p_place: string }; Returns: string }
      prune_pictures: { Args: { p_variant_id: string }; Returns: string }
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
      record_moment_run: {
        Args: {
          p_first: number
          p_id: string
          p_last: number
          p_run_id: string
          p_title: string
        }
        Returns: undefined
      }
      record_usage: {
        Args: { p_run_id: string; p_stage: string; p_usage: Json }
        Returns: undefined
      }
      reference_failed: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      reference_ready: {
        Args: { p_id: string; p_media_id: string }
        Returns: undefined
      }
      reference_release: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      reference_take_due: { Args: { p_limit?: number }; Returns: Json }
      remember_post: {
        Args: { p_note?: string; p_place: string; p_post_id: string }
        Returns: string
      }
      remove_ai_video: { Args: { p_id: string }; Returns: undefined }
      remove_brand_example: { Args: { p_id: string }; Returns: undefined }
      remove_long_video: { Args: { p_id: string }; Returns: undefined }
      remove_moment: {
        Args: { p_first: number; p_id: string; p_last: number }
        Returns: undefined
      }
      remove_picture: { Args: { p_variant_id: string }; Returns: string }
      report_continue_failure: {
        Args: { p_error: string; p_run_id: string; p_stage: string }
        Returns: undefined
      }
      report_start_failure: {
        Args: { p_error: string; p_run_id: string }
        Returns: undefined
      }
      request_picture: { Args: { p_variant_id: string }; Returns: undefined }
      reschedule_post: {
        Args: { p_local_time?: string; p_post_id: string }
        Returns: string
      }
      results_fail: {
        Args: { p_error: string; p_place: string; p_post_id: string }
        Returns: undefined
      }
      results_record: {
        Args: { p_place: string; p_post_id: string; p_results: Json }
        Returns: undefined
      }
      results_take_due: { Args: { p_limit?: number }; Returns: Json }
      retry_post: {
        Args: { p_place: string; p_post_id: string }
        Returns: undefined
      }
      run_of_variant: { Args: { p_variant_id: string }; Returns: string }
      save_long_video_edit: {
        Args: { p_edit: Json; p_id: string }
        Returns: undefined
      }
      save_moment: {
        Args: {
          p_first: number
          p_hook: string
          p_id: string
          p_last: number
          p_title: string
          p_warnings: Json
          p_was_first: number
          p_was_last: number
          p_why: string
        }
        Returns: undefined
      }
      save_variant: {
        Args: {
          p_copy: Json
          p_creative_text: string
          p_variant_id: string
          p_warnings: string[]
        }
        Returns: undefined
      }
      save_variant_design: {
        Args: { p_design: Json; p_variant_id: string }
        Returns: undefined
      }
      save_variant_words: {
        Args: {
          p_copy: Json
          p_creative_text: string
          p_posts: Json
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
      set_ads_source: { Args: { p_source: string }; Returns: undefined }
      set_competitor_tracked: {
        Args: { p_competitor_id: string; p_tracked: boolean }
        Returns: undefined
      }
      set_lead_verdict: {
        Args: { p_lead_id: string; p_note?: string; p_verdict: string }
        Returns: undefined
      }
      set_leads_source: {
        Args: { p_org?: string; p_region?: string; p_source: string }
        Returns: undefined
      }
      set_pictures_auto: { Args: { p_on: boolean }; Returns: undefined }
      set_pictures_model: {
        Args: { p_account?: string; p_model: string }
        Returns: undefined
      }
      set_pictures_quality: { Args: { p_quality: string }; Returns: undefined }
      set_post_for_real: {
        Args: { p_on: boolean; p_place: string }
        Returns: undefined
      }
      set_post_link: { Args: { p_link: string }; Returns: undefined }
      set_run_guidance: {
        Args: { p_guidance: string; p_run_id: string }
        Returns: undefined
      }
      set_run_media: {
        Args: {
          p_kind: string
          p_references?: Json
          p_run_id: string
          p_video?: Json
        }
        Returns: undefined
      }
      set_run_pick_first: {
        Args: { p_on: boolean; p_run_id: string }
        Returns: undefined
      }
      set_video_settings: {
        Args: { p_cap: number; p_live: boolean }
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
      start_run_from_ads: {
        Args: {
          p_ad_ids: string[]
          p_goal: string
          p_platforms: string[]
          p_report_id: string
          p_title?: string
        }
        Returns: string
      }
      stop_picture: { Args: { p_variant_id: string }; Returns: undefined }
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
      update_brand_memory: {
        Args: {
          p_picture_style: string
          p_post_formats: Json
          p_topics: string[]
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
      update_lead_criteria: { Args: { p_criteria: string }; Returns: undefined }
      update_long_video: {
        Args: {
          p_description: string
          p_guidance: string
          p_id: string
          p_title: string
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
      use_picture: {
        Args: { p_picture_id: string; p_variant_id: string }
        Returns: undefined
      }
      video_budget: { Args: never; Returns: Json }
      video_fail: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      video_finish: {
        Args: { p_id: string; p_path?: string; p_stand_in?: boolean }
        Returns: undefined
      }
      video_prompt_used: {
        Args: { p_long_video_id: string; p_model: string; p_usage: Json }
        Returns: undefined
      }
      video_release: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      video_started: {
        Args: { p_credits?: number; p_id: string; p_job_id: string }
        Returns: undefined
      }
      video_take_due: { Args: { p_limit?: number }; Returns: Json }
      video_take_making: { Args: { p_limit?: number }; Returns: Json }
      video_unknown: {
        Args: { p_error: string; p_id: string }
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
