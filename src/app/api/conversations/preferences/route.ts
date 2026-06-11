// src/app/api/conversations/preferences/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { IConversationRepository } from '@/repositories/interfaces';
import { isAuthzFailure, requireConversationParticipant } from '@/lib/auth/authorize';

/**
 * GET /api/conversations/preferences?conversationId={id}
 * Get user's preferences for a specific conversation
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing required parameter: conversationId' }, { status: 400 });
    }

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(ctx.serviceClient);

    // Get user's preferences for this conversation
    const preferences = await conversationRepository.getUserPreference(conversationId, ctx.dbUser.id);

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

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(ctx.serviceClient);

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
      `API: Updating preferences for conversation ${conversationId} for user ${ctx.dbUser.id}:`,
      preferencesUpdate
    );

    // Update preferences
    const updatedPreferences = await conversationRepository.setUserPreference(
      conversationId,
      ctx.dbUser.id,
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
