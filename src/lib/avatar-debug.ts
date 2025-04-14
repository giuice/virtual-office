// src/lib/avatar-debug.ts
/**
 * This utility provides tools to debug avatar URL issues
 */

/**
 * Analyzes an avatar URL and provides diagnostic information
 * @param url The avatar URL to analyze
 * @param userId Optional user ID for logging context
 * @param componentName Optional component name for logging context
 * @returns Diagnostic information about the URL
 */
export function analyzeAvatarUrl(url: string | null | undefined, userId?: string, componentName?: string): Record<string, any> {
  // Initialize the diagnostics object
  const diagnostics: Record<string, any> = {
    isValid: false,
    type: 'unknown',
    source: 'unknown',
    isSupabaseStorage: false,
    isDataUri: false,
    isExternalUrl: false,
    urlLength: 0,
    component: componentName || 'unknown',
    userId: userId || 'unknown',
  };

  // If URL is null or undefined
  if (!url) {
    diagnostics.type = 'empty';
    diagnostics.message = 'Avatar URL is null or undefined';
    return diagnostics;
  }

  // Set the URL and its length
  diagnostics.urlLength = url.length;
  
  // Check if URL is a data URI
  if (url.startsWith('data:')) {
    diagnostics.isValid = true;
    diagnostics.type = 'data-uri';
    diagnostics.isDataUri = true;
    diagnostics.source = 'generated';
    diagnostics.message = 'Avatar is a data URI (generated SVG or other inline image)';
    return diagnostics;
  }

  // Check if URL is a Supabase storage URL
  // Pattern: https://{supabase-project-id}.supabase.co/storage/v1/object/public/{bucket}/{path}
  if (url.includes('supabase.co/storage/v1/object/public/')) {
    diagnostics.isValid = true;
    diagnostics.type = 'supabase-storage';
    diagnostics.isSupabaseStorage = true;
    diagnostics.source = 'uploaded';
    
    // Extract bucket and path
    try {
      const parts = url.split('/storage/v1/object/public/');
      const bucketAndPath = parts[1];
      const [bucket, ...pathParts] = bucketAndPath.split('/');
      diagnostics.bucket = bucket;
      diagnostics.path = pathParts.join('/');
    } catch (e) {
      diagnostics.parseError = 'Error parsing Supabase URL parts';
    }
    
    diagnostics.message = `Avatar is a Supabase storage URL (bucket: ${diagnostics.bucket || 'unknown'})`;
    return diagnostics;
  }

  // Check if URL is an external URL (starts with http/https)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    diagnostics.isValid = true;
    diagnostics.type = 'external-url';
    diagnostics.isExternalUrl = true;
    diagnostics.source = 'external';
    diagnostics.message = 'Avatar is an external URL';
    return diagnostics;
  }

  // Check if URL is a placeholder API
  if (url.startsWith('/api/placeholder')) {
    diagnostics.isValid = true;
    diagnostics.type = 'placeholder';
    diagnostics.source = 'placeholder';
    diagnostics.message = 'Avatar is a placeholder image';
    return diagnostics;
  }

  // If we got here, we have a URL but it doesn't match any expected pattern
  diagnostics.isValid = false;
  diagnostics.type = 'unknown';
  diagnostics.message = 'Avatar URL has unknown format';
  diagnostics.url = url.substring(0, 100) + (url.length > 100 ? '...' : ''); // Add truncated URL for debugging
  
  return diagnostics;
}

/**
 * Logs detailed diagnostics about an avatar URL to the console
 * @param url The avatar URL to analyze
 * @param userId Optional user ID for logging context
 * @param componentName Optional component name for logging context
 */
export function logAvatarDiagnostics(url: string | null | undefined, userId?: string, componentName?: string): void {
  if (process.env.NODE_ENV !== 'development') {
    return; // Only log in development mode
  }
  
  const diagnostics = analyzeAvatarUrl(url, userId, componentName);
  
  // Create a nicely formatted log message
  console.group(`[AvatarDebug] ${componentName || 'Unknown component'} - ${userId || 'Unknown user'}`);
  console.log(`URL: ${url ? url.substring(0, 100) + (url.length > 100 ? '...' : '') : 'null'}`);
  console.log(`Valid: ${diagnostics.isValid ? '✅' : '❌'}`);
  console.log(`Type: ${diagnostics.type}`);
  console.log(`Source: ${diagnostics.source}`);
  console.log(`Message: ${diagnostics.message}`);
  
  // Log additional details if available
  if (diagnostics.isSupabaseStorage) {
    console.log(`Bucket: ${diagnostics.bucket}`);
    console.log(`Path: ${diagnostics.path}`);
  }
  
  // End the group
  console.groupEnd();
  
  // Return the diagnostics object for possible use in the component
  return diagnostics;
}

/**
 * Test if an avatar URL is accessible by attempting to load it
 * @param url The URL to test
 * @returns A promise that resolves to an object with the test result
 */
export async function testAvatarUrlAccess(url: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Create a new image element
    const img = new Image();
    
    // Set a timeout to catch slow-loading images
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Timeout loading image' });
    }, 5000); // 5 second timeout
    
    // On successful load
    img.onload = () => {
      clearTimeout(timeout);
      resolve({ success: true });
    };
    
    // On error
    img.onerror = () => {
      clearTimeout(timeout);
      resolve({ success: false, error: 'Failed to load image' });
    };
    
    // Start loading the image
    img.src = url;
  });
}
