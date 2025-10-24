// seed-test-data.ts
// Script to seed test data for E2E tests
// Run with: npx tsx __tests__/e2e/fixtures/seed-test-data.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

// Create Supabase client with service role
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seedTestData() {
  console.log('🌱 Seeding test data for E2E tests...');

  try {
    // Check if test users already exist
    console.log('1. Checking existing test users...');
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }

    const user1Exists = existingUsers.users.find(u => u.email === 'testuser1@example.com');
    const user2Exists = existingUsers.users.find(u => u.email === 'testuser2@example.com');

    let user1, user2;

    if (user1Exists) {
      console.log('User1 exists, updating...');
      const { data, error } = await supabase.auth.admin.updateUserById(user1Exists.id, {
        email_confirm: true,
        user_metadata: { full_name: 'Test User 1' }
      });
      if (error) {
        console.error('Error updating user1:', error);
        return;
      }
      user1 = { user: data.user };
    } else {
      console.log('Creating user1...');
      const { data, error } = await supabase.auth.admin.createUser({
        email: 'testuser1@example.com',
        password: 'testpassword123',
        user_metadata: { full_name: 'Test User 1' },
        email_confirm: true
      });
      if (error) {
        console.error('Error creating user1:', error);
        return;
      }
      user1 = data;
    }

    if (user2Exists) {
      console.log('User2 exists, updating...');
      const { data, error } = await supabase.auth.admin.updateUserById(user2Exists.id, {
        email_confirm: true,
        user_metadata: { full_name: 'Test User 2' }
      });
      if (error) {
        console.error('Error updating user2:', error);
        return;
      }
      user2 = { user: data.user };
    } else {
      console.log('Creating user2...');
      const { data, error } = await supabase.auth.admin.createUser({
        email: 'testuser2@example.com',
        password: 'testpassword123',
        user_metadata: { full_name: 'Test User 2' },
        email_confirm: true
      });
      if (error) {
        console.error('Error creating user2:', error);
        return;
      }
      user2 = data;
    }

    console.log('Users created/updated successfully');
    console.log('User1 ID:', user1.user.id);
    console.log('User2 ID:', user2.user.id);

    // Insert user profiles (assuming users table exists)
    console.log('2. Inserting user profiles...');
    const { data: insertedUser1, error: profileError1 } = await supabase
      .from('users')
      .upsert([
        {
          supabase_uid: user1.user.id,
          display_name: 'Test User 1',
          email: 'testuser1@example.com',
          role: 'member'
        }
      ], { onConflict: 'supabase_uid' })
      .select('id')
      .single();

    if (profileError1) {
      console.error('Error inserting user1 profile:', profileError1);
      return;
    }

    const { data: insertedUser2, error: profileError2 } = await supabase
      .from('users')
      .upsert([
        {
          supabase_uid: user2.user.id,
          display_name: 'Test User 2',
          email: 'testuser2@example.com',
          role: 'member'
        }
      ], { onConflict: 'supabase_uid' })
      .select('id')
      .single();

    if (profileError2) {
      console.error('Error inserting user2 profile:', profileError2);
      return;
    }

    console.log('User1 DB ID:', insertedUser1.id);
    console.log('User2 DB ID:', insertedUser2.id);

    // Create a test company
    console.log('3. Creating test company...');
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert([
        {
          name: 'Test Company'
        }
      ])
      .select('id')
      .single();

    if (companyError) {
      console.error('Error creating company:', companyError);
      return;
    }

    console.log('Company created:', company.id);

    // Associate users with company
    console.log('4. Associating users with company...');
    const { error: updateUser1Error } = await supabase
      .from('users')
      .update({ company_id: company.id })
      .eq('id', insertedUser1.id);

    if (updateUser1Error) {
      console.error('Error associating user1 with company:', updateUser1Error);
      return;
    }

    const { error: updateUser2Error } = await supabase
      .from('users')
      .update({ company_id: company.id })
      .eq('id', insertedUser2.id);

    if (updateUser2Error) {
      console.error('Error associating user2 with company:', updateUser2Error);
      return;
    }

    console.log('Users associated with company');

    // Create a DM conversation
    console.log('5. Creating DM conversation...');
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'direct',
        participants: [insertedUser1.id, insertedUser2.id]
      })
      .select()
      .single();

    if (convError) {
      console.error('Error creating conversation:', convError);
      return;
    }

    console.log('Conversation created:', conversation.id);

    // Pin the conversation for user1
    console.log('6. Pinning conversation for user1...');
    const { error: pinError } = await supabase
      .from('conversation_preferences')
      .insert({
        conversation_id: conversation.id,
        user_id: insertedUser1.id,
        is_pinned: true
      });

    if (pinError) {
      console.error('Error pinning conversation:', pinError);
      return;
    }

    console.log('Conversation pinned for user1');

    // Send a test message
    console.log('7. Sending test message...');
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: insertedUser1.id,
      content: 'Hello from test seed!'
    });

    console.log('✅ Test data seeded successfully');
    console.log('Test users: testuser1@example.com / testuser2@example.com');
    console.log('Password: testpassword123');
    console.log('Company: Test Company');
    console.log('DM conversation ID:', conversation.id);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
}

seedTestData();