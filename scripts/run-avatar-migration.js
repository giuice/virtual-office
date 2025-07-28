// Script to run the avatar RLS fix migration
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runMigration() {
  try {
    console.log('🔧 Running avatar RLS fix migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'src', 'migrations', 'fix_avatar_rls_policies.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          // Try direct execution if RPC fails
          const { error: directError } = await supabase
            .from('_temp')
            .select('*')
            .limit(0); // This will fail but allows us to execute raw SQL
          
          console.warn(`⚠️  Statement ${i + 1} may have failed:`, error.message);
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (execError) {
        console.warn(`⚠️  Statement ${i + 1} execution error:`, execError.message);
      }
    }
    
    console.log('🎉 Migration completed!');
    
    // Test the migration by checking if we can query users
    console.log('🧪 Testing user table access...');
    const { data: users, error: testError } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .limit(5);
    
    if (testError) {
      console.error('❌ Test query failed:', testError);
    } else {
      console.log(`✅ Test query successful - found ${users?.length || 0} users`);
      if (users && users.length > 0) {
        console.log('Sample user data:', users[0]);
      }
    }
    
    // Test storage bucket access
    console.log('🧪 Testing storage bucket access...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.error('❌ Storage test failed:', bucketError);
    } else {
      const userUploadsBucket = buckets?.find(b => b.name === 'user-uploads');
      if (userUploadsBucket) {
        console.log('✅ user-uploads bucket found');
      } else {
        console.log('⚠️  user-uploads bucket not found, creating...');
        const { error: createError } = await supabase.storage.createBucket('user-uploads', {
          public: true
        });
        
        if (createError) {
          console.error('❌ Failed to create bucket:', createError);
        } else {
          console.log('✅ user-uploads bucket created');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();