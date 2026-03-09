/** A single parsed chess game. */
export interface ChessGame {
	headers: Record<string, string>;
	moves: string;
}

/**
 * Parse raw PGN text into individual games.
 * Handles the standard PGN format: header tags followed by move text.
 */
export function parsePgnText(pgnText: string): ChessGame[] {
	const games: ChessGame[] = [];
	let currentHeaders: Record<string, string> = {};
	let moveLines: string[] = [];
	let inMoves = false;

	const headerRegex = /^\[(\w+)\s+"(.*)"\]$/;

	for (const rawLine of pgnText.split("\n")) {
		const line = rawLine.trim();

		const headerMatch = line.match(headerRegex);
		if (headerMatch) {
			// If we were collecting moves, save the previous game
			if (inMoves && moveLines.length > 0) {
				games.push({
					headers: currentHeaders,
					moves: moveLines.join(" ").trim(),
				});
				currentHeaders = {};
				moveLines = [];
				inMoves = false;
			}
			currentHeaders[headerMatch[1]] = headerMatch[2];
			continue;
		}

		if (line === "") {
			if (Object.keys(currentHeaders).length > 0 && !inMoves) {
				inMoves = true;
			}
			continue;
		}

		// Move text
		if (Object.keys(currentHeaders).length > 0) {
			inMoves = true;
			moveLines.push(line);
		}
	}

	// Last game
	if (Object.keys(currentHeaders).length > 0) {
		games.push({
			headers: currentHeaders,
			moves: moveLines.join(" ").trim(),
		});
	}

	return games;
}

/** Convert a single game to Markdown. */
export function gameToMarkdown(game: ChessGame): string {
	const h = game.headers;
	const white = h["White"] || "?";
	const black = h["Black"] || "?";
	const result = h["Result"] || "*";
	const whiteElo = h["WhiteElo"] || "";
	const blackElo = h["BlackElo"] || "";

	const lines: string[] = [];

	lines.push(`# ${white} vs ${black}`);
	lines.push("");
	lines.push("| Detail | Value |");
	lines.push("|--------|-------|");
	lines.push(`| **White** | ${white}${whiteElo ? ` (${whiteElo})` : ""} |`);
	lines.push(`| **Black** | ${black}${blackElo ? ` (${blackElo})` : ""} |`);
	lines.push(`| **Result** | ${result} |`);

	const optionalFields = ["Date", "Event", "Site", "Round", "ECO", "Opening"];
	for (const field of optionalFields) {
		if (h[field]) {
			lines.push(`| **${field}** | ${h[field]} |`);
		}
	}

	lines.push("");
	lines.push("## Moves");
	lines.push("");
	lines.push("```pgn");
	lines.push(game.moves);
	lines.push("```");
	lines.push("");

	// Raw PGN in a collapsible block
	const pgnLines: string[] = [];
	for (const [key, val] of Object.entries(h)) {
		pgnLines.push(`[${key} "${val}"]`);
	}
	pgnLines.push("");
	pgnLines.push(game.moves);

	lines.push("<details>");
	lines.push("<summary>Raw PGN</summary>");
	lines.push("");
	lines.push("```");
	lines.push(pgnLines.join("\n"));
	lines.push("```");
	lines.push("");
	lines.push("</details>");

	return lines.join("\n");
}

/** Convert all games into one big Markdown string. */
export function gamesToSingleMarkdown(games: ChessGame[], title: string): string {
	const lines: string[] = [];

	lines.push(`# ${title}`);
	lines.push("");
	lines.push(`*${games.length} games downloaded from [PGN Mentor](https://www.pgnmentor.com)*`);
	lines.push("");
	lines.push("## Games");
	lines.push("");

	for (let i = 0; i < games.length; i++) {
		const h = games[i].headers;
		const white = h["White"] || "?";
		const black = h["Black"] || "?";
		const result = h["Result"] || "*";
		const date = h["Date"] || "";
		lines.push(`${i + 1}. **${white}** vs **${black}** — ${result} (${date})`);
	}

	lines.push("");
	lines.push("---");
	lines.push("");

	for (let i = 0; i < games.length; i++) {
		lines.push(gameToMarkdown(games[i]));
		lines.push("");
		lines.push("---");
		lines.push("");
	}

	return lines.join("\n");
}
