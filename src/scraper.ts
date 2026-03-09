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
 */
function responseToText(response: { text: string; arrayBuffer: ArrayBuffer }): string {
	if (response.text && response.text.length > 0) {
		return response.text;
	}
	if (response.arrayBuffer && response.arrayBuffer.byteLength > 0) {
		const decoder = new TextDecoder("utf-8");
		return decoder.decode(response.arrayBuffer);
	}
	return "";
}

/**
 * Try to fetch a URL, with HTTPS→HTTP fallback on SSL errors.
 * Returns the raw response text (could be PGN or HTML).
 */
async function fetchUrl(url: string): Promise<string> {
	const urlsToTry = [url];
	const httpUrl = url.replace(/^https:\/\//, "http://");
	if (httpUrl !== url) {
		urlsToTry.push(httpUrl);
	}

	let lastError: Error | null = null;

	for (const tryUrl of urlsToTry) {
		try {
			const response = await requestUrl({ url: tryUrl });
			const text = responseToText(response);
			if (text && text.trim().length > 0) {
				return text;
			}
		} catch (e) {
			lastError = e instanceof Error ? e : new Error(String(e));
			console.log(`PGN Mentor: ${tryUrl} failed (${lastError.message}), trying next...`);
			continue;
		}
	}

	throw lastError || new Error(`All attempts failed for ${url}`);
}

/**
 * Check if text looks like PGN (has header tags).
 */
function looksLikePgn(text: string): boolean {
	return /\[\s*Event\s+"/.test(text) || /\[\s*White\s+"/.test(text);
}

/**
 * Check if text looks like HTML.
 */
function looksLikeHtml(text: string): boolean {
	const trimmed = text.trim().toLowerCase();
	return (
		trimmed.startsWith("<!doctype") ||
		trimmed.startsWith("<html") ||
		trimmed.startsWith("<!") ||
		(trimmed.includes("<head") && trimmed.includes("<body"))
	);
}

/**
 * Extract PGN data from an HTML page.
 *
 * PGN Mentor uses pgn4web, which embeds PGN in one of two ways:
 *   1. Inline in <textarea id="pgnText">...PGN here...</textarea>
 *   2. Via SetPgnUrl("path/to/file.pgn") in a <script> tag
 *
 * We try method 1 first, then fall back to method 2 (fetching the linked file).
 */
async function extractPgnFromHtml(html: string, pageUrl: string): Promise<string> {
	// --- Method 1: PGN inline in <textarea id="pgnText"> ---
	// Match both id="pgnText" and id='pgnText', handle various attribute orderings
	const textareaPatterns = [
		// <textarea ... id="pgnText" ...>CONTENT</textarea>
		/<textarea[^>]*\bid\s*=\s*["']pgnText["'][^>]*>([\s\S]*?)<\/textarea>/i,
		// <textarea ... id="pgnText" ...>CONTENT</textarea> (relaxed)
		/<textarea[^>]*pgnText[^>]*>([\s\S]*?)<\/textarea>/i,
	];

	for (const pattern of textareaPatterns) {
		const match = html.match(pattern);
		if (match && match[1]) {
			const content = decodeHtmlEntities(match[1].trim());
			if (looksLikePgn(content)) {
				return content;
			}
		}
	}

	// --- Method 2: SetPgnUrl("...") in a script tag ---
	const setPgnUrlPatterns = [
		/SetPgnUrl\s*\(\s*["']([^"']+)["']\s*\)/i,
		/setPgnUrl\s*\(\s*["']([^"']+)["']\s*\)/i,
	];

	for (const pattern of setPgnUrlPatterns) {
		const match = html.match(pattern);
		if (match && match[1]) {
			const pgnPath = match[1];
			// Resolve relative URL against the page URL
			const pgnUrl = resolveRelativeUrl(pgnPath, pageUrl);
			console.log(`PGN Mentor: Found SetPgnUrl, fetching ${pgnUrl}`);
			const pgnText = await fetchUrl(pgnUrl);
			if (looksLikePgn(pgnText)) {
				return pgnText;
			}
			// If this also returned HTML, recurse once
			if (looksLikeHtml(pgnText)) {
				return extractPgnFromHtml(pgnText, pgnUrl);
			}
			return pgnText;
		}
	}

	// --- Method 3: Look for PGN data anywhere in the HTML (hidden in divs, spans, etc.) ---
	// Extract any text block that looks like PGN games
	const pgnBlockRegex = /(\[Event\s+"[^"]*"\][\s\S]*?(?:1-0|0-1|1\/2-1\/2|\*))/g;
	const blocks: string[] = [];
	let blockMatch;
	while ((blockMatch = pgnBlockRegex.exec(html)) !== null) {
		blocks.push(blockMatch[1]);
	}
	if (blocks.length > 0) {
		return blocks.join("\n\n");
	}

	throw new Error(
		"Could not find PGN data in the HTML page. " +
		"No <textarea id='pgnText'>, no SetPgnUrl(), and no inline PGN blocks found."
	);
}

/** Decode basic HTML entities. */
function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/&nbsp;/g, " ");
}

/** Resolve a relative URL against a base page URL. */
function resolveRelativeUrl(relative: string, base: string): string {
	// Already absolute
	if (relative.startsWith("http://") || relative.startsWith("https://")) {
		return relative;
	}

	// Protocol-relative
	if (relative.startsWith("//")) {
		const protocol = base.startsWith("https") ? "https:" : "http:";
		return protocol + relative;
	}

	// Relative to root
	if (relative.startsWith("/")) {
		const match = base.match(/^(https?:\/\/[^/]+)/);
		return match ? match[1] + relative : relative;
	}

	// Relative to current path
	const lastSlash = base.lastIndexOf("/");
	const basePath = lastSlash >= 0 ? base.substring(0, lastSlash + 1) : base + "/";
	return basePath + relative;
}

/**
 * Download PGN text for a given URL.
 *
 * Tries the URL directly. If the response is HTML (viewer page),
 * extracts PGN from it. Handles all the quirks of pgnmentor.com:
 * - .pgn URLs may redirect to HTML viewer pages
 * - Viewer pages use pgn4web with inline or external PGN
 * - SSL certs may fail on mobile
 */
export async function downloadPgn(url: string): Promise<string> {
	const text = await fetchUrl(url);

	// If it's already raw PGN, return it directly
	if (looksLikePgn(text) && !looksLikeHtml(text)) {
		return text;
	}

	// It's HTML — extract PGN from the viewer page
	if (looksLikeHtml(text)) {
		console.log("PGN Mentor: Response is HTML, extracting PGN from viewer page...");
		return extractPgnFromHtml(text, url);
	}

	// Unknown format — return as-is and let the parser try
	return text;
}

/**
 * Download PGN for an opening/player/event.
 * Tries multiple URL patterns since pgnmentor.com may serve:
 *   - /openings/Colle.pgn (raw file)
 *   - /openings/Colle/ (viewer page with embedded PGN)
 */
export async function downloadPgnByName(
	name: string,
	section: string,
	useHttp: boolean
): Promise<{ pgnText: string; displayName: string }> {
	const { url, displayName } = resolvePgnUrl(name, section, useHttp);

	// Try the .pgn URL first
	try {
		const pgnText = await downloadPgn(url);
		if (looksLikePgn(pgnText)) {
			return { pgnText, displayName };
		}
	} catch (e) {
		console.log(`PGN Mentor: .pgn URL failed: ${e}`);
	}

	// Try the viewer page URL (/openings/Name/)
	if (!name.startsWith("http")) {
		const baseUrl = useHttp ? BASE_URL_HTTP : BASE_URL_HTTPS;
		const prefix = SECTIONS[section] || SECTIONS["openings"];
		const viewerUrl = baseUrl + prefix + name.replace(/\s+/g, "") + "/";
		try {
			console.log(`PGN Mentor: Trying viewer page at ${viewerUrl}`);
			const pgnText = await downloadPgn(viewerUrl);
			if (looksLikePgn(pgnText)) {
				return { pgnText, displayName };
			}
		} catch (e) {
			console.log(`PGN Mentor: Viewer URL also failed: ${e}`);
		}
	}

	throw new Error(
		`Could not find PGN data for "${displayName}". ` +
		`Tried both .pgn file and viewer page URLs. The site may be down.`
	);
}

/** Fetch the files.html index page and extract available names for a section. */
export async function listAvailable(section: string): Promise<string[]> {
	const url = BASE_URL_HTTPS + "files.html";
	const html = await fetchUrl(url);

	const prefix = SECTIONS[section] || SECTIONS["openings"];
	const names: string[] = [];

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
