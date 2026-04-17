from __future__ import annotations

import json
import os
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from mutagen.id3 import APIC, TALB, TIT2, TPE1, USLT, ID3, ID3NoHeaderError
from yt_dlp import YoutubeDL


def _is_retryable_yt_error(message: str) -> bool:
    normalized = message.lower()
    markers = (
        "sign in to confirm your age",
        "sign in to confirm you're not a bot",
        "sign in to confirm you’re not a bot",
        "confirm you're not a bot",
        "confirm you’re not a bot",
        "age-restricted",
        "this video is unavailable",
        "http error 403",
        "private video",
    )
    return any(marker in normalized for marker in markers)


def _resolve_candidate_url(entry: dict[str, Any]) -> str:
    webpage_url = str(entry.get("webpage_url") or "").strip()
    if webpage_url:
        return webpage_url

    video_id = str(entry.get("id") or "").strip()
    if video_id:
        return f"https://www.youtube.com/watch?v={video_id}"

    raw_url = str(entry.get("url") or "").strip()
    if raw_url.startswith("http://") or raw_url.startswith("https://"):
        return raw_url
    if raw_url:
        return f"https://www.youtube.com/watch?v={raw_url}"
    return ""


def _download_with_fallback(ydl_opts: dict[str, object], query: str) -> tuple[dict[str, Any], str]:
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=True)
            if not isinstance(info, dict):
                raise RuntimeError("yt-dlp returned invalid metadata")
            if isinstance(info.get("entries"), list) and info["entries"]:
                first_entry = info["entries"][0]
                if isinstance(first_entry, dict):
                    info = first_entry
            requested = ydl.prepare_filename(info)
            return info, requested
    except Exception as error:
        if not _is_retryable_yt_error(str(error)):
            raise

    discovery_opts = dict(ydl_opts)
    discovery_opts["skip_download"] = True
    discovery_opts["default_search"] = "ytsearch8"
    discovery_opts["extract_flat"] = True
    candidates: list[str] = []
    try:
        with YoutubeDL(discovery_opts) as ydl:
            discovered = ydl.extract_info(query, download=False)
    except Exception:
        discovered = None

    if isinstance(discovered, dict):
        entries = discovered.get("entries")
        if isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, dict):
                    candidate = _resolve_candidate_url(entry)
                    if candidate and candidate not in candidates:
                        candidates.append(candidate)
        direct_candidate = _resolve_candidate_url(discovered)
        if direct_candidate and direct_candidate not in candidates:
            candidates.insert(0, direct_candidate)

    errors: list[str] = []
    for candidate in candidates:
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(candidate, download=True)
                if not isinstance(info, dict):
                    raise RuntimeError("yt-dlp returned invalid metadata")
                requested = ydl.prepare_filename(info)
                return info, requested
        except Exception as error:
            errors.append(str(error))
            continue

    details = " | ".join(errors[:3]) if errors else "No playable fallback candidates were found"
    raise RuntimeError(f"yt-dlp fallback failed: {details}")


def _sanitize_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]+', "_", value).strip()
    return cleaned or "track"


def _download_artwork_bytes(artwork_url: str) -> tuple[bytes | None, str]:
    if not artwork_url:
        return None, "image/jpeg"

    try:
        request = Request(
            artwork_url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            },
        )
        with urlopen(request, timeout=20) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0].strip().lower()
    except (URLError, TimeoutError, ValueError):
        return None, "image/jpeg"

    if not raw:
        return None, "image/jpeg"

    try:
        from PIL import Image  # type: ignore

        with Image.open(BytesIO(raw)) as image:
            image = image.convert("RGB")
            image.thumbnail((1200, 1200))
            optimized = BytesIO()
            image.save(optimized, format="JPEG", quality=88, optimize=True)
            return optimized.getvalue(), "image/jpeg"
    except Exception:
        return raw, content_type if content_type in {"image/jpeg", "image/png"} else "image/jpeg"


def _fetch_lyrics(title: str, artist: str, query: str) -> str | None:
    search_query = " - ".join(part for part in [artist.strip(), title.strip()] if part.strip()) or query

    try:
        import syncedlyrics  # type: ignore

        try:
            lyrics = syncedlyrics.search(search_query, synced_only=False)  # type: ignore[call-arg]
        except TypeError:
            lyrics = syncedlyrics.search(search_query)  # type: ignore[call-arg]
        if isinstance(lyrics, str) and lyrics.strip():
            return lyrics.strip()
    except Exception:
        pass

    genius_token = os.getenv("GENIUS_ACCESS_TOKEN", "").strip()
    if not genius_token:
        return None

    try:
        import lyricsgenius  # type: ignore

        genius = lyricsgenius.Genius(genius_token, verbose=False, remove_section_headers=True, skip_non_songs=True)
        song = genius.search_song(title=title or query, artist=artist or None)
        if song and isinstance(song.lyrics, str) and song.lyrics.strip():
            return song.lyrics.strip()
    except Exception:
        return None

    return None


def _sanitize_lyrics_text(lyrics: str | None) -> str:
    if not lyrics:
        return ""
    text = re.sub(r"\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]\s*", "", lyrics)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _fetch_itunes_metadata(query: str) -> dict[str, str]:
    if not query.strip():
        return {}

    endpoint = f"https://itunes.apple.com/search?entity=song&limit=1&term={quote_plus(query)}"
    try:
        request = Request(
            endpoint,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
            },
        )
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {}

    if not isinstance(payload, dict):
        return {}
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return {}
    top = results[0]
    if not isinstance(top, dict):
        return {}

    title = str(top.get("trackName") or "").strip()
    artist = str(top.get("artistName") or "").strip()
    album = str(top.get("collectionName") or "").strip()
    artwork_600 = str(top.get("artworkUrl600") or "").strip()
    artwork_100 = str(top.get("artworkUrl100") or "").strip()
    artwork = artwork_600 or artwork_100
    if artwork and "100x100" in artwork:
        artwork = artwork.replace("100x100bb", "1000x1000bb").replace("100x100", "1000x1000")

    return {
        "title": title,
        "artist": artist,
        "album": album,
        "artworkUrl": artwork,
    }


def _apply_tags(
    mp3_path: Path,
    title: str,
    artist: str,
    album: str,
    artwork_url: str,
    lyrics: str | None,
) -> None:
    try:
        try:
            tags = ID3(str(mp3_path))
        except ID3NoHeaderError:
            tags = ID3()

        tags.delall("TIT2")
        tags.delall("TPE1")
        tags.delall("TALB")
        tags.delall("USLT")
        tags.delall("APIC")

        if title:
            tags.add(TIT2(encoding=3, text=title))
        if artist:
            tags.add(TPE1(encoding=3, text=artist))
        if album:
            tags.add(TALB(encoding=3, text=album))

        if lyrics:
            tags.add(USLT(encoding=3, lang="eng", desc="", text=lyrics))

        artwork_bytes, mime_type = _download_artwork_bytes(artwork_url)
        if artwork_bytes:
            tags.add(APIC(encoding=3, mime=mime_type, type=3, desc="Cover", data=artwork_bytes))

        tags.save(str(mp3_path), v2_version=3)
    except Exception:
        # Tagging failures should not block media delivery.
        return


def process_media(payload: dict[str, Any] | str) -> dict[str, object]:
    normalized_payload = payload if isinstance(payload, dict) else {"query": str(payload)}
    query_value = normalized_payload.get("query")
    if isinstance(query_value, (dict, list, tuple, set)):
        query = json.dumps(query_value, ensure_ascii=False).strip()
    else:
        query = str(query_value or "").strip()
    provided_title = str(normalized_payload.get("title") or "").strip()
    provided_artist = str(normalized_payload.get("artist") or "").strip()
    provided_album = str(normalized_payload.get("album") or "").strip()
    artwork_url = str(normalized_payload.get("artworkUrl") or "").strip()

    project_root = Path(__file__).resolve().parent
    storage_dir = project_root / "server" / "storage" / "rainboow"
    storage_dir.mkdir(parents=True, exist_ok=True)

    output_template = str(storage_dir / "%(title)s [%(id)s].%(ext)s")
    if not query:
        query = " - ".join(part for part in [provided_artist, provided_title] if part).strip()
    if not query:
        raise RuntimeError("query is required")

    normalized_query = query
    ydl_opts: dict[str, object] = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "outtmpl": output_template,
        "default_search": "auto",
        "extractaudio": True,
        "audioformat": "mp3",
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }

    info, requested = _download_with_fallback(ydl_opts, normalized_query)

    requested_path = Path(requested)
    mp3_path = requested_path.with_suffix(".mp3")
    if not mp3_path.exists():
        alt_candidates = sorted(storage_dir.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not alt_candidates:
            raise RuntimeError("Downloaded mp3 file was not found in storage")
        mp3_path = alt_candidates[0]

    itunes_meta = _fetch_itunes_metadata(query=normalized_query)
    resolved_title = (
        itunes_meta.get("title")
        or provided_title
        or str(info.get("track") or info.get("title") or mp3_path.stem)
    )
    resolved_artist = (
        itunes_meta.get("artist")
        or provided_artist
        or str(info.get("artist") or info.get("uploader") or "").strip()
    )
    resolved_album = (
        itunes_meta.get("album")
        or provided_album
        or str(info.get("album") or "").strip()
    )
    resolved_artwork_url = itunes_meta.get("artworkUrl") or artwork_url
    resolved_lyrics = _sanitize_lyrics_text(_fetch_lyrics(title=resolved_title, artist=resolved_artist, query=normalized_query))

    pretty_base_name = _sanitize_filename(
        " - ".join(part for part in [resolved_artist, resolved_title] if part.strip()) or resolved_title
    )
    final_path = storage_dir / f"{pretty_base_name}.mp3"
    if final_path.exists() and final_path.resolve() != mp3_path.resolve():
        index = 1
        while True:
            candidate = storage_dir / f"{pretty_base_name} ({index}).mp3"
            if not candidate.exists():
                final_path = candidate
                break
            index += 1

    if final_path.resolve() != mp3_path.resolve():
        mp3_path.rename(final_path)
        mp3_path = final_path

    _apply_tags(
        mp3_path=mp3_path,
        title=resolved_title,
        artist=resolved_artist,
        album=resolved_album,
        artwork_url=resolved_artwork_url,
        lyrics=resolved_lyrics,
    )

    absolute_file_path = str(mp3_path.resolve())
    pretty_name = mp3_path.name

    return {
        "ok": True,
        "file_path": absolute_file_path,
        "filename": pretty_name,
        "lyrics": resolved_lyrics or "",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Payload is required"}))
        raise SystemExit(1)

    try:
        raw_payload = sys.argv[1]
        if not isinstance(raw_payload, str):
            raw_payload = str(raw_payload)
        payload: dict[str, Any] | str
        try:
            parsed = json.loads(raw_payload)
            payload = parsed if isinstance(parsed, dict) else str(parsed)
        except json.JSONDecodeError:
            payload = raw_payload

        result = process_media(payload)
        print(json.dumps(result))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        raise SystemExit(1)
