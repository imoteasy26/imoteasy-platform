export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type ListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived' | 'sold'
type AccountType = 'individual' | 'broker' | 'agency' | 'admin'
type PropertyType = 'apartment' | 'house' | 'land' | 'office' | 'shop' | 'warehouse' | 'other'
type TransactionType = 'sale' | 'rent'
type InquiryStatus = 'new' | 'read' | 'replied' | 'archived'
type OrganizationRole = 'owner' | 'agency_admin' | 'broker' | 'assistant' | 'marketing_manager' | 'read_only'
type Organization = { id: string; name: string; slug: string; organization_type: 'agency' | 'brokerage'; status: 'active' | 'suspended' | 'closed'; created_by: string; created_at: string; updated_at: string }
type OrganizationMembership = { organization_id: string; user_id: string; role: OrganizationRole; status: 'active' | 'suspended' | 'removed'; invited_by: string | null; invited_at: string | null; joined_at: string; created_at: string; updated_at: string }
type OrganizationInvitation = { id: string; organization_id: string; invitee_email: string; invited_role: Exclude<OrganizationRole, 'owner'>; token_hash: string; invited_by: string; status: 'pending' | 'accepted' | 'revoked' | 'expired'; expires_at: string; accepted_by: string | null; accepted_at: string | null; created_at: string }
type BrokerProfile = { user_id: string; headline: string | null; service_area: string | null; verification_status: 'unverified' | 'pending' | 'verified' | 'rejected'; onboarding_completed_at: string | null; onboarding_terms_version: string | null; created_at: string; updated_at: string }
type BrokerPlan = { plan_code: string; display_name: string; tier: 'starter' | 'professional' | 'enterprise'; trial_days: number; entitlements: Json; usage_limits: Json; active: boolean; created_at: string; updated_at: string }
type BrokerSubscription = { id: string; broker_user_id: string; organization_id: string; plan_code: string; status: 'trialing' | 'active' | 'expired' | 'cancelled' | 'paused'; activated_at: string; trial_started_at: string; trial_ends_at: string; created_at: string; updated_at: string }
type BrokerUsageEvent = { id: string; organization_id: string; broker_user_id: string; resource_key: string; units: number; idempotency_key: string; provider: string | null; model: string | null; cost_micro_usd: number | null; usage_metadata: Json; created_at: string }
type CrmContact = { id: string; organization_id: string; display_name: string; email: string | null; email_normalized: string | null; phone: string | null; contact_roles: string[]; source: string; assigned_to: string | null; created_by: string; communication_opt_out: boolean; created_at: string; updated_at: string }
type CrmLead = { id: string; organization_id: string; contact_id: string; listing_id: string | null; source_inquiry_id: string | null; status: 'new' | 'contacted' | 'qualified' | 'viewing_scheduled' | 'viewing_completed' | 'offer_received' | 'negotiation' | 'under_contract' | 'won' | 'lost'; priority: 'low' | 'normal' | 'high' | 'urgent'; source: string; assigned_to: string | null; next_follow_up_at: string | null; created_by: string; created_at: string; updated_at: string }
type CrmTask = { id: string; organization_id: string; lead_id: string | null; contact_id: string | null; listing_id: string | null; appointment_id: string | null; transaction_id: string | null; title: string; description: string | null; status: 'open' | 'in_progress' | 'completed' | 'cancelled'; priority: 'low' | 'normal' | 'high' | 'urgent'; due_at: string | null; assigned_to: string | null; created_by: string; completed_at: string | null; created_at: string; updated_at: string }
type BrokerAvailability = { id: string; organization_id: string; broker_user_id: string; starts_at: string; ends_at: string; recurrence_rule: string | null; status: 'available' | 'blocked' | 'cancelled'; created_at: string; updated_at: string }
type ViewingAppointment = { id: string; organization_id: string; listing_id: string; lead_id: string | null; contact_id: string | null; broker_user_id: string; scheduled_at: string; duration_minutes: number; status: 'requested' | 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'no_show'; outcome: 'interested' | 'not_interested' | 'follow_up' | 'offer_expected' | 'other' | null; internal_notes: string | null; cancellation_reason: string | null; created_by: string; created_at: string; updated_at: string }
type BrokerTransaction = { id: string; organization_id: string; listing_id: string; lead_id: string | null; seller_contact_id: string | null; buyer_contact_id: string | null; broker_user_id: string; status: 'lead' | 'qualified' | 'viewing' | 'offer' | 'negotiation' | 'due_diligence' | 'contract_preparation' | 'contract_signed' | 'completed' | 'cancelled'; asking_price_snapshot: number | null; verified_completion_at: string | null; verified_completion_by: string | null; completion_verification_note: string | null; created_by: string; created_at: string; updated_at: string }
type AttributionTouchpoint = { id: string; organization_id: string; listing_id: string | null; inquiry_id: string | null; lead_id: string | null; transaction_id: string | null; event_kind: 'broker_activation' | 'inquiry' | 'lead' | 'viewing' | 'offer' | 'completed_deal'; channel: string | null; source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null; referral_code: string | null; referrer_host: string | null; attribution_model: string; consent_context: 'service_attribution' | 'optional_marketing'; occurred_at: string; created_at: string }
type EventRow = { id: string; organization_id: string; actor_id: string | null; event_type: string; event_data: Json; created_at: string }

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        { id: string; display_name: string; phone: string | null; avatar_path: string | null; account_type: AccountType; created_at: string; updated_at: string },
        { id: string; display_name?: string; phone?: string | null; avatar_path?: string | null; account_type?: AccountType; created_at?: string; updated_at?: string }
      >
      listings: Table<
        { id: string; owner_id: string; organization_id: string | null; title: string; slug: string; description: string; property_type: PropertyType; transaction_type: TransactionType; city: string; neighborhood: string | null; price_eur: number; area_sqm: number; rooms: number | null; bedrooms: number | null; floor: number | null; total_floors: number | null; construction_type: string | null; condition: string | null; furnishing: string | null; latitude: number | null; longitude: number | null; status: ListingStatus; created_at: string; updated_at: string; published_at: string | null },
        { id?: string; owner_id: string; organization_id?: string | null; title: string; slug: string; description: string; property_type: PropertyType; transaction_type: TransactionType; city: string; neighborhood?: string | null; price_eur: number; area_sqm: number; rooms?: number | null; bedrooms?: number | null; floor?: number | null; total_floors?: number | null; construction_type?: string | null; condition?: string | null; furnishing?: string | null; latitude?: number | null; longitude?: number | null; status?: ListingStatus; created_at?: string; updated_at?: string; published_at?: string | null }
      >
      listing_images: Table<
        { id: string; listing_id: string; storage_path: string; alt_text: string; position: number; is_cover: boolean; created_at: string },
        { id?: string; listing_id: string; storage_path: string; alt_text?: string; position?: number; is_cover?: boolean; created_at?: string }
      >
      favorites: Table<
        { user_id: string; listing_id: string; created_at: string },
        { user_id: string; listing_id: string; created_at?: string }
      >
      inquiries: Table<
        { id: string; listing_id: string; sender_id: string; name: string; email: string; phone: string | null; message: string; status: InquiryStatus; created_at: string },
        { id?: string; listing_id: string; sender_id: string; name: string; email: string; phone?: string | null; message: string; status?: InquiryStatus; created_at?: string }
      >
      private_profile_details: Table<
        { user_id: string; phone: string | null },
        { user_id: string; phone?: string | null }
      >
      listing_reports: Table<
        { id: string; listing_id: string; reporter_id: string; reason: 'incorrect' | 'duplicate' | 'fraud' | 'inappropriate' | 'other'; details: string | null; status: 'new' | 'reviewed' | 'actioned'; created_at: string },
        { id?: string; listing_id: string; reporter_id: string; reason: 'incorrect' | 'duplicate' | 'fraud' | 'inappropriate' | 'other'; details?: string | null; status?: 'new' | 'reviewed' | 'actioned'; created_at?: string }
      >
      saved_searches: Table<
        { id: string; user_id: string; name: string; filters: Json; filter_hash: string; enabled: boolean; created_at: string; updated_at: string },
        { id?: string; user_id: string; name: string; filters: Json; filter_hash: string; enabled?: boolean; created_at?: string; updated_at?: string }
      >
      notifications: Table<
        { id: string; user_id: string; listing_id: string | null; type: 'saved_search_match' | 'price_drop' | 'inquiry_received'; title: string; body: string; href: string; dedupe_key: string; is_read: boolean; created_at: string },
        { id?: string; user_id: string; listing_id?: string | null; type: 'saved_search_match' | 'price_drop' | 'inquiry_received'; title: string; body: string; href: string; dedupe_key: string; is_read?: boolean; created_at?: string }
      >
      listing_price_history: Table<
        { id: string; listing_id: string; previous_price: number | null; new_price: number; changed_at: string },
        { id?: string; listing_id: string; previous_price?: number | null; new_price: number; changed_at?: string }
      >
      private_listing_details: Table<
        { listing_id: string; exact_address: string; exact_latitude: number | null; exact_longitude: number | null; created_at: string; updated_at: string },
        { listing_id: string; exact_address: string; exact_latitude?: number | null; exact_longitude?: number | null; created_at?: string; updated_at?: string }
      >
      organizations: Table<Organization, Partial<Organization>>
      organization_memberships: Table<OrganizationMembership, Partial<OrganizationMembership>>
      organization_invitations: Table<OrganizationInvitation, Partial<OrganizationInvitation>>
      organization_events: Table<EventRow & { subject_user_id: string | null }, Partial<EventRow & { subject_user_id: string | null }>>
      broker_profiles: Table<BrokerProfile, Partial<BrokerProfile>>
      broker_plan_catalog: Table<BrokerPlan, Partial<BrokerPlan>>
      broker_subscriptions: Table<BrokerSubscription, Partial<BrokerSubscription>>
      broker_usage_events: Table<BrokerUsageEvent, Partial<BrokerUsageEvent>>
      crm_contacts: Table<CrmContact, Partial<CrmContact>>
      crm_leads: Table<CrmLead, Partial<CrmLead>>
      crm_lead_events: Table<EventRow & { lead_id: string }, Partial<EventRow & { lead_id: string }>>
      broker_availability: Table<BrokerAvailability, Partial<BrokerAvailability>>
      viewing_appointments: Table<ViewingAppointment, Partial<ViewingAppointment>>
      viewing_appointment_events: Table<EventRow & { appointment_id: string }, Partial<EventRow & { appointment_id: string }>>
      transactions: Table<BrokerTransaction, Partial<BrokerTransaction>>
      transaction_events: Table<EventRow & { transaction_id: string }, Partial<EventRow & { transaction_id: string }>>
      crm_tasks: Table<CrmTask, Partial<CrmTask>>
      crm_task_events: Table<EventRow & { task_id: string }, Partial<EventRow & { task_id: string }>>
      attribution_touchpoints: Table<AttributionTouchpoint, Partial<AttributionTouchpoint>>
    }
    Views: { [_ in never]: never }
    Functions: {
      activate_broker_trial: { Args: { p_organization_id: string; p_service_area: string | null; p_terms_version: string; p_terms_accepted: boolean }; Returns: string }
      create_broker_workspace: { Args: { p_name: string; p_service_area: string | null; p_terms_version: string; p_terms_accepted: boolean }; Returns: string }
      create_organization_invitation: { Args: { p_organization_id: string; p_email: string; p_role: string; p_token_hash: string }; Returns: string }
      accept_organization_invitation: { Args: { p_token_hash: string }; Returns: string }
      leave_organization: { Args: { p_organization_id: string }; Returns: undefined }
      remove_organization_member: { Args: { p_organization_id: string; p_user_id: string }; Returns: undefined }
      convert_inquiry_to_crm_lead: { Args: { p_organization_id: string; p_inquiry_id: string; p_assigned_to?: string | null }; Returns: string }
      set_crm_lead_state: { Args: { p_lead_id: string; p_status: string; p_priority: string; p_assigned_to: string | null; p_next_follow_up_at: string | null }; Returns: undefined }
      transition_broker_transaction: { Args: { p_transaction_id: string; p_status: string }; Returns: undefined }
      verify_broker_transaction_completion: { Args: { p_transaction_id: string; p_verification_note: string }; Returns: undefined }
      capture_inquiry_attribution: { Args: { p_inquiry_id: string; p_channel: string | null; p_source: string | null; p_medium: string | null; p_campaign: string | null; p_content: string | null; p_term: string | null; p_referral_code: string | null; p_referrer_host: string | null }; Returns: boolean }
      record_broker_usage: { Args: { p_organization_id: string; p_broker_user_id: string; p_resource_key: string; p_units: number; p_idempotency_key: string; p_provider?: string | null; p_model?: string | null; p_cost_micro_usd?: number | null; p_usage_metadata?: Json }; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Row']
export type TablesInsert<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Insert']
export type TablesUpdate<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Update']
export type Listing = Tables<'listings'>
export type ListingImage = Tables<'listing_images'>
