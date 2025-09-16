#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const args = process.argv.slice(2);
const shouldExecute = args.includes('--execute');

function normalizeParticipants(participants) {
  if (!Array.isArray(participants)) {
    return [];
  }
  return Array.from(new Set(participants.filter(Boolean))).sort();
}

function participantsFingerprint(participants) {
  return normalizeParticipants(participants).join(':');
}

async function fetchConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, type, participants, created_at, room_id');

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function repairMessages(duplicateId, canonicalId) {
  const { error } = await supabase
    .from('messages')
    .update({ conversation_id: canonicalId })
    .eq('conversation_id', duplicateId);

  if (error) {
    throw error;
  }
}

async function deleteConversation(conversationId) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    throw error;
  }
}

async function dedupeDirectConversations(conversations) {
  const groups = new Map();

  for (const conversation of conversations.filter(c => c.type === 'direct')) {
    const key = participantsFingerprint(conversation.participants);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(conversation);
  }

  for (const [key, group] of groups.entries()) {
    if (group.length <= 1) continue;

    const sortedGroup = group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const canonical = sortedGroup[0];
    const duplicates = sortedGroup.slice(1);

    console.log(`Direct conversation fingerprint ${key} has ${group.length} entries. Canonical: ${canonical.id}. Duplicates: ${duplicates.map(d => d.id).join(', ')}`);

    if (!shouldExecute) {
      continue;
    }

    for (const duplicate of duplicates) {
      console.log(`  -> Reassigning messages from ${duplicate.id} to ${canonical.id}`);
      await repairMessages(duplicate.id, canonical.id);
      console.log(`  -> Deleting duplicate conversation ${duplicate.id}`);
      await deleteConversation(duplicate.id);
    }
  }
}

async function dedupeRoomConversations(conversations) {
  const groups = new Map();

  for (const conversation of conversations.filter(c => c.type === 'room' && conversation.room_id)) {
    const key = conversation.room_id;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(conversation);
  }

  for (const [roomId, group] of groups.entries()) {
    if (group.length <= 1) continue;

    const sortedGroup = group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const canonical = sortedGroup[0];
    const duplicates = sortedGroup.slice(1);

    console.log(`Room ${roomId} has ${group.length} conversations. Canonical: ${canonical.id}. Duplicates: ${duplicates.map(d => d.id).join(', ')}`);

    if (!shouldExecute) {
      continue;
    }

    for (const duplicate of duplicates) {
      console.log(`  -> Reassigning messages from ${duplicate.id} to ${canonical.id}`);
      await repairMessages(duplicate.id, canonical.id);
      console.log(`  -> Deleting duplicate conversation ${duplicate.id}`);
      await deleteConversation(duplicate.id);
    }
  }
}

(async function main() {
  console.log(`Running conversation de-duplication (${shouldExecute ? 'EXECUTE' : 'DRY RUN'})`);

  try {
    const conversations = await fetchConversations();
    console.log(`Fetched ${conversations.length} conversations.`);

    await dedupeDirectConversations(conversations);
    await dedupeRoomConversations(conversations);

    if (!shouldExecute) {
      console.log('Dry run complete. Re-run with --execute to apply changes.');
    } else {
      console.log('De-duplication run completed.');
    }
  } catch (error) {
    console.error('De-duplication failed:', error);
    process.exitCode = 1;
  }
})();
