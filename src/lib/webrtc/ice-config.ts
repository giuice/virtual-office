/**
 * ICE Server Configuration for WebRTC
 * 
 * Provides STUN/TURN server configuration for NAT traversal.
 * STUN is used for simple NAT traversal (free/public).
 * TURN is used for firewall/symmetric NAT traversal (requires provisioning).
 */

/**
 * Returns the ICE servers configuration for RTCPeerConnection.
 * Uses environment variables for TURN credentials (server-side only for credential).
 * Falls back to Google's public STUN server if no configuration provided.
 */
export function getIceServers(): RTCIceServer[] {
	const servers: RTCIceServer[] = [];

	// STUN server (public, free)
	const stunUrl = process.env.NEXT_PUBLIC_STUN_URL || 'stun:stun.l.google.com:19302';
	servers.push({ urls: stunUrl });

	// TURN server (requires credentials)
	const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
	const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
	const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

	if (turnUrl && turnUsername && turnCredential) {
		servers.push({
			urls: turnUrl,
			username: turnUsername,
			credential: turnCredential,
		});
	}

	return servers;
}

/**
 * Default STUN server for quick testing
 * Note: This is a public Google STUN server
 */
const DEFAULT_STUN_SERVER = 'stun:stun.l.google.com:19302';

/**
 * Validates that required TURN configuration is present.
 * Returns true if TURN is properly configured, false otherwise.
 */
function isTurnConfigured(): boolean {
	return !!(
		process.env.NEXT_PUBLIC_TURN_URL &&
		process.env.NEXT_PUBLIC_TURN_USERNAME &&
		process.env.NEXT_PUBLIC_TURN_CREDENTIAL
	);
}

/**
 * User limit constants for P2P mesh topology
 * Soft limit shows warning, hard limit prevents new connections
 */
export const ROOM_LIMITS = {
	SOFT_WARNING: 8, // Show toast warning
	HARD_LIMIT: 12,   // Prevent new connections (future)
} as const;
