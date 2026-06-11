#!/usr/bin/env python3
"""Render the scan data-flow diagram (Free / Pro) to a PNG, matching the HTML."""
from PIL import Image, ImageDraw, ImageFont

S = 2  # supersampling scale for crisp text
JP = "/etc/alternatives/fonts-japanese-gothic.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

def jp(sz): return ImageFont.truetype(JP, int(sz * S))
def mono(sz): return ImageFont.truetype(MONO, int(sz * S))

# palette
INK   = (26, 26, 26)
PAPER = (250, 247, 241)
MUTED = (122, 122, 114)
WHITE = (255, 255, 255)
COL = {
    "client": ((232, 240, 255), (59, 111, 212)),
    "server": ((255, 243, 224), (212, 134, 15)),
    "ext":    ((234, 255, 240), (28, 154, 75)),
    "supa":   ((243, 232, 255), (139, 59, 212)),
    "plain":  ((246, 245, 242), (122, 122, 114)),
}
BADGE = {"ret": (28, 154, 75), "gate": (212, 134, 15), "err": (192, 57, 43)}

CONTENT_W = 1060
PAD = 22  # inner card padding

def tokenize(s):
    toks, cur = [], ""
    for ch in s:
        if ch == " ":
            if cur: toks.append(cur); cur = ""
            toks.append(" ")
        elif ord(ch) > 0x2E80:  # CJK & JP punctuation -> own token
            if cur: toks.append(cur); cur = ""
            toks.append(ch)
        else:
            cur += ch
    if cur: toks.append(cur)
    return toks

_d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
def tw(s, font): return _d.textlength(s, font=font)

def wrap(s, font, maxw):
    lines, line = [], ""
    for t in tokenize(s):
        cand = line + t
        if tw(cand, font) <= maxw or line == "":
            line = cand
        else:
            lines.append(line.rstrip()); line = t if t != " " else ""
    if line.strip() or not lines: lines.append(line.rstrip())
    return lines

def rr(d, box, r, fill=None, outline=None, width=1, dash=False):
    if not dash:
        d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)
        return
    d.rounded_rectangle(box, radius=r, fill=fill)
    # dashed outline approximation: draw rounded rect then overlay dashes is complex;
    # use solid lighter outline for dashed look
    d.rounded_rectangle(box, radius=r, outline=outline, width=width)

# ---- step model ----
class Step:
    def __init__(self, num, kind, color, frm, chip, desc, loc, badge=None):
        self.num, self.kind, self.color = num, kind, color
        self.frm, self.chip, self.desc, self.loc, self.badge = frm, chip, desc, loc, badge

FREE = [
    Step("1","api","client","クライアント → 自サーバー","POST /api/extract",
         "base64画像 + mode + scanModes + eikenLevel を送信（画像1枚ごとにループ）","ScanCaptureModal.tsx:136"),
    Step("2","api","supa","サーバー → Supabase Auth","auth.getUser()",
         "認証チェック","api/extract/route.ts:125",("401で拒否","err")),
    Step("3","api","supa","サーバー → Supabase RPC","check_and_increment_scan",
         "スキャン回数のサーバー側制限","route.ts:210",("429 / Pro限定は403","gate")),
    Step("4","api","ext","サーバー → Gemini 2.5 Flash","CLOUD_RUN設定時は /generate 経由",
         "OCR + 単語抽出。応答は Zod で検証","lib/ai/extract-words.ts / providers/index.ts:58"),
    Step("5","api","supa","サーバー → Supabase DB","lexicon マスター照会",
         "訳語のマスター先行解決。未ヒット分は AI 翻訳にフォールバック","lib/lexicon/master-first-scan.ts (route.ts:309)"),
    Step("6","api","supa","サーバー → Supabase DB","fetchExampleGenres",
         "ユーザーの例文ジャンル設定を取得","api/extract/route.ts:358"),
    Step("7","api","ext","サーバー → OpenAI GPT-4o-mini","例文生成",
         "例文のない単語に同期生成","generate-example-sentences.ts (route.ts:359)"),
    Step("8","api","supa","サーバー → Supabase DB","saveExamplesToLexicon",
         "生成例文をマスターへ保存（ベストエフォート / 失敗しても続行）","route.ts:413"),
    Step("9","return","server","サーバー → クライアント","JSON レスポンス",
         "{ success, words, sourceLabels, lexiconEntries, scanInfo }","api/extract/route.ts:426",("ここで返る","ret")),
    Step("10","noapi","plain","クライアント内（API 非経由）","",
         "sessionStorage 保存 → /scan/confirm へ遷移。確認画面は API を経由しない","ScanCaptureModal.tsx:165–173, 210"),
]
PRO = [
    Step("1","api","supa","クライアント → Supabase Storage","scan-images.upload()",
         "画像を直接アップロード（API ルートを通さない）","home-background-scan-upload.ts:72"),
    Step("2","api","client","クライアント → 自サーバー","POST /api/scan-jobs/create",
         "Bearer トークン + imagePaths でジョブ作成依頼","home-background-scan-upload.ts:96"),
    Step("3","return","server","サーバー → Supabase + クライアント","INSERT scan_jobs",
         "認証 + check_and_increment_scan RPC + ジョブ行 INSERT → { jobId } を即返す（処理完了は待たない）",
         "api/scan-jobs/create/route.ts",("jobId が返る","ret")),
    Step("4","api","ext","サーバー内 after()","processJobById()",
         "プロセス内で直接呼出（HTTP self-fetch ではない）。Storage 取得 → Gemini 抽出 → OpenAI 例文生成 → Project/Words を Supabase 保存 → ジョブを completed に更新",
         "create/route.ts:36–39 → process/route.ts"),
    Step("5","api","client","クライアント → 自サーバー","GET /api/scan-jobs（2秒ポーリング）",
         "Bearer トークンでジョブの status を監視","page.tsx:375"),
    Step("6","return","supa","クライアント → Supabase","loadHome()",
         "completed 検知後に単語帳データを再取得","page.tsx:422–424",("ここで届く","ret")),
]

# fonts
f_arrow = jp(12)
f_chip  = jp(11.5)
f_desc  = jp(13.5)
f_loc   = mono(10.5)
f_badge = jp(10)
f_num   = jp(14)

NUM_W = 38
GAP = 14          # gap between num column and card
CARD_X = NUM_W + GAP
CARD_W = CONTENT_W - CARD_X
TXT_W = CARD_W - 2 * PAD
STEP_GAP = 20

def step_height(st):
    h = 11  # top pad
    h += 18  # arrow line (+ chip)
    desc_lines = wrap(st.desc, f_desc, TXT_W - (tw(" "+st.badge[0]+" ", f_badge)+14 if st.badge else 0))
    # recompute desc lines properly (badge sits after last line inline; approximate by full width)
    desc_lines = wrap(st.desc, f_desc, TXT_W)
    h += 6
    h += len(desc_lines) * 21
    h += 6
    h += 16  # loc
    h += 12  # bottom pad
    return max(h, 64), desc_lines

def draw_step(d, x, y, st, is_last):
    ch, desc_lines = step_height(st)
    # connector
    if not is_last:
        cx = x + NUM_W // 2
        yy = y + NUM_W
        while yy < y + ch + STEP_GAP:
            d.line([(cx, yy), (cx, min(yy+5, y+ch+STEP_GAP))], fill=INK, width=int(2*S//1))
            yy += 10
    # number circle
    nb = [x, y, x + NUM_W, y + NUM_W]
    if st.kind == "api":
        d.ellipse(nb, fill=INK, outline=INK, width=2*1)
        ncol = WHITE
    elif st.kind == "return":
        d.ellipse(nb, fill=INK, outline=INK, width=2)
        ncol = WHITE
    else:
        d.ellipse(nb, fill=WHITE, outline=MUTED, width=2)
        ncol = MUTED
    twn = tw(st.num, f_num); tbb = f_num.getbbox(st.num)
    d.text((x + NUM_W/2 - twn/2, y + NUM_W/2 - (tbb[3]+tbb[1])/2), st.num, font=f_num, fill=ncol)

    # card
    bg, bd = COL[st.color]
    cx0 = x + CARD_X
    cbox = [cx0, y, cx0 + CARD_W, y + ch]
    shadow = st.kind == "return"
    if shadow:
        d.rounded_rectangle([cbox[0]+3*S//2, cbox[1]+3*S//2, cbox[2]+3*S//2, cbox[3]+3*S//2], radius=11, fill=INK)
    rr(d, cbox, 11, fill=bg, outline=bd, width=2)

    tx = cx0 + PAD
    ty = y + 11
    # arrow row: "from"  + chip
    d.text((tx, ty), st.frm, font=f_arrow, fill=MUTED)
    fx = tx + tw(st.frm, f_arrow) + 8
    if st.chip:
        cw = tw(st.chip, f_chip)
        chip_pad = 6
        chip_box = [fx, ty-2, fx + cw + 2*chip_pad, ty + 16]
        if chip_box[2] > cx0 + CARD_W - PAD:  # wrap chip below
            ty2 = ty + 18
            chip_box = [tx, ty2-2, tx + cw + 2*chip_pad, ty2 + 16]
            rr(d, chip_box, 5, fill=(255,255,255), outline=bd, width=1)
            d.text((tx+chip_pad, ty2), st.chip, font=f_chip, fill=INK)
            ty = ty2 + 20
        else:
            rr(d, chip_box, 5, fill=(255,255,255), outline=bd, width=1)
            d.text((fx+chip_pad, ty), st.chip, font=f_chip, fill=INK)
            ty += 22
    else:
        ty += 22

    # desc
    for i, ln in enumerate(desc_lines):
        d.text((tx, ty), ln, font=f_desc, fill=INK)
        ty += 21
    # badge after desc
    if st.badge:
        btxt, bk = st.badge
        bw = tw(btxt, f_badge)
        bx = tx
        bb = [bx, ty+1, bx + bw + 16, ty + 19]
        rr(d, bb, 9, fill=BADGE[bk])
        d.text((bx+8, ty+3), btxt, font=f_badge, fill=WHITE)
        ty += 24
    else:
        ty += 3
    # loc
    d.text((tx, ty), st.loc, font=f_loc, fill=MUTED)

    return ch + STEP_GAP

def flow_height(steps):
    head = 54
    body_top = 22
    total = head + body_top
    for i, st in enumerate(steps):
        ch, _ = step_height(st)
        total += ch + (STEP_GAP if i < len(steps)-1 else 0)
    total += 18
    return total

def draw_flow(d, x, y, tag, tag_col, title, route, steps):
    # measure
    fh = flow_height(steps)
    box = [x, y, x + CONTENT_W, y + fh]
    # shadow
    d.rounded_rectangle([box[0]+5*S//2, box[1]+5*S//2, box[2]+5*S//2, box[3]+5*S//2], radius=18, fill=INK)
    rr(d, box, 18, fill=WHITE, outline=INK, width=2)
    # header
    hy = y + 16
    # tag pill
    f_tag = jp(11)
    ttxt = tag
    tw_ = tw(ttxt, f_tag)
    tb = [x+22, hy, x+22+tw_+18, hy+20]
    rr(d, tb, 5, fill=tag_col)
    d.text((x+22+9, hy+2), ttxt, font=f_tag, fill=WHITE)
    # title
    f_h2 = jp(18)
    hx = tb[2] + 12
    d.text((hx, hy-1), title, font=f_h2, fill=INK)
    hx2 = hx + tw(title, f_h2) + 12
    f_route = mono(11)
    # route may overflow; place under if needed
    if hx2 + tw(route, f_route) > x + CONTENT_W - 20:
        d.text((x+22, hy+24), route, font=f_route, fill=MUTED)
        head_bottom = hy + 46
    else:
        d.text((hx2, hy+5), route, font=f_route, fill=MUTED)
        head_bottom = hy + 38
    d.line([(x, head_bottom), (x+CONTENT_W, head_bottom)], fill=INK, width=2)
    # body
    sy = head_bottom + 20
    sx = x + 22
    for i, st in enumerate(steps):
        adv = draw_step(d, sx, sy, st, i == len(steps)-1)
        sy += adv
    return fh

# ---------- compose ----------
MARGIN = 28
def compute_total():
    y = MARGIN
    y += 38   # title
    y += 26   # subtitle
    y += 44   # legend
    fh1 = flow_height(FREE)
    fh2 = flow_height(PRO)
    y += fh1 + 40 + fh2
    y += 90   # note
    y += MARGIN
    return y

W = (MARGIN*2 + CONTENT_W)
H = compute_total()
img = Image.new("RGB", (W*S, H*S), PAPER)
d = ImageDraw.Draw(img)

def X(v): return v * S
# scale all by drawing in scaled coords: easiest is to multiply every coordinate.
# We've been passing logical coords; wrap by re-creating draw with scaling via transform.
# Simpler: redefine d.* through a scaling proxy.

class SD:
    def __init__(self, d): self.d = d
    def _b(self, b): return [b[0]*S, b[1]*S, b[2]*S, b[3]*S]
    def rounded_rectangle(self, box, radius=0, fill=None, outline=None, width=1):
        self.d.rounded_rectangle(self._b(box), radius=int(radius*S), fill=fill, outline=outline, width=max(1,int(width*S)))
    def ellipse(self, box, fill=None, outline=None, width=1):
        self.d.ellipse(self._b(box), fill=fill, outline=outline, width=max(1,int(width*S)))
    def line(self, pts, fill=None, width=1):
        self.d.line([(p[0]*S, p[1]*S) for p in pts], fill=fill, width=max(1,int(width*S)))
    def text(self, xy, s, font=None, fill=None):
        self.d.text((xy[0]*S, xy[1]*S), s, font=font, fill=fill)

sd = SD(d)

y = MARGIN
# title
d.text((MARGIN*S, y*S), "MERKEN — スキャン後、クライアントにデータが返るまで", font=jp(24), fill=INK)
y += 38
d.text((MARGIN*S, y*S), "API に触れる部分だけに注目した経路図。Free（即時抽出）と Pro（バックグラウンドジョブ）で経路が分かれる。",
       font=jp(13), fill=MUTED)
y += 30
# legend
lx = MARGIN
leg = [("クライアント","client"),("自サーバー(Next.js API)","server"),
       ("外部AI Gemini/OpenAI","ext"),("Supabase Auth/DB/Storage","supa")]
f_leg = jp(11.5)
for label, key in leg:
    bg, bd = COL[key]
    wlab = tw(label, f_leg)
    chip_w = 18 + wlab + 18
    sd.rounded_rectangle([lx, y, lx+chip_w, y+24], radius=12, fill=WHITE, outline=INK, width=1.4)
    sd.rounded_rectangle([lx+8, y+7, lx+19, y+18], radius=3, fill=bg, outline=bd, width=1.4)
    sd.text((lx+24, y+4), label, font=f_leg, fill=INK)
    lx += chip_w + 10
y += 44

draw_flow(sd, MARGIN, y, "FREE", COL["client"][1], "即時抽出フロー",
          "/api/extract → sessionStorage → /scan/confirm", FREE)
y += flow_height(FREE) + 40
draw_flow(sd, MARGIN, y, "PRO", COL["supa"][1], "バックグラウンドジョブフロー",
          "/api/scan-jobs/create → after() → ポーリング", PRO)
y += flow_height(PRO) + 24

# note
nb = [MARGIN, y, MARGIN+CONTENT_W, y+78]
sd.rounded_rectangle(nb, radius=12, fill=(255,251,233), outline=INK, width=1.4)
note1 = "2つの違い: Free は /api/extract の 1 本のリクエスト内で Gemini・OpenAI・Supabase 呼び出しが"
note2 = "すべて同期的に完結し、レスポンス本文がそのまま結果データになる。Pro は /api/scan-jobs/create が jobId だけ"
note3 = "返して after() で非同期処理し、クライアントはポーリング + Supabase 再取得で結果を受け取る分離構造。"
fn = jp(12.5)
sd.text((MARGIN+18, y+14), note1, font=fn, fill=INK)
sd.text((MARGIN+18, y+34), note2, font=fn, fill=INK)
sd.text((MARGIN+18, y+54), note3, font=fn, fill=INK)

out = "/home/user/vocabularytest/docs/scan-data-flow.png"
img = img.resize((W, H), Image.LANCZOS)
img.save(out)
print("saved", out, img.size)
