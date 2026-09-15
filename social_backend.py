#!/usr/bin/env python3
"""Best-effort public Instagram/TikTok discovery layered on the existing backend.

No login bypasses, no private-content access. Results are public URLs discovered
through normal search result pages; the existing /media/import route still
performs the actual allow-listed fetch/import.
"""
import html as html_lib
import json
import re
import threading
import time
import urllib.request
from urllib.parse import parse_qs, quote, unquote, urlparse

import server

SOCIAL_SEARCH_TIMEOUT = 14
SOCIAL_CACHE_TTL = 600
_SOCIAL_PATTERNS = {
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/(?:reel|p)/[A-Za-z0-9_-]+/?", re.I),
    "tiktok": re.compile(r"https?://(?:www\.)?tiktok\.com/@[^/\s]+/video/\d+", re.I),
}
_cache = {}
_cache_lock = threading.Lock()


def _ddg_outbound(href):
    try:
        href = html_lib.unescape(href or "")
        if href.startswith("//"):
            href = "https:" + href
        parsed = urlparse(href)
        if "duckduckgo.com" in (parsed.hostname or ""):
            qs = parse_qs(parsed.query)
            if qs.get("uddg"):
                return unquote(qs["uddg"][0])
        return href
    except Exception:
        return href or ""


def _cached(key):
    with _cache_lock:
        item = _cache.get(key)
        if item and time.time() - item[0] < SOCIAL_CACHE_TTL:
            return item[1]
    return None


def _store(key, value):
    with _cache_lock:
        _cache[key] = (time.time(), value)


def social_search(query, source, want=8):
    source = (source or "").strip().lower()
    if source not in _SOCIAL_PATTERNS:
        raise ValueError("source must be instagram or tiktok")
    query = (query or "").strip()
    if not query:
        raise ValueError("missing q")
    want = max(1, min(int(want or 8), 12))
    cache_key = (source, query.lower(), want)
    hit = _cached(cache_key)
    if hit is not None:
        return hit

    site_q = "instagram.com/reel" if source == "instagram" else "tiktok.com/@"
    search_q = f'"{query}" site:{site_q}'
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    providers = [
        "https://html.duckduckgo.com/html/?q=" + quote(search_q),
        "https://www.bing.com/search?q=" + quote(search_q),
    ]
    pattern = _SOCIAL_PATTERNS[source]
    out, seen = [], set()
    last_error = None
    for url in providers:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=SOCIAL_SEARCH_TIMEOUT) as resp:
                page = resp.read(1_500_000).decode("utf-8", "ignore")
        except Exception as exc:
            last_error = exc
            continue

        candidates = []
        candidates.extend(re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', page, re.I | re.S))
        candidates.extend((m.group(0), "") for m in pattern.finditer(html_lib.unescape(page)))
        for href, raw_title in candidates:
            actual = _ddg_outbound(href)
            m = pattern.search(actual)
            if not m:
                continue
            clean_url = m.group(0)
            if clean_url in seen:
                continue
            seen.add(clean_url)
            title = re.sub(r"<[^>]+>", " ", raw_title)
            title = html_lib.unescape(re.sub(r"\s+", " ", title)).strip()
            out.append({
                "source": source,
                "url": clean_url,
                "title": title or f"{source.title()} result",
                "license_cleared": False,
            })
            if len(out) >= want:
                _store(cache_key, out)
                return out
        if out:
            break

    if not out and last_error:
        raise RuntimeError(f"social search unavailable: {last_error}")
    _store(cache_key, out)
    return out


class SocialHandler(server.Handler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/social/search":
            qs = parse_qs(parsed.query)
            query = (qs.get("q") or [""])[0].strip()
            source = (qs.get("source") or [""])[0].strip().lower()
            try:
                want = min(12, max(1, int((qs.get("max") or ["8"])[0] or 8)))
            except ValueError:
                want = 8
            if not query:
                return self.send_json({"error": "missing q"}, 400)
            try:
                return self.send_json({"results": social_search(query, source, want), "source": source})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
            except Exception as exc:
                return self.send_json({"error": str(exc)[:300]}, 502)
        return super().do_GET()
