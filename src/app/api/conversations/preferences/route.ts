// src/app/api/conversations/preferences/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { IConversationRepository } from '@/repositories/interfaces';

/**
 * GET /api/conversations/preferences?conversationId={id}
 * Get user's preferences for a specific conversation
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = new URL(request.url).searchParams;
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing required parameter: conversationId' }, { status: 400 });
    }

    // Get user database record
    const serviceSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceSupabase);
    const userProfile = await userRepository.findBySupabaseUid(authData.user.id);

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);

    // Get user's preferences for this conversation
    const preferences = await conversationRepository.getUserPreference(conversationId, userProfile.id);

    if (!preferences) {
      // Return default preferences if none exist
      return NextResponse.json({
        preferences: {
          isPinned: false,
          pinnedOrder: null,
          isStarred: false,
          isArchived: false,
          notificationsEnabled: true,
        },
      });
    }

    return NextResponse.json({
      preferences: {
        ...preferences,
        createdAt: preferences.createdAt.toISOString(),
        updatedAt: preferences.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting conversation preferences:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH /api/conversations/preferences
 * Update user's preferences for a conversation (pin, star, notifications)
 * Body: { conversationId, isPinned?, pinnedOrder?, isStarred?, notificationsEnabled? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, isPinned, pinnedOrder, isStarred, notificationsEnabled } = body;

    // Basic validation
    if (!conversationId) {
      return NextResponse.json({ error: 'Missing required field: conversationId' }, { status: 400 });
    }

    // Validate at least one preference field is provided
    if (
      isPinned === undefined &&
      pinnedOrder === undefined &&
      isStarred === undefined &&
      notificationsEnabled === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one preference field must be provided (isPinned, pinnedOrder, isStarred, notificationsEnabled)' },
        { status: 400 }
      );
    }

    // Get user database record
    const serviceSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceSupabase);
    const userProfile = await userRepository.findBySupabaseUid(authData.user.id);

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);

    // Check if the conversation exists and if the user is a participant
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Verify user is a participant in the conversation
    if (!conversation.participants.includes(userProfile.id)) {
      return NextResponse.json({ error: 'Not authorized to modify preferences for this conversation' }, { status: 403 });
    }

    // Build preferences update object
    const preferencesUpdate: any = {};
    if (isPinned !== undefined) {
      preferencesUpdate.isPinned = isPinned;
      // If unpinning, clear pinned order
      if (!isPinned) {
        preferencesUpdate.pinnedOrder = null;
      }
    }
    if (pinnedOrder !== undefined) preferencesUpdate.pinnedOrder = pinnedOrder;
    if (isStarred !== undefined) preferencesUpdate.isStarred = isStarred;
    if (notificationsEnabled !== undefined) preferencesUpdate.notificationsEnabled = notificationsEnabled;

    console.log(
      `API: Updating preferences for conversation ${conversationId} for user ${userProfile.id}:`,
      preferencesUpdate
    );

    // Update preferences
    const updatedPreferences = await conversationRepository.setUserPreference(
      conversationId,
      userProfile.id,
      preferencesUpdate
    );

    return NextResponse.json({
      success: true,
      preferences: {
        ...updatedPreferences,
        createdAt: updatedPreferences.createdAt.toISOString(),
        updatedAt: updatedPreferences.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating conversation preferences:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
