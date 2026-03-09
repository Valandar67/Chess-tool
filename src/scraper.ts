import { requestUrl } from "obsidian";

const BASE_URL_HTTPS = "https://www.pgnmentor.com/";
const BASE_URL_HTTP = "http://www.pgnmentor.com/";

const SECTIONS: Record<string, string> = {
	openings: "openings/",
	players: "players/",
	events: "events/",
};

/** Resolve a name like "Colle" to a full PGN URL. */
export function resolvePgnUrl(name: string, section: string, useHttp: boolean): { url: string; displayName: string } {
	if (name.startsWith("http://") || name.startsWith("https://")) {
		let url = name;
		if (useHttp) {
			url = url.replace(/^https:\/\//, "http://");
		}
		let displayName = name.replace(/\/$/, "").split("/").pop() || name;
		if (displayName.endsWith(".pgn")) {
			displayName = displayName.slice(0, -4);
		}
		return { url, displayName };
	}

	const baseUrl = useHttp ? BASE_URL_HTTP : BASE_URL_HTTPS;
	const clean = name.replace(/\s+/g, "");
	const prefix = SECTIONS[section] || SECTIONS["openings"];
	const url = baseUrl + prefix + clean + ".pgn";
	return { url, displayName: clean };
}

/**
 * Extract text from a requestUrl response.
 * Obsidian's requestUrl may return the body as an ArrayBuffer on mobile.
 * We need to handle both cases.
 */
function responseToText(response: { text: string; arrayBuffer: ArrayBuffer }): string {
	// Try .text first
	if (response.text && response.text.length > 0) {
		return response.text;
	}
	// Fallback: decode the ArrayBuffer manually
	if (response.arrayBuffer && response.arrayBuffer.byteLength > 0) {
		const decoder = new TextDecoder("utf-8");
		return decoder.decode(response.arrayBuffer);
	}
	return "";
}

/**
 * Validate that the response looks like PGN, not HTML.
 * Returns the text if valid, throws a descriptive error if not.
 */
function validatePgnResponse(text: string, url: string): string {
	if (!text || text.trim().length === 0) {
		throw new Error(`Empty response from ${url}`);
	}

	const trimmed = text.trim();

	// Check if the response is HTML instead of PGN
	if (
		trimmed.startsWith("<!") ||
		trimmed.startsWith("<html") ||
		trimmed.startsWith("<HTML") ||
		trimmed.toLowerCase().startsWith("<!doctype")
	) {
		throw new Error(
			`Server returned an HTML page instead of a PGN file. ` +
			`The URL may be wrong, or the site may be redirecting. URL: ${url}`
		);
	}

	// A valid PGN should have at least one header tag
	if (!trimmed.includes("[Event ") && !trimmed.includes("[White ") && !trimmed.includes("[Site ")) {
		// Show first 200 chars to help debug
		const preview = trimmed.substring(0, 200);
		throw new Error(
			`Response doesn't look like PGN data. First 200 chars: ${preview}`
		);
	}

	return text;
}

/**
 * Fetch a URL with automatic HTTPS → HTTP fallback.
 * pgnmentor.com uses an older SSL cert that Android/iOS may reject.
 */
async function fetchWithFallback(url: string, expectPgn: boolean): Promise<string> {
	let lastError: Error | null = null;

	// Try the given URL first
	const urlsToTry = [url];

	// If it's HTTPS, also try HTTP as fallback
	const httpUrl = url.replace(/^https:\/\//, "http://");
	if (httpUrl !== url) {
		urlsToTry.push(httpUrl);
	}

	for (const tryUrl of urlsToTry) {
		try {
			const response = await requestUrl({ url: tryUrl });
			const text = responseToText(response);

			if (expectPgn) {
				return validatePgnResponse(text, tryUrl);
			}
			return text;
		} catch (e) {
			lastError = e instanceof Error ? e : new Error(String(e));
			const errMsg = String(e);

			// If it's an SSL/certificate error, continue to HTTP fallback
			if (
				errMsg.includes("SSL") ||
				errMsg.includes("certificate") ||
				errMsg.includes("Certificate") ||
				errMsg.includes("CERT") ||
				errMsg.includes("Handshake")
			) {
				console.log(`PGN Mentor: SSL failed for ${tryUrl}, trying next...`);
				continue;
			}

			// For non-SSL errors on HTTPS, still try HTTP fallback
			if (tryUrl.startsWith("https://")) {
				console.log(`PGN Mentor: ${tryUrl} failed (${errMsg}), trying HTTP...`);
				continue;
			}

			// If HTTP also failed, throw
			throw e;
		}
	}

	throw lastError || new Error(`All attempts failed for ${url}`);
}

/** Download PGN text from a URL. Uses Obsidian's requestUrl (works on mobile). */
export async function downloadPgn(url: string): Promise<string> {
	return fetchWithFallback(url, true);
}

/** Fetch the files.html index page and extract available names for a section. */
export async function listAvailable(section: string): Promise<string[]> {
	const url = BASE_URL_HTTPS + "files.html";
	const html = await fetchWithFallback(url, false);

	const prefix = SECTIONS[section] || SECTIONS["openings"];
	const names: string[] = [];

	// Parse href attributes matching the section prefix
	const hrefRegex = /href="([^"]+)"/g;
	let match;
	while ((match = hrefRegex.exec(html)) !== null) {
		const href = match[1];
		if (href.startsWith(prefix) && href.endsWith(".pgn")) {
			const name = href.slice(prefix.length, -4);
			if (name && !names.includes(name)) {
				names.push(name);
			}
		}
	}

	return names.sort();
}
