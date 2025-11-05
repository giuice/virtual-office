// Quick integration test for Google avatar functionality
const { extractGoogleAvatarUrl } = require('../src/lib/avatar-utils.ts');

// Test data similar to what Google OAuth would provide
const mockGoogleOAuthData = {
  id: 'google-user-123',
  email: 'user@example.com',
  name: 'Test User',
  picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
  given_name: 'Test',
  family_name: 'User',
  locale: 'en'
};

console.log('Testing Google avatar extraction...');
console.log('Mock OAuth data:', mockGoogleOAuthData);

try {
  const extractedUrl = extractGoogleAvatarUrl(mockGoogleOAuthData);
  console.log('Extracted avatar URL:', extractedUrl);
  
  if (extractedUrl === mockGoogleOAuthData.picture) {
    console.log('✅ SUCCESS: Avatar URL extracted correctly');
  } else {
    console.log('❌ FAILED: Avatar URL not extracted correctly');
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
}

// Test with different field names
const mockWithPhotoURL = {
  ...mockGoogleOAuthData,
  picture: undefined,
  photoURL: 'https://lh3.googleusercontent.com/a/different-user=s96-c'
};

console.log('\nTesting with photoURL field...');
try {
  const extractedUrl = extractGoogleAvatarUrl(mockWithPhotoURL);
  console.log('Extracted avatar URL:', extractedUrl);
  
  if (extractedUrl === mockWithPhotoURL.photoURL) {
    console.log('✅ SUCCESS: Avatar URL extracted from photoURL correctly');
  } else {
    console.log('❌ FAILED: Avatar URL not extracted from photoURL correctly');
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
}

console.log('\n✅ Integration test completed');