// src/lib/dynamo.ts
// This file now acts as a barrel file, re-exporting from the modularized dynamo functions.
// This maintains backward compatibility for existing imports.

export * from './dynamo/index';

// Note: The actual implementations have been moved to individual files
// within the src/lib/dynamo/ directory (e.g., users.ts, companies.ts, etc.).
// Generic helper functions are in utils.ts, and client initialization is in client.ts.
