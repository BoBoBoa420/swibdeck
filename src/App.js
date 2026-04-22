import { useState, useRef, useCallback, useEffect } from "react";

/* ═══ BOBOA-TCGSCAN · Design tokens ═══════════════════════════════════════ */
// Pastel palette — warm, eye-friendly, higher contrast than soft-soft
const P = {
  bg:       "#FBF8F3",   // warm cream
  bgDeep:   "#F4ECE1",   // cream tint for cards
  surface:  "#FFFFFF",
  ink:      "#2B2A35",   // near-black, slight purple
  sub:      "#6E6B7E",
  dim:      "#A8A4B5",
  line:     "#ECE4D6",
  border:   "#E0D6C4",
  // accents — muted pastel
  peach:    "#F2A488",   // primary brand
  peachDp:  "#E88A68",
  sage:     "#8FB89A",
  sageDp:   "#6FA17E",
  sky:      "#A9C5E8",
  skyDp:    "#7FA6D1",
  rose:     "#E9AFC0",
  roseDp:   "#D78BA3",
  butter:   "#F2D79E",
  butterDp: "#E6C37D",
  lavender: "#BFB0DB",
  lavDp:    "#9C87C5",
  coral:    "#E68A7A",
  // dark mode for camera
  inkDark:  "#1A1821",
};

const RATE = 35;
const fmt    = (n) => Number(n || 0).toLocaleString();
const thb    = (u) => "฿" + fmt(Math.round(u * RATE));
const usdStr = (u) => "($" + (u % 1 === 0 ? Number(u).toFixed(0) : Number(u).toFixed(2)) + ")";
const toRgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ═══ GLOBAL CSS ═══════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,500&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body,#root{min-height:100%;background:${P.bg};}
body{
  font-family:'Manrope',sans-serif;
  color:${P.ink};
  -webkit-font-smoothing:antialiased;
  overscroll-behavior:none;
  touch-action:manipulation;
  font-size:16px;
}
::-webkit-scrollbar{display:none;}
a{text-decoration:none;color:inherit;}
input,button,select{
  font-family:'Manrope',sans-serif;
  -webkit-appearance:none;
  appearance:none;
}
button{cursor:pointer;}
.serif{font-family:'Fraunces',serif;font-optical-sizing:auto;}
.mono{font-family:'JetBrains Mono',monospace;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes scanLine{0%{top:0%}100%{top:95%}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.fu1{animation:fu 0.45s 0.00s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu2{animation:fu 0.45s 0.08s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu3{animation:fu 0.45s 0.16s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu4{animation:fu 0.45s 0.24s cubic-bezier(0.2,0.8,0.2,1) both;}
.fu5{animation:fu 0.45s 0.32s cubic-bezier(0.2,0.8,0.2,1) both;}
`;

/* ═══ PROCESSING STEPS ═════════════════════════════════════════════════════ */
const PROC_STEPS = [
  "BoBoa frame detection…",
  "Cropping card boundaries…",
  "Extracting 4 corners…",
  "Stitching corner grid…",
  "Sealing BoBoa watermark…",
  "BoBoa AI identifying card…",
  "Cross-checking card number…",
  "Detecting language…",
  "BoBoaGrade analysis…",
];

/* ═══ BGS GRADING CRITERIA ═════════════════════════════════════════════════
   Real BGS 10 requires: all 4 subgrades ≥ 9.5
   BGS 10 Black Label requires: all 4 subgrades = 10.0 (perfect)
   We use 4 subgrades + overall, same as BGS.
═══════════════════════════════════════════════════════════════════════════ */
const BGS_CRITERIA = [
  { key:"centering", label:"Centering", desc:"Front/back border ratios. PSA 10: ≤55/45 front · ≤60/40 back." },
  { key:"corners",   label:"Corners",   desc:"Sharpness & whitening of all 4 corners under magnification." },
  { key:"edges",     label:"Edges",     desc:"Smoothness, chipping, layering along all 4 edges." },
  { key:"surface",   label:"Surface",   desc:"Print defects, scratches, indentations, holo scratches." },
];

function bgsRelative(score) {
  // Convert 0-100 score to BGS-style subgrade (0-10 in 0.5 steps)
  const sub = Math.max(0, Math.min(10, (score / 10)));
  const rounded = Math.round(sub * 2) / 2;
  return rounded;
}

function bgsOverallBand(scores) {
  // BGS Overall is weighted and rounded down — approximates real BGS rules
  const subs = [scores.centering, scores.corners, scores.edges, scores.surface]
    .map(s => bgsRelative(s || 0));
  const min = Math.min(...subs);
  const avg = subs.reduce((a,b) => a + b, 0) / subs.length;
  // BGS uses weighted: lowest sub drags overall
  const overall = Math.min(avg, min + 0.5);
  const rounded = Math.floor(overall * 2) / 2;

  if (rounded >= 9.5 && min >= 9.5) {
    if (min >= 10) return { grade:"BGS 10 PRISTINE (Black Label)", color:P.lavender, tier:"bl" };
    return { grade:"BGS 10 GEM MINT", color:P.butterDp, tier:"bgs10" };
  }
  if (rounded >= 9)   return { grade:`BGS ${rounded} MINT`,      color:P.sageDp,   tier:"bgs9" };
  if (rounded >= 8)   return { grade:`BGS ${rounded} NM-MT`,     color:P.skyDp,    tier:"bgs8" };
  if (rounded >= 7)   return { grade:`BGS ${rounded} NEAR MINT`, color:P.peachDp,  tier:"bgs7" };
  return { grade:`BGS ${rounded} EX`, color:P.coral, tier:"low" };
}

/* ═══ ONE PIECE CARD DATABASE ══════════════════════════════════════════════ */
const OP_DB = {
  "OP07-051": {
    name:"Boa Hancock", nameJP:"ボア・ハンコック",
    set:"OP-07", setName:"500 Years in the Future",
    rarity:"SR", type:"Character", color:"Blue",
    cost:6, power:"8000",
    traits:["Seven Warlords","Kuja Pirates"],
    ability:"[On Play] Up to 1 opponent Character (not Luffy) can't attack next turn. Return 1 Cost-1 or less to bottom of deck.",
    prices:{
      raw_mint:{thbLow:1050,thbHigh:1330},
      psa10:{thbLow:1995,thbHigh:2975,note:"176 auctions"},
      bgs10:{thbLow:3150,thbHigh:4550},
      bgs10bl:{thbLow:9800,thbHigh:15750,note:"Pop < 5"},
    },
  },
  "ST17-004": {
    name:"Boa Hancock", nameJP:"ボア・ハンコック",
    set:"ST-17", setName:"Royal Blood",
    rarity:"SR", type:"Character", color:"Blue",
    cost:4, power:"6000",
    traits:["Seven Warlords","Kuja Pirates"],
    ability:"[Blocker] [On Play] Look at top 3 cards, rearrange. Give 1 Warlord leader/character up to 1 Don!! rested.",
    prices:{
      raw_mint:{thbLow:280,thbHigh:490},
      psa10:{thbLow:700,thbHigh:980},
      bgs10:{thbLow:980,thbHigh:1400},
      bgs10bl:{thbLow:2800,thbHigh:4200},
    },
  },
  "OP09-001": {
    name:"Monkey D. Luffy (God)", nameJP:"モンキー・D・ルフィ",
    set:"OP-09", setName:"Emperors in the New World",
    rarity:"UR", type:"Character", color:"Red",
    cost:10, power:"15000",
    traits:["Straw Hat Crew","Four Emperors"],
    ability:"[On Play] KO up to 5 opponent characters. Can't be KO'd by effects.",
    prices:{
      raw_mint:{thbLow:3500,thbHigh:5250},
      psa10:{thbLow:7000,thbHigh:10500},
      bgs10:{thbLow:10500,thbHigh:14000},
      bgs10bl:{thbLow:28000,thbHigh:42000,note:"Extremely rare"},
    },
  },
  "OP01-001": {
    name:"Monkey D. Luffy", nameJP:"モンキー・D・ルフィ",
    set:"OP-01", setName:"Romance Dawn",
    rarity:"SR", type:"Leader", color:"Red",
    cost:5, power:"5000",
    traits:["Straw Hat Crew"],
    ability:"[Activate: Main] Give up to 1 Leader or Character +2000 power until end of turn.",
    prices:{
      raw_mint:{thbLow:420,thbHigh:700},
      psa10:{thbLow:1050,thbHigh:1575},
      bgs10:{thbLow:1750,thbHigh:2450},
      bgs10bl:{thbLow:4900,thbHigh:7000},
    },
  },
};

const RARITY_OPTIONS = [
  { id:"C",    label:"C",        desc:"Common",        color:P.dim },
  { id:"UC",   label:"UC",       desc:"Uncommon",      color:P.sageDp },
  { id:"R",    label:"R",        desc:"Rare",          color:P.skyDp },
  { id:"SR",   label:"SR",       desc:"Super Rare",    color:P.butterDp },
  { id:"SRAlt",label:"SR Alt",   desc:"Alt Art",       color:P.peachDp },
  { id:"SRMA", label:"SR Manga", desc:"Manga Alt",     color:P.coral },
  { id:"UR",   label:"UR",       desc:"Ultra Rare",    color:P.lavDp },
  { id:"L",    label:"L",        desc:"Leader",        color:P.roseDp },
  { id:"SEC",  label:"SEC",      desc:"Secret Rare",   color:P.lavender },
];

const GRADE_BTNS = [
  {id:"raw_sealed", label:"Sealed",    color:P.sageDp},
  {id:"raw_mint",   label:"Mint NM",   color:P.skyDp},
  {id:"raw_played", label:"Played",    color:P.dim},
  {id:"psa10",      label:"PSA 10",    color:P.sageDp},
  {id:"bgs10",      label:"BGS 10",    color:P.butterDp},
  {id:"bgs10bl",    label:"BGS BL",    color:P.lavDp},
];

/* ═══ SMALL COMPONENTS ═════════════════════════════════════════════════════ */
function Pill({ children, color, style }) {
  color = color || P.peachDp;
  return (
    <span style={{
      background: toRgba(color, 0.14),
      color, border: `1px solid ${toRgba(color, 0.35)}`,
      borderRadius: 99, padding: "4px 10px",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.01em",
      display:"inline-block", whiteSpace:"nowrap",
      ...style,
    }}>{children}</span>
  );
}

function SmallBtn({ children, onClick, primary, style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? P.peachDp : "transparent",
      color: primary ? "#fff" : P.ink,
      border: primary ? "none" : `1px solid ${P.border}`,
      borderRadius:10, padding:"8px 14px",
      fontSize:13, fontWeight:600, lineHeight:1,
      opacity: disabled ? 0.4 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      transition:"all 0.15s",
      ...style,
    }}>{children}</button>
  );
}

function PrimaryBtn({ children, onClick, style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? P.dim : P.peachDp,
      color:"#fff", border:"none",
      borderRadius:14, padding:"13px 20px",
      fontSize:15, fontWeight:700, letterSpacing:"-0.01em",
      width:"100%",
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : `0 6px 20px ${toRgba(P.peachDp, 0.32)}`,
      transition:"all 0.2s",
      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
      ...style,
    }}>{children}</button>
  );
}

function Card({ children, style, accentColor }) {
  return (
    <div style={{
      background:P.surface,
      border:`1px solid ${P.border}`,
      borderRadius:18,
      overflow:"hidden",
      boxShadow: accentColor
        ? `0 4px 18px ${toRgba(accentColor, 0.12)}`
        : "0 2px 10px rgba(43, 42, 53, 0.04)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ children, accent }) {
  return (
    <div style={{
      padding:"11px 18px",
      borderBottom:`1px solid ${P.line}`,
      background: accent ? toRgba(accent, 0.06) : toRgba(P.bgDeep, 0.5),
      fontSize:11, fontWeight:700,
      color: accent || P.sub,
      letterSpacing:"0.08em",
      textTransform:"uppercase",
    }}>{children}</div>
  );
}

function ScoreBar({ label, score, bgsValue, desc, isLast }) {
  // Pastel colour based on BGS range
  const color = bgsValue >= 9.5 ? P.lavDp :
                bgsValue >= 9   ? P.sageDp :
                bgsValue >= 8   ? P.butterDp :
                bgsValue >= 7   ? P.peachDp : P.coral;
  return (
    <div style={{ padding:"13px 18px", borderBottom: isLast ? "none" : `1px solid ${P.line}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6, gap:12 }}>
        <span style={{ fontSize:14, fontWeight:600 }}>{label}</span>
        <div style={{ display:"flex", gap:10, alignItems:"baseline" }}>
          <span style={{ fontSize:11, color:P.dim }}>BGS</span>
          <span className="serif" style={{ fontSize:22, fontWeight:600, color }}>
            {bgsValue.toFixed(1)}
          </span>
        </div>
      </div>
      <div style={{ height:6, background:P.bgDeep, borderRadius:99, overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${score}%`,
          background: color, borderRadius:99,
          transition:"width 0.8s cubic-bezier(0.2,0.8,0.2,1)",
        }}/>
      </div>
      {desc && <div style={{ fontSize:11, color:P.dim, marginTop:6, lineHeight:1.5 }}>{desc}</div>}
    </div>
  );
}

function MiniChart({ data, color }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v,i) => [(i/(data.length-1))*96+2, 48 - ((v-min)/rng)*40]);
  const line = pts.map(([x,y],i) => `${i?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length-1][0].toFixed(1)},52 L2,52 Z`;
  const gid  = `bc_${color.replace(/[^a-z0-9]/gi,"_")}`;
  return (
    <svg viewBox="0 0 100 54" style={{width:"100%",height:60}} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map(([x,y],i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.2" fill={color}/>)}
    </svg>
  );
}

// roundRect polyfill for older Safari
if (typeof window !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === "number") r = [r, r, r, r];
    this.beginPath();
    this.moveTo(x + r[0], y);
    this.lineTo(x + w - r[1], y);
    this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
    this.lineTo(x + w, y + h - r[2]);
    this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
    this.lineTo(x + r[3], y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
    this.lineTo(x, y + r[0]);
    this.quadraticCurveTo(x, y, x + r[0], y);
    this.closePath();
    return this;
  };
}

/* ═══ FRAME-ONLY CROP + CORNER EXTRACTION ══════════════════════════════════
   The camera viewfinder shows a dashed blue rectangle at 68% width,
   aspect ratio 63:88 (standard trading card). We need to crop ONLY that
   portion of the captured image, then extract 4 corners of that crop.
═══════════════════════════════════════════════════════════════════════════ */
function cropFrameAndCorners(videoEl, frameRect, watermark) {
  // videoEl: the video element (intrinsic size videoWidth x videoHeight)
  // frameRect: { xPct, yPct, wPct, hPct } — percentages of video area where frame sits
  // Returns { fullCardUrl, cornersUrl }

  const vw = videoEl.videoWidth  || 1280;
  const vh = videoEl.videoHeight || 720;

  // Frame pixel bounds on video
  const fx = Math.round(vw * frameRect.xPct);
  const fy = Math.round(vh * frameRect.yPct);
  const fw = Math.round(vw * frameRect.wPct);
  const fh = Math.round(vh * frameRect.hPct);

  // ── Crop the card area only ──
  const cardCanvas = document.createElement("canvas");
  cardCanvas.width  = fw;
  cardCanvas.height = fh;
  const cctx = cardCanvas.getContext("2d");
  cctx.drawImage(videoEl, fx, fy, fw, fh, 0, 0, fw, fh);

  // ── Watermark (low opacity, bottom-right, non-blocking) ──
  cctx.save();
  cctx.globalAlpha = 0.32;
  const wmPad = Math.round(fw * 0.025);
  const wmFontSize = Math.max(11, Math.round(fw * 0.028));
  cctx.font = `600 ${wmFontSize}px 'Manrope', sans-serif`;
  const textWidth = cctx.measureText(watermark).width;
  const wmBgPad = wmPad * 0.6;
  // Subtle pill background
  cctx.fillStyle = "rgba(0,0,0,0.22)";
  const bgX = fw - textWidth - wmPad * 2 - wmBgPad;
  const bgY = fh - wmFontSize - wmPad * 1.2 - wmBgPad;
  const bgW = textWidth + wmPad * 2 + wmBgPad * 2;
  const bgH = wmFontSize + wmBgPad * 2;
  cctx.beginPath();
  cctx.roundRect(bgX, bgY, bgW, bgH, 6);
  cctx.fill();
  cctx.fillStyle = "rgba(255,255,255,0.78)";
  cctx.globalAlpha = 0.55;
  cctx.fillText(watermark, bgX + wmPad, bgY + wmFontSize + wmBgPad * 0.3);
  cctx.restore();

  const fullCardUrl = cardCanvas.toDataURL("image/jpeg", 0.92);

  // ── Now crop 4 corners from the card-only canvas ──
  const pct = 0.28;  // 28% of each dimension per corner — larger zoom
  const cw  = Math.round(fw * pct);
  const ch  = Math.round(fh * pct);
  const corners = [
    { label:"TL", sx:0,       sy:0 },
    { label:"TR", sx:fw - cw, sy:0 },
    { label:"BL", sx:0,       sy:fh - ch },
    { label:"BR", sx:fw - cw, sy:fh - ch },
  ];

  const gap  = 5;
  const grid = document.createElement("canvas");
  grid.width  = cw * 2 + gap * 3;
  grid.height = ch * 2 + gap * 3;
  const gctx = grid.getContext("2d");
  // Pastel background
  gctx.fillStyle = "#2B2A35";
  gctx.fillRect(0, 0, grid.width, grid.height);

  corners.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const dx = gap + col * (cw + gap);
    const dy = gap + row * (ch + gap);
    gctx.drawImage(cardCanvas, c.sx, c.sy, cw, ch, dx, dy, cw, ch);
    // Corner label (pastel pill)
    const labelSize = Math.round(ch * 0.1);
    gctx.fillStyle = "rgba(242, 164, 136, 0.88)";
    gctx.beginPath();
    gctx.roundRect(dx + 6, dy + 6, labelSize * 2.2, labelSize * 1.4, 4);
    gctx.fill();
    gctx.fillStyle = "#fff";
    gctx.font = `700 ${labelSize}px 'JetBrains Mono', monospace`;
    gctx.fillText(c.label, dx + 10, dy + labelSize * 1.15);
  });

  const cornersUrl = grid.toDataURL("image/jpeg", 0.92);

  return { fullCardUrl, cornersUrl };
}

/* ═══ BOBOA AI — CARD RECOGNITION ══════════════════════════════════════════ */
async function boboaRecognize(imageDataUrl) {
  const base64 = imageDataUrl.split(",")[1];
  const prompt = `You are BoBoa AI — a One Piece TCG card identification engine.

Analyze this card image carefully. Look at:
- The card number/serial printed at bottom-right (format like OP07-051, ST17-004, EB01-023, etc.)
- The card name (top area)
- Language of the text on the card (Japanese, English, Chinese)
- Rarity symbol next to the card number

Respond with ONLY a valid JSON object, no markdown:

{
  "cardId": "exact card number e.g. OP07-051 or ST17-004 (READ IT FROM THE CARD)",
  "cardIdConfidence": 0-100,
  "name": "English card name",
  "nameJP": "Japanese name if visible",
  "set": "set code e.g. OP-07 or ST-17",
  "setName": "full set name in English if known",
  "rarity": "C/UC/R/SR/UR/L/SEC (what you can see)",
  "type": "Character/Event/Stage/Leader",
  "color": "Red/Blue/Green/Purple/Black/Yellow",
  "cost": integer or null,
  "power": "string or null",
  "language": "JP, EN, or CN (detect from text on card)",
  "languageEvidence": "brief reason e.g. 'Japanese kanji and hiragana visible'",
  "isOnePiece": true or false,
  "printQuality": {
    "centering": 0-100,
    "corners": 0-100,
    "edges": 0-100,
    "surface": 0-100,
    "overall": 0-100,
    "notes": "brief BGS-style notes on print defects visible"
  },
  "confidence": 0-100
}

Use BGS grading as reference for printQuality scores:
- 95-100 = BGS 10 Pristine / Black Label quality
- 90-94 = BGS 9.5 Gem Mint
- 85-89 = BGS 9 Mint
- 80-84 = BGS 8.5 NM-MT
- 70-79 = BGS 7-8 NM
- below 70 = EX or worse

If you cannot read the card number clearly, set cardIdConfidence low and make best guess.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:1200,
        messages:[{
          role:"user",
          content:[
            { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:base64 } },
            { type:"text", text:prompt },
          ],
        }],
      }),
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { success:true, data:parsed };
  } catch(e) {
    return { success:false, error:e.message };
  }
}

/* ═══ SCREEN — LOGIN (Social / Guest) ══════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [guestMode,   setGuestMode]   = useState(false);
  const [wmName,      setWmName]      = useState("");
  const [err,         setErr]         = useState("");

  const socials = [
    { id:"facebook",  label:"Continue with Facebook",  icon:"f",  color:"#1877F2", bg:"#1877F2", text:"#fff" },
    { id:"google",    label:"Continue with Google",    icon:"G",  color:"#4285F4", bg:"#fff", text:"#3C4043", border:true },
    { id:"instagram", label:"Continue with Instagram", icon:"◉",  color:"#E4405F", bg:"linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)", text:"#fff" },
  ];

  const socialLogin = (id) => {
    // Demo — instant verification with auto-generated name
    const names = {
      facebook:  "FB_User_" + Math.random().toString(36).slice(2,6),
      google:    "Google_" + Math.random().toString(36).slice(2,6),
      instagram: "IG_" + Math.random().toString(36).slice(2,6),
    };
    onLogin({ name: names[id], provider: id, verified: true });
  };

  const guestLogin = () => {
    if (!wmName.trim()) { setErr("Enter your watermark name"); return; }
    if (wmName.trim().length < 2) { setErr("Minimum 2 characters"); return; }
    setErr("");
    onLogin({ name: wmName.trim(), provider: "guest", verified: false });
  };

  return (
    <div style={{
      minHeight:"100vh", minHeight:"-webkit-fill-available",
      background:P.bg, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"40px 22px",
    }}>
      <style>{CSS}</style>

      {/* Decorative blobs */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
        <div style={{ position:"absolute", top:"-15%", left:"-15%", width:"50%", height:"50%", background:toRgba(P.peach, 0.18), borderRadius:"50%", filter:"blur(60px)" }}/>
        <div style={{ position:"absolute", bottom:"-20%", right:"-20%", width:"60%", height:"60%", background:toRgba(P.lavender, 0.22), borderRadius:"50%", filter:"blur(70px)" }}/>
      </div>

      <div style={{ width:"100%", maxWidth:380, position:"relative", zIndex:1 }}>

        <div className="fu1" style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{
            width:72, height:72, borderRadius:22,
            background:`linear-gradient(135deg, ${P.peach}, ${P.coral})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            margin:"0 auto 18px",
            boxShadow:`0 12px 32px ${toRgba(P.peachDp, 0.35)}`,
          }}>
            <span style={{ fontSize:34, color:"#fff" }}>◆</span>
          </div>
          <div className="serif" style={{ fontSize:36, fontWeight:700, letterSpacing:"-0.02em", marginBottom:4 }}>
            BoBoa<span style={{ color:P.peachDp }}>-TCGScan</span>
          </div>
          <div style={{ fontSize:14, color:P.sub, lineHeight:1.6 }}>
            BoBoa AI · Card scanner for collectors
          </div>
        </div>

        {!guestMode ? (
          <>
            <div className="fu2" style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {socials.map(s => (
                <button key={s.id} onClick={() => socialLogin(s.id)} style={{
                  display:"flex", alignItems:"center", gap:12,
                  background: s.bg,
                  color: s.text,
                  border: s.border ? `1px solid ${P.border}` : "none",
                  borderRadius:14, padding:"13px 18px",
                  fontSize:15, fontWeight:600,
                  cursor:"pointer", transition:"transform 0.1s",
                  boxShadow:"0 4px 14px rgba(43,42,53,0.08)",
                }}
                onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
                onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                  <div style={{
                    width:28, height:28, borderRadius:7,
                    background: s.border ? s.color : "rgba(255,255,255,0.22)",
                    color: "#fff",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:16, fontWeight:800, flexShrink:0,
                  }}>{s.icon}</div>
                  <span style={{ flex:1, textAlign:"left" }}>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="fu3" style={{ display:"flex", alignItems:"center", gap:12, margin:"22px 0" }}>
              <div style={{ flex:1, height:1, background:P.border }}/>
              <span style={{ fontSize:12, color:P.dim, letterSpacing:"0.06em" }}>OR</span>
              <div style={{ flex:1, height:1, background:P.border }}/>
            </div>

            <button className="fu3" onClick={() => setGuestMode(true)} style={{
              width:"100%", background:"transparent",
              border:`1.5px dashed ${P.border}`, borderRadius:14,
              padding:"14px", fontSize:14, fontWeight:600,
              color:P.ink, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              <span style={{ fontSize:17 }}>👤</span>
              Continue as Guest
            </button>

            <div className="fu4" style={{ textAlign:"center", marginTop:18, fontSize:11, color:P.dim, lineHeight:1.7 }}>
              Social login provides auto-verification.<br/>
              Guests can enter a watermark name manually.
            </div>
          </>
        ) : (
          <div className="fu1">
            <Card style={{ padding:22 }}>
              <div style={{ fontSize:13, fontWeight:700, color:P.ink, marginBottom:3 }}>
                Guest Watermark Name
              </div>
              <div style={{ fontSize:12, color:P.sub, marginBottom:16, lineHeight:1.6 }}>
                This name is stamped on every scan you capture. Choose something memorable.
              </div>
              <input
                type="text"
                value={wmName}
                onChange={e => setWmName(e.target.value)}
                placeholder="e.g. BoBoBoa"
                maxLength={20}
                autoFocus
                style={{
                  width:"100%", background:P.bg,
                  border:`1.5px solid ${P.border}`, borderRadius:11,
                  padding:"13px 14px", fontSize:16, color:P.ink,
                  outline:"none", marginBottom:12,
                }}
                onKeyDown={e => e.key === "Enter" && guestLogin()}
                onFocus={e => e.target.style.borderColor = P.peachDp}
                onBlur={e => e.target.style.borderColor = P.border}
              />
              {wmName && (
                <div style={{ background:P.bgDeep, borderRadius:9, padding:"10px 12px", marginBottom:14, fontSize:12, color:P.sub }}>
                  Preview watermark:{" "}
                  <span style={{ color:P.ink, fontWeight:600 }}>
                    {wmName} · {new Date().toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}
                  </span>
                </div>
              )}
              {err && (
                <div style={{ background:toRgba(P.coral,0.14), border:`1px solid ${toRgba(P.coral,0.35)}`, borderRadius:9, padding:"9px 12px", fontSize:12, color:P.coral, marginBottom:12 }}>
                  {err}
                </div>
              )}
              <PrimaryBtn onClick={guestLogin}>Continue →</PrimaryBtn>
              <button onClick={() => { setGuestMode(false); setErr(""); setWmName(""); }} style={{
                width:"100%", background:"transparent", border:"none",
                marginTop:10, padding:"8px", fontSize:12, color:P.sub, cursor:"pointer",
              }}>
                ← Back to sign-in options
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ SCREEN — WELCOME ═════════════════════════════════════════════════════ */
function WelcomeScreen({ user, onStart, onLogout }) {
  return (
    <div style={{
      minHeight:"100vh", minHeight:"-webkit-fill-available",
      background:P.bg, display:"flex", flexDirection:"column",
      padding:"54px 22px 40px",
      position:"relative",
    }}>
      <style>{CSS}</style>

      {/* Blobs */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
        <div style={{ position:"absolute", top:"10%", right:"-20%", width:"55%", height:"40%", background:toRgba(P.butter, 0.25), borderRadius:"50%", filter:"blur(80px)" }}/>
        <div style={{ position:"absolute", bottom:"0%", left:"-15%", width:"45%", height:"35%", background:toRgba(P.sky, 0.22), borderRadius:"50%", filter:"blur(70px)" }}/>
      </div>

      {/* User badge */}
      <div className="fu1" style={{
        position:"relative", zIndex:1,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:40,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:36, height:36, borderRadius:"50%",
            background:`linear-gradient(135deg, ${P.peach}, ${P.rose})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:14, fontWeight:700,
          }}>{user.name[0].toUpperCase()}</div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:P.ink }}>{user.name}</div>
            <div style={{ fontSize:10, color:P.dim, textTransform:"capitalize" }}>
              {user.verified ? `✓ ${user.provider}` : "Guest"}
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={{
          background:P.surface, border:`1px solid ${P.border}`,
          borderRadius:10, padding:"6px 12px", fontSize:12, color:P.sub,
          cursor:"pointer", fontWeight:500,
        }}>Sign out</button>
      </div>

      <div style={{ position:"relative", zIndex:1, flex:1, display:"flex", flexDirection:"column", justifyContent:"center" }}>

        <div className="fu2" style={{ marginBottom:34 }}>
          <div className="serif" style={{ fontSize:42, fontWeight:700, lineHeight:1.05, letterSpacing:"-0.03em", marginBottom:10 }}>
            Scan your card<br/>
            <span style={{ color:P.peachDp }}>in seconds.</span>
          </div>
          <div style={{ fontSize:15, color:P.sub, lineHeight:1.6, maxWidth:340 }}>
            BoBoa AI reads the card number, name, rarity, and language — then grades print quality using BGS criteria.
          </div>
        </div>

        <div className="fu3" style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:30 }}>
          {[
            { icon:"📸", title:"Card-frame cropping", body:"Only the card gets captured — clean & tight."},
            { icon:"◆",  title:"BoBoa AI recognition", body:"Card ID, name, language, rarity identified."},
            { icon:"🔍", title:"4-corner analysis",     body:"Zoomed corner grid for BGS-style grading."},
            { icon:"💰", title:"Market prices in THB",  body:"Live pricing by rarity & grade."},
          ].map((s,i) => (
            <div key={i} style={{
              display:"flex", gap:14, padding:"12px 14px",
              background:P.surface,
              border:`1px solid ${P.border}`,
              borderRadius:14,
            }}>
              <div style={{
                width:40, height:40, borderRadius:11,
                background:P.bgDeep,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:19, flexShrink:0,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:1 }}>{s.title}</div>
                <div style={{ fontSize:12, color:P.sub, lineHeight:1.5 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="fu4">
          <PrimaryBtn onClick={onStart} style={{ padding:"15px 20px", fontSize:16 }}>
            <span style={{ fontSize:19 }}>📷</span> Start Scan
          </PrimaryBtn>
          <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:P.dim }}>
            Watermark: <span className="mono" style={{ color:P.sub }}>
              {user.name} · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ SCREEN — CAMERA ══════════════════════════════════════════════════════
   Frame is positioned at 50% center, 68% width, card aspect 63:88.
   We translate that to video coordinates at capture time.
═══════════════════════════════════════════════════════════════════════════ */
const FRAME_W_PCT = 0.68;   // frame width % of video width at capture

function CameraScreen({ user, onCapture, onBack }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [status,  setStatus]  = useState("starting");
  const [errMsg,  setErrMsg]  = useState("");
  const [flash,   setFlash]   = useState(false);

  const stopCam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCam = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:"environment" }, audio:false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.setAttribute("playsinline","true");
        v.muted = true;
        v.onloadedmetadata = () => {
          v.play().then(() => setStatus("live"))
            .catch(e => { setErrMsg("Video: " + e.message); setStatus("error"); });
        };
      }
    } catch(e) {
      setErrMsg(
        e.name === "NotAllowedError"
          ? "Camera permission denied.\n\nFix: iPhone Settings → Safari → Camera → Allow"
          : "Camera: " + e.message
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => { startCam(); return stopCam; }, [startCam]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || status !== "live") return;

    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    // Compute frame rect in video intrinsic coords.
    // We want a portrait card aspect 63:88 inside the frame region.
    // Frame width = FRAME_W_PCT of video width; height = width * (88/63).
    // But if that's taller than video, fall back to height-limited.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const ar = 88 / 63;  // card aspect (taller than wide)

    let fw = vw * FRAME_W_PCT;
    let fh = fw * ar;
    if (fh > vh * 0.88) {
      fh = vh * 0.88;
      fw = fh / ar;
    }
    const fx = (vw - fw) / 2;
    const fy = (vh - fh) / 2;

    const frameRect = {
      xPct: fx / vw,
      yPct: fy / vh,
      wPct: fw / vw,
      hPct: fh / vh,
    };

    const dateStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-");
    const watermark = `${user.name} · ${dateStr}`;

    const { fullCardUrl, cornersUrl } = cropFrameAndCorners(video, frameRect, watermark);

    stopCam();
    onCapture({ full: fullCardUrl, corners: cornersUrl });
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"#000",
      display:"flex", flexDirection:"column",
    }}>
      <style>{CSS}</style>

      <video ref={videoRef} playsInline muted autoPlay style={{
        position:"absolute", inset:0, width:"100%", height:"100%",
        objectFit:"cover",
        display: status === "live" ? "block" : "none",
      }}/>

      {flash && <div style={{ position:"absolute", inset:0, background:"#fff", opacity:0.85, zIndex:20 }}/>}

      {/* Starting overlay */}
      {status === "starting" && (
        <div style={{
          position:"absolute", inset:0, background:P.inkDark,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:18,
        }}>
          <div style={{
            width:52, height:52,
            border:`3px solid ${P.peach}`, borderTopColor:"transparent",
            borderRadius:"50%", animation:"spin 0.8s linear infinite",
          }}/>
          <div style={{ color:"#fff", fontSize:16, fontWeight:600 }}>Opening camera…</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", textAlign:"center", padding:"0 40px", lineHeight:1.7 }}>
            If a popup appears, tap <strong style={{color:"#fff"}}>Allow</strong>
          </div>
        </div>
      )}

      {status === "error" && (
        <div style={{
          position:"absolute", inset:0, background:P.inkDark,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          padding:"32px 24px", gap:16, textAlign:"center",
        }}>
          <div style={{ fontSize:48 }}>📷</div>
          <div style={{ fontSize:18, fontWeight:700, color:P.coral }}>Camera Error</div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", lineHeight:1.7, whiteSpace:"pre-line", maxWidth:320 }}>{errMsg}</div>
          <button onClick={startCam} style={{
            background:P.peachDp, border:"none", borderRadius:12,
            padding:"13px 30px", fontSize:14, fontWeight:700, color:"#fff",
            cursor:"pointer", marginTop:8,
          }}>Try Again</button>
          <button onClick={() => { stopCam(); onBack(); }} style={{
            background:"transparent", border:"1px solid rgba(255,255,255,0.15)",
            borderRadius:12, padding:"11px 30px", fontSize:13,
            color:"rgba(255,255,255,0.5)", cursor:"pointer",
          }}>← Back</button>
        </div>
      )}

      {status === "live" && (
        <>
          {/* Dim overlay outside frame */}
          <div style={{
            position:"absolute", inset:0, zIndex:3,
            background: `
              linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)) top/100% calc(50% - ${FRAME_W_PCT * 88/63 * 50 * 0.85}vmin) no-repeat,
              linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)) bottom/100% calc(50% - ${FRAME_W_PCT * 88/63 * 50 * 0.85}vmin) no-repeat
            `,
            pointerEvents:"none",
          }}/>

          {/* Top bar */}
          <div style={{
            position:"absolute", top:0, left:0, right:0, zIndex:5,
            padding:"52px 20px 14px",
            background:"linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <button onClick={() => { stopCam(); onBack(); }} style={{
              background:"rgba(255,255,255,0.16)",
              border:"1px solid rgba(255,255,255,0.22)",
              borderRadius:11, padding:"7px 14px", fontSize:13, fontWeight:600,
              color:"#fff", cursor:"pointer",
              backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
            }}>← Back</button>
            <div className="serif" style={{ fontSize:17, fontWeight:700, color:"#fff" }}>BoBoa-TCGScan</div>
            <div style={{ width:60 }}/>
          </div>

          {/* Card frame guide */}
          <div style={{
            position:"absolute", inset:0, zIndex:4,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <div style={{
              position:"relative",
              width:"68%", maxWidth:260,
              aspectRatio:"63/88",
            }}>
              {/* Corner brackets */}
              {[
                {top:0, left:0,   borderTop:`3px solid ${P.peach}`, borderLeft:`3px solid ${P.peach}`},
                {top:0, right:0,  borderTop:`3px solid ${P.peach}`, borderRight:`3px solid ${P.peach}`},
                {bottom:0, left:0,  borderBottom:`3px solid ${P.peach}`, borderLeft:`3px solid ${P.peach}`},
                {bottom:0, right:0, borderBottom:`3px solid ${P.peach}`, borderRight:`3px solid ${P.peach}`},
              ].map((s,i) => <div key={i} style={{ position:"absolute", width:30, height:30, borderRadius:4, ...s}}/>)}
              {/* Dashed border */}
              <div style={{ position:"absolute", inset:0, border:`1.5px dashed ${toRgba(P.peach, 0.55)}`, borderRadius:10 }}/>
              {/* Scan line */}
              <div style={{
                position:"absolute", left:4, right:4, height:2, top:0,
                background:`linear-gradient(90deg, transparent, ${P.peach}, transparent)`,
                boxShadow:`0 0 12px ${P.peach}`,
                animation:"scanLine 2.2s ease-in-out infinite",
              }}/>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, zIndex:5,
            padding:"20px 24px 42px",
            background:"linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
          }}>
            <div style={{ textAlign:"center", marginBottom:18, fontSize:13, color:"rgba(255,255,255,0.78)", fontWeight:500, letterSpacing:"-0.01em" }}>
              Place the card inside the frame
            </div>
            <div style={{ display:"flex", justifyContent:"center" }}>
              <button onClick={capture} style={{
                width:72, height:72, borderRadius:"50%",
                background:"#fff", border:"4px solid rgba(255,255,255,0.35)",
                cursor:"pointer", padding:0,
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:"0 4px 24px rgba(0,0,0,0.4)",
              }}>
                <div style={{
                  width:56, height:56, borderRadius:"50%",
                  background:`linear-gradient(135deg, ${P.peach}, ${P.peachDp})`,
                  boxShadow:`0 0 20px ${toRgba(P.peachDp, 0.6)}`,
                }}/>
              </button>
            </div>
            <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:"rgba(255,255,255,0.4)" }}>
              Only the framed area is captured
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══ SCREEN — PROCESSING ══════════════════════════════════════════════════ */
function ProcessingScreen({ photos, onDone }) {
  const [step, setStep] = useState(0);
  const [pct,  setPct]  = useState(0);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStep(i);
      setPct(Math.round((i / PROC_STEPS.length) * 100));
      if (i >= PROC_STEPS.length - 1) {
        clearInterval(iv);
        boboaRecognize(photos.full).then(r => setTimeout(() => onDone(r), 600));
      }
    }, 360);
    return () => clearInterval(iv);
  }, [photos, onDone]);

  return (
    <div style={{
      minHeight:"100vh", minHeight:"-webkit-fill-available",
      background:P.bg,
      display:"flex", alignItems:"center", justifyContent:"center",
      flexDirection:"column", gap:24, padding:"40px 32px",
      position:"relative", overflow:"hidden",
    }}>
      <style>{CSS}</style>

      {/* Blobs */}
      <div style={{ position:"absolute", top:"20%", left:"-20%", width:"60%", height:"40%", background:toRgba(P.peach, 0.2), borderRadius:"50%", filter:"blur(80px)" }}/>
      <div style={{ position:"absolute", bottom:"20%", right:"-20%", width:"60%", height:"40%", background:toRgba(P.lavender, 0.2), borderRadius:"50%", filter:"blur(80px)" }}/>

      <div className="fu1" style={{ position:"relative", width:96, height:96, zIndex:1 }}>
        <div style={{ position:"absolute", inset:0, border:`3px solid ${toRgba(P.peach, 0.25)}`, borderRadius:"50%" }}/>
        <div style={{ position:"absolute", inset:0, border:"3px solid transparent", borderTopColor:P.peachDp, borderRadius:"50%", animation:"spin 0.9s linear infinite" }}/>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span className="serif" style={{ fontSize:22, fontWeight:600, color:P.peachDp }}>{pct}%</span>
        </div>
      </div>

      <div className="fu2" style={{ textAlign:"center", position:"relative", zIndex:1 }}>
        <div className="serif" style={{ fontSize:26, fontWeight:700, color:P.ink, marginBottom:6, letterSpacing:"-0.02em" }}>
          BoBoa AI is working…
        </div>
        <div style={{ fontSize:13, color:P.sub, minHeight:20 }}>{PROC_STEPS[step-1] || PROC_STEPS[0]}</div>
      </div>

      <div className="fu2" style={{ width:"100%", maxWidth:300, height:6, background:P.bgDeep, borderRadius:99, position:"relative", zIndex:1 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg, ${P.peach}, ${P.peachDp})`, borderRadius:99, transition:"width 0.35s" }}/>
      </div>

      {photos.corners && (
        <div className="fu3" style={{ width:"100%", maxWidth:240, textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontSize:10, color:P.dim, marginBottom:8, letterSpacing:"0.1em" }} className="mono">CORNERS · EXTRACTED</div>
          <img src={photos.corners} alt="corners" style={{
            width:"100%", borderRadius:12,
            border:`1px solid ${P.border}`,
            boxShadow:"0 4px 18px rgba(43,42,53,0.08)",
          }}/>
        </div>
      )}
    </div>
  );
}

/* ═══ SCREEN — RARITY PICKER ═══════════════════════════════════════════════
   User selects rarity manually after scanning.
═══════════════════════════════════════════════════════════════════════════ */
function RarityPickerScreen({ photos, aiResult, user, onConfirm, onRescan }) {
  const ai = aiResult?.success ? aiResult.data : null;

  // Pre-select AI's guess if confident
  const initialRarity = ai?.rarity && RARITY_OPTIONS.find(r => r.id === ai.rarity)
    ? ai.rarity
    : "SR";
  const [rarity, setRarity] = useState(initialRarity);

  // Merge DB + AI
  const dbCard = ai?.cardId ? OP_DB[ai.cardId] : null;
  const cardId  = ai?.cardId || "";
  const name    = dbCard?.name  || ai?.name  || "Unknown Card";
  const nameJP  = dbCard?.nameJP || ai?.nameJP || "";
  const setName = dbCard?.setName || ai?.setName || "";
  const language = ai?.language || "JP";
  const conf    = ai?.confidence || 0;
  const cardIdConf = ai?.cardIdConfidence ?? conf;

  const confColor = conf >= 85 ? P.sageDp : conf >= 65 ? P.butterDp : P.coral;

  const handleConfirm = () => {
    const lookupCard = OP_DB[cardId];
    onConfirm({
      cardId,
      name:     lookupCard?.name    || name,
      nameJP:   lookupCard?.nameJP  || nameJP,
      set:      lookupCard?.set     || ai?.set || "",
      setName:  lookupCard?.setName || setName,
      rarity,
      type:     lookupCard?.type    || ai?.type || "Character",
      color:    lookupCard?.color   || ai?.color || "Blue",
      cost:     lookupCard?.cost ?? ai?.cost ?? null,
      power:    lookupCard?.power   || ai?.power || null,
      traits:   lookupCard?.traits  || [],
      ability:  lookupCard?.ability || "",
      language,
      confidence: conf,
      cardIdConfidence: cardIdConf,
      languageEvidence: ai?.languageEvidence || "",
      pq: ai?.printQuality || { centering:85, corners:88, edges:88, surface:90, overall:88, notes:"" },
      prices: lookupCard?.prices || null,
    });
  };

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:P.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{
        background:P.surface, borderBottom:`1px solid ${P.border}`,
        padding:"48px 18px 14px", position:"sticky", top:0, zIndex:40,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <SmallBtn onClick={onRescan}>← Rescan</SmallBtn>
          <div className="serif" style={{ fontSize:16, fontWeight:700, letterSpacing:"-0.01em" }}>
            BoBoa Scan · Confirm
          </div>
          <div style={{ width:78 }}/>
        </div>
      </div>

      <div style={{ padding:"16px 18px 110px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* AI Confidence banner */}
        <div className="fu1">
          <Card accentColor={confColor} style={{ padding:"16px 18px", borderColor: toRgba(confColor, 0.45) }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:11, color:P.sub, marginBottom:4, letterSpacing:"0.05em" }}>
                  ◆ BOBOA AI · CONFIDENCE
                </div>
                <div className="serif" style={{ fontSize:36, fontWeight:700, color:confColor, lineHeight:1, letterSpacing:"-0.02em" }}>
                  {conf}%
                </div>
                {ai?.languageEvidence && (
                  <div style={{ fontSize:11, color:P.sub, marginTop:6, maxWidth:220, lineHeight:1.5 }}>
                    🗣 {ai.languageEvidence}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end" }}>
                <Pill color={aiResult?.success ? P.sageDp : P.coral}>
                  {aiResult?.success ? "✓ AI matched" : "⚠ AI failed"}
                </Pill>
                <Pill color={P.skyDp}>{language}</Pill>
              </div>
            </div>
          </Card>
        </div>

        {/* Photos */}
        <div className="fu2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Card>
            <img src={photos.full} alt="card" style={{ width:"100%", aspectRatio:"63/88", objectFit:"cover", display:"block" }}/>
            <div style={{ padding:"8px 12px", fontSize:10, color:P.sub, letterSpacing:"0.08em" }} className="mono">
              CARD · FRAMED
            </div>
          </Card>
          <Card>
            <img src={photos.corners} alt="corners" style={{ width:"100%", aspectRatio:"1/1", objectFit:"cover", display:"block" }}/>
            <div style={{ padding:"8px 12px", fontSize:10, color:P.sub, letterSpacing:"0.08em" }} className="mono">
              4 CORNERS · STITCHED
            </div>
          </Card>
        </div>

        {/* Card identification */}
        <div className="fu3">
          <Card>
            <SectionHeader accent={P.peachDp}>◆ Card Identification</SectionHeader>
            <div style={{ padding:"16px 18px" }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:4 }}>
                <span className="mono" style={{ fontSize:12, color:P.peachDp, fontWeight:600, letterSpacing:"0.08em" }}>
                  {cardId || "—"}
                </span>
                {cardIdConf > 0 && (
                  <Pill color={cardIdConf >= 80 ? P.sageDp : P.butterDp} style={{ fontSize:9, padding:"2px 7px" }}>
                    {cardIdConf}% match
                  </Pill>
                )}
              </div>
              <div className="serif" style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.02em", lineHeight:1.1, marginBottom:4 }}>
                {name}
              </div>
              {nameJP && (
                <div className="mono" style={{ fontSize:12, color:P.dim, marginBottom:8 }}>
                  {nameJP}
                </div>
              )}
              {setName && <div style={{ fontSize:13, color:P.sub }}>{setName}</div>}
            </div>
          </Card>
        </div>

        {/* Rarity picker */}
        <div className="fu4">
          <Card>
            <SectionHeader accent={P.lavDp}>Select Rarity (required)</SectionHeader>
            <div style={{ padding:"14px 14px 16px" }}>
              <div style={{ fontSize:12, color:P.sub, marginBottom:12, lineHeight:1.6 }}>
                Pricing and details are looked up based on rarity. AI suggested{" "}
                <strong style={{ color:P.ink }}>{ai?.rarity || "—"}</strong>.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                {RARITY_OPTIONS.map(r => {
                  const selected = rarity === r.id;
                  return (
                    <button key={r.id} onClick={() => setRarity(r.id)} style={{
                      background: selected ? r.color : P.surface,
                      color: selected ? "#fff" : P.ink,
                      border: `1.5px solid ${selected ? r.color : P.border}`,
                      borderRadius:11, padding:"10px 8px",
                      cursor:"pointer", transition:"all 0.15s",
                      textAlign:"center",
                      boxShadow: selected ? `0 4px 14px ${toRgba(r.color, 0.32)}` : "none",
                    }}>
                      <div style={{ fontSize:14, fontWeight:700, letterSpacing:"-0.01em" }}>{r.label}</div>
                      <div style={{ fontSize:10, marginTop:2, opacity:0.8 }}>{r.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* AI notes */}
        {ai?.printQuality?.notes && (
          <div className="fu5">
            <Card>
              <SectionHeader>BoBoa AI Notes</SectionHeader>
              <div style={{ padding:"14px 18px", fontSize:13, color:P.sub, lineHeight:1.7 }}>
                {ai.printQuality.notes}
              </div>
            </Card>
          </div>
        )}

      </div>

      {/* Bottom bar */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"rgba(251,248,243,0.96)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
        borderTop:`1px solid ${P.border}`,
        padding:"12px 18px 30px", display:"flex", gap:10,
      }}>
        <SmallBtn onClick={onRescan} style={{ flex:1, padding:"12px", fontSize:13 }}>📷 Rescan</SmallBtn>
        <PrimaryBtn onClick={handleConfirm} style={{ flex:2, padding:"12px", fontSize:14 }}>
          Confirm · View Prices →
        </PrimaryBtn>
      </div>
    </div>
  );
}

/* ═══ SCREEN — RESULT ══════════════════════════════════════════════════════ */
function ResultScreen({ photos, card, user, onRescan }) {
  const [tab, setTab]   = useState("overview");
  const [gradeId, setGradeId] = useState("raw_mint");
  const [showJP, setShowJP] = useState(false);

  const prices = card.prices || {};
  const curGrade = prices[gradeId] || { thbLow:0, thbHigh:0 };
  const suggest = Math.round(((curGrade.thbLow + curGrade.thbHigh) / 2) * 0.98) || 0;
  const net = Math.round(suggest * 0.95);

  const chartData = [525,630,770,665,840,770,910,curGrade.thbLow,curGrade.thbLow,curGrade.thbHigh];

  const gradeColor = {
    raw_sealed: P.sageDp, raw_mint: P.skyDp, raw_played: P.dim,
    psa10: P.sageDp, bgs10: P.butterDp, bgs10bl: P.lavDp,
  }[gradeId] || P.skyDp;

  const rarityOpt = RARITY_OPTIONS.find(r => r.id === card.rarity) || RARITY_OPTIONS[3];
  const rarityColor = rarityOpt.color;

  const jpQ = encodeURIComponent(`${card.nameJP || card.name} ${card.cardId}`);
  const enQ = encodeURIComponent(`${card.name} ${card.cardId} one piece tcg`);
  const EN_LINKS = [
    {icon:"🛒",label:"eBay — "+card.name,  url:`https://www.ebay.com/sch/i.html?_nkw=${enQ}`,               color:P.butterDp},
    {icon:"📈",label:"PriceCharting",        url:`https://www.pricecharting.com/search-products?q=${enQ}`,    color:P.skyDp},
    {icon:"🃏",label:"Limitless TCG",        url:`https://onepiece.limitlesstcg.com/cards/${card.cardId}`,     color:P.sageDp},
  ];
  const JP_LINKS = [
    {icon:"🟠",label:"Mercari Japan",    url:`https://jp.mercari.com/search?keyword=${jpQ}`,                             color:P.coral},
    {icon:"🟡",label:"Yahoo Auctions JP",url:`https://auctions.yahoo.co.jp/search/search?p=${jpQ}`,                     color:P.butterDp},
    {icon:"🟣",label:"Rakuten Japan",    url:`https://search.rakuten.co.jp/search/mall/${jpQ}/`,                         color:P.lavDp},
    {icon:"⬛",label:"Amazon Japan",     url:`https://www.amazon.co.jp/s?k=${jpQ}`,                                     color:P.ink},
  ];

  const TABS = [
    {id:"overview",  label:"Overview"},
    {id:"prices",    label:"Prices"},
    {id:"condition", label:"BoBoaGrade"},
  ];

  // BGS overall band
  const bgsOverall = bgsOverallBand(card.pq || {});

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:P.bg, minHeight:"100vh" }}>
      <style>{CSS}</style>

      {/* Sticky header */}
      <div style={{
        background:P.surface, borderBottom:`1px solid ${P.border}`,
        padding:"46px 16px 0", position:"sticky", top:0, zIndex:40,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SmallBtn onClick={onRescan}>📷 Scan</SmallBtn>
          <div style={{ display:"flex", gap:4 }}>
            <Pill color={P.sageDp}>✓ BoBoa AI</Pill>
            <Pill color={rarityColor}>{card.rarity}</Pill>
          </div>
        </div>

        {/* Card hero */}
        <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:12 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <img src={photos.full} alt="card" style={{
              width:92, aspectRatio:"63/88", objectFit:"cover",
              borderRadius:11, boxShadow:"0 6px 20px rgba(43,42,53,0.18)",
            }}/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="mono" style={{ fontSize:10, color:P.peachDp, letterSpacing:"0.1em", marginBottom:5, fontWeight:600 }}>
              {card.set} · {card.cardId}
            </div>
            <div className="serif" style={{ fontSize:24, fontWeight:700, lineHeight:1.1, marginBottom:6, letterSpacing:"-0.02em" }}>
              {card.name}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
              <Pill color={rarityColor} style={{ fontSize:10 }}>{card.rarity}</Pill>
              <Pill color={P.skyDp} style={{ fontSize:10 }}>{card.language}</Pill>
              {card.color && <Pill color={P.sub} style={{ fontSize:10 }}>{card.color}</Pill>}
            </div>
            <div style={{ fontSize:12, color:P.sub, lineHeight:1.7 }}>
              <strong style={{ color:P.ink }}>{card.setName}</strong><br/>
              {card.type}{card.cost != null ? ` · Cost ${card.cost}` : ""}{card.power ? ` · ${card.power} PWR` : ""}
              {card.nameJP && <><br/><span className="mono" style={{ fontSize:11, color:P.dim }}>{card.nameJP}</span></>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {[
            {label:"BoBoa Match", value:`${card.confidence}%`,          color: card.confidence >= 85 ? P.sageDp : P.butterDp},
            {label:"BoBoaGrade",  value: bgsOverall.grade.split(" ")[1], color: bgsOverall.color, sub: bgsOverall.grade.split(" ").slice(2).join(" ")},
            {label:"Rarity",      value: card.rarity,                   color: rarityColor},
          ].map((m,i) => (
            <div key={i} style={{
              flex:1, background:P.bgDeep,
              borderRadius:11, padding:"9px 6px", textAlign:"center",
            }}>
              <div style={{ fontSize:10, color:P.sub, marginBottom:3, letterSpacing:"0.02em" }}>{m.label}</div>
              <div className="serif" style={{ fontSize:16, color:m.color, fontWeight:700, lineHeight:1 }}>{m.value}</div>
              {m.sub && <div style={{ fontSize:9, color:P.dim, marginTop:2 }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderTop:`1px solid ${P.border}`, margin:"0 -16px" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, background:"none", border:"none",
              borderBottom: tab===t.id ? `2px solid ${P.peachDp}` : "2px solid transparent",
              color: tab===t.id ? P.peachDp : P.sub,
              padding:"11px 2px",
              fontSize:13, fontWeight: tab===t.id ? 700 : 500,
              letterSpacing:"-0.01em", cursor:"pointer",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px 16px 110px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            <Card className="fu1">
              <SectionHeader>📸 Captured · ⬡ {user.name}</SectionHeader>
              <div style={{ padding:"14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  {label:"Full Card (framed)", src:photos.full,    aspect:"63/88"},
                  {label:"4 Corners Grid",      src:photos.corners, aspect:"1/1"},
                ].map((p,i) => (
                  <div key={i} style={{ background:P.bgDeep, borderRadius:11, overflow:"hidden", border:`1px solid ${P.line}` }}>
                    <img src={p.src} alt={p.label} style={{ width:"100%", aspectRatio:p.aspect, objectFit:"cover", display:"block" }}/>
                    <div style={{ padding:"7px 10px" }}>
                      <div style={{ fontSize:11, fontWeight:600, marginBottom:3 }}>{p.label}</div>
                      <Pill color={P.peachDp} style={{ fontSize:9, padding:"2px 7px" }}>
                        WM · {user.name}
                      </Pill>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Market snapshot */}
            {Object.keys(prices).length > 0 && (
              <Card className="fu2">
                <SectionHeader accent={P.peachDp}>💰 Market Snapshot</SectionHeader>
                <div style={{ padding:"14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {GRADE_BTNS.filter(gb => prices[gb.id]).map(gb => {
                    const p = prices[gb.id] || {};
                    return (
                      <button key={gb.id} onClick={() => { setGradeId(gb.id); setTab("prices"); }} style={{
                        background:P.surface, border:`1.5px solid ${P.border}`,
                        borderRadius:13, padding:"12px 10px",
                        cursor:"pointer", textAlign:"left", transition:"all 0.15s",
                      }}>
                        <div style={{ fontSize:11, fontWeight:700, color:gb.color, marginBottom:3, letterSpacing:"-0.01em" }}>{gb.label}</div>
                        <div className="serif" style={{ fontSize:20, fontWeight:700, color:P.ink, lineHeight:1, letterSpacing:"-0.02em" }}>
                          ฿{fmt(p.thbLow || 0)}
                        </div>
                        <div style={{ fontSize:11, color:P.dim, marginTop:2 }}>to ฿{fmt(p.thbHigh || 0)}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding:"0 14px 14px" }}>
                  <PrimaryBtn onClick={() => setTab("prices")} style={{ padding:"12px", fontSize:14 }}>
                    View Full Price History →
                  </PrimaryBtn>
                </div>
              </Card>
            )}

            {/* List CTA */}
            <Card accentColor={P.peachDp} className="fu3" style={{ borderColor: toRgba(P.peachDp, 0.5) }}>
              <div style={{ padding:"16px 18px" }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>List on SwibSwap</div>
                <div style={{ fontSize:12, color:P.sub, marginBottom:14, lineHeight:1.6 }}>
                  {card.name} · {card.rarity} · {card.setName}
                </div>
                <PrimaryBtn>Publish Now →</PrimaryBtn>
              </div>
            </Card>
          </>
        )}

        {/* PRICES */}
        {tab === "prices" && (
          <>
            <div className="fu1">
              <div style={{ fontSize:11, fontWeight:700, color:P.sub, marginBottom:8, letterSpacing:"0.08em", textTransform:"uppercase" }}>
                By Grade & Condition
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                {GRADE_BTNS.map(gb => {
                  const has = prices[gb.id];
                  return (
                    <button key={gb.id} onClick={() => setGradeId(gb.id)} disabled={!has} style={{
                      background: gradeId === gb.id ? gb.color : P.surface,
                      color:      gradeId === gb.id ? "#fff"   : has ? P.ink : P.dim,
                      border:     `1.5px solid ${gradeId === gb.id ? gb.color : P.border}`,
                      borderRadius:11, padding:"10px 4px",
                      cursor: has ? "pointer" : "not-allowed",
                      opacity: has ? 1 : 0.4,
                      fontSize:11, fontWeight:700, textAlign:"center",
                      letterSpacing:"-0.01em",
                    }}>{gb.label}</button>
                  );
                })}
              </div>
            </div>

            {curGrade.thbLow > 0 ? (
              <Card accentColor={gradeColor} className="fu2" style={{ borderColor: toRgba(gradeColor, 0.5), padding:0 }}>
                <div style={{ padding:"16px 18px" }}>
                  {curGrade.note && (
                    <div style={{ fontSize:11, color:P.dim, marginBottom:8, fontStyle:"italic" }}>{curGrade.note}</div>
                  )}
                  <div style={{ fontSize:12, color:P.sub, marginBottom:4 }}>
                    {card.name} · {GRADE_BTNS.find(g => g.id === gradeId)?.label}
                  </div>
                  <div className="serif" style={{ fontSize:38, fontWeight:700, color:gradeColor, lineHeight:1, letterSpacing:"-0.03em" }}>
                    ฿{fmt(curGrade.thbLow)}
                  </div>
                  <div className="serif" style={{ fontSize:18, fontWeight:600, color:gradeColor, opacity:0.7, marginTop:3 }}>
                    – ฿{fmt(curGrade.thbHigh)}
                  </div>
                  <div style={{ fontSize:12, color:P.dim, marginTop:4 }}>
                    (${Math.round(curGrade.thbLow/RATE)}–${Math.round(curGrade.thbHigh/RATE)} USD)
                  </div>
                  <div style={{ marginTop:14 }}>
                    <MiniChart data={chartData} color={gradeColor}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                    {["Oct","Nov","Dec","Jan","Feb","Mar","Mar","Apr","Apr","Now"].map((m,i) => (
                      <span key={i} style={{ fontSize:9, color:P.dim }}>{m}</span>
                    ))}
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="fu2">
                <div style={{ padding:"28px 20px", textAlign:"center" }}>
                  <div style={{ fontSize:26, marginBottom:8 }}>📊</div>
                  <div style={{ fontSize:14, fontWeight:600, color:P.sub }}>No price data yet</div>
                  <div style={{ fontSize:12, color:P.dim, marginTop:4 }}>Check eBay or PriceCharting</div>
                </div>
              </Card>
            )}

            {suggest > 0 && (
              <Card accentColor={P.peachDp} className="fu3" style={{ borderColor: toRgba(P.peachDp, 0.5) }}>
                <div style={{ padding:"16px 18px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>List on SwibSwap</div>
                      <div style={{ fontSize:12, color:P.sub }}>
                        Suggested <strong style={{ color:P.peachDp }}>฿{fmt(suggest)}</strong> · Net <strong style={{ color:P.sageDp }}>฿{fmt(net)}</strong>
                      </div>
                    </div>
                  </div>
                  <PrimaryBtn>Publish →</PrimaryBtn>
                </div>
              </Card>
            )}

            <Card className="fu4">
              <div style={{ display:"flex", gap:5, padding:"11px 14px", borderBottom:`1px solid ${P.line}` }}>
                <button onClick={() => setShowJP(false)} style={{
                  flex:1, background: !showJP ? P.peachDp : P.surface,
                  color: !showJP ? "#fff" : P.sub,
                  border:`1px solid ${!showJP ? P.peachDp : P.border}`,
                  borderRadius:9, padding:"8px", fontSize:12, fontWeight:600, cursor:"pointer",
                }}>🌐 English</button>
                <button onClick={() => setShowJP(true)} style={{
                  flex:1, background:  showJP ? P.peachDp : P.surface,
                  color:  showJP ? "#fff" : P.sub,
                  border:`1px solid ${ showJP ? P.peachDp : P.border}`,
                  borderRadius:9, padding:"8px", fontSize:12, fontWeight:600, cursor:"pointer",
                }}>🇯🇵 Japan</button>
              </div>
              {showJP && (
                <div style={{ padding:"8px 16px", background:P.bgDeep, fontSize:11, color:P.sub, borderBottom:`1px solid ${P.line}` }}>
                  JP: <span className="mono" style={{ color:P.ink }}>{card.nameJP} {card.cardId}</span>
                </div>
              )}
              {(showJP ? JP_LINKS : EN_LINKS).map((l,i,arr) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
                  <div style={{
                    display:"flex", alignItems:"center", gap:12, padding:"13px 16px",
                    borderBottom: i < arr.length - 1 ? `1px solid ${P.line}` : "none",
                    cursor:"pointer",
                  }}>
                    <span style={{ fontSize:18 }}>{l.icon}</span>
                    <span style={{ fontSize:13.5, fontWeight:500, flex:1, color:l.color }}>{l.label}</span>
                    <span style={{ fontSize:14, color:P.dim }}>›</span>
                  </div>
                </a>
              ))}
            </Card>
          </>
        )}

        {/* BOBOAGRADE (Condition) */}
        {tab === "condition" && (
          <>
            <Card accentColor={bgsOverall.color} className="fu1" style={{ borderColor: toRgba(bgsOverall.color, 0.6) }}>
              <div style={{ padding:"18px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:16 }}>
                <div>
                  <div style={{ fontSize:11, color:P.sub, marginBottom:4, letterSpacing:"0.06em" }}>
                    ◆ BOBOAGRADE · BGS CRITERIA
                  </div>
                  <div className="serif" style={{ fontSize:20, fontWeight:700, color:bgsOverall.color, lineHeight:1.2, letterSpacing:"-0.01em" }}>
                    {bgsOverall.grade}
                  </div>
                  <div style={{ fontSize:12, color:P.sub, marginTop:8, maxWidth:180, lineHeight:1.55 }}>
                    Scored against real BGS 10 Black Label criteria.
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div className="serif" style={{ fontSize:58, fontWeight:700, color:bgsOverall.color, lineHeight:0.9, letterSpacing:"-0.04em" }}>
                    {bgsOverall.grade.match(/\d+(\.\d+)?/)?.[0] || "—"}
                  </div>
                  <div style={{ fontSize:11, color:P.sub, marginTop:4 }}>/ 10.0</div>
                </div>
              </div>
            </Card>

            <Card className="fu2">
              <SectionHeader accent={P.sageDp}>Subgrade Breakdown</SectionHeader>
              {BGS_CRITERIA.map((c, i) => {
                const score = card.pq?.[c.key] || 85;
                return (
                  <ScoreBar
                    key={c.key}
                    label={c.label}
                    score={score}
                    bgsValue={bgsRelative(score)}
                    desc={c.desc}
                    isLast={i === BGS_CRITERIA.length - 1}
                  />
                );
              })}
            </Card>

            <Card className="fu3">
              <SectionHeader>BGS Grade Reference</SectionHeader>
              <div style={{ padding:"8px 0" }}>
                {[
                  { tier:"10 PRISTINE (BL)", req:"All subs 10.0",  color:P.lavDp },
                  { tier:"10 GEM MINT",      req:"All subs ≥ 9.5", color:P.butterDp },
                  { tier:"9.5 MINT",         req:"All subs ≥ 9.0", color:P.sageDp },
                  { tier:"9 MINT",           req:"All subs ≥ 8.5", color:P.skyDp },
                  { tier:"8.5 NM-MT",        req:"All subs ≥ 8.0", color:P.peachDp },
                ].map((r,i,arr) => (
                  <div key={r.tier} style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"10px 18px",
                    borderBottom: i < arr.length-1 ? `1px solid ${P.line}` : "none",
                  }}>
                    <span style={{ fontSize:12, fontWeight:600, color:r.color }}>BGS {r.tier}</span>
                    <span className="mono" style={{ fontSize:11, color:P.sub }}>{r.req}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="fu4">
              <SectionHeader>Corner Analysis — Zoomed 4x</SectionHeader>
              <div style={{ padding:"14px 18px" }}>
                <img src={photos.corners} alt="Corners" style={{
                  width:"100%", borderRadius:11, border:`1px solid ${P.line}`,
                }}/>
                <div style={{ marginTop:10, fontSize:12, color:P.sub, lineHeight:1.6 }}>
                  TL · TR · BL · BR — each corner cropped from the framed card at 28% zoom and stitched into a 2×2 grid for close inspection.
                </div>
              </div>
            </Card>

            {card.pq?.notes && (
              <Card className="fu5">
                <SectionHeader accent={P.peachDp}>BoBoa AI · Condition Notes</SectionHeader>
                <div style={{ padding:"14px 18px", fontSize:13, color:P.sub, lineHeight:1.7 }}>
                  {card.pq.notes}
                </div>
              </Card>
            )}

            {card.ability && (
              <Card className="fu5">
                <SectionHeader>Card Ability</SectionHeader>
                <div style={{ padding:"14px 18px" }}>
                  <div className="mono" style={{ fontSize:11, color:P.sub, marginBottom:8 }}>
                    {card.cardId} · {card.rarity}{card.cost != null && ` · Cost ${card.cost}`}{card.power && ` · ${card.power} PWR`}
                  </div>
                  <div style={{ fontSize:14, color:P.ink, lineHeight:1.7 }}>
                    {card.ability}
                  </div>
                  {card.traits?.length > 0 && (
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:10 }}>
                      {card.traits.map(t => <Pill key={t} color={P.sub} style={{ fontSize:10 }}>{t}</Pill>)}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"rgba(251,248,243,0.96)",
        backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
        borderTop:`1px solid ${P.border}`,
        padding:"12px 16px 30px", display:"flex", gap:10,
      }}>
        <SmallBtn onClick={onRescan} style={{ flex:1, padding:"12px" }}>📷 Scan Again</SmallBtn>
        <PrimaryBtn style={{ flex:2, padding:"12px" }}>Push to Vault →</PrimaryBtn>
      </div>
    </div>
  );
}

/* ═══ ROOT ═════════════════════════════════════════════════════════════════ */
export default function App() {
  const [screen,   setScreen]   = useState("login");
  const [user,     setUser]     = useState(null);
  const [photos,   setPhotos]   = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [card,     setCard]     = useState(null);

  const handleLogin     = useCallback(u  => { setUser(u); setScreen("welcome"); }, []);
  const handleLogout    = useCallback(()  => { setUser(null); setScreen("login"); }, []);
  const handleStart     = useCallback(()  => setScreen("camera"), []);
  const handleBack      = useCallback(()  => setScreen("welcome"), []);
  const handleCapture   = useCallback(p  => { setPhotos(p); setScreen("processing"); }, []);
  const handleProcDone  = useCallback(r  => { setAiResult(r); setScreen("rarity"); }, []);
  const handleConfirm   = useCallback(c  => { setCard(c); setScreen("result"); }, []);
  const handleRescan    = useCallback(()  => { setPhotos(null); setAiResult(null); setCard(null); setScreen("camera"); }, []);

  if (screen === "login")      return <LoginScreen       onLogin={handleLogin}/>;
  if (screen === "welcome")    return <WelcomeScreen     user={user} onStart={handleStart} onLogout={handleLogout}/>;
  if (screen === "camera")     return <CameraScreen      user={user} onCapture={handleCapture} onBack={handleBack}/>;
  if (screen === "processing") return <ProcessingScreen  photos={photos} onDone={handleProcDone}/>;
  if (screen === "rarity")     return <RarityPickerScreen photos={photos} aiResult={aiResult} user={user} onConfirm={handleConfirm} onRescan={handleRescan}/>;
  if (screen === "result")     return <ResultScreen      photos={photos} card={card} user={user} onRescan={handleRescan}/>;
  return null;
}
