# Upgraded build notes

This build keeps the original 1080x1920 editor coordinate system and adds:

- Export quality selector: 1080x1920, 720x1280, 480x854.
- Off-screen export canvas used by both WebCodecs and MediaRecorder fallback.
- Deterministic WebCodecs frame timestamps and safer background-tab pause/resume.
- Project/playback/export duration cap increased from 60s to 120s.
- Easier text dragging with larger hit areas, snapping guides, selection outline, arrow-key nudging, precise X/Y fields, rank alignment controls, and position locking.
- Free text overlays: add short custom text, drag anywhere, set color/size, lock, reset or delete; saved inside .rankproj and included in export.
- Expanded quick color palette.
- Dark blue/cyan UI refresh (no white-theme surfaces).
- Corrected MP4 muxer script path in index.html.

## Run

From this folder:

```bash
python server.py
```

Then open the local URL shown by the server.

## Notes

The helper server still needs `yt-dlp` for YouTube Creative Commons sourcing. Local uploads, procedural backgrounds, editor features and other configured stock sources do not depend on yt-dlp.
