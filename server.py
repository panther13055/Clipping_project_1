#!/usr/bin/env python3
"""Ranking Shorts Maker — local helper server.

Serves the app statically on http://localhost:8000 AND provides two
YouTube endpoints used for raw-clip sourcing, RESTRICTED to videos that
YouTube reports as Creative Commons Attribution licensed:

  GET  /yt/ping                      -> {"ok": true}
  GET  /yt/search?q=...&max=8       -> CC-only candidates (license verified
                                        per-video via full yt-dlp metadata)
  POST /yt/download {"id": ...}     -> downloads a short mp4 section into
                                        .cache/yt/ (license re-verified first)

Standard-license videos are NEVER returned or downloaded. Attribution data
(uploader, title, URL, license) is included in every response so the app can
build the required CC-BY credits list.

Requires: yt-dlp and ffmpeg on PATH (checked at startup).
Run:  python3 server.py     then open http://localhost:8000
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

PORT = 8000
APP_DIR = Path(__file__).resolve().parent
CACHE_DIR = APP_DIR / ".cache" / "yt"
MEDIA_CACHE = APP_DIR / ".cache" / "media"
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
YTDLP = shutil.which("yt-dlp") or "/opt/homebrew/bin/yt-dlp"
SEARCH_TIMEOUT = 90
META_TIMEOUT = 45
DL_TIMEOUT = 180
MAX_SECTION_SECONDS = 12.0
MAX_MEDIA_SECONDS = 15.0
# Paste-a-link import is limited to these video hosts. This is BOTH a safety
# guard (no arbitrary-URL fetch / SSRF) and a scope limit. Clips from here are
# NOT license-cleared — the app labels them so and the user owns that call.
ALLOWED_MEDIA_HOSTS = {
    "instagram.com", "www.instagram.com",
    "tiktok.com", "www.tiktok.com", "vm.tiktok.com", "m.tiktok.com",
    "youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com",
    "twitter.com", "x.com", "www.twitter.com", "mobile.twitter.com",
    "facebook.com", "www.facebook.com", "fb.watch",
    "vimeo.com", "www.vimeo.com",
}

_meta_cache: dict = {}
_meta_lock = threading.Lock()


def run_ytdlp(args, timeout):
    """Run yt-dlp with an argument LIST (never a shell) and return stdout."""
    proc = subprocess.run(
        [YTDLP, "--no-warnings", "--no-playlist", *args],
        capture_output=True, text=True, timeout=timeout, shell=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip().splitlines()[-1][:200] if proc.stderr else "yt-dlp failed")
    return proc.stdout


def video_metadata(video_id):
    """Full (non-flat) metadata for one video, cached in memory."""
    with _meta_lock:
        if video_id in _meta_cache:
            return _meta_cache[video_id]
    out = run_ytdlp(
        ["-J", "--skip-download", f"https://www.youtube.com/watch?v={video_id}"],
        META_TIMEOUT,
    )
    meta = json.loads(out)
    with _meta_lock:
        _meta_cache[video_id] = meta
    return meta


def is_cc(meta):
    """True only for YouTube's Creative Commons Attribution license."""
    return "creative commons" in (meta.get("license") or "").lower()


def is_english(meta):
    """English-only gate. The user does not want foreign-language clips.

    1. Trust YouTube's declared audio language when present: keep only "en*"
       (en, en-US, en-GB...). A declared non-English language is rejected
       outright — that's the strongest signal.
    2. When no language is declared, fall back to a script heuristic on the
       title: reject titles that are mostly non-Latin (Cyrillic, CJK, Arabic,
       Devanagari, Hangul, Thai, Hebrew, Greek...). This catches the obvious
       foreign videos without throwing away legitimate English ones.
    """
    lang = (meta.get("language") or "").strip().lower()
    if lang:
        return lang.startswith("en")
    title = meta.get("title") or ""
    letters = [c for c in title if c.isalpha()]
    if not letters:
        return True  # emoji/number-only title — don't reject on script alone
    def non_latin(c):
        o = ord(c)
        return (
            0x0400 <= o <= 0x04FF or   # Cyrillic
            0x0590 <= o <= 0x05FF or   # Hebrew
            0x0600 <= o <= 0x06FF or   # Arabic
            0x0900 <= o <= 0x097F or   # Devanagari
            0x0E00 <= o <= 0x0E7F or   # Thai
            0x1100 <= o <= 0x11FF or   # Hangul Jamo
            0x3040 <= o <= 0x30FF or   # Hiragana + Katakana
            0x3400 <= o <= 0x9FFF or   # CJK
            0xAC00 <= o <= 0xD7AF or   # Hangul syllables
            0x0370 <= o <= 0x03FF      # Greek
        )
    foreign = sum(1 for c in letters if non_latin(c))
    return foreign / len(letters) < 0.30


_WORD_RE = re.compile(r"[a-z0-9]+")
_TITLE_STOP = {"the", "and", "for", "with", "best", "top", "video", "videos",
               "compilation", "moments", "shorts", "clips", "you", "your",
               "that", "this", "new", "how", "why", "part"}


def title_overlap(title, query):
    """How many meaningful query words appear in the video title — used to rank
    candidates by relevance so unrelated clips sink to the bottom."""
    words = [w for w in _WORD_RE.findall((title or "").lower()) if len(w) >= 3]
    tset = set(words)
    qwords = [w for w in _WORD_RE.findall((query or "").lower())
              if len(w) >= 3 and w not in _TITLE_STOP]
    if not qwords:
        return 0
    return sum(1 for w in qwords if w in tset)


def cc_search(query, want):
    """CC-only search. Uses YouTube's own CC search filter (sp=EgIwAQ%3D%3D)
    to bias candidates, then STILL verifies the license of every single video
    via its full metadata — search results alone are never trusted."""
    # sp = Creative-Commons filter; lr/hl/gl bias the results toward English.
    url = ("https://www.youtube.com/results?search_query="
           + quote(query) + "&sp=EgIwAQ%253D%253D&lr=lang_en&hl=en&gl=US")
    out = run_ytdlp(
        ["--flat-playlist", "-J", "--playlist-end", str(max(12, want * 2)), url],
        SEARCH_TIMEOUT,
    )
    entries = (json.loads(out) or {}).get("entries") or []
    results, checked = [], 0
    for e in entries:
        if len(results) >= want or checked >= 12:
            break
        vid = e.get("id") or ""
        if not VIDEO_ID_RE.match(vid):
            continue
        checked += 1
        try:
            meta = video_metadata(vid)
        except Exception:
            continue
        if not is_cc(meta):
            continue  # non-negotiable: standard-license videos never pass
        if not is_english(meta):
            continue  # English-only: skip foreign-language clips
        dur = meta.get("duration") or 0
        results.append({
            "id": vid,
            "title": meta.get("title") or "",
            "uploader": meta.get("uploader") or meta.get("channel") or "",
            "duration": dur,
            "thumbnail": meta.get("thumbnail") or "",
            "license": meta.get("license") or "",
            "webpage_url": meta.get("webpage_url") or f"https://www.youtube.com/watch?v={vid}",
            "relevance": title_overlap(meta.get("title") or "", query),
            # good raw clips are long enough to slice a clean section from but
            # not hour-long uploads; short (<8s) videos rarely work.
            "preferred": 12 <= dur <= 600,
        })
    # most relevant first, then well-sized clips, then shortest.
    results.sort(key=lambda r: (-r["relevance"], not r["preferred"], r["duration"] or 9999))
    return results


def cc_download(video_id, start=None, end=None):
    """Download a short mp4 section of a CC-verified video into .cache/yt/."""
    if not VIDEO_ID_RE.match(video_id or ""):
        raise ValueError("invalid video id")
    meta = video_metadata(video_id)      # re-verify license BEFORE download
    if not is_cc(meta):
        raise PermissionError("refused: video is not Creative Commons licensed")

    try:
        s = max(0.0, float(start)) if start is not None else 0.0
        e = float(end) if end is not None else s + MAX_SECTION_SECONDS
    except (TypeError, ValueError):
        raise ValueError("invalid start/end")
    if e <= s:
        raise ValueError("invalid section")
    e = min(e, s + MAX_SECTION_SECONDS)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{video_id}_{int(s)}_{int(e)}.mp4"
    if not dest.exists():
        run_ytdlp([
            # Best video up to 1080p + best audio, merged to mp4 (ffmpeg). Falls
            # back to the best progressive stream. Prefer higher resolution.
            "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
            "-S", "res:1080,fps,vcodec:h264,acodec:aac",
            "--merge-output-format", "mp4",
            "--download-sections", f"*{s}-{e}",
            "--force-keyframes-at-cuts",  # clean cut at section boundaries
            "-o", str(dest),
            f"https://www.youtube.com/watch?v={video_id}",
        ], DL_TIMEOUT)
        if not dest.exists():  # yt-dlp may append an extension
            for cand in CACHE_DIR.glob(f"{video_id}_{int(s)}_{int(e)}.*"):
                cand.rename(dest)
                break
    if not dest.exists():
        raise RuntimeError("download produced no file")
    return {
        "url": f"/.cache/yt/{dest.name}",
        "id": video_id,
        "title": meta.get("title") or "",
        "uploader": meta.get("uploader") or meta.get("channel") or "",
        "license": meta.get("license") or "",
        "webpage_url": meta.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}",
    }


def _host_allowed(url):
    try:
        return (urlparse(url).hostname or "").lower() in ALLOWED_MEDIA_HOSTS
    except Exception:
        return False


def media_import(url, start=None, end=None):
    """Download a section of a pasted video LINK (Instagram/TikTok/YouTube/…) as
    an mp4 clip. NOT license-checked — these are copyrighted; the app labels the
    clip 'not license-cleared' and the user is responsible for how they use it.
    Restricted to ALLOWED_MEDIA_HOSTS (no arbitrary-URL fetch)."""
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ValueError("invalid url")
    if not _host_allowed(url):
        raise PermissionError("that link's site isn't supported")

    meta = json.loads(run_ytdlp(["-J", "--skip-download", url], META_TIMEOUT))
    if meta.get("_type") == "playlist":  # a profile/collection, not one video
        raise ValueError("link must point to a single video/reel")
    dur = float(meta.get("duration") or 0)

    try:
        s = max(0.0, float(start)) if start is not None else 0.0
        e = float(end) if end is not None else s + min(MAX_MEDIA_SECONDS, dur or MAX_MEDIA_SECONDS)
    except (TypeError, ValueError):
        raise ValueError("invalid start/end")
    if e <= s:
        e = s + MAX_MEDIA_SECONDS
    e = min(e, s + MAX_MEDIA_SECONDS)

    MEDIA_CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{url}|{s}|{e}".encode()).hexdigest()[:16]
    dest = MEDIA_CACHE / f"{key}.mp4"
    if not dest.exists():
        run_ytdlp([
            "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
            "-S", "res:1080,fps,vcodec:h264,acodec:aac",
            "--merge-output-format", "mp4",
            "--download-sections", f"*{s}-{e}",
            "--force-keyframes-at-cuts",
            "-o", str(dest),
            url,
        ], DL_TIMEOUT)
        if not dest.exists():
            for cand in MEDIA_CACHE.glob(f"{key}.*"):
                cand.rename(dest)
                break
    if not dest.exists():
        raise RuntimeError("download produced no file")
    return {
        "url": f"/.cache/media/{dest.name}",
        "title": meta.get("title") or meta.get("description") or "clip",
        "uploader": meta.get("uploader") or meta.get("channel") or meta.get("uploader_id") or "",
        "webpage_url": meta.get("webpage_url") or url,
        "extractor": (meta.get("extractor_key") or meta.get("extractor") or "").lower(),
        "license_cleared": False,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, fmt, *args):  # quieter static logs
        if "/yt/" in (args[0] if args else ""):
            sys.stderr.write("[yt] %s\n" % (args[0],))

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/yt/ping":
            return self.send_json({"ok": True, "ytdlp": Path(YTDLP).exists()})
        if parsed.path == "/yt/search":
            qs = parse_qs(parsed.query)
            query = (qs.get("q") or [""])[0].strip()
            want = min(10, max(1, int((qs.get("max") or ["8"])[0] or 8)))
            if not query:
                return self.send_json({"error": "missing q"}, 400)
            try:
                return self.send_json({"results": cc_search(query, want)})
            except Exception as exc:
                return self.send_json({"error": str(exc)[:300]}, 502)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/yt/download", "/media/import"):
            return self.send_json({"error": "not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            if parsed.path == "/media/import":
                info = media_import(body.get("url"), body.get("start"), body.get("end"))
            else:
                info = cc_download(body.get("id"), body.get("start"), body.get("end"))
            return self.send_json(info)
        except PermissionError as exc:
            return self.send_json({"error": str(exc)}, 403)
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            return self.send_json({"error": str(exc)[:300]}, 502)


def main():
    if not Path(YTDLP).exists() and not shutil.which("yt-dlp"):
        print("WARNING: yt-dlp not found — YouTube CC sourcing will fail. "
              "Install it (brew install yt-dlp) or use stock/procedural sources.")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("=" * 62)
    print("  Ranking Shorts Maker helper server")
    print(f"  App:            http://localhost:{PORT}")
    print("  YouTube CC API: /yt/search, /yt/download  (CC-BY videos ONLY)")
    print("  Stop with Ctrl+C")
    print("=" * 62, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
