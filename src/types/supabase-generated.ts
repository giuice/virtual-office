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
			announcements: {
				Row: {
					company_id: string
					content: string
					expiration: string | null
					id: string
					posted_by: string | null
					priority: Database["public"]["Enums"]["announcement_priority"] | null
					timestamp: string
					title: string
				}
				Insert: {
					company_id: string
					content: string
					expiration?: string | null
					id?: string
					posted_by?: string | null
					priority?: Database["public"]["Enums"]["announcement_priority"] | null
					timestamp?: string
					title: string
				}
				Update: {
					company_id?: string
					content?: string
					expiration?: string | null
					id?: string
					posted_by?: string | null
					priority?: Database["public"]["Enums"]["announcement_priority"] | null
					timestamp?: string
					title?: string
				}
				Relationships: [
					{
						foreignKeyName: "announcements_company_id_fkey"
						columns: ["company_id"]
						isOneToOne: false
						referencedRelation: "companies"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "announcements_posted_by_fkey"
						columns: ["posted_by"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
				]
			}
			companies: {
				Row: {
					admin_ids: string[] | null
					created_at: string
					id: string
					name: string
					settings: Json | null
				}
				Insert: {
					admin_ids?: string[] | null
					created_at?: string
					id?: string
					name: string
					settings?: Json | null
				}
				Update: {
					admin_ids?: string[] | null
					created_at?: string
					id?: string
					name?: string
					settings?: Json | null
				}
				Relationships: []
			}
			conversation_preferences: {
				Row: {
					conversation_id: string
					created_at: string
					id: string
					is_archived: boolean
					is_pinned: boolean
					is_starred: boolean
					notifications_enabled: boolean
					pinned_order: number | null
					updated_at: string
					user_id: string
				}
				Insert: {
					conversation_id: string
					created_at?: string
					id?: string
					is_archived?: boolean
					is_pinned?: boolean
					is_starred?: boolean
					notifications_enabled?: boolean
					pinned_order?: number | null
					updated_at?: string
					user_id: string
				}
				Update: {
					conversation_id?: string
					created_at?: string
					id?: string
					is_archived?: boolean
					is_pinned?: boolean
					is_starred?: boolean
					notifications_enabled?: boolean
					pinned_order?: number | null
					updated_at?: string
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "conversation_preferences_conversation_id_fkey"
						columns: ["conversation_id"]
						isOneToOne: false
						referencedRelation: "conversations"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "conversation_preferences_user_id_fkey"
						columns: ["user_id"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
				]
			}
			conversations: {
				Row: {
					created_at: string
					created_by: string
					id: string
					is_group: boolean
					last_message_at: string | null
					metadata: Json | null
					name: string | null
					participants: string[]
					space_id: string | null
					type: Database["public"]["Enums"]["conversation_type"]
					updated_at: string
					visibility: Database["public"]["Enums"]["conversation_visibility_type"]
				}
				Insert: {
					created_at?: string
					created_by: string
					id?: string
					is_group?: boolean
					last_message_at?: string | null
					metadata?: Json | null
					name?: string | null
					participants: string[]
					space_id?: string | null
					type?: Database["public"]["Enums"]["conversation_type"]
					updated_at?: string
					visibility?: Database["public"]["Enums"]["conversation_visibility_type"]
				}
				Update: {
					created_at?: string
					created_by?: string
					id?: string
					is_group?: boolean
					last_message_at?: string | null
					metadata?: Json | null
					name?: string | null
					participants?: string[]
					space_id?: string | null
					type?: Database["public"]["Enums"]["conversation_type"]
					updated_at?: string
					visibility?: Database["public"]["Enums"]["conversation_visibility_type"]
				}
				Relationships: [
					{
						foreignKeyName: "conversations_created_by_fkey"
						columns: ["created_by"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "conversations_space_id_fkey"
						columns: ["space_id"]
						isOneToOne: false
						referencedRelation: "spaces"
						referencedColumns: ["id"]
					},
				]
			}
			invitations: {
				Row: {
					company_id: string
					created_at: string
					email: string
					expires_at: number
					id: string
					role: Database["public"]["Enums"]["user_role"]
					status: Database["public"]["Enums"]["invitation_status"]
					token: string
				}
				Insert: {
					company_id: string
					created_at?: string
					email: string
					expires_at: number
					id?: string
					role: Database["public"]["Enums"]["user_role"]
					status?: Database["public"]["Enums"]["invitation_status"]
					token: string
				}
				Update: {
					company_id?: string
					created_at?: string
					email?: string
					expires_at?: number
					id?: string
					role?: Database["public"]["Enums"]["user_role"]
					status?: Database["public"]["Enums"]["invitation_status"]
					token?: string
				}
				Relationships: [
					{
						foreignKeyName: "invitations_company_id_fkey"
						columns: ["company_id"]
						isOneToOne: false
						referencedRelation: "companies"
						referencedColumns: ["id"]
					},
				]
			}
			meeting_notes: {
				Row: {
					action_items: Json | null
					created_at: string
					edited_by: string | null
					generated_by: Database["public"]["Enums"]["note_generator"]
					id: string
					meeting_date: string
					room_id: string
					summary: string
					title: string
					transcript: string | null
					updated_at: string
				}
				Insert: {
					action_items?: Json | null
					created_at?: string
					edited_by?: string | null
					generated_by: Database["public"]["Enums"]["note_generator"]
					id?: string
					meeting_date: string
					room_id: string
					summary: string
					title: string
					transcript?: string | null
					updated_at?: string
				}
				Update: {
					action_items?: Json | null
					created_at?: string
					edited_by?: string | null
					generated_by?: Database["public"]["Enums"]["note_generator"]
					id?: string
					meeting_date?: string
					room_id?: string
					summary?: string
					title?: string
					transcript?: string | null
					updated_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "meeting_notes_edited_by_fkey"
						columns: ["edited_by"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "meeting_notes_room_id_fkey"
						columns: ["room_id"]
						isOneToOne: false
						referencedRelation: "spaces"
						referencedColumns: ["id"]
					},
				]
			}
			message_read_receipts: {
				Row: {
					id: string
					message_id: string
					read_at: string
					user_id: string
				}
				Insert: {
					id?: string
					message_id: string
					read_at?: string
					user_id: string
				}
				Update: {
					id?: string
					message_id?: string
					read_at?: string
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "message_read_receipts_message_id_fkey"
						columns: ["message_id"]
						isOneToOne: false
						referencedRelation: "messages"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "message_read_receipts_user_id_fkey"
						columns: ["user_id"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
				]
			}
			messages: {
				Row: {
					attachments: Json | null
					content: string
					conversation_id: string
					created_at: string
					id: string
					reactions: Json | null
					sender_id: string
					status: Database["public"]["Enums"]["message_status"]
					type: Database["public"]["Enums"]["message_type"]
					updated_at: string
				}
				Insert: {
					attachments?: Json | null
					content: string
					conversation_id: string
					created_at?: string
					id?: string
					reactions?: Json | null
					sender_id: string
					status?: Database["public"]["Enums"]["message_status"]
					type?: Database["public"]["Enums"]["message_type"]
					updated_at?: string
				}
				Update: {
					attachments?: Json | null
					content?: string
					conversation_id?: string
					created_at?: string
					id?: string
					reactions?: Json | null
					sender_id?: string
					status?: Database["public"]["Enums"]["message_status"]
					type?: Database["public"]["Enums"]["message_type"]
					updated_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "messages_conversation_id_fkey"
						columns: ["conversation_id"]
						isOneToOne: false
						referencedRelation: "conversations"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "messages_sender_id_fkey"
						columns: ["sender_id"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
				]
			}
			pinned_messages: {
				Row: {
					conversation_id: string
					id: string
					message_id: string
					pinned_at: string
					pinned_by: string
				}
				Insert: {
					conversation_id: string
					id?: string
					message_id: string
					pinned_at?: string
					pinned_by: string
				}
				Update: {
					conversation_id?: string
					id?: string
					message_id?: string
					pinned_at?: string
					pinned_by?: string
				}
				Relationships: [
					{
						foreignKeyName: "message_pins_message_id_fkey"
						columns: ["message_id"]
						isOneToOne: false
						referencedRelation: "messages"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "message_pins_user_id_fkey"
						columns: ["pinned_by"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "pinned_messages_conversation_id_fkey"
						columns: ["conversation_id"]
						isOneToOne: false
						referencedRelation: "conversations"
						referencedColumns: ["id"]
					},
				]
			}
			spaces: {
				Row: {
					access_control: Json
					capacity: number
					company_id: string
					created_at: string
					created_by: string | null
					description: string | null
					features: string[] | null
					id: string
					is_template: boolean
					name: string
					position: Json
					status: Database["public"]["Enums"]["space_status"]
					template_name: string | null
					type: Database["public"]["Enums"]["space_type"]
					updated_at: string
				}
				Insert: {
					access_control?: Json
					capacity?: number
					company_id: string
					created_at?: string
					created_by?: string | null
					description?: string | null
					features?: string[] | null
					id?: string
					is_template?: boolean
					name: string
					position?: Json
					status?: Database["public"]["Enums"]["space_status"]
					template_name?: string | null
					type?: Database["public"]["Enums"]["space_type"]
					updated_at?: string
				}
				Update: {
					access_control?: Json
					capacity?: number
					company_id?: string
					created_at?: string
					created_by?: string | null
					description?: string | null
					features?: string[] | null
					id?: string
					is_template?: boolean
					name?: string
					position?: Json
					status?: Database["public"]["Enums"]["space_status"]
					template_name?: string | null
					type?: Database["public"]["Enums"]["space_type"]
					updated_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "spaces_company_id_fkey"
						columns: ["company_id"]
						isOneToOne: false
						referencedRelation: "companies"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "spaces_created_by_fkey"
						columns: ["created_by"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
				]
			}
			starred_messages: {
				Row: {
					conversation_id: string
					id: string
					message_id: string
					starred_at: string
					user_id: string
				}
				Insert: {
					conversation_id: string
					id?: string
					message_id: string
					starred_at?: string
					user_id: string
				}
				Update: {
					conversation_id?: string
					id?: string
					message_id?: string
					starred_at?: string
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "message_stars_message_id_fkey"
						columns: ["message_id"]
						isOneToOne: false
						referencedRelation: "messages"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "message_stars_user_id_fkey"
						columns: ["user_id"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "starred_messages_conversation_id_fkey"
						columns: ["conversation_id"]
						isOneToOne: false
						referencedRelation: "conversations"
						referencedColumns: ["id"]
					},
				]
			}
			users: {
				Row: {
					avatar_url: string | null
					company_id: string | null
					created_at: string
					current_space_id: string | null
					display_name: string
					email: string
					id: string
					last_active: string
					preferences: Json | null
					role: Database["public"]["Enums"]["user_role"]
					status: Database["public"]["Enums"]["user_status"]
					status_message: string | null
					supabase_uid: string
				}
				Insert: {
					avatar_url?: string | null
					company_id?: string | null
					created_at?: string
					current_space_id?: string | null
					display_name: string
					email: string
					id?: string
					last_active?: string
					preferences?: Json | null
					role?: Database["public"]["Enums"]["user_role"]
					status?: Database["public"]["Enums"]["user_status"]
					status_message?: string | null
					supabase_uid: string
				}
				Update: {
					avatar_url?: string | null
					company_id?: string | null
					created_at?: string
					current_space_id?: string | null
					display_name?: string
					email?: string
					id?: string
					last_active?: string
					preferences?: Json | null
					role?: Database["public"]["Enums"]["user_role"]
					status?: Database["public"]["Enums"]["user_status"]
					status_message?: string | null
					supabase_uid?: string
				}
				Relationships: [
					{
						foreignKeyName: "users_company_id_fkey"
						columns: ["company_id"]
						isOneToOne: false
						referencedRelation: "companies"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "users_current_space_id_fkey"
						columns: ["current_space_id"]
						isOneToOne: false
						referencedRelation: "spaces"
						referencedColumns: ["id"]
					},
				]
			}
		}
		Views: {
			[_ in never]: never
		}
		Functions: {
			create_default_conversation_preference: {
				Args: Record<PropertyKey, never>
				Returns: unknown
			}
		}
		Enums: {
			announcement_priority: "low" | "medium" | "high"
			conversation_type: "direct" | "group" | "room"
			conversation_visibility_type: "public" | "private" | "direct"
			invitation_status: "pending" | "accepted" | "expired"
			member_role_type: "member" | "admin" | "director"
			message_status: "sending" | "sent" | "delivered" | "read" | "failed"
			message_type: "text" | "image" | "file" | "system" | "announcement"
			note_generator: "ai" | "user"
			session_type_enum: "meeting" | "workspace" | "conference"
			space_status:
			| "active"
			| "available"
			| "maintenance"
			| "locked"
			| "reserved"
			| "in_use"
			space_type:
			| "workspace"
			| "conference"
			| "social"
			| "breakout"
			| "private_office"
			| "open_space"
			| "lounge"
			| "lab"
			user_role: "admin" | "member"
			user_status: "online" | "away" | "busy" | "offline"
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
}

type PublicSchema = Database[Extract<keyof Database, "public">]

// Helper type to extract schemas that have the standard Supabase structure
type GenericSchema = {
	Tables: Record<string, unknown>
	Views: Record<string, unknown>
	Enums: Record<string, unknown>
	CompositeTypes: Record<string, unknown>
}

export type Tables<
	PublicTableNameOrOptions extends
	| keyof (PublicSchema["Tables"] & PublicSchema["Views"])
	| { schema: keyof Database },
	TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions["schema"]] extends GenericSchema
		? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
			Database[PublicTableNameOrOptions["schema"]]["Views"])
		: never
	: never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions["schema"]] extends GenericSchema
		? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
			Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
				Row: infer R
			}
			? R
			: never
		: never
	: PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
		PublicSchema["Views"])
	? (PublicSchema["Tables"] &
		PublicSchema["Views"])[PublicTableNameOrOptions] extends {
			Row: infer R
		}
	? R
	: never
	: never

export type TablesInsert<
	PublicTableNameOrOptions extends
	| keyof PublicSchema["Tables"]
	| { schema: keyof Database },
	TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions["schema"]] extends GenericSchema
		? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
		: never
	: never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions["schema"]] extends GenericSchema
		? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I
		}
			? I
			: never
		: never
	: PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
	? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
		Insert: infer I
	}
	? I
	: never
	: never

export type TablesUpdate<
	PublicTableNameOrOptions extends
	| keyof PublicSchema["Tables"]
	| { schema: keyof Database },
	TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions["schema"]] extends GenericSchema
		? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
		: never
	: never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions["schema"]] extends GenericSchema
		? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U
		}
			? U
			: never
		: never
	: PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
	? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
		Update: infer U
	}
	? U
	: never
	: never

export type Enums<
	PublicEnumNameOrOptions extends
	| keyof PublicSchema["Enums"]
	| { schema: keyof Database },
	EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
	? Database[PublicEnumNameOrOptions["schema"]] extends GenericSchema
		? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
		: never
	: never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
	? Database[PublicEnumNameOrOptions["schema"]] extends GenericSchema
		? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
		: never
	: PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
	? PublicSchema["Enums"][PublicEnumNameOrOptions]
	: never

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
	| keyof PublicSchema["CompositeTypes"]
	| { schema: keyof Database },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof Database
	}
	? Database[PublicCompositeTypeNameOrOptions["schema"]] extends GenericSchema
		? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never
	: never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
	? Database[PublicCompositeTypeNameOrOptions["schema"]] extends GenericSchema
		? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
		: never
	: PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
	? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
	: never
