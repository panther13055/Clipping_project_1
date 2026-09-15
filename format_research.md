# Ranking Shorts — Format Research Report

Research date: 2026-07-21. Compiled from creator guides (vsub.io "Viral Top 5 Ranking Videos" guide, nexlev.io Shorts niches report, tubebuddy Shorts niches analysis), CapCut "Ranking Reveal" template documentation, safe-zone references (Kreatli, Somake, postplanify), Shorts SEO/hashtag guides (Hollyland, JoinBrands, shortgenius, minvo), and observed real examples on YouTube Shorts ("Ranking Best Football Fails 😭", "Ranking the best football fails 📈☠️", "Ranking sports moments from fails to LEGENDARY", "Ranking the Best Sports Fails Moments").

---

## 1. What the format is

A vertical 9:16 short (1080x1920) that compiles 5–10 clips around one theme and ranks them. A bold title sits at the top for the whole video. A numbered list runs down the LEFT side. As each clip plays, the label for that rank is revealed next to its number. Clips almost always play from the lowest rank up to #1 (countdown), so the viewer must finish the video to see the winner — this is the core retention mechanic and why the format dominates: countdown structure + numbered-list curiosity + minimal production cost.

Observed everywhere: sports (football fails dominate), NBA, general fails, gaming, food, animals, memes, celebrities, satisfying/ASMR, science experiments, cars, gym, extreme sports, school life, wholesome.

## 2. Visual anatomy (1080x1920 canvas)

```
+--------------------------------------+
|          (top: 220 px clear)         |  <- Shorts/TikTok top UI
|      RANKING BEST *POOL FAILS*       |  <- title, top-center, ~y 240-400
|                                      |
| 6. Diving goes wrong😭               |  <- list column, left-aligned
| 5. Aaaah💀                           |     x ≈ 60-90 px from left edge
| 4. The chair betrayed🪑              |     starts y ≈ 480, line pitch
| 3. ???                               |     ~110-130 px
| 2. ???                               |  <- unrevealed rows hidden or "?"
| 1. ???                               |
|                                      |
|        (clip fills background)       |
|   (bottom: ~350-400 px keep clear)   |  <- captions/handle/music UI
+--------------------------------------+
```

- The clip plays full-frame behind everything (scaled/cropped to fill 9:16; landscape source clips are usually center-cropped or shown with blurred-fill top/bottom).
- Title: 1–2 lines, top-center, persistent for the entire video.
- Rank list: left column, persistent; each row appears (or fills in) when its clip starts and STAYS on screen, so by #1 the whole list is visible — this is the screenshot/share payoff frame.

## 3. Text styling spec

Title:
- ALL CAPS or Title Case, extra-bold sans (Montserrat ExtraBold / Archivo Black / "TheBoldFont" / Komika Axis are the common picks).
- Fill: white. Stroke: black, thick — roughly 8–12 px stroke at 1080 width (stroke ≈ 10–15% of glyph height). Optional soft drop shadow (black, 40–60% opacity, 4–8 px offset) for legibility over bright clips.
- One accent phrase (the subject, e.g. "POOL FAILS") in red (#FF2E2E–#E62117 range). Everything else white. Sometimes accent is yellow/gold instead of red.
- Size: ~64–90 px cap height, i.e. title occupies roughly 5–8% of frame height per line, max width ~90% of frame.

Rank rows:
- Format: `{number}. {label}{emoji}` — label is 1–5 words, punchy, meme-voiced; exactly one fitting emoji at the end (occasionally two).
- Number styling rotates through gold/yellow (#FFD700), white, and red — either #1 gold with rest white, or colors alternating per row; numbers are frequently a step bolder/larger than label text.
- Label text: white fill, black outline (6–8 px), ~48–60 px height (≈ 3–4% of frame height per row).
- Same outlined bold font family as the title for cohesion.

Safe zones (from Kreatli/Somake/postplanify 2026 guides):
- Top: keep text below ~220–288 px (Shorts search/camera icons).
- Bottom: keep everything above the bottom ~350–670 px band (title/handle/music ticker + comment bar; strictest is TikTok). Practical rule: no text in the bottom 20% of frame.
- Right: keep ~160–192 px clear (like/comment/share/subscribe rail) — this is WHY the rank list lives on the LEFT.
- Left: ~48–60 px margin.
- Effective text-safe box ≈ x:[60, 888], y:[288, 1250] on a 1080x1920 canvas.

## 4. Timing and pacing

- Clip length: 2–6 s per clip; punchline fails run 2–4 s, #1 gets the longest slot (4–6 s) and the best clip.
- Total: 6 ranks x ~3.5 s ≈ 20–30 s total — the 15–40 s window guides cite as the retention sweet spot; 10-rank videos push 45–60 s (higher total views, lower completion).
- No intro. First clip and title are on screen at 0:00 (hook must land in 0–2 s). Some creators flash a 0.5 s preview of a chaotic moment first.
- Hard cuts between clips, no transitions (or a 2–3 frame white flash). Each cut = a reveal = a retention spike.
- Reveal order: worst_to_best (countdown) in ~90% of observed videos; occasional best_to_worst "we peaked early" novelty inversions.

## 5. Reveal mechanics

Common variants (all valid targets for the renderer):
1. Append: only revealed rows are on screen; new row pops in when its clip starts (most common).
2. Placeholder: all rows visible from the start as "6. ???", text fills in per clip.
3. Full-list-blur: list present but blurred/dimmed; rows sharpen on reveal.
- Reveal animation: instant pop or a 100–200 ms scale-bounce (1.2x → 1.0x); often paired with a "ding"/"pop" SFX.
- The current rank's row is sometimes briefly highlighted (scale 1.1x, or brighter color) while its clip plays.
- Freeze-zoom accent: on the fail moment, some creators freeze-frame and punch-zoom (the TikTok "Oh No" trend grammar).

## 6. Audio conventions

- Music bed: trending phonk (heavy bass, lo-fi vocals, dark synths) for sports/cars/gym; "Oh No" by Capone and comedic tracks for fails; emotional piano for wholesome; funny/quirky loops for animals/memes. Sync cuts to the beat; use the catchiest 5–15 s segment of the track.
- Original clip audio: usually kept (screams/impacts ARE the content), ducked under music (music ~-10 to -15 dB relative when clip audio matters).
- SFX layer: "ding"/"pop"/whoosh on each rank reveal; airhorn or bass-boost hit on #1; vine-boom/bruh for meme niches.
- Music volume ramps or track-drop often aligned with the #1 reveal.

## 7. Titles, metadata, virality patterns

Title formulas (observed + guide-recommended):
- "Ranking Best {X}" / "Ranking the Best {X}" (dominant), "Ranking the Worst {X}", "Ranking Craziest/Funniest/Most {ADJ} {X}", "Top {N} {X} Ranked", "{X} Tier List", "Ranking {X} from Fails to LEGENDARY".
- On-screen title usually ends with 1–2 emojis matching the niche (😭☠️📈🔥).
- Video description/title on platform repeats the on-screen title + #shorts.

Hashtags: 3–5 total, always #shorts; one broad (#viral, #fyp) + niche tags (#fails, #football, #nba, #gaming...). Hashtag stuffing (>5) suppresses reach; YouTube ignores all if >60.

Why it goes viral (synthesis of guides + format logic):
- Countdown curiosity: everyone waits for #1 → completion rate ↑ → algorithm push.
- Ordered list = built-in controversy: "nah, #3 should've been #1" comment wars.
- Replay value: final frame shows the whole list; viewers rewatch and share favorites.
- Repeatable template: same layout every video trains the audience and enables daily posting.
- End-card CTA: "Which was your favorite?" / "What should we rank next?" farms comments and future content ideas.
- Loops: 20–30 s videos that end on the #1 punchline loop back into the title seamlessly.

## 8. Implementation style guide (for the Main Developer)

- Canvas: 1080x1920, 30 fps (60 fps for sports), H.264, AAC.
- Layers bottom→top: clip video (cover-fit) → optional dark gradient behind text zones (black 0→35% alpha, top 400 px and left column) → rank list → title → SFX/music on audio track.
- Title: extra-bold sans, white fill #FFFFFF, black stroke ~10 px, accent substring in #FF2E2E; center x=540, first baseline ~y 300; wrap at 900 px width, max 2 lines.
- Rank rows: left x=70; first row y=480; row pitch 120 px; number colors cycle [gold #FFD700, white #FFFFFF, red #FF2E2E] (or #1=gold rule); label 52 px, number 60 px, stroke 7 px; one emoji suffix.
- Per-clip timeline: at clip start t, pop in row (scale 1.2→1.0 over 150 ms) + reveal SFX; hold all previous rows; #1 gets +1 s hold at end showing full list.
- Duration budget: sum(clip durations) target 20–35 s; clamp clips to [2, 6] s; give rank #1 the max-duration clip.
- Never place text right of x=888 or below y=1250; keep top 240 px title-only.

## 9. Sources

- https://vsub.io/blog/how-to-create-viral-top-5-ranking-videos-complete-guide-for-youtube-shorts-and-tiktok-success-in-2025
- https://capcut.se/ranking-reveal-capcut-template/
- https://www.nexlev.io/youtube-shorts-niches
- https://www.tubebuddy.com/blog/10-youtube-shorts-niches/
- https://kreatli.com/guides/youtube-shorts-safe-zone and https://kreatli.com/guides/safe-zone-guide
- https://www.somake.ai/blog/youtube-shorts-aspect-ratio
- https://postplanify.com/tools/youtube-shorts-safe-zone-checker
- https://www.hollyland.com/blog/topics/youtube-shorts-seo-best-practices
- https://joinbrands.com/blog/youtube-shorts-best-practices/
- https://shortgenius.com/blog/best-hashtags-for-youtube-shorts
- https://dubbingai.io/articles/en/collection/tiktok-phonk-sound-effects
- https://www.aol.com/news/tiktoks-oh-no-trend-making-204451697.html (Oh No fail-trend grammar)
- Observed examples: youtube.com/shorts/K5aCr0NTGno ("Ranking Best Football Fails ☠️"), youtube.com/shorts/pb9jMhsR6Vw, youtube.com/shorts/FRogJOq-6a4, youtube.com/shorts/p9UyvzUOfaI ("Ranking sports moments from fails to LEGENDARY"), youtube.com/shorts/VFtcN-gt0xE
