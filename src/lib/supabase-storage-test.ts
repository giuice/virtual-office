// Test utility to check Supabase storage configuration and permissions
import { supabase } from '@/lib/supabase/client';

export async function testSupabaseStorageConfiguration() {
  console.group('🔍 Supabase Storage Configuration Test');
  
  try {
    // Test 1: Check if user-uploads bucket exists
    console.log('1. Testing bucket access...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Failed to list buckets:', bucketsError);
      return;
    }
    
    const userUploadsBucket = buckets?.find(bucket => bucket.name === 'user-uploads');
    if (!userUploadsBucket) {
      console.error('❌ user-uploads bucket not found');
      console.log('Available buckets:', buckets?.map(b => b.name));
      return;
    }
    
    console.log('✅ user-uploads bucket found');
    console.log('Bucket details:', userUploadsBucket);
    
    // Test 2: Check if avatars folder exists and is accessible
    console.log('2. Testing avatars folder access...');
    const { data: avatarFiles, error: avatarFilesError } = await supabase.storage
      .from('user-uploads')
      .list('avatars', { limit: 10 });
    
    if (avatarFilesError) {
      console.error('❌ Failed to list avatar files:', avatarFilesError);
      
      // Try to create the avatars folder if it doesn't exist
      console.log('Attempting to create avatars folder...');
      const { error: createError } = await supabase.storage
        .from('user-uploads')
        .upload('avatars/.gitkeep', new Blob([''], { type: 'text/plain' }));
      
      if (createError) {
        console.error('❌ Failed to create avatars folder:', createError);
      } else {
        console.log('✅ Created avatars folder');
      }
    } else {
      console.log('✅ Avatars folder accessible');
      console.log(`Found ${avatarFiles?.length || 0} files in avatars folder`);
      
      // Test 3: Test public URL generation for existing files
      if (avatarFiles && avatarFiles.length > 0) {
        console.log('3. Testing public URL generation...');
        
        for (const file of avatarFiles.slice(0, 3)) {
          const { data: { publicUrl } } = supabase.storage
            .from('user-uploads')
            .getPublicUrl(`avatars/${file.name}`);
          
          console.log(`File: ${file.name}`);
          console.log(`Public URL: ${publicUrl}`);
          
          // Test if the URL is accessible
          try {
            const response = await fetch(publicUrl, { method: 'HEAD' });
            console.log(`Status: ${response.status} ${response.statusText}`);
            console.log(`CORS headers: ${response.headers.get('access-control-allow-origin') || 'None'}`);
            
            if (response.ok) {
              console.log('✅ URL accessible');
            } else {
              console.log('❌ URL not accessible');
            }
          } catch (fetchError) {
            console.error('❌ Failed to fetch URL:', fetchError);
          }
          
          console.log('---');
        }
      }
    }
    
    // Test 4: Test upload permissions (if we have auth)
    console.log('4. Testing upload permissions...');
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      console.log('✅ User authenticated');
      
      // Try to upload a test file
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      const testFileName = `avatars/test-${Date.now()}.txt`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-uploads')
        .upload(testFileName, testBlob);
      
      if (uploadError) {
        console.error('❌ Upload test failed:', uploadError);
      } else {
        console.log('✅ Upload test successful');
        
        // Clean up test file
        await supabase.storage
          .from('user-uploads')
          .remove([testFileName]);
        
        console.log('✅ Test file cleaned up');
      }
    } else {
      console.log('⚠️ No authenticated user - skipping upload test');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error during storage test:', error);
  }
  
  console.groupEnd();
}

// Function to test a specific avatar URL
export async function testAvatarUrl(url: string) {
  console.group(`🖼️ Testing Avatar URL: ${url}`);
  
  try {
    // Test with different methods
    const methods = ['HEAD', 'GET'];
    
    for (const method of methods) {
      console.log(`Testing with ${method} request...`);
      
      try {
        const response = await fetch(url, { 
          method,
          mode: 'cors',
          cache: 'no-cache'
        });
        
        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log(`Content-Type: ${response.headers.get('content-type') || 'None'}`);
        console.log(`Content-Length: ${response.headers.get('content-length') || 'None'}`);
        console.log(`CORS: ${response.headers.get('access-control-allow-origin') || 'None'}`);
        console.log(`Cache-Control: ${response.headers.get('cache-control') || 'None'}`);
        
        if (response.ok) {
          console.log(`✅ ${method} request successful`);
        } else {
          console.log(`❌ ${method} request failed`);
        }
      } catch (fetchError) {
        console.error(`❌ ${method} request error:`, fetchError);
      }
      
      console.log('---');
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
  
  console.groupEnd();
}