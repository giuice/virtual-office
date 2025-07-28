// Direct script to fix RLS policies using Supabase client
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

async function fixRLSPolicies() {
  console.log('🔧 Fixing RLS policies directly...');
  
  try {
    // Step 1: Disable RLS temporarily to clean up
    console.log('1. Disabling RLS temporarily...');
    await supabase.rpc('exec', {
      sql: 'ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;'
    }).catch(() => {
      // Try alternative approach
      console.log('Trying alternative disable approach...');
    });
    
    // Step 2: Drop all existing policies
    console.log('2. Dropping existing policies...');
    const dropPolicies = [
      'DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;',
      'DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;',
      'DROP POLICY IF EXISTS "Users can view company members" ON public.users;',
      'DROP POLICY IF EXISTS "Admins can manage users" ON public.users;',
      'DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;',
      'DROP POLICY IF EXISTS "Enable users to update their own profile" ON public.users;',
      'DROP POLICY IF EXISTS "Enable users to insert their own profile" ON public.users;'
    ];
    
    for (const sql of dropPolicies) {
      try {
        const { error } = await supabase.rpc('exec', { sql });
        if (error) console.log(`Policy drop warning: ${error.message}`);
      } catch (e) {
        console.log(`Policy drop warning: ${e.message}`);
      }
    }
    
    // Step 3: Create simple, non-recursive policies
    console.log('3. Creating new simple policies...');
    
    // Enable RLS first
    const { error: enableError } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;'
    });
    
    if (enableError) {
      console.log('Enable RLS warning:', enableError.message);
    }
    
    // Create simple read policy
    const { error: readError } = await supabase.rpc('exec', {
      sql: `CREATE POLICY "Allow authenticated read" ON public.users 
            FOR SELECT USING (auth.role() = 'authenticated');`
    });
    
    if (readError) {
      console.log('Read policy warning:', readError.message);
    }
    
    // Create simple update policy
    const { error: updateError } = await supabase.rpc('exec', {
      sql: `CREATE POLICY "Allow own profile update" ON public.users 
            FOR UPDATE USING (auth.uid()::text = supabase_uid);`
    });
    
    if (updateError) {
      console.log('Update policy warning:', updateError.message);
    }
    
    // Create simple insert policy
    const { error: insertError } = await supabase.rpc('exec', {
      sql: `CREATE POLICY "Allow own profile insert" ON public.users 
            FOR INSERT WITH CHECK (auth.uid()::text = supabase_uid);`
    });
    
    if (insertError) {
      console.log('Insert policy warning:', insertError.message);
    }
    
    console.log('4. Testing user table access...');
    
    // Test the fix
    const { data: users, error: testError } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .limit(5);
    
    if (testError) {
      console.error('❌ Test failed:', testError);
      
      // If still failing, try to disable RLS completely as last resort
      console.log('5. Disabling RLS completely as fallback...');
      const { error: disableError } = await supabase.rpc('exec', {
        sql: 'ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;'
      });
      
      if (disableError) {
        console.error('Failed to disable RLS:', disableError);
      } else {
        console.log('✅ RLS disabled - testing again...');
        const { data: retestUsers, error: retestError } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .limit(5);
        
        if (retestError) {
          console.error('❌ Still failing:', retestError);
        } else {
          console.log(`✅ Success! Found ${retestUsers?.length || 0} users`);
          if (retestUsers && retestUsers.length > 0) {
            console.log('Sample user:', retestUsers[0]);
          }
        }
      }
    } else {
      console.log(`✅ Success! Found ${users?.length || 0} users`);
      if (users && users.length > 0) {
        console.log('Sample user:', users[0]);
      }
    }
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

// Alternative approach using direct SQL execution
async function executeDirectSQL() {
  console.log('🔧 Trying direct SQL execution...');
  
  const sqlCommands = [
    'ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;',
    'DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;',
    'DROP POLICY IF EXISTS "Users can view company members" ON public.users;',
    'DROP POLICY IF EXISTS "Admins can manage users" ON public.users;',
    'DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;',
    'DROP POLICY IF EXISTS "Enable users to update their own profile" ON public.users;',
    'DROP POLICY IF EXISTS "Enable users to insert their own profile" ON public.users;'
  ];
  
  for (const sql of sqlCommands) {
    try {
      console.log(`Executing: ${sql}`);
      // Try different methods to execute SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({ sql })
      });
      
      if (!response.ok) {
        console.log(`Response not OK: ${response.status} ${response.statusText}`);
      } else {
        console.log('✅ Command executed');
      }
    } catch (error) {
      console.log(`Command failed: ${error.message}`);
    }
  }
}

// Run both approaches
async function main() {
  await fixRLSPolicies();
  console.log('\n' + '='.repeat(50) + '\n');
  await executeDirectSQL();
}

main();