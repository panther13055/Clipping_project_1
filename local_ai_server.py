#!/usr/bin/env python3
"""Free local video enhancement helper for Ranking Shorts Maker.

Runs only on the creator's PC. No paid API/key is required.

Required:
  - Python 3.9+
  - ffmpeg + ffprobe on PATH

Recommended for real neural super-resolution:
  - Real-ESRGAN ncnn-vulkan executable on PATH, OR place
    realesrgan-ncnn-vulkan(.exe) in ./tools/realesrgan/

The helper uses temporal/spatial cleanup in FFmpeg, then Real-ESRGAN when
available, then a high-quality encode. It deliberately reports when the neural
engine is missing instead of pretending a normal resize is AI.
"""

from __future__ import annotations

import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("LOCAL_AI_PORT", "8765"))
ROOT = Path(__file__).resolve().parent
TOOLS = ROOT / "tools"
MAX_UPLOAD = 2 * 1024 * 1024 * 1024  # 2 GB; local short-form clips only


def which_any(names: list[str], extra: list[Path] | None = None) -> str | None:
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    for p in extra or []:
        if p.exists() and p.is_file():
            return str(p)
    return None


def tool_state() -> dict:
    ffmpeg = which_any(["ffmpeg"])
    ffprobe = which_any(["ffprobe"])
    realesrgan = which_any(
        ["realesrgan-ncnn-vulkan", "realesrgan-ncnn-vulkan.exe"],
        [
            TOOLS / "realesrgan" / "realesrgan-ncnn-vulkan.exe",
            TOOLS / "realesrgan" / "realesrgan-ncnn-vulkan",
            ROOT / "realesrgan-ncnn-vulkan.exe",
            ROOT / "realesrgan-ncnn-vulkan",
        ],
    )
    return {"ffmpeg": ffmpeg, "ffprobe": ffprobe, "realesrgan": realesrgan}


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("[local-ai]", " ".join(str(x) for x in cmd), flush=True)
    p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        tail = (p.stdout or "")[-8000:]
        raise RuntimeError(tail.strip() or f"Command failed with code {p.returncode}")


def probe_video(path: Path, ffprobe: str) -> dict:
    p = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate", "-of", "json", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if p.returncode != 0:
        raise RuntimeError((p.stderr or "ffprobe failed").strip())
    data = json.loads(p.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError("No video stream found")
    s = streams[0]
    fps_text = s.get("avg_frame_rate") or s.get("r_frame_rate") or "30/1"
    try:
        a, b = fps_text.split("/", 1)
        fps = float(a) / max(float(b), 1e-9)
    except Exception:
        fps = 30.0
    if not (1 <= fps <= 240):
        fps = 30.0
    return {"width": int(s.get("width") or 0), "height": int(s.get("height") or 0), "fps": fps}


def ffmpeg_cleanup(input_path: Path, output_path: Path, ffmpeg: str, tier: str, content: str) -> None:
    # hqdn3d includes temporal denoise; values stay intentionally conservative
    # to avoid the waxy/oversharpened look common in aggressive enhancers.
    if tier == "max":
        dn = "hqdn3d=2.0:1.6:6.0:5.0"
        sharp = "unsharp=5:5:0.48:5:5:0.0"
        eq = "eq=contrast=1.045:saturation=1.06:brightness=0.003"
    else:
        dn = "hqdn3d=1.3:1.1:4.5:3.5"
        sharp = "unsharp=5:5:0.30:5:5:0.0"
        eq = "eq=contrast=1.025:saturation=1.035"

    if content == "cartoon":
        dn = "hqdn3d=0.8:0.7:3.0:2.5"
        sharp = "unsharp=5:5:0.38:5:5:0.0"
    elif content == "faces":
        sharp = "unsharp=5:5:0.22:5:5:0.0"
    elif content == "compressed":
        dn = "hqdn3d=2.4:2.0:7.0:6.0" if tier == "max" else "hqdn3d=1.8:1.5:5.5:4.5"

    vf = ",".join([dn, sharp, eq])
    run([
        ffmpeg, "-y", "-i", str(input_path), "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "15",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(output_path)
    ])


def realesrgan_model(content: str) -> str:
    # These names are supported by the common Real-ESRGAN ncnn-vulkan package.
    if content == "cartoon":
        return "realesr-animevideov3"
    return "realesrgan-x4plus"


def neural_upscale(cleaned: Path, out_video: Path, *, ffmpeg: str, ffprobe: str, realesrgan: str, scale: int, tier: str, content: str, fps60: bool) -> None:
    info = probe_video(cleaned, ffprobe)
    fps = info["fps"]

    with tempfile.TemporaryDirectory(prefix="ranking_ai_frames_") as td:
        t = Path(td)
        frames = t / "frames"
        up = t / "up"
        frames.mkdir()
        up.mkdir()

        # Normalize VFR sources before frame extraction; rebuilding a VFR
        # source as CFR without this can change video speed.
        run([ffmpeg, "-y", "-i", str(cleaned), "-vf", f"fps={fps:.6f}", str(frames / "%08d.png")])
        model = realesrgan_model(content)
        exe_dir = Path(realesrgan).resolve().parent
        model_dir = exe_dir / "models"
        if not model_dir.exists():
            raise RuntimeError(f"Real-ESRGAN models folder was not found next to the executable: {model_dir}")
        cmd = [realesrgan, "-i", str(frames), "-o", str(up), "-m", str(model_dir), "-n", model, "-s", str(scale), "-j", "2:2:2", "-f", "png"]
        # TTA is several times slower. Keep Max usable unless explicitly enabled.
        if tier == "max" and os.environ.get("LOCAL_AI_TTA", "0") == "1":
            cmd.append("-x")
        run(cmd, cwd=exe_dir)

        filters: list[str] = []
        if fps60:
            filters.append("minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
        # A tiny post-upscale detail pass; stronger sharpening is intentionally avoided.
        filters.append("unsharp=5:5:0.16:5:5:0.0")
        vf_args = ["-vf", ",".join(filters)] if filters else []
        out_fps = 60 if fps60 else fps
        preset = "slow" if tier == "max" else "medium"
        crf = "13" if tier == "max" else "15"
        run([
            ffmpeg, "-y",
            "-framerate", f"{fps:.6f}", "-i", str(up / "%08d.png"),
            "-i", str(cleaned),
            *vf_args,
            "-map", "0:v:0", "-map", "1:a?",
            "-r", f"{out_fps:.6f}",
            "-c:v", "libx264", "-preset", preset, "-crf", crf,
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", "-shortest", str(out_video)
        ])


def ffmpeg_upscale_fallback(cleaned: Path, out_video: Path, *, ffmpeg: str, scale: int, tier: str, fps60: bool) -> None:
    filters = [f"scale=iw*{scale}:ih*{scale}:flags=lanczos"]
    if fps60:
        filters.append("minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    filters.append("unsharp=5:5:0.18:5:5:0.0")
    preset = "slow" if tier == "max" else "medium"
    crf = "13" if tier == "max" else "15"
    run([
        ffmpeg, "-y", "-i", str(cleaned), "-vf", ",".join(filters),
        "-c:v", "libx264", "-preset", preset, "-crf", crf,
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(out_video)
    ])


def enhance(input_path: Path, output_path: Path, tier: str, content: str, scale: int, fps60: bool) -> str:
    tools = tool_state()
    ffmpeg = tools["ffmpeg"]
    ffprobe = tools["ffprobe"]
    if not ffmpeg or not ffprobe:
        raise RuntimeError("FFmpeg/ffprobe not found. Install FFmpeg and add it to PATH.")

    cleaned = input_path.with_name("cleaned.mp4")
    ffmpeg_cleanup(input_path, cleaned, ffmpeg, tier, content)

    if tools["realesrgan"]:
        neural_upscale(
            cleaned, output_path,
            ffmpeg=ffmpeg, ffprobe=ffprobe, realesrgan=tools["realesrgan"],
            scale=scale, tier=tier, content=content, fps60=fps60,
        )
        return "Real-ESRGAN GPU + temporal cleanup"

    ffmpeg_upscale_fallback(cleaned, output_path, ffmpeg=ffmpeg, scale=scale, tier=tier, fps60=fps60)
    return "FFmpeg fallback (Real-ESRGAN not installed)"


class Handler(BaseHTTPRequestHandler):
    server_version = "RankingLocalAI/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print("[local-ai-http] " + fmt % args, flush=True)

    def cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename")
        # Required by current Chromium when an HTTPS site talks to localhost
        # after the user grants Local Network Access.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Expose-Headers", "X-Enhancer-Engine, X-Processing-Seconds")
        self.send_header("Cache-Control", "no-store")

    def send_json(self, code: int, obj: dict) -> None:
        raw = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:
        u = urllib.parse.urlparse(self.path)
        if u.path != "/health":
            self.send_json(404, {"error": "not found"})
            return
        t = tool_state()
        self.send_json(200, {
            "ok": True,
            "ffmpeg": bool(t["ffmpeg"]),
            "ffprobe": bool(t["ffprobe"]),
            "realesrgan": bool(t["realesrgan"]),
            "engine": "Real-ESRGAN GPU" if t["realesrgan"] else "FFmpeg fallback",
            "host": HOST,
            "port": PORT,
        })

    def do_POST(self) -> None:
        u = urllib.parse.urlparse(self.path)
        if u.path != "/enhance":
            self.send_json(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except Exception:
            length = 0
        if length <= 0:
            self.send_json(400, {"error": "empty upload"})
            return
        if length > MAX_UPLOAD:
            self.send_json(413, {"error": "clip is too large for the local helper (2 GB limit)"})
            return

        q = urllib.parse.parse_qs(u.query)
        tier = (q.get("tier", ["pro"])[0] or "pro").lower()
        if tier not in {"pro", "max"}:
            tier = "pro"
        content = (q.get("content", ["auto"])[0] or "auto").lower()
        if content not in {"auto", "real", "cartoon", "faces", "compressed"}:
            content = "auto"
        scale = 4 if q.get("scale", ["2"])[0] == "4" else 2
        fps60 = q.get("fps", ["original"])[0] == "60"

        name = urllib.parse.unquote(self.headers.get("X-Filename", "clip.mp4"))
        suffix = Path(name).suffix.lower() or mimetypes.guess_extension(self.headers.get("Content-Type", "")) or ".mp4"
        if suffix not in {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}:
            suffix = ".mp4"

        with tempfile.TemporaryDirectory(prefix="ranking_local_ai_") as td:
            td_path = Path(td)
            input_path = td_path / ("input" + suffix)
            output_path = td_path / "enhanced.mp4"
            remaining = length
            with input_path.open("wb") as f:
                while remaining > 0:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
            if input_path.stat().st_size <= 0:
                self.send_json(400, {"error": "upload did not contain video bytes"})
                return

            started = time.time()
            try:
                engine = enhance(input_path, output_path, tier, content, scale, fps60)
            except Exception as e:
                self.send_json(500, {"error": str(e)[-7000:]})
                return
            if not output_path.exists() or output_path.stat().st_size <= 0:
                self.send_json(500, {"error": "enhancement produced no output"})
                return

            size = output_path.stat().st_size
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition", 'attachment; filename="enhanced.mp4"')
            self.send_header("X-Enhancer-Engine", engine)
            self.send_header("X-Processing-Seconds", f"{time.time() - started:.1f}")
            self.end_headers()
            with output_path.open("rb") as f:
                shutil.copyfileobj(f, self.wfile, length=1024 * 1024)


def main() -> None:
    state = tool_state()
    print("\nRanking Shorts Maker — Free Local AI Enhancer")
    print("------------------------------------------------")
    print(f"Listening on http://{HOST}:{PORT}")
    print("FFmpeg:", state["ffmpeg"] or "NOT FOUND")
    print("Real-ESRGAN:", state["realesrgan"] or "NOT FOUND (FFmpeg fallback only)")
    print("No paid API is used. Processing stays on this computer.\n")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
