#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

// Create reports directory if it doesn't exist
const reportsDir = path.resolve('./test-reports');
if (!existsSync(reportsDir)) {
  mkdirSync(reportsDir, { recursive: true });
}

console.log('\n🧪 Running all tests...\n');

try {
  // Run Vitest unit tests
  console.log('📋 Running Vitest unit tests...');
  execSync('npm run test', { stdio: 'inherit' });
  console.log('✅ Vitest tests completed successfully!\n');
} catch (error) {
  console.error('❌ Vitest tests failed:', error.message);
  process.exit(1);
}

try {
  // Run Playwright API tests if a server is running
  console.log('📡 Running Playwright API tests...');
  console.log('⚠️  Make sure your development server is running on http://localhost:3000');
  console.log('⚠️  If not, start it with: npm run dev');
  
  // Prompt to continue
  console.log('\nPress Enter to continue with API tests or Ctrl+C to cancel...');
  process.stdin.resume();
  process.stdin.once('data', () => {
    try {
      execSync('npm run test:api', { stdio: 'inherit' });
      console.log('✅ Playwright API tests completed successfully!\n');
      
      console.log('🎉 All tests completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Playwright API tests failed:', error.message);
      process.exit(1);
    }
  });
} catch (error) {
  console.error('❌ Error running tests:', error.message);
  process.exit(1);
}
