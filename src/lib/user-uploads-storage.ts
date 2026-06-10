const USER_UPLOADS_PUBLIC_MARKER = '/storage/v1/object/public/user-uploads/';

export function extractUserUploadsPath(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const markerIndex = parsedUrl.pathname.indexOf(USER_UPLOADS_PUBLIC_MARKER);
    if (markerIndex === -1) {
      return null;
    }

    const encodedPath = parsedUrl.pathname.slice(markerIndex + USER_UPLOADS_PUBLIC_MARKER.length);
    return encodedPath ? decodeURIComponent(encodedPath) : null;
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }
}
