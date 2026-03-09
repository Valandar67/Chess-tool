#!/usr/bin/env python3
"""
PGN Mentor Scraper — Download chess games from pgnmentor.com and convert to Markdown.

Designed for use with Obsidian (including mobile). Downloads PGN files from
pgnmentor.com, parses individual games, and outputs clean Markdown files you
can drop straight into your vault.

Usage:
    # Download a specific opening to markdown
    python pgn_mentor_scraper.py Colle

    # Download multiple openings
    python pgn_mentor_scraper.py Colle "Sicilian Grand Prix" "Kings Indian"

    # Download by full URL
    python pgn_mentor_scraper.py https://www.pgnmentor.com/openings/Colle.pgn

    # Download a player's games
    python pgn_mentor_scraper.py --type players Kasparov

    # Download event games
    python pgn_mentor_scraper.py --type events Linares1993

    # List all available openings
    python pgn_mentor_scraper.py --list openings

    # Output as single file instead of one-per-game
    python pgn_mentor_scraper.py --single-file Colle

    # Also keep the raw .pgn file
    python pgn_mentor_scraper.py --keep-pgn Colle

    # Custom output directory
    python pgn_mentor_scraper.py -o my_vault/Chess Colle
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://www.pgnmentor.com/"
SECTIONS = {
    "openings": "openings/",
    "players": "players/",
    "events": "events/",
}

# Retry settings for network requests
MAX_RETRIES = 4
BACKOFF_BASE = 2  # seconds


def fetch_with_retry(url: str, stream: bool = False) -> requests.Response:
    """Fetch a URL with exponential backoff on failure."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, stream=stream, timeout=30)
            resp.raise_for_status()
            return resp
        except (requests.RequestException, ConnectionError) as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = BACKOFF_BASE ** (attempt + 1)
            print(f"  Retry {attempt + 1}/{MAX_RETRIES} in {wait}s... ({e})")
            time.sleep(wait)


# ---------------------------------------------------------------------------
# PGN Parsing
# ---------------------------------------------------------------------------

def parse_pgn_text(pgn_text: str) -> list[dict]:
    """
    Parse raw PGN text into a list of games.
    Each game is a dict with 'headers' (dict) and 'moves' (str).
    """
    games = []
    current_headers = {}
    current_moves_lines = []
    in_moves = False

    for line in pgn_text.splitlines():
        line_stripped = line.strip()

        # Header tag
        header_match = re.match(r'^\[(\w+)\s+"(.*)"\]$', line_stripped)
        if header_match:
            if in_moves and current_moves_lines:
                # Save previous game
                games.append({
                    "headers": current_headers,
                    "moves": " ".join(current_moves_lines).strip(),
                })
                current_headers = {}
                current_moves_lines = []
                in_moves = False
            key, value = header_match.group(1), header_match.group(2)
            current_headers[key] = value
            continue

        # Empty line after headers → moves section starts
        if line_stripped == "":
            if current_headers and not in_moves:
                in_moves = True
            elif in_moves and current_moves_lines:
                # Double blank can separate games in some PGN files
                pass
            continue

        # Move text
        if current_headers:
            in_moves = True
            current_moves_lines.append(line_stripped)

    # Last game
    if current_headers:
        games.append({
            "headers": current_headers,
            "moves": " ".join(current_moves_lines).strip(),
        })

    return games


# ---------------------------------------------------------------------------
# Markdown Conversion
# ---------------------------------------------------------------------------

def game_to_markdown(game: dict, index: int) -> str:
    """Convert a single parsed game to a Markdown string."""
    h = game["headers"]
    white = h.get("White", "?")
    black = h.get("Black", "?")
    result = h.get("Result", "*")
    event = h.get("Event", "")
    site = h.get("Site", "")
    date = h.get("Date", "")
    eco = h.get("ECO", "")
    opening = h.get("Opening", "")
    round_ = h.get("Round", "")
    white_elo = h.get("WhiteElo", "")
    black_elo = h.get("BlackElo", "")

    lines = []
    lines.append(f"# {white} vs {black}")
    lines.append("")

    # YAML-style front-matter as a callout block (renders nicely in Obsidian)
    lines.append("| Detail | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| **White** | {white}{f' ({white_elo})' if white_elo else ''} |")
    lines.append(f"| **Black** | {black}{f' ({black_elo})' if black_elo else ''} |")
    lines.append(f"| **Result** | {result} |")
    if date:
        lines.append(f"| **Date** | {date} |")
    if event:
        lines.append(f"| **Event** | {event} |")
    if site:
        lines.append(f"| **Site** | {site} |")
    if round_:
        lines.append(f"| **Round** | {round_} |")
    if eco:
        lines.append(f"| **ECO** | {eco} |")
    if opening:
        lines.append(f"| **Opening** | {opening} |")
    lines.append("")

    # Moves in a code block (preserves formatting, easy to copy)
    lines.append("## Moves")
    lines.append("")
    lines.append("```pgn")
    lines.append(game["moves"])
    lines.append("```")
    lines.append("")

    # Also include raw PGN in a collapsed section for import into chess apps
    pgn_lines = []
    for key, val in h.items():
        pgn_lines.append(f'[{key} "{val}"]')
    pgn_lines.append("")
    pgn_lines.append(game["moves"])

    lines.append("<details>")
    lines.append("<summary>Raw PGN</summary>")
    lines.append("")
    lines.append("```")
    lines.append("\n".join(pgn_lines))
    lines.append("```")
    lines.append("")
    lines.append("</details>")
    lines.append("")

    return "\n".join(lines)


def games_to_single_markdown(games: list[dict], title: str) -> str:
    """Convert all games into one big Markdown file with a table of contents."""
    lines = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"*{len(games)} games downloaded from [PGN Mentor](https://www.pgnmentor.com)*")
    lines.append("")

    # Table of contents
    lines.append("## Games")
    lines.append("")
    for i, game in enumerate(games, 1):
        h = game["headers"]
        white = h.get("White", "?")
        black = h.get("Black", "?")
        result = h.get("Result", "*")
        date = h.get("Date", "")
        lines.append(f"{i}. [[#{white} vs {black}|{white} vs {black}]] — {result} ({date})")
    lines.append("")
    lines.append("---")
    lines.append("")

    # All games
    for i, game in enumerate(games, 1):
        lines.append(game_to_markdown(game, i))
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Downloading & Listing
# ---------------------------------------------------------------------------

def list_available(section: str) -> list[str]:
    """Scrape files.html and list available PGN files for a section."""
    url = BASE_URL + "files.html"
    print(f"Fetching index from {url} ...")
    resp = fetch_with_retry(url)
    soup = BeautifulSoup(resp.text, "html.parser")

    prefix = SECTIONS[section]
    names = []
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if href.startswith(prefix) and href.endswith(".pgn"):
            name = href[len(prefix):-4]  # strip prefix and .pgn
            names.append(name)
    return sorted(set(names))


def resolve_pgn_url(name_or_url: str, section: str) -> tuple[str, str]:
    """
    Given a name like 'Colle' or a full URL, return (url, display_name).
    """
    if name_or_url.startswith("http://") or name_or_url.startswith("https://"):
        url = name_or_url
        # Extract name from URL
        display = url.rstrip("/").split("/")[-1]
        if display.endswith(".pgn"):
            display = display[:-4]
        return url, display

    # Clean up name — remove spaces, try common patterns
    clean = name_or_url.replace(" ", "")
    prefix = SECTIONS[section]
    url = BASE_URL + prefix + clean + ".pgn"
    return url, clean


def download_pgn(url: str) -> str:
    """Download a PGN file and return its text content."""
    print(f"Downloading {url} ...")
    resp = fetch_with_retry(url)
    return resp.text


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Download PGN files from pgnmentor.com and convert to Obsidian Markdown.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "names",
        nargs="*",
        help='Opening/player/event name(s) or full URL(s). E.g. "Colle" or "https://www.pgnmentor.com/openings/Colle.pgn"',
    )
    parser.add_argument(
        "--type", "-t",
        choices=["openings", "players", "events"],
        default="openings",
        help="Section to download from (default: openings)",
    )
    parser.add_argument(
        "--list", "-l",
        metavar="SECTION",
        choices=["openings", "players", "events"],
        help="List all available PGN files for a section and exit",
    )
    parser.add_argument(
        "--output", "-o",
        default="output",
        help="Output directory (default: ./output)",
    )
    parser.add_argument(
        "--single-file",
        action="store_true",
        help="Output all games into a single Markdown file instead of one per game",
    )
    parser.add_argument(
        "--keep-pgn",
        action="store_true",
        help="Also save the raw .pgn file alongside the Markdown",
    )
    parser.add_argument(
        "--max-games",
        type=int,
        default=0,
        help="Limit number of games to convert (0 = all)",
    )

    args = parser.parse_args()

    # --- List mode ---
    if args.list:
        names = list_available(args.list)
        if not names:
            print(f"No PGN files found for section '{args.list}' (site may be down).")
            sys.exit(1)
        print(f"\nAvailable {args.list} ({len(names)}):\n")
        for n in names:
            print(f"  {n}")
        print(f"\nUsage: python {sys.argv[0]} --type {args.list} <name>")
        sys.exit(0)

    # --- Download mode ---
    if not args.names:
        parser.print_help()
        sys.exit(1)

    for name in args.names:
        url, display_name = resolve_pgn_url(name, args.type)

        try:
            pgn_text = download_pgn(url)
        except requests.RequestException as e:
            print(f"ERROR: Failed to download {url}: {e}")
            continue

        games = parse_pgn_text(pgn_text)
        if not games:
            print(f"  No games found in {url}")
            continue

        if args.max_games > 0:
            games = games[:args.max_games]

        print(f"  Parsed {len(games)} games from {display_name}")

        # Output directory
        out_dir = Path(args.output) / display_name
        out_dir.mkdir(parents=True, exist_ok=True)

        # Save raw PGN if requested
        if args.keep_pgn:
            pgn_path = out_dir / f"{display_name}.pgn"
            pgn_path.write_text(pgn_text, encoding="utf-8")
            print(f"  Saved raw PGN → {pgn_path}")

        # Markdown output
        if args.single_file:
            md_content = games_to_single_markdown(games, display_name)
            md_path = out_dir / f"{display_name}.md"
            md_path.write_text(md_content, encoding="utf-8")
            print(f"  Saved {len(games)} games → {md_path}")
        else:
            for i, game in enumerate(games, 1):
                h = game["headers"]
                white = h.get("White", "Unknown").replace("/", "-")
                black = h.get("Black", "Unknown").replace("/", "-")
                date = h.get("Date", "").replace(".", "-")
                # Sanitize filename
                fname = f"{i:04d}_{white}_vs_{black}"
                if date:
                    fname += f"_{date}"
                fname = re.sub(r'[<>:"/\\|?*]', "", fname)[:200]

                md_content = game_to_markdown(game, i)
                md_path = out_dir / f"{fname}.md"
                md_path.write_text(md_content, encoding="utf-8")

            print(f"  Saved {len(games)} games → {out_dir}/")

        # Also create an index file when doing per-game files
        if not args.single_file:
            index_lines = [
                f"# {display_name}",
                "",
                f"*{len(games)} games from [PGN Mentor](https://www.pgnmentor.com)*",
                "",
                "## Games",
                "",
            ]
            for i, game in enumerate(games, 1):
                h = game["headers"]
                white = h.get("White", "?")
                black = h.get("Black", "?")
                result = h.get("Result", "*")
                date = h.get("Date", "")
                index_lines.append(f"{i}. **{white}** vs **{black}** — {result} ({date})")
            index_path = out_dir / f"_{display_name}_index.md"
            index_path.write_text("\n".join(index_lines), encoding="utf-8")
            print(f"  Index → {index_path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
