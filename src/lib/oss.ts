import OSS from 'ali-oss';
import { OSS_CONFIG } from '@/config/services';

// Default upload path prefix (re-exported for compatibility)
export const OSS_UPLOAD_PREFIX = OSS_CONFIG.uploadPrefix;

// Re-export config for backward compatibility
export { OSS_CONFIG } from '@/config/services';

/**
 * Get OSS client instance
 * @param useEndpoint Whether to use custom endpoint (for getting custom domain URL)
 */
export const getOSSClient = (useEndpoint = false): OSS => {
  const config: OSS.Options = {
    region: OSS_CONFIG.region,
    accessKeyId: OSS_CONFIG.accessKeyId,
    accessKeySecret: OSS_CONFIG.accessKeySecret,
    bucket: OSS_CONFIG.bucket,
    cname: OSS_CONFIG.cname,
    endpoint: OSS_CONFIG.endpoint,
  };

  if (useEndpoint) {
    config.cname = OSS_CONFIG.cname;
    config.endpoint = OSS_CONFIG.endpoint;
  }

  return new OSS(config);
};

/**
 * Upload file to OSS
 * @param filePath OSS path
 * @param content File content (Buffer or file path)
 * @param useEndpoint Whether to use custom endpoint
 */
export const uploadToOSS = async (
  filePath: string,
  content: Buffer | string,
  useEndpoint = false
): Promise<string> => {
  const client = getOSSClient(useEndpoint);
  const result = await client.put(filePath, content);
  return result.url;
};

/**
 * Generate timestamped OSS path
 * @param filename File name
 * @param subFolder Subfolder (optional)
 */
export const generateOSSPath = (filename: string, subFolder?: string): string => {
  const timestamp = Date.now();
  if (subFolder) {
    return `${OSS_UPLOAD_PREFIX}/${subFolder}/${timestamp}-${filename}`;
  }
  return `${OSS_UPLOAD_PREFIX}/${timestamp}-${filename}`;
};
