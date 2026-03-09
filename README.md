# PGN Mentor Scraper — Obsidian Plugin

Download chess games from [pgnmentor.com](https://www.pgnmentor.com) straight into your Obsidian vault. Works on **mobile** and desktop.

## Install (Manual)

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. In your vault, create the folder `.obsidian/plugins/pgn-mentor-scraper/`
3. Copy the 3 files into that folder
4. In Obsidian → Settings → Community Plugins → enable **PGN Mentor Scraper**

## How to Use

### Download by name
1. Open the command palette (swipe down on mobile, `Ctrl/Cmd+P` on desktop)
2. Search for **"Download PGN from PGN Mentor"**
3. Type an opening name like `Colle`, `SicilianNajdorf`, or `KingsIndian`
4. Pick the section (Openings / Players / Events)
5. Hit **Download**

Your games appear as Markdown notes in the output folder (default: `Chess/`).

### Browse available files
1. Open command palette
2. Search for **"Browse available PGN files on PGN Mentor"**
3. A searchable list appears — pick any opening/player/event
4. Games are downloaded and saved automatically

### Full URLs work too
Paste a direct URL like `https://www.pgnmentor.com/openings/Colle.pgn` into the name field.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Output folder** | Where games are saved in your vault | `Chess` |
| **Default section** | Openings, Players, or Events | Openings |
| **Single file mode** | All games in one note (ON) or one note per game (OFF) | ON |
| **Max games** | Limit number of games (0 = all) | 0 |

## What You Get

Each game includes:
- Player names, ELO ratings, date, event, ECO code in a table
- Moves in a `pgn` code block
- Collapsible raw PGN for import into chess apps

## Building from Source

```bash
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.
