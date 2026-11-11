export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type ListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived' | 'sold'
type AccountType = 'individual' | 'broker' | 'agency' | 'admin'
type PropertyType = 'apartment' | 'house' | 'land' | 'office' | 'shop' | 'warehouse' | 'other'
type TransactionType = 'sale' | 'rent'
type InquiryStatus = 'new' | 'read' | 'replied' | 'archived'

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
        { id: string; owner_id: string; title: string; slug: string; description: string; property_type: PropertyType; transaction_type: TransactionType; city: string; neighborhood: string | null; price_eur: number; area_sqm: number; rooms: number | null; bedrooms: number | null; floor: number | null; total_floors: number | null; construction_type: string | null; condition: string | null; furnishing: string | null; latitude: number | null; longitude: number | null; status: ListingStatus; created_at: string; updated_at: string; published_at: string | null },
        { id?: string; owner_id: string; title: string; slug: string; description: string; property_type: PropertyType; transaction_type: TransactionType; city: string; neighborhood?: string | null; price_eur: number; area_sqm: number; rooms?: number | null; bedrooms?: number | null; floor?: number | null; total_floors?: number | null; construction_type?: string | null; condition?: string | null; furnishing?: string | null; latitude?: number | null; longitude?: number | null; status?: ListingStatus; created_at?: string; updated_at?: string; published_at?: string | null }
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
      private_listing_details: Table<
        { listing_id: string; exact_address: string; created_at: string; updated_at: string },
        { listing_id: string; exact_address: string; created_at?: string; updated_at?: string }
      >
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Row']
export type TablesInsert<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Insert']
export type TablesUpdate<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Update']
export type Listing = Tables<'listings'>
export type ListingImage = Tables<'listing_images'>
