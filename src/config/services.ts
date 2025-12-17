/**
 * External Services Configuration
 * Centralized configuration for OSS, Supabase and other external services
 *
 * All sensitive credentials should be set via environment variables
 */

// ============================================
// OSS Configuration (Alibaba Cloud)
// ============================================
export const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-us-west-1',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || '',
  cname: process.env.OSS_CNAME === 'true',
  endpoint: process.env.OSS_ENDPOINT || '',
  // Default upload path prefix
  uploadPrefix: process.env.OSS_UPLOAD_PREFIX || 'frontend/workflow',
} as const;

// ============================================
// Supabase Configuration
// ============================================
export const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || '',
  // anon/public key (safe for browser use)
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  // Database table name
  tableName: process.env.SUPABASE_TABLE_NAME || 'workflow_histories',
} as const;

// ============================================
// Helper function to check if services are configured
// ============================================
export const isOSSConfigured = (): boolean => {
  return !!(OSS_CONFIG.accessKeyId && OSS_CONFIG.accessKeySecret && OSS_CONFIG.bucket);
};

export const isSupabaseConfigured = (): boolean => {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
};

// ============================================
// Type Exports for Configuration
// ============================================
export type OSSConfig = typeof OSS_CONFIG;
export type SupabaseConfig = typeof SUPABASE_CONFIG;
