import { requestUrl } from "obsidian";

const BASE_URL = "https://www.pgnmentor.com/";

const SECTIONS: Record<string, string> = {
	openings: "openings/",
	players: "players/",
	events: "events/",
};

/** Resolve a name like "Colle" to a full PGN URL. */
export function resolvePgnUrl(name: string, section: string): { url: string; displayName: string } {
	if (name.startsWith("http://") || name.startsWith("https://")) {
		let displayName = name.replace(/\/$/, "").split("/").pop() || name;
		if (displayName.endsWith(".pgn")) {
			displayName = displayName.slice(0, -4);
		}
		return { url: name, displayName };
	}

	const clean = name.replace(/\s+/g, "");
	const prefix = SECTIONS[section] || SECTIONS["openings"];
	const url = BASE_URL + prefix + clean + ".pgn";
	return { url, displayName: clean };
}

/** Download PGN text from a URL. Uses Obsidian's requestUrl (works on mobile). */
export async function downloadPgn(url: string): Promise<string> {
	const response = await requestUrl({ url });
	return response.text;
}

/** Fetch the files.html index page and extract available names for a section. */
export async function listAvailable(section: string): Promise<string[]> {
	const url = BASE_URL + "files.html";
	const response = await requestUrl({ url });
	const html = response.text;

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
