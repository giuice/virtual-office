/**
 * Image upload utility functions for handling profile pictures and other image uploads
 */

/**
 * Maximum image size in bytes (2MB)
 */
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/**
 * Allowed image MIME types
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

/**
 * Error types for image validation
 */
export type ImageValidationErrorType = 
  | 'too-large'
  | 'wrong-format'
  | 'unknown';

/**
 * Image validation error
 */
export class ImageValidationError extends Error {
  type: ImageValidationErrorType;

  constructor(message: string, type: ImageValidationErrorType = 'unknown') {
    super(message);
    this.name = 'ImageValidationError';
    this.type = type;
  }
}

/**
 * Validates an image file
 * @param file The file to validate
 * @param options Optional validation options
 * @returns The valid file
 * @throws ImageValidationError if validation fails
 */
export function validateImage(
  file: File, 
  options: {
    maxSize?: number;
    allowedTypes?: string[];
  } = {}
): File {
  const { 
    maxSize = MAX_IMAGE_SIZE, 
    allowedTypes = ALLOWED_IMAGE_TYPES 
  } = options;

  // Check file size
  if (file.size > maxSize) {
    throw new ImageValidationError(
      `Image too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is ${(maxSize / 1024 / 1024).toFixed(2)}MB.`,
      'too-large'
    );
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    throw new ImageValidationError(
      `Invalid image format. Allowed formats: ${allowedTypes.map(t => t.replace('image/', '')).join(', ')}`,
      'wrong-format'
    );
  }

  return file;
}

/**
 * Creates a preview URL for an image file
 * @param file The image file
 * @returns A URL that can be used to preview the image
 */
export function createImagePreview(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revokes a preview URL created with createImagePreview
 * @param url The preview URL to revoke
 */
export function revokeImagePreview(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Compresses an image file to reduce its size
 * @param file The image file to compress
 * @param options Compression options
 * @returns A promise that resolves to the compressed file
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    type?: string;
  } = {}
): Promise<File> {
  const { 
    maxWidth = 1200, 
    maxHeight = 1200, 
    quality = 0.8,
    type = file.type 
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      
      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      
      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          
          // Create new file
          const compressedFile = new File(
            [blob], 
            file.name.replace(/\.[^/.]+$/, "") + '.' + type.split('/')[1], 
            { type }
          );
          
          resolve(compressedFile);
        },
        type,
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
  });
}

/**
 * Uploads an image to the server
 * @param file The image file to upload
 * @param endpoint The API endpoint to upload to
 * @param options Upload options
 * @returns A promise that resolves to the server response
 */
export async function uploadImage<T = any>(
  file: File,
  endpoint: string,
  options: {
    formFieldName?: string;
    additionalData?: Record<string, string>;
    headers?: Record<string, string>;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<T> {
  const {
    formFieldName = 'image',
    additionalData = {},
    headers = {},
    onProgress,
  } = options;

  // Create form data
  const formData = new FormData();
  formData.append(formFieldName, file);
  
  // Add additional data
  Object.entries(additionalData).forEach(([key, value]) => {
    formData.append(key, value);
  });

  // Use XMLHttpRequest to track upload progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Track progress if callback provided
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
    }
    
    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject(new Error('Failed to parse server response'));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });
    
    // Open and send request
    xhr.open('POST', endpoint);
    
    // Add headers
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    
    xhr.send(formData);
  });
}

/**
 * Helper function to handle the complete image upload flow:
 * 1. Validate the image
 * 2. Compress it if needed
 * 3. Upload to the server
 * 
 * @param file The image file to process
 * @param endpoint The API endpoint to upload to
 * @param options Processing and upload options
 * @returns A promise that resolves to the server response
 */
export async function processAndUploadImage<T = any>(
  file: File,
  endpoint: string,
  options: {
    validation?: {
      maxSize?: number;
      allowedTypes?: string[];
    };
    compression?: {
      enabled?: boolean;
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
    };
    upload?: {
      formFieldName?: string;
      additionalData?: Record<string, string>;
      headers?: Record<string, string>;
      onProgress?: (progress: number) => void;
    };
  } = {}
): Promise<T> {
  const {
    validation = {},
    compression = { enabled: true },
    upload = {},
  } = options;
  
  // Step 1: Validate the image
  const validatedFile = validateImage(file, validation);
  
  // Step 2: Compress if enabled
  let processedFile = validatedFile;
  if (compression.enabled) {
    processedFile = await compressImage(validatedFile, {
      maxWidth: compression.maxWidth,
      maxHeight: compression.maxHeight,
      quality: compression.quality,
    });
  }
  
  // Step 3: Upload to server
  return uploadImage<T>(
    processedFile,
    endpoint,
    upload
  );
}
