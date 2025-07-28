// Test script to check if avatar URLs are accessible
import fetch from 'node-fetch';

const testUrl = 'https://lh3.googleusercontent.com/a/ACg8ocLxvxWtCy6XLamwQ50zTr87Y3t5ND6SDMZf3XCExLBrVEEUmcS_vg=s96-c';

async function testAvatarUrl(url) {
  console.log(`🧪 Testing avatar URL: ${url}`);
  
  try {
    const response = await fetch(url, { method: 'HEAD' });
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    console.log(`Content-Length: ${response.headers.get('content-length')}`);
    console.log(`CORS: ${response.headers.get('access-control-allow-origin') || 'None'}`);
    
    if (response.ok) {
      console.log('✅ Avatar URL is accessible');
    } else {
      console.log('❌ Avatar URL is not accessible');
    }
  } catch (error) {
    console.error('❌ Error testing avatar URL:', error.message);
  }
}

testAvatarUrl(testUrl);