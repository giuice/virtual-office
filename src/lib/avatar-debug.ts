// Debug utility to test avatar URL resolution and loading
import { supabase } from '@/lib/supabase/client';

export interface AvatarDebugInfo {
  url: string;
  accessible: boolean;
  error?: string;
  corsEnabled?: boolean;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
}

export async function debugAvatarUrl(url: string): Promise<AvatarDebugInfo> {
  const debugInfo: AvatarDebugInfo = {
    url,
    accessible: false,
  };

  try {
    // Test if URL is accessible
    const response = await fetch(url, { 
      method: 'HEAD',
      mode: 'cors' 
    });
    
    debugInfo.responseStatus = response.status;
    debugInfo.accessible = response.ok;
    debugInfo.corsEnabled = response.headers.get('access-control-allow-origin') !== null;
    
    // Collect response headers for debugging
    debugInfo.responseHeaders = {};
    response.headers.forEach((value, key) => {
      debugInfo.responseHeaders![key] = value;
    });
    
    if (!response.ok) {
      debugInfo.error = `HTTP ${response.status}: ${response.statusText}`;
    }
  } catch (error) {
    debugInfo.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return debugInfo;
}

export async function testSupabaseStorageAccess(): Promise<{
  bucketExists: boolean;
  publicAccess: boolean;
  sampleUrls: AvatarDebugInfo[];
}> {
  const result = {
    bucketExists: false,
    publicAccess: false,
    sampleUrls: [] as AvatarDebugInfo[],
  };

  try {
    // Test if user-uploads bucket exists and is accessible
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return result;
    }

    const userUploadsBucket = buckets?.find(bucket => bucket.name === 'user-uploads');
    result.bucketExists = !!userUploadsBucket;

    if (userUploadsBucket) {
      // Test public access by trying to list files
      const { data: files, error: filesError } = await supabase.storage
        .from('user-uploads')
        .list('avatars', { limit: 5 });

      if (!filesError && files) {
        result.publicAccess = true;
        
        // Test a few sample URLs
        for (const file of files.slice(0, 3)) {
          const { data: { publicUrl } } = supabase.storage
            .from('user-uploads')
            .getPublicUrl(`avatars/${file.name}`);
          
          const debugInfo = await debugAvatarUrl(publicUrl);
          result.sampleUrls.push(debugInfo);
        }
      }
    }
  } catch (error) {
    console.error('Error testing Supabase storage access:', error);
  }

  return result;
}

export function logAvatarDebugInfo(info: AvatarDebugInfo) {
  console.group(`🖼️ Avatar Debug: ${info.url}`);
  console.log(`✅ Accessible: ${info.accessible}`);
  console.log(`🌐 CORS Enabled: ${info.corsEnabled}`);
  console.log(`📊 Status: ${info.responseStatus}`);
  
  if (info.error) {
    console.error(`❌ Error: ${info.error}`);
  }
  
  if (info.responseHeaders) {
    console.log('📋 Headers:', info.responseHeaders);
  }
  
  console.groupEnd();
}