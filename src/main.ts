import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
} from "obsidian";
import { parsePgnText, gameToMarkdown, gamesToSingleMarkdown, ChessGame } from "./pgn-parser";
import { resolvePgnUrl, downloadPgn, listAvailable } from "./scraper";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface PgnMentorSettings {
	outputFolder: string;
	section: string;
	singleFile: boolean;
	maxGames: number;
	useHttp: boolean;
}

const DEFAULT_SETTINGS: PgnMentorSettings = {
	outputFolder: "Chess",
	section: "openings",
	singleFile: true,
	maxGames: 0,
	useHttp: false,
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class PgnMentorPlugin extends Plugin {
	settings: PgnMentorSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "download-pgn",
			name: "Download PGN from PGN Mentor",
			callback: () => new DownloadModal(this.app, this).open(),
		});

		this.addCommand({
			id: "browse-pgn",
			name: "Browse available PGN files on PGN Mentor",
			callback: () => this.browseAndDownload(),
		});

		this.addSettingTab(new PgnMentorSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Browse available files, let user pick one, then download it. */
	async browseAndDownload() {
		new Notice("Fetching list from pgnmentor.com...");
		try {
			const names = await listAvailable(this.settings.section);
			if (names.length === 0) {
				new Notice("No files found (site may be down). Try again later.");
				return;
			}
			new BrowseModal(this.app, this, names).open();
		} catch (e) {
			new Notice(`Failed to fetch list: ${e}`);
		}
	}

	/** Core download + save logic. */
	async downloadAndSave(nameOrUrl: string): Promise<void> {
		const { url, displayName } = resolvePgnUrl(nameOrUrl, this.settings.section, this.settings.useHttp);

		new Notice(`Downloading ${displayName}...`);

		let pgnText: string;
		try {
			pgnText = await downloadPgn(url);
		} catch (e) {
			new Notice(`Download failed: ${e}`);
			return;
		}

		let games = parsePgnText(pgnText);
		if (games.length === 0) {
			new Notice(`No games found in ${displayName}`);
			return;
		}

		if (this.settings.maxGames > 0) {
			games = games.slice(0, this.settings.maxGames);
		}

		new Notice(`Parsed ${games.length} games. Saving...`);

		// Ensure output folder exists
		const folder = this.settings.outputFolder
			? `${this.settings.outputFolder}/${displayName}`
			: displayName;

		await this.ensureFolder(folder);

		if (this.settings.singleFile) {
			await this.saveSingleFile(games, displayName, folder);
		} else {
			await this.savePerGameFiles(games, displayName, folder);
		}

		new Notice(`Done! ${games.length} games saved to ${folder}/`);
	}

	private async ensureFolder(path: string) {
		const parts = path.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private async saveSingleFile(games: ChessGame[], displayName: string, folder: string) {
		const md = gamesToSingleMarkdown(games, displayName);
		const filePath = `${folder}/${displayName}.md`;
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing) {
			await this.app.vault.modify(existing as any, md);
		} else {
			await this.app.vault.create(filePath, md);
		}
	}

	private async savePerGameFiles(games: ChessGame[], displayName: string, folder: string) {
		for (let i = 0; i < games.length; i++) {
			const game = games[i];
			const h = game.headers;
			const white = (h["White"] || "Unknown").replace(/[/\\:*?"<>|]/g, "-");
			const black = (h["Black"] || "Unknown").replace(/[/\\:*?"<>|]/g, "-");
			const date = (h["Date"] || "").replace(/\./g, "-");

			let fname = `${String(i + 1).padStart(4, "0")}_${white}_vs_${black}`;
			if (date) fname += `_${date}`;
			// Truncate if too long
			if (fname.length > 180) fname = fname.slice(0, 180);

			const md = gameToMarkdown(game);
			const filePath = `${folder}/${fname}.md`;
			const existing = this.app.vault.getAbstractFileByPath(filePath);
			if (existing) {
				await this.app.vault.modify(existing as any, md);
			} else {
				await this.app.vault.create(filePath, md);
			}
		}

		// Index file
		const indexLines: string[] = [
			`# ${displayName}`,
			"",
			`*${games.length} games from [PGN Mentor](https://www.pgnmentor.com)*`,
			"",
			"## Games",
			"",
		];
		for (let i = 0; i < games.length; i++) {
			const h = games[i].headers;
			const white = h["White"] || "?";
			const black = h["Black"] || "?";
			const result = h["Result"] || "*";
			const date = h["Date"] || "";
			indexLines.push(`${i + 1}. **${white}** vs **${black}** — ${result} (${date})`);
		}
		const indexPath = `${folder}/_${displayName}_index.md`;
		const existingIndex = this.app.vault.getAbstractFileByPath(indexPath);
		if (existingIndex) {
			await this.app.vault.modify(existingIndex as any, indexLines.join("\n"));
		} else {
			await this.app.vault.create(indexPath, indexLines.join("\n"));
		}
	}
}

// ---------------------------------------------------------------------------
// Download Modal — type a name or URL
// ---------------------------------------------------------------------------

class DownloadModal extends Modal {
	plugin: PgnMentorPlugin;
	inputValue = "";

	constructor(app: App, plugin: PgnMentorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Download from PGN Mentor" });

		contentEl.createEl("p", {
			text: `Enter an opening name (e.g. "Colle"), player name, or a full URL.`,
			cls: "setting-item-description",
		});

		new Setting(contentEl)
			.setName("Name or URL")
			.addText((text) => {
				text.setPlaceholder("e.g. Colle, KingsIndian, Kasparov...");
				text.onChange((value) => {
					this.inputValue = value;
				});
				// Allow Enter to submit
				text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.submit();
					}
				});
				// Auto-focus
				setTimeout(() => text.inputEl.focus(), 50);
			});

		new Setting(contentEl)
			.setName("Section")
			.setDesc("Where to look on pgnmentor.com")
			.addDropdown((dropdown) => {
				dropdown.addOption("openings", "Openings");
				dropdown.addOption("players", "Players");
				dropdown.addOption("events", "Events");
				dropdown.setValue(this.plugin.settings.section);
				dropdown.onChange(async (value) => {
					this.plugin.settings.section = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Download").setCta().onClick(() => this.submit())
		);
	}

	async submit() {
		if (!this.inputValue.trim()) {
			new Notice("Please enter a name or URL.");
			return;
		}
		this.close();
		await this.plugin.downloadAndSave(this.inputValue.trim());
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------------------------------------------------------------------------
// Browse Modal — pick from available files
// ---------------------------------------------------------------------------

class BrowseModal extends SuggestModal<string> {
	plugin: PgnMentorPlugin;
	names: string[];

	constructor(app: App, plugin: PgnMentorPlugin, names: string[]) {
		super(app);
		this.plugin = plugin;
		this.names = names;
		this.setPlaceholder("Search openings/players/events...");
	}

	getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		return this.names.filter((n) => n.toLowerCase().includes(lower));
	}

	renderSuggestion(name: string, el: HTMLElement) {
		el.createEl("div", { text: name });
	}

	async onChooseSuggestion(name: string) {
		await this.plugin.downloadAndSave(name);
	}
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

class PgnMentorSettingTab extends PluginSettingTab {
	plugin: PgnMentorPlugin;

	constructor(app: App, plugin: PgnMentorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "PGN Mentor Scraper" });

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Where to save downloaded games in your vault")
			.addText((text) =>
				text
					.setPlaceholder("Chess")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default section")
			.setDesc("Which section to download from by default")
			.addDropdown((dropdown) => {
				dropdown.addOption("openings", "Openings");
				dropdown.addOption("players", "Players");
				dropdown.addOption("events", "Events");
				dropdown.setValue(this.plugin.settings.section);
				dropdown.onChange(async (value) => {
					this.plugin.settings.section = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Single file mode")
			.setDesc("Save all games in one Markdown file (ON) or one file per game (OFF)")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.singleFile).onChange(async (value) => {
					this.plugin.settings.singleFile = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Use HTTP instead of HTTPS")
			.setDesc(
				"Enable this if downloads fail with SSL/certificate errors (common on mobile). " +
				"The plugin also tries HTTP automatically as a fallback."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useHttp).onChange(async (value) => {
					this.plugin.settings.useHttp = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Max games")
			.setDesc("Limit number of games to save (0 = all)")
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.maxGames))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						this.plugin.settings.maxGames = isNaN(num) ? 0 : num;
						await this.plugin.saveSettings();
					})
			);
	}
}
