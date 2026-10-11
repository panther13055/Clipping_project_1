from pathlib import Path

APP = Path("app.js")
HTML = Path("index.html")
s = APP.read_text(encoding="utf-8")
h = HTML.read_text(encoding="utf-8")

if "RANK_SPACING_BOX_MOVE_V1" in s:
    raise SystemExit("rank spacing + draggable box patch already applied")

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}")
    return text.replace(old, new, 1)

def all_at_least(text, old, new, minimum, label):
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{label}: expected at least {minimum} targets, found {count}")
    return text.replace(old, new)

# Add persisted editor options.
s = once(s,
'''    groupMove: false,    // when true, dragging any rank moves the whole list
''',
'''    groupMove: false,    // when true, dragging any rank moves the whole list
    autoRankSpacing: true, // dragging a rank reflows the stack with equal gaps
    rankBoxMove: false,    // show a draggable outline around the complete rank stack
''', "state defaults")

# Do not let the group hit-target include itself when computing the real text union.
s = once(s,
'''      const rs = hitBoxes.filter((hb) => hb.id.indexOf("rank") === 0);
''',
'''      const rs = hitBoxes.filter((hb) => /^rank\\d+$/.test(hb.id));
''', "group bounds filter")

# Draw a dedicated, draggable outline around all ranks (editor only; never in export).
s = once(s,
'''    drawTitle(c);
    drawRanks(c, revealed);
    drawFreeTexts(c);
''',
'''    drawTitle(c);
    drawRanks(c, revealed);

    // RANK_SPACING_BOX_MOVE_V1: optional group frame. The visible outline is
    // draggable; clicks directly on a rank still select that individual rank.
    if (state.rankBoxMove && !engine.recording && !engine.running) {
      const rankRows = hitBoxes.filter((hb) => /^rank\\d+$/.test(hb.id));
      if (rankRows.length) {
        const gx1 = Math.min(...rankRows.map((b) => b.x));
        const gy1 = Math.min(...rankRows.map((b) => b.y));
        const gx2 = Math.max(...rankRows.map((b) => b.x + b.w));
        const gy2 = Math.max(...rankRows.map((b) => b.y + b.h));
        const pad = 34;
        const groupHit = { id:"ranksGroup", x:gx1-pad, y:gy1-pad, w:gx2-gx1+pad*2, h:gy2-gy1+pad*2 };
        hitBoxes.push(groupHit);
        c.save();
        c.setLineDash([14,10]); c.lineWidth=3; c.strokeStyle="rgba(91,214,255,.96)";
        c.strokeRect(groupHit.x, groupHit.y, groupHit.w, groupHit.h);
        c.setLineDash([]);
        c.fillStyle="rgba(7,13,24,.96)";
        c.fillRect(groupHit.x, groupHit.y-24, 118, 22);
        c.fillStyle="#8ceaff"; c.font="bold 16px system-ui"; c.textAlign="left"; c.textBaseline="middle";
        c.fillText("DRAG RANK BOX", groupHit.x+7, groupHit.y-13);
        c.restore();
      }
    }

    drawFreeTexts(c);
''', "rank box renderer")

# Make the border itself the group drag target, without stealing normal rank clicks.
s = once(s,
'''  function hitTest(p) {
    const pri = (b) => (b.id.startsWith("free:") ? 0 : b.id.indexOf("rank") === 0 ? 1 : b.id === "title" ? 2 : b.id === "videoRect" ? 4 : 3);
    const ordered = [...hitBoxes].sort((a, b) => pri(a) - pri(b));
''',
'''  function hitTest(p) {
    if (state.rankBoxMove) {
      const group = hitBoxes.find((b) => b.id === "ranksGroup");
      if (group) {
        const edge = 16;
        const inside = p.x >= group.x && p.x <= group.x + group.w && p.y >= group.y && p.y <= group.y + group.h;
        const onEdge = p.x - group.x <= edge || group.x + group.w - p.x <= edge ||
          p.y - group.y <= edge || group.y + group.h - p.y <= edge;
        if (inside && onEdge) return group;
      }
    }
    const pri = (b) => (b.id.startsWith("free:") ? 0 : /^rank\\d+$/.test(b.id) ? 1 : b.id === "title" ? 2 : b.id === "ranksGroup" ? 3 : b.id === "videoRect" ? 4 : 3);
    const ordered = [...hitBoxes].sort((a, b) => pri(a) - pri(b));
''', "group hit testing")

# Replace pointer release so enabled auto-spacing reflows around the row the user moved.
s = once(s,
'''  const endDrag = (e) => {
    if (!drag) return;
    drag=null; activeGuides=[]; canvas.style.cursor="default";
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    commitHistory(); renderStatic(); updateSelectionControls();
  };
''',
'''  const endDrag = (e) => {
    if (!drag) return;
    const endedDrag = drag;
    drag=null; activeGuides=[]; canvas.style.cursor="default";
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    // If a single row was moved, keep that row near its dropped position and
    // reflow every other row around it with equal visible gaps. Group drags
    // already preserve spacing and should not be reflowed.
    if (state.autoRankSpacing !== false && !state.groupMove && /^rank\\d+$/.test(endedDrag.id)) {
      renderStatic();
      const anchorPos = Number(endedDrag.id.slice(4));
      const anchor = hitBoxes.find((b) => b.id === "rank" + anchorPos);
      if (anchor) equalizeRankSpacing(anchorPos, anchor.y);
    }
    commitHistory(); renderStatic(); updateSelectionControls();
  };
''', "drag release reflow")

# Add height-aware equal spacing. Anchored mode keeps the row being dragged at
# its drop position (clamped to the list area) while distributing other rows.
old = '''  $("btn-distribute-ranks").addEventListener("click",()=>{
    renderStatic(); const boxes=[];
    for(let pos=1;pos<=state.numRanks;pos++){const hb=hitBoxes.find((b)=>b.id==="rank"+pos);if(hb)boxes.push({pos,hb});}
    if(boxes.length>1){
      const maxH=Math.max(...boxes.map((it)=>it.hb.h));
      const first=LIST_BOX.y1, last=LIST_BOX.y2-maxH;
      boxes.forEach((it,i)=>{const target=first+(last-first)*(i/(boxes.length-1));const o=getOffset("rank"+it.pos);state.layout.ranks[it.pos]={dx:o.dx,dy:o.dy+(target-it.hb.y)};});
      commitHistory();renderStatic();updateSelectionControls();
    }
  });
'''
new = '''  function equalizeRankSpacing(anchorPos = null, anchorY = null) {
    const rows = [];
    for (let pos=1; pos<=state.numRanks; pos++) {
      const hb = hitBoxes.find((b) => b.id === "rank" + pos);
      if (hb) rows.push({ pos, hb, h: Math.max(1, hb.h) });
    }
    if (rows.length < 2) return false;

    const list = layoutMetrics().list;
    const top = list.y1 + 12, bottom = list.y2 - 12;
    const heights = rows.map((r) => r.h);
    const totalHeight = heights.reduce((sum, value) => sum + value, 0);
    let targets = new Array(rows.length);
    let gap = Math.max(0, (bottom - top - totalHeight) / (rows.length - 1));

    const anchorIndex = anchorPos == null ? -1 : rows.findIndex((r) => r.pos === anchorPos);
    if (anchorIndex >= 0) {
      const beforeHeight = heights.slice(0, anchorIndex).reduce((sum, value) => sum + value, 0);
      const afterHeight = heights.slice(anchorIndex + 1).reduce((sum, value) => sum + value, 0);
      const minY = top + beforeHeight;
      const maxY = bottom - heights[anchorIndex] - afterHeight;
      const wantedY = Number.isFinite(anchorY) ? anchorY : rows[anchorIndex].hb.y;
      const fixedY = clamp(wantedY, minY, maxY);
      const beforeGap = anchorIndex > 0 ? (fixedY - top - beforeHeight) / anchorIndex : Infinity;
      const afterCount = rows.length - anchorIndex - 1;
      const afterGap = afterCount > 0 ? (bottom - fixedY - heights[anchorIndex] - afterHeight) / afterCount : Infinity;
      gap = Math.max(0, Math.min(beforeGap, afterGap));
      targets[anchorIndex] = fixedY;
      for (let i=anchorIndex-1; i>=0; i--) targets[i] = targets[i+1] - gap - heights[i];
      for (let i=anchorIndex+1; i<rows.length; i++) targets[i] = targets[i-1] + heights[i-1] + gap;
    } else {
      targets[0] = top;
      for (let i=1; i<rows.length; i++) targets[i] = targets[i-1] + heights[i-1] + gap;
    }

    rows.forEach((row, i) => {
      const old = state.layout.ranks[row.pos] || { dx:0, dy:0 };
      state.layout.ranks[row.pos] = {
        dx: Number(old.dx) || 0,
        dy: (Number(old.dy) || 0) + targets[i] - row.hb.y,
      };
    });
    return true;
  }

  $("btn-distribute-ranks").addEventListener("click",()=>{
    renderStatic();
    if (equalizeRankSpacing()) {
      commitHistory(); renderStatic(); updateSelectionControls();
    }
  });
'''
s = once(s, old, new, "equal spacing button")

# Persist these editor preferences in project JSON and undo/redo snapshots.
s = all_at_least(s,
'''titleScale: state.titleScale, sideScale: state.sideScale, groupMove: state.groupMove,''',
'''titleScale: state.titleScale, sideScale: state.sideScale, groupMove: state.groupMove,
          autoRankSpacing: state.autoRankSpacing !== false, rankBoxMove: !!state.rankBoxMove,''',
2, "snapshot persistence")
s = once(s,
'''    state.titleScale = s.titleScale; state.sideScale = s.sideScale; state.groupMove = s.groupMove;
''',
'''    state.titleScale = s.titleScale; state.sideScale = s.sideScale; state.groupMove = s.groupMove;
    state.autoRankSpacing = s.autoRankSpacing !== false; state.rankBoxMove = !!s.rankBoxMove;
''', "undo snapshot restore")
s = once(s,
'''      state.groupMove = !!s.groupMove; state.editRank = s.editRank || 1;
''',
'''      state.groupMove = !!s.groupMove; state.autoRankSpacing = s.autoRankSpacing !== false; state.rankBoxMove = !!s.rankBoxMove;
      state.editRank = s.editRank || 1;
''', "project import restore")

# Sync toggles after loading/reset/undo.
s = once(s,
'''    const gm = $("inp-group-move"); if (gm) gm.checked = state.groupMove;
''',
'''    const gm = $("inp-group-move"); if (gm) gm.checked = state.groupMove;
    const ars = $("inp-auto-rank-spacing"); if (ars) ars.checked = state.autoRankSpacing !== false;
    const rbm = $("inp-rank-box-move"); if (rbm) rbm.checked = !!state.rankBoxMove;
''', "control sync")

# Register the two new controls.
s = once(s,
'''  // group-move toggle: when on, dragging any rank moves the whole list at once
  const grp = $("inp-group-move");
  if (grp) grp.addEventListener("change", (e) => { state.groupMove = e.target.checked; scheduleCommit(); });
''',
'''  // Group drag moves the whole stack when any rank is grabbed.
  const grp = $("inp-group-move");
  if (grp) grp.addEventListener("change", (e) => { state.groupMove = e.target.checked; scheduleCommit(); renderStatic(); });

  const autoSpace = $("inp-auto-rank-spacing");
  if (autoSpace) autoSpace.addEventListener("change", (e) => {
    state.autoRankSpacing = e.target.checked;
    scheduleCommit();
  });

  const rankBox = $("inp-rank-box-move");
  if (rankBox) rankBox.addEventListener("change", (e) => {
    state.rankBoxMove = e.target.checked;
    selectedTextId = null;
    scheduleCommit();
    renderStatic();
  });
''', "new option listeners")

APP.write_text(s, encoding="utf-8")

# Add controls directly under the existing group-move toggle.
old_html = '''        <label class="field check-field">
          <input type="checkbox" id="inp-group-move"> Move ranks as one group
        </label>
'''
new_html = '''        <label class="field check-field">
          <input type="checkbox" id="inp-group-move"> Drag any rank = move whole list
        </label>
        <label class="field check-field">
          <input type="checkbox" id="inp-auto-rank-spacing" checked> Auto equal spacing when a rank is moved
        </label>
        <label class="field check-field">
          <input type="checkbox" id="inp-rank-box-move"> Show draggable rank box (drag its border to move all ranks)
        </label>
'''
h = once(h, old_html, new_html, "layout controls")
h = once(h, 'id="btn-distribute-ranks">Distribute ranks</button>', 'id="btn-distribute-ranks">Equal spacing</button>', "equal spacing label")
h = once(h,
'''          <p class="hint" style="margin-bottom:0">Tip: drag text directly on the preview. Arrow keys nudge 2px; Shift+Arrow nudges 10px. Snapping helps with center/safe-zone alignment.</p>''',
'''          <p class="hint" style="margin-bottom:0">Tip: drag a rank to set its position; Auto equal spacing reflows the other ranks around it. Enable the draggable rank box to move the full rank stack by its border. Arrow keys nudge 2px; Shift+Arrow nudges 10px.</p>''',
"layout help text")
HTML.write_text(h, encoding="utf-8")

print("Applied rank equal-spacing + draggable rank-box controls.")
