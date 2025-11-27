// src/app/api/spaces/[id]/details/route.ts
// Story 3.11: API endpoint for fetching detailed space information
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/spaces/[id]/details
 * 
 * Fetches additional details for a space:
 * - agenda: Current phase information from space metadata
 * - activityLog: Recent activity in the space
 * - transcript: Latest message/transcript snippet
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: spaceId } = await params;
    
    if (!spaceId) {
      return NextResponse.json(
        { error: 'Space ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const spaceRepository = new SupabaseSpaceRepository(supabase);

    // Fetch space using repository
    const space = await spaceRepository.findById(spaceId);

    if (!space) {
      return NextResponse.json(
        { error: 'Space not found' },
        { status: 404 }
      );
    }

    // Fetch agenda from space_agendas table (AC3)
    let agenda = null;
    try {
      const { data: agendaData } = await supabase
        .from('space_agendas')
        .select('current_phase, total_phases, phase_name, phase_description')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agendaData) {
        agenda = {
          current: agendaData.current_phase,
          total: agendaData.total_phases,
          name: agendaData.phase_name,
          description: agendaData.phase_description,
        };
      }
    } catch {
      // Table may not exist yet - gracefully continue
      console.log('space_agendas table not available yet');
    }

    // For now, return empty activity log (table may not exist yet)
    const activityLog: Array<{
      id: string;
      timestamp: string;
      author: string;
      authorId: string;
      summary: string;
      type: string;
    }> = [];

    // Try to fetch latest message for transcript snippet
    // Messages are linked to spaces via conversations.room_id
    let transcript = null;
    try {
      // First find the conversation for this space
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('room_id', spaceId)
        .limit(1)
        .maybeSingle();

      if (conversation) {
        // Get the latest message from this conversation
        const { data: messages } = await supabase
          .from('messages')
          .select('id, content, sender_id, timestamp')
          .eq('conversation_id', conversation.id)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (messages && messages.length > 0) {
          const msg = messages[0];
          // Get sender info from users table
          const { data: sender } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', msg.sender_id)
            .single();
          
          transcript = {
            text: msg.content || '',
            speaker: sender?.display_name || 'Unknown',
            timestamp: msg.timestamp,
          };
        }
      }
    } catch {
      // Gracefully continue without transcript if query fails
    }

    return NextResponse.json({
      agenda,
      activityLog,
      transcript,
    });

  } catch (error) {
    console.error('Error fetching space details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
