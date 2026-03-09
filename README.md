# PGN Mentor Scraper

Download chess games from [pgnmentor.com](https://www.pgnmentor.com) and convert them to **Markdown** — ready to drop into your Obsidian vault.

## Setup

```bash
pip install -r requirements.txt
```

## Quick Start

```bash
# Download all Colle System games as Markdown
python pgn_mentor_scraper.py Colle

# Output lands in ./output/Colle/ with one .md file per game + an index file
```

## Usage

```
python pgn_mentor_scraper.py [OPTIONS] <name(s) or URL(s)>
```

### Examples

```bash
# Single opening
python pgn_mentor_scraper.py Colle

# Multiple openings at once
python pgn_mentor_scraper.py Colle "SicilianGrandPrix" "KingsIndian"

# Full URL works too
python pgn_mentor_scraper.py https://www.pgnmentor.com/openings/Colle.pgn

# Download a player's games
python pgn_mentor_scraper.py --type players Kasparov

# Download event games
python pgn_mentor_scraper.py --type events Linares1993

# Everything in one big Markdown file (instead of one per game)
python pgn_mentor_scraper.py --single-file Colle

# Also keep the raw .pgn file
python pgn_mentor_scraper.py --keep-pgn Colle

# Limit to first 50 games
python pgn_mentor_scraper.py --max-games 50 Colle

# Custom output directory (e.g. straight into your vault)
python pgn_mentor_scraper.py -o ~/Obsidian/Chess Colle

# List all available openings
python pgn_mentor_scraper.py --list openings
```

### Options

| Flag | Description |
|------|-------------|
| `--type`, `-t` | Section: `openings` (default), `players`, or `events` |
| `--list`, `-l` | List all available files for a section |
| `--output`, `-o` | Output directory (default: `./output`) |
| `--single-file` | All games in one Markdown file |
| `--keep-pgn` | Also save the raw `.pgn` file |
| `--max-games` | Limit number of games (0 = all) |

## Output Format

Each game becomes a Markdown file with:

- A heading with the player names
- A table with game metadata (players, ELO, date, event, ECO code, etc.)
- The moves in a `pgn` code block
- A collapsible raw PGN section for easy import into chess apps

An index file (`_<Opening>_index.md`) is also generated listing all games.

### Obsidian Tips

- Point `-o` directly at a folder in your vault
- Use `--single-file` if you prefer one note per opening
- The `pgn` code blocks work with Obsidian chess plugins
- Works great on mobile — just sync the output folder

## How It Works

1. Resolves the opening/player/event name to a PGN file URL on pgnmentor.com
2. Downloads the `.pgn` file
3. Parses individual games (headers + moves)
4. Converts each game to clean Markdown
5. Writes to your output directory
