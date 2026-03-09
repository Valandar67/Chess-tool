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
 * Fetch a URL with automatic HTTPS → HTTP fallback.
 * pgnmentor.com uses an older SSL cert that Android/iOS may reject.
 */
async function fetchWithFallback(url: string): Promise<string> {
	try {
		const response = await requestUrl({ url });
		return response.text;
	} catch (e) {
		const errMsg = String(e);
		// If it's an SSL/certificate error, retry with HTTP
		if (
			errMsg.includes("SSL") ||
			errMsg.includes("certificate") ||
			errMsg.includes("Certificate") ||
			errMsg.includes("CERT") ||
			errMsg.includes("Handshake")
		) {
			const httpUrl = url.replace(/^https:\/\//, "http://");
			if (httpUrl !== url) {
				console.log(`PGN Mentor: SSL failed, falling back to HTTP for ${httpUrl}`);
				const response = await requestUrl({ url: httpUrl });
				return response.text;
			}
		}
		throw e;
	}
}

/** Download PGN text from a URL. Uses Obsidian's requestUrl (works on mobile). */
export async function downloadPgn(url: string): Promise<string> {
	return fetchWithFallback(url);
}

/** Fetch the files.html index page and extract available names for a section. */
export async function listAvailable(section: string): Promise<string[]> {
	// Try HTTPS first, fall back to HTTP automatically
	const url = BASE_URL_HTTPS + "files.html";
	const html = await fetchWithFallback(url);

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
