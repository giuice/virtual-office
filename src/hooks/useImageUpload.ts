'use client';

import { useState, useCallback } from 'react';
import { 
  validateImage, 
  compressImage, 
  ImageValidationError,
  ImageValidationErrorType,
  processAndUploadImage
} from '@/lib/uploads/image-upload';

type UploadState = 'idle' | 'validating' | 'compressing' | 'uploading' | 'success' | 'error';

interface UseImageUploadOptions {
  endpoint?: string;
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
  uploadOptions?: {
    formFieldName?: string;
    additionalData?: Record<string, string>;
    headers?: Record<string, string>;
  };
  onSuccess?: (response: any) => void;
  onError?: (error: Error) => void;
}

interface UseImageUploadResult {
  upload: (file: File) => Promise<any>;
  state: UploadState;
  progress: number;
  preview: string | null;
  error: Error | null;
  errorType: ImageValidationErrorType | null;
  reset: () => void;
}

/**
 * Hook for handling image uploads with validation, compression, and progress tracking
 */
export function useImageUpload(options: UseImageUploadOptions = {}): UseImageUploadResult {
  const {
    endpoint = '/api/upload',
    validation = {},
    compression = { enabled: true },
    uploadOptions = {},
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [errorType, setErrorType] = useState<ImageValidationErrorType | null>(null);

  const reset = useCallback(() => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setState('idle');
    setProgress(0);
    setPreview(null);
    setError(null);
    setErrorType(null);
  }, [preview]);

  const upload = useCallback(
    async (file: File) => {
      try {
        reset();

        // Step 1: Validate the image
        setState('validating');
        let validatedFile: File;
        try {
          validatedFile = validateImage(file, validation);
        } catch (err) {
          if (err instanceof ImageValidationError) {
            setErrorType(err.type);
          }
          throw err;
        }

        // Generate preview
        const previewUrl = URL.createObjectURL(validatedFile);
        setPreview(previewUrl);

        // Step 2: Compress if enabled
        setState('compressing');
        let processedFile = validatedFile;
        if (compression.enabled) {
          try {
            processedFile = await compressImage(validatedFile, {
              maxWidth: compression.maxWidth,
              maxHeight: compression.maxHeight,
              quality: compression.quality,
            });
          } catch (err) {
            // If compression fails, continue with the original file
            console.warn('Image compression failed, using original file:', err);
            processedFile = validatedFile;
          }
        }

        // Step 3: Upload to server
        setState('uploading');
        const response = await processAndUploadImage(
          processedFile,
          endpoint,
          {
            validation,
            compression: { enabled: false }, // Skip compression since we already did it
            upload: {
              ...uploadOptions,
              onProgress: (p) => setProgress(p),
            },
          }
        );

        setState('success');
        if (onSuccess) {
          onSuccess(response);
        }
        return response;
      } catch (err) {
        setState('error');
        const errorObject = err instanceof Error ? err : new Error(String(err));
        setError(errorObject);
        if (onError) {
          onError(errorObject);
        }
        throw errorObject;
      }
    },
    [
      endpoint,
      validation,
      compression,
      uploadOptions,
      onSuccess,
      onError,
      reset,
    ]
  );

  return {
    upload,
    state,
    progress,
    preview,
    error,
    errorType,
    reset,
  };
}
