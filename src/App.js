import { useState, useRef, useEffect, useCallback } from "react";

// ─── TOKENS ──────────────────────────────────────────────────────────────────
const C = {
  bg:      "#F8F9FB",
  white:   "#FFFFFF",
  surface: "#F1F3F7",
  border:  "#E3E7EE",
  line:    "#EEF1F6",
  blue:    "#1A6FFF",
  green:   "#12A05C",
  gold:    "#D48A00",
  purple:  "#7C3AED",
  red:     "#DC2626",
  teal:    "#0891B2",
  text:    "#111827",
  sub:     "#6B7280",
  dim:     "#9CA3AF",
  lighter: "#D1D5DB",
  // rgba soft versions
  blueSoft:   "rgba(26,111,255,0.08)",
  greenSoft:  "rgba(18,160,92,0.08)",
  goldSoft:   "rgba(212,138,0,0.08)",
  purpleSoft: "rgba(124,58,237,0.08)",
};

const RATE = 35;
const fmt    = (n) => Number(n).toLocaleString();
const thbStr = (usd) => `฿${fmt(Math.round(usd * RATE))}`;
const usdStr = (usd) => `($${Number(usd) % 1 === 0 ? Number(usd).toFixed(0) : Number(usd).toFixed(2)})`;
const rgba   = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const GS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body{background:#111827;color:#111827;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;overscroll-behavior:none;}
::-webkit-scrollbar{display:none;}
.mono{font-family:'JetBrains Mono',monospace;}
a{text-decoration:none;color:inherit;}

@keyframes fadeUp   {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn   {from{opacity:0}to{opacity:1}}
@keyframes scanLine {0%{top:0%}100%{top:100%}}
@keyframes pulse    {0%,100%{opacity:1}50%{opacity:0.3}}
@keyframes spin     {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes popUp    {from{opacity:0;transform:scale(0.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}

.fu1{animation:fadeUp 0.4s 0.00s ease both;}
.fu2{animation:fadeUp 0.4s 0.07s ease both;}
.fu3{animation:fadeUp 0.4s 0.14s ease both;}
.fu4{animation:fadeUp 0.4s 0.21s ease both;}
.fu5{animation:fadeUp 0.4s 0.28s ease both;}
.pop{animation:popUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both;}
.fi {animation:fadeIn 0.35s ease both;}
`;

// ─── PRICE DATA ───────────────────────────────────────────────────────────────
const GRADE_DATA = {
  raw_sealed: { label:"RAW Sealed",   color:C.blue,   thbLow:1890, thbHigh:2450, trend:"+8%",  up:true,  usd:"$54–$70",   suggest:2100, history:[840,980,1120,1050,1260,1190,1400,1680,2100,2240] },
  raw_mint:   { label:"RAW Mint/NM",  color:C.blue,   thbLow:1050, thbHigh:1330, trend:"+8%",  up:true,  usd:"$30–$38",   suggest:1150, history:[525,630,770,665,840,770,910,1050,1190,1260] },
  raw_played: { label:"RAW Played",   color:C.sub,    thbLow:420,  thbHigh:840,  trend:"-3%",  up:false, usd:"$12–$24",   suggest:600,  history:[210,280,350,315,420,385,455,490,700,770] },
  psa10:      { label:"PSA 10",       color:C.green,  thbLow:1995, thbHigh:2975, trend:"−12%", up:false, usd:"$57–$85",   suggest:2200, history:[4200,3675,3220,3080,3325,2800,2695,2450,2975,1995], note:"176 auctions · $15,570 GMV" },
  bgs10:      { label:"BGS 10",       color:C.gold,   thbLow:3150, thbHigh:4550, trend:"+5%",  up:true,  usd:"$90–$130",  suggest:3800, history:[2800,3150,3080,2870,3325,3430,3850,4130,4200,4375] },
  bgs10bl:    { label:"BGS 10 BL",    color:C.purple, thbLow:9800, thbHigh:15750,trend:"+22%", up:true,  usd:"$280–$450", suggest:12000,history:[5600,6300,7000,7350,8050,8400,10850,11900,12600,13300], note:"Est. pop < 5" },
};

const RECENT_SALES = {
  raw_mint: [{date:"22 Apr",usd:36,cond:"NM"},{date:"17 Apr",usd:34.5,cond:"NM"},{date:"9 Apr",usd:31,cond:"NM"},{date:"4 Apr",usd:29.99,cond:"NM"},{date:"28 Mar",usd:26,cond:"NM+"}],
  psa10:    [{date:"27 Sep",usd:57,cond:"Gem Mint"},{date:"16 Sep",usd:61,cond:"Gem Mint"},{date:"5 Sep",usd:84.99,cond:"Gem Mint"},{date:"28 Aug",usd:60,cond:"Gem Mint"},{date:"24 Jun",usd:56,cond:"Gem Mint"}],
  bgs10:    [{date:"Apr 2025",usd:125,cond:"Pristine"},{date:"Mar 2025",usd:110,cond:"Pristine"},{date:"Feb 2025",usd:95,cond:"Pristine"}],
  bgs10bl:  [{date:"Apr 2025",usd:380,cond:"Black Label"},{date:"Mar 2025",usd:310,cond:"Black Label"},{date:"Jan 2025",usd:240,cond:"Black Label"}],
};

const SCAN_RESULT = {
  name:      "Boa Hancock",
  number:    "OP07-051",
  set:       "500 Years in the Future",
  rarity:    "SR Manga Alt Art",
  type:      "Character — Blue",
  cost:      6,
  power:     "8000",
  ability:   "[On Play] Up to 1 opponent's Character (not Luffy) can't attack next turn. Return 1 Cost-1 or less to bottom of deck.",
  condition: { centering:91, corners:88, surface:93, edges:90, print:97, foil:95, uv:100 },
  centering: { front:{ t:49,b:51,l:48,r:52 }, back:{ t:50,b:50,l:51,r:49 } },
  overall:   "NM",
  aiScore:   8.8,
  genuine:   true,
  jpName:    "ボア・ハンコック OP07-051 コミックパラレル",
};

const PROC_STEPS = [
  "Detecting card frame…",
  "Perspective correction…",
  "Extracting 4 corners…",
  "Stitching corner grid…",
  "Measuring centering…",
  "Applying watermark…",
  "Matching TCG database…",
  "Checking UV signature…",
  "Generating full report…",
];

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
function Tag({ children, color, style }) {
  color = color || C.blue;
  const bgMap = {
    [C.blue]:   "rgba(26,111,255,0.1)",
    [C.green]:  "rgba(18,160,92,0.1)",
    [C.gold]:   "rgba(212,138,0,0.1)",
    [C.purple]: "rgba(124,58,237,0.1)",
    [C.red]:    "rgba(220,38,38,0.1)",
    [C.teal]:   "rgba(8,145,178,0.1)",
    [C.sub]:    "rgba(107,114,128,0.1)",
  };
  return (
    <span style={{
      background: bgMap[color] || "rgba(0,0,0,0.06)",
      color, border:`1px solid ${color}`,
      borderRadius:5, padding:"2px 7px",
      fontSize:10, fontWeight:600, display:"inline-block", ...style,
    }}>{children}</span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background:C.white, borderRadius:16, border:`1px solid ${C.border}`,
      overflow:"hidden", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.line}`,
      background:C.surface, fontSize:10, fontWeight:700, color:C.sub,
      letterSpacing:"0.07em", textTransform:"uppercase" }}>
      {children}
    </div>
  );
}

function ScoreRow({ label, score, note, isLast }) {
  const color = score >= 90 ? C.green : score >= 80 ? C.gold : C.red;
  return (
    <div style={{ padding:"9px 16px", borderBottom: isLast ? "none" : `1px solid ${C.line}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <span style={{ fontSize:13, fontWeight:500 }}>{label}</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {note && <span style={{ fontSize:10, color:C.dim }}>{note}</span>}
          <span style={{ fontSize:14, fontWeight:700, color }}>{score}</span>
        </div>
      </div>
      <div style={{ height:4, background:C.surface, borderRadius:99, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${score}%`, background:color, borderRadius:99 }} />
      </div>
    </div>
  );
}

function MiniChart({ data, color }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * 96 + 2,
    46 - ((v - min) / rng) * 38,
  ]);
  const line = pts.map(([x,y],i) => `${i?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length-1][0].toFixed(1)},50 L2,50 Z`;
  const gid  = `mcg${Math.abs(color.split("").reduce((a,c)=>a+c.charCodeAt(0),0))}`;
  return (
    <svg viewBox="0 0 100 52" style={{ width:"100%", height:56 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map(([x,y],i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.2" fill={color}/>)}
    </svg>
  );
}

// ─── CARD ILLUSTRATION ────────────────────────────────────────────────────────
function CardIllustration({ w, captured }) {
  w = w || 100;
  const h = Math.round(w * 1.4);
  if (captured) {
    return (
      <div style={{ width:w, height:h, borderRadius:10, overflow:"hidden",
        flexShrink:0, boxShadow:"0 4px 20px rgba(0,0,0,0.18)", position:"relative" }}>
        <img src={captured} alt="scanned card"
          style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        {/* watermark overlay */}
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", pointerEvents:"none" }}>
          <div style={{ fontSize: w * 0.07, color:"white", opacity:0.12, fontFamily:"monospace",
            fontWeight:700, transform:"rotate(-35deg)", textAlign:"center", lineHeight:1.6, padding:4 }}>
            SWIBSWAP{"\n"}VERIFIED{"\n"}SW-5021
          </div>
        </div>
        <div style={{ position:"absolute", bottom:6, right:6, background:"rgba(0,0,0,0.55)",
          borderRadius:3, padding:"2px 6px" }}>
          <span style={{ fontSize: Math.max(8, w*0.07), color:"#3B9EFF", fontFamily:"monospace" }}>
            ⬡ SWIBSWAP
          </span>
        </div>
      </div>
    );
  }
  return (
    <svg width={w} height={h} viewBox="0 0 100 140"
      style={{ borderRadius:10, display:"block", flexShrink:0,
        boxShadow:"0 4px 20px rgba(0,0,0,0.18)" }}>
      <defs>
        <linearGradient id="ci_bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0D1E36"/>
          <stop offset="100%" stopColor="#060E1C"/>
        </linearGradient>
        <clipPath id="ci_clip"><rect width="100" height="140" rx="7"/></clipPath>
      </defs>
      <g clipPath="url(#ci_clip)">
        <rect width="100" height="140" fill="url(#ci_bg)"/>
        <rect x="2" y="2" width="96" height="100" fill="#EDE8DE" rx="3"/>
        {Array.from({length:12},(_,i)=>{
          const a=(i/12)*Math.PI*2;
          return <line key={i} x1={50} y1={52}
            x2={50+Math.cos(a)*56} y2={52+Math.sin(a)*56}
            stroke="#D5CEC0" strokeWidth="0.4" opacity="0.5"/>;
        })}
        <path d="M33 18 Q27 10 26 20 Q24 30 30 35" fill="#1A0E06"/>
        <path d="M67 18 Q73 10 74 20 Q76 30 70 35" fill="#1A0E06"/>
        <path d="M33 15 Q50 7 67 15 Q71 23 67 26 Q50 18 33 26 Q29 23 33 15Z" fill="#1A0E06"/>
        <path d="M27 35 Q19 56 21 74 Q23 86 26 96 L31 94 Q28 82 28 63 Q30 44 35 35Z" fill="#241408"/>
        <path d="M73 35 Q81 56 79 74 Q77 86 74 96 L69 94 Q72 82 72 63 Q70 44 65 35Z" fill="#241408"/>
        <ellipse cx="50" cy="37" rx="15" ry="17" fill="#F5E8D4" stroke="#2A1A0A" strokeWidth="0.5"/>
        <ellipse cx="43" cy="35" rx="4"  ry="4.5" fill="#0A0400"/>
        <ellipse cx="57" cy="35" rx="4"  ry="4.5" fill="#0A0400"/>
        <circle  cx="44.5" cy="33.5" r="1.5" fill="white"/>
        <circle  cx="58.5" cy="33.5" r="1.5" fill="white"/>
        <path d="M44 44 Q50 48 56 44" fill="#E07878" stroke="#C05050" strokeWidth="0.4"/>
        <ellipse cx="37" cy="39" rx="4.5" ry="2.2" fill="#FFB0A0" opacity="0.45"/>
        <ellipse cx="63" cy="39" rx="4.5" ry="2.2" fill="#FFB0A0" opacity="0.45"/>
        <path d="M43 16 L44.5 11 L46 15 L50 8 L54 15 L55.5 11 L57 16" fill="#D4A820" stroke="#A07010" strokeWidth="0.5"/>
        <path d="M36 53 Q41 57 50 55 Q59 57 64 53 Q61 67 50 69 Q39 67 36 53Z" fill="#2A1060"/>
        <path d="M64 60 Q75 55 78 63 Q81 71 73 74 Q65 77 63 69 Q61 61 69 59" fill="none" stroke="#4A8A4A" strokeWidth="2" strokeLinecap="round"/>
        <rect x="0" y="102" width="100" height="38" fill="#0A1628"/>
        <text x="5"  y="114" fill="#5A8AAA" fontSize="5" fontFamily="monospace">CHARACTER · BLUE · COST 6</text>
        <text x="5"  y="124" fill="#F0F4FA" fontSize="7" fontFamily="sans-serif" fontWeight="700">Boa Hancock</text>
        <text x="5"  y="133" fill="#3A5A78" fontSize="4.5" fontFamily="monospace">OP07-051 · SR · MANGA ALT</text>
        <text x="94" y="124" textAnchor="end" fill="#F5A623" fontSize="8" fontFamily="monospace" fontWeight="700">8000</text>
        <rect x="1" y="1" width="98" height="138" rx="6.5" fill="none" stroke="#1E3A5A" strokeWidth="1"/>
        <text x="50" y="64" textAnchor="middle" fill="#000" fontSize="4.5" fontFamily="monospace"
          opacity="0.09" transform="rotate(-35,50,64)">SWIBSWAP · SW-5021</text>
        <rect x="62" y="92" width="34" height="9" rx="2" fill="#000" opacity="0.4"/>
        <text x="79" y="98.5" textAnchor="middle" fill="#3B9EFF" fontSize="5" fontFamily="monospace">⬡ SWIBSWAP</text>
      </g>
    </svg>
  );
}

// ─── SCREEN 1: CAMERA SCANNER ─────────────────────────────────────────────────
function CameraScreen({ onScanComplete }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const [phase,    setPhase]    = useState("start");   // start|requesting|live|capturing|processing|done|error
  const [errMsg,   setErrMsg]   = useState("");
  const [procStep, setProcStep] = useState("");
  const [procPct,  setProcPct]  = useState(0);
  const [flash,    setFlash]    = useState(false);
  const [torch,    setTorch]    = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = useCallback(async () => {
    setPhase("requesting");
    try {
      const constraints = {
        video: {
          facingMode: { ideal:"environment" },
          width:  { ideal:1920 },
          height: { ideal:1080 },
          focusMode: "continuous",
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setPhase("live");
      }
    } catch (err) {
      setErrMsg(
        err.name === "NotAllowedError"
          ? "Camera permission denied.\n\nTo fix: go to Safari Settings → Camera → Allow for this site."
          : err.name === "NotFoundError"
          ? "No camera found on this device."
          : `Camera error: ${err.message}`
      );
      setPhase("error");
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced:[{ torch: !torch }] });
      setTorch(t => !t);
    } catch(_) { /* torch not supported on all devices */ }
  }, [torch]);

  const capture = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    setPhase("capturing");

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    // Apply watermark
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle   = "#000000";
    ctx.font        = `bold ${canvas.width * 0.018}px monospace`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 5.5);
    ctx.fillText(`SWIBSWAP · VERIFIED · SW-5021 · ${new Date().toLocaleDateString("en-GB")}`, -canvas.width * 0.35, 0);
    ctx.restore();
    // Corner badge
    const bw = canvas.width * 0.16, bh = canvas.height * 0.055;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(canvas.width - bw - 12, canvas.height - bh - 12, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = "#3B9EFF";
    ctx.font = `bold ${canvas.height * 0.022}px monospace`;
    ctx.fillText("⬡ SWIBSWAP", canvas.width - bw - 6, canvas.height - bh * 0.25 - 12);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    stopStream();

    // Simulate processing pipeline
    setTimeout(() => {
      setPhase("processing");
      let i = 0;
      const iv = setInterval(() => {
        const step = PROC_STEPS[i];
        setProcStep(step || "");
        setProcPct(Math.round(((i + 1) / PROC_STEPS.length) * 100));
        i++;
        if (i >= PROC_STEPS.length) {
          clearInterval(iv);
          setTimeout(() => onScanComplete(dataUrl), 500);
        }
      }, 320);
    }, 150);
  }, [onScanComplete]);

  useEffect(() => () => stopStream(), []);

  // ── START SCREEN ──
  if (phase === "start") return (
    <div style={{ minHeight:"100vh", background:"#0D111A", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"40px 24px", gap:32 }}>
      <style>{GS}</style>

      {/* Logo */}
      <div className="fu1" style={{ textAlign:"center" }}>
        <div style={{ width:72, height:72, background:C.blue, borderRadius:20,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:32, margin:"0 auto 16px",
          boxShadow:`0 8px 32px rgba(26,111,255,0.4)` }}>⬡</div>
        <div style={{ fontSize:28, fontWeight:800, color:"white", letterSpacing:"-0.5px" }}>SwibDeck</div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,0.5)", marginTop:4 }}>
          TCG Card Scanner · Powered by SwibSwap
        </div>
      </div>

      {/* Instructions */}
      <div className="fu2" style={{ width:"100%", maxWidth:340 }}>
        {[
          { icon:"📸", title:"Point at your card", body:"Place card on a flat surface. Good lighting helps." },
          { icon:"🔍", title:"Auto-identifies card", body:"AI matches against TCG database instantly." },
          { icon:"💰", title:"See live prices", body:"RAW, PSA 10, BGS 10, BGS 10 BL — all in Thai Baht." },
          { icon:"📦", title:"Push to Vault", body:"List directly on SwibSwap in one tap." },
        ].map((s, i) => (
          <div key={i} style={{ display:"flex", gap:14, padding:"12px 0",
            borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.07)" : "none",
            alignItems:"flex-start" }}>
            <div style={{ width:38, height:38, borderRadius:10,
              background:"rgba(255,255,255,0.06)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:18, flexShrink:0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"white", marginBottom:2 }}>{s.title}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Start button */}
      <div className="fu3" style={{ width:"100%", maxWidth:340 }}>
        <button onClick={startCamera}
          style={{ width:"100%", background:C.blue, border:"none", borderRadius:16,
            padding:"18px", fontSize:17, fontWeight:800, color:"white",
            cursor:"pointer", boxShadow:`0 8px 28px rgba(26,111,255,0.45)`,
            display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>📷</span> Start Scanning
        </button>
        <div style={{ textAlign:"center", marginTop:12, fontSize:11,
          color:"rgba(255,255,255,0.28)" }}>
          Camera access required · Works on iPhone Safari
        </div>
      </div>
    </div>
  );

  // ── REQUESTING ──
  if (phase === "requesting") return (
    <div style={{ minHeight:"100vh", background:"#0D111A", display:"flex",
      alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <style>{GS}</style>
      <div style={{ width:48, height:48, border:`3px solid ${C.blue}`,
        borderTopColor:"transparent", borderRadius:"50%",
        animation:"spin 0.8s linear infinite" }}/>
      <div style={{ color:"white", fontSize:14 }}>Requesting camera access…</div>
      <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", textAlign:"center", padding:"0 40px", lineHeight:1.6 }}>
        Tap <strong style={{ color:"white" }}>Allow</strong> when Safari asks for camera permission
      </div>
    </div>
  );

  // ── ERROR ──
  if (phase === "error") return (
    <div style={{ minHeight:"100vh", background:"#0D111A", display:"flex",
      alignItems:"center", justifyContent:"center", flexDirection:"column",
      gap:16, padding:"40px 24px", textAlign:"center" }}>
      <style>{GS}</style>
      <div style={{ fontSize:48 }}>📷</div>
      <div style={{ fontSize:18, fontWeight:700, color:C.red }}>Camera Unavailable</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", lineHeight:1.7,
        maxWidth:320, whiteSpace:"pre-line" }}>{errMsg}</div>
      <button onClick={() => setPhase("start")}
        style={{ background:C.blue, border:"none", borderRadius:12, padding:"14px 28px",
          fontSize:14, fontWeight:700, color:"white", cursor:"pointer", marginTop:8 }}>
        Try Again
      </button>
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.25)", lineHeight:1.6, maxWidth:300 }}>
        Note: Camera access requires HTTPS. Open this page at <strong style={{ color:"rgba(255,255,255,0.5)" }}>swibdeck.vercel.app</strong> for full iPhone support.
      </div>
    </div>
  );

  // ── LIVE CAMERA ──
  if (phase === "live" || phase === "capturing") return (
    <div style={{ minHeight:"100vh", background:"#000", position:"relative",
      display:"flex", flexDirection:"column" }}>
      <style>{GS}</style>

      {/* Video */}
      <video ref={videoRef} playsInline muted autoPlay
        style={{ position:"absolute", inset:0, width:"100%", height:"100%",
          objectFit:"cover" }} />

      {/* Flash */}
      {flash && (
        <div style={{ position:"absolute", inset:0, background:"white",
          opacity:0.8, pointerEvents:"none", zIndex:10 }} />
      )}

      {/* Top bar */}
      <div style={{ position:"relative", zIndex:5, display:"flex",
        justifyContent:"space-between", alignItems:"center",
        padding:"56px 20px 16px",
        background:"linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)" }}>
        <div style={{ fontSize:15, fontWeight:700, color:"white" }}>SwibDeck Scanner</div>
        <button onClick={toggleTorch}
          style={{ background: torch ? "rgba(255,200,0,0.25)" : "rgba(255,255,255,0.15)",
            border:`1px solid ${torch ? "rgba(255,200,0,0.6)" : "rgba(255,255,255,0.3)"}`,
            borderRadius:10, padding:"8px 14px", fontSize:12, fontWeight:600,
            color:"white", cursor:"pointer" }}>
          {torch ? "🔦 On" : "🔦 Off"}
        </button>
      </div>

      {/* Viewfinder overlay */}
      <div style={{ position:"absolute", inset:0, display:"flex",
        alignItems:"center", justifyContent:"center", zIndex:4 }}>
        {/* Dark mask with card-shaped cutout effect */}
        <div style={{ position:"relative", width:"72%", maxWidth:260, aspectRatio:"63/88" }}>
          {/* Corner brackets */}
          {[
            {top:0,    left:0,    borderTop:`3px solid ${C.blue}`, borderLeft:`3px solid ${C.blue}`},
            {top:0,    right:0,   borderTop:`3px solid ${C.blue}`, borderRight:`3px solid ${C.blue}`},
            {bottom:0, left:0,    borderBottom:`3px solid ${C.blue}`, borderLeft:`3px solid ${C.blue}`},
            {bottom:0, right:0,   borderBottom:`3px solid ${C.blue}`, borderRight:`3px solid ${C.blue}`},
          ].map((s, i) => (
            <div key={i} style={{ position:"absolute", width:28, height:28, ...s }} />
          ))}
          {/* Card guide border */}
          <div style={{ position:"absolute", inset:0,
            border:`1.5px dashed rgba(26,111,255,0.45)`, borderRadius:8 }} />
          {/* Animated scan line */}
          <div style={{ position:"absolute", left:0, right:0, height:2, top:"50%",
            background:`linear-gradient(90deg,transparent,${C.blue},transparent)`,
            animation:"scanLine 2s ease-in-out infinite",
            boxShadow:`0 0 8px ${C.blue}` }} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:5,
        padding:"20px 24px 44px",
        background:"linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}>
        <div style={{ textAlign:"center", marginBottom:20, fontSize:13,
          color:"rgba(255,255,255,0.7)", fontWeight:500 }}>
          Place card inside the frame · Keep flat &amp; steady
        </div>
        {/* Capture button */}
        <div style={{ display:"flex", justifyContent:"center" }}>
          <button onClick={capture}
            style={{ width:76, height:76, borderRadius:"50%",
              background:"white", border:"4px solid rgba(255,255,255,0.3)",
              cursor:"pointer", display:"flex", alignItems:"center",
              justifyContent:"center", boxShadow:"0 4px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ width:58, height:58, borderRadius:"50%",
              background:C.blue, boxShadow:`0 0 20px rgba(26,111,255,0.6)` }} />
          </button>
        </div>
        <div style={{ textAlign:"center", marginTop:14, fontSize:11,
          color:"rgba(255,255,255,0.35)" }}>
          Tap to capture
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display:"none" }} />
    </div>
  );

  // ── PROCESSING ──
  if (phase === "processing") return (
    <div style={{ minHeight:"100vh", background:"#0D111A", display:"flex",
      alignItems:"center", justifyContent:"center", flexDirection:"column",
      gap:24, padding:"40px 32px" }}>
      <style>{GS}</style>

      {/* Spinner */}
      <div style={{ position:"relative", width:80, height:80 }}>
        <div style={{ position:"absolute", inset:0, border:`3px solid rgba(26,111,255,0.2)`,
          borderRadius:"50%" }} />
        <div style={{ position:"absolute", inset:0, border:`3px solid transparent`,
          borderTopColor:C.blue, borderRadius:"50%",
          animation:"spin 0.8s linear infinite" }} />
        <div style={{ position:"absolute", inset:0, display:"flex",
          alignItems:"center", justifyContent:"center",
          fontSize:14, fontWeight:700, color:"white" }}>
          {procPct}%
        </div>
      </div>

      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:18, fontWeight:700, color:"white", marginBottom:6 }}>
          Analysing Card…
        </div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:24 }}>
          {procStep}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width:"100%", maxWidth:280, height:4,
        background:"rgba(255,255,255,0.1)", borderRadius:99 }}>
        <div style={{ height:"100%", width:`${procPct}%`, background:C.blue,
          borderRadius:99, transition:"width 0.3s ease" }} />
      </div>

      {/* Steps */}
      <div style={{ width:"100%", maxWidth:280 }}>
        {PROC_STEPS.map((s, i) => {
          const done = i < PROC_STEPS.indexOf(procStep);
          const active = s === procStep;
          return (
            <div key={i} style={{ display:"flex", gap:10, alignItems:"center",
              padding:"5px 0", opacity: done ? 0.5 : active ? 1 : 0.25 }}>
              <div style={{ width:18, height:18, borderRadius:"50%", flexShrink:0,
                background: done ? C.green : active ? C.blue : "rgba(255,255,255,0.1)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, color:"white" }}>
                {done ? "✓" : active ? "●" : ""}
              </div>
              <span style={{ fontSize:12, color:"white", fontWeight: active ? 600 : 400 }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return null;
}

// ─── SCREEN 2: SCAN RESULT ────────────────────────────────────────────────────
function ResultScreen({ capturedImage, onRescan }) {
  const [tab,     setTab]     = useState("overview");
  const [gradeId, setGradeId] = useState("raw_mint");
  const [showJP,  setShowJP]  = useState(false);
  const [showGuide,setShowGuide] = useState(false);

  const gd      = GRADE_DATA[gradeId];
  const sales   = RECENT_SALES[gradeId] || RECENT_SALES["raw_mint"];
  const sr      = SCAN_RESULT;
  const net     = Math.round(gd.suggest * 0.95);

  const GRADE_BTNS = [
    {id:"raw_sealed",label:"Sealed",    sub:"Pack fresh",   color:C.teal},
    {id:"raw_mint",  label:"Mint NM",   sub:"PSA ready",    color:C.blue},
    {id:"raw_played",label:"Played",    sub:"Visible wear", color:C.sub},
    {id:"psa10",     label:"PSA 10",    sub:"Gem Mint",     color:C.green},
    {id:"bgs10",     label:"BGS 10",    sub:"Pristine",     color:C.gold},
    {id:"bgs10bl",   label:"BGS 10 BL", sub:"Black Label",  color:C.purple},
  ];

  const EN_LINKS = [
    {icon:"🛒",label:"eBay Listings",      url:"https://www.ebay.com/p/11072893798",                                                                color:C.gold},
    {icon:"📊",label:"PSA Auction History",url:"https://www.psacard.com/auctionprices/tcg-cards/2024-one-piece-japanese-500-years-future/boa-hancock/10477464",color:C.green},
    {icon:"📈",label:"PriceCharting (EN)", url:"https://www.pricecharting.com/game/one-piece-500-years-in-the-future/boa-hancock-alternate-art-manga-op07-051",color:C.blue},
    {icon:"📈",label:"PriceCharting (JP)", url:"https://www.pricecharting.com/game/one-piece-japanese-500-years-in-the-future/boa-hancock-alternate-art-manga-op07-051",color:C.blue},
    {icon:"🃏",label:"Limitless TCG",      url:"https://onepiece.limitlesstcg.com/cards/OP07-051",                                                  color:C.teal},
  ];
  const JP_LINKS = [
    {icon:"🟠",label:"Mercari Japan",     url:`https://jp.mercari.com/search?keyword=${encodeURIComponent(sr.jpName)}`,                             color:C.red},
    {icon:"🟡",label:"Yahoo Auctions JP", url:`https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(sr.jpName)}`,                      color:C.gold},
    {icon:"🟣",label:"Rakuten Japan",     url:`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(sr.jpName)}/`,                         color:C.purple},
    {icon:"⬛",label:"Amazon Japan",      url:`https://www.amazon.co.jp/s?k=${encodeURIComponent(sr.jpName)}`,                                      color:C.text},
  ];

  const TABS = [{id:"overview",label:"Overview"},{id:"prices",label:"Prices"},{id:"condition",label:"Condition"},{id:"centering",label:"Centering"}];

  const ListingGuideSheet = () => (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200,
      display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={() => setShowGuide(false)}>
      <div className="pop" style={{ background:C.white, borderRadius:"20px 20px 0 0",
        width:"100%", maxWidth:430, maxHeight:"85vh", overflow:"auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ position:"sticky", top:0, background:C.white,
          borderBottom:`1px solid ${C.border}`, padding:"14px 16px",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>Listing Guide</div>
            <div style={{ fontSize:11, color:C.sub }}>Boa Hancock · {sr.rarity} · {gd.label}</div>
          </div>
          <button onClick={() => setShowGuide(false)}
            style={{ background:C.surface, border:"none", borderRadius:8,
              padding:"5px 10px", fontSize:13, cursor:"pointer", color:C.sub }}>✕</button>
        </div>
        <div style={{ padding:"16px" }}>
          <div style={{ background:C.blueSoft, border:`1px solid rgba(26,111,255,0.18)`,
            borderRadius:12, padding:"14px", marginBottom:16 }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Suggested · {gd.label}</div>
            <div style={{ fontSize:30, fontWeight:800, color:C.blue }}>฿{fmt(gd.suggest)}</div>
            <div style={{ fontSize:11, color:C.dim }}>Net after 5% fee: ฿{fmt(net)} · {usdStr(gd.suggest/RATE)}</div>
          </div>
          {[
            {icon:"📸",title:"Photos auto-taken",body:"Front, back, and 4 corner crops captured. All watermarked with SW-5021."},
            {icon:"✍️",title:"Review card details",body:`${sr.rarity} · ${sr.number} · ${sr.set}. Auto-filled from scan.`},
            {icon:"💰",title:"Set your price",body:`Market range: ฿${fmt(gd.thbLow)}–฿${fmt(gd.thbHigh)}. Suggested: ฿${fmt(gd.suggest)} for fast sale.`},
            {icon:"📦",title:"Choose listing type",body:"Fixed Price for quick sale. Auction if demand is high. Best Offer for flexibility."},
            {icon:"🚚",title:"Confirm shipping",body:"Kerry / Flash / J&T. Cards over ฿3,000 — require signature on delivery."},
            {icon:"✅",title:"Publish & get paid",body:`Funds held in escrow until buyer confirms. Net payout: ฿${fmt(net)}.`},
          ].map((s, i, arr) => (
            <div key={i} style={{ display:"flex", gap:12, padding:"12px 0",
              borderBottom: i < arr.length-1 ? `1px solid ${C.line}` : "none" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:C.surface,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:18, flexShrink:0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>
                  <span style={{ color:C.dim, fontSize:11 }}>Step {i+1} · </span>{s.title}
                </div>
                <div style={{ fontSize:12, color:C.sub, lineHeight:1.6 }}>{s.body}</div>
              </div>
            </div>
          ))}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10,
            padding:"11px 14px", margin:"14px 0", fontSize:11, color:C.sub, lineHeight:1.7 }}>
            <strong style={{ color:C.text }}>SwibSwap Rules:</strong> No external transactions ·
            Photos locked · Disputes within 5 days · Refunds need photo evidence within 24h
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setShowGuide(false)}
              style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`,
                borderRadius:10, padding:"12px", fontSize:13, fontWeight:600,
                cursor:"pointer" }}>Save Draft</button>
            <button onClick={() => setShowGuide(false)}
              style={{ flex:2, background:C.blue, border:"none", borderRadius:10,
                padding:"12px", fontSize:13, fontWeight:700, color:"white",
                cursor:"pointer", boxShadow:"0 3px 14px rgba(26,111,255,0.28)" }}>
              Publish Listing →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:430, margin:"0 auto", background:C.bg,
      minHeight:"100vh", fontFamily:"'Inter',sans-serif" }}>
      <style>{GS}</style>
      {showGuide && <ListingGuideSheet />}

      {/* ── HEADER ── */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`,
        padding:"48px 16px 0", position:"sticky", top:0, zIndex:40 }}>
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:12 }}>
          <button onClick={onRescan}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8,
              padding:"6px 12px", fontSize:12, color:C.sub, cursor:"pointer", fontWeight:500 }}>
            ← Re-Scan
          </button>
          <div style={{ display:"flex", gap:4 }}>
            <Tag color={C.green}>✓ Genuine</Tag>
            <Tag color={C.purple}>UV Pass</Tag>
            <Tag color={C.gold}>NM {sr.aiScore}</Tag>
          </div>
        </div>

        {/* Card hero */}
        <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:12 }}>
          <CardIllustration w={92} captured={capturedImage} />
          <div style={{ flex:1, paddingTop:2 }}>
            <div className="mono" style={{ fontSize:9, color:C.blue, letterSpacing:"0.1em", marginBottom:5 }}>
              ONE PIECE TCG · {sr.number}
            </div>
            <div style={{ fontSize:24, fontWeight:800, lineHeight:1.1,
              marginBottom:7, letterSpacing:"-0.4px" }}>{sr.name}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:7 }}>
              <Tag color={C.blue}>{sr.rarity}</Tag>
              <Tag color={C.gold}>FOIL</Tag>
              <Tag color={C.sub}>JPN</Tag>
            </div>
            <div style={{ fontSize:11, color:C.sub, lineHeight:1.9 }}>
              <span style={{ color:C.text, fontWeight:600 }}>{sr.set}</span><br/>
              {sr.type} · Cost {sr.cost} · {sr.power} PWR<br/>
              <span className="mono" style={{ fontSize:10, color:C.dim }}>{sr.jpName}</span>
            </div>
          </div>
        </div>

        {/* Ability */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8,
          padding:"8px 10px", marginBottom:10, fontSize:11, color:C.sub, lineHeight:1.5 }}>
          <span style={{ fontWeight:700, color:C.text }}>On Play: </span>{sr.ability}
        </div>

        {/* Quick stats */}
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {[
            {label:"Card ID",  value:"99.8%",         color:C.green},
            {label:"UV Scan",  value:"PASS ✓",        color:C.green},
            {label:"AI Grade", value:`${sr.aiScore} ${sr.overall}`, color:C.gold},
          ].map((m,i) => (
            <div key={i} style={{ flex:1, background:C.surface,
              border:`1px solid ${C.border}`, borderRadius:10,
              padding:"9px 6px", textAlign:"center" }}>
              <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>{m.label}</div>
              <div className="mono" style={{ fontSize:13, color:m.color, fontWeight:700 }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderTop:`1px solid ${C.border}`, margin:"0 -16px" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, background:"none", border:"none",
              borderTop: tab===t.id ? `2px solid ${C.blue}` : "2px solid transparent",
              color: tab===t.id ? C.blue : C.sub,
              padding:"10px 2px", fontSize:11,
              fontWeight: tab===t.id ? 700 : 500,
              cursor:"pointer", transition:"all 0.15s",
              fontFamily:"'Inter',sans-serif",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding:"14px 16px 110px", display:"flex", flexDirection:"column", gap:12 }}>

        {/* ══ OVERVIEW ═══════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <>
            {/* Photos */}
            <div className="fu1">
              <Card>
                <SectionTitle>📸 Scan Output · 4 Images · ⬡ Watermarked</SectionTitle>
                <div style={{ padding:"12px", display:"grid",
                  gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {[
                    {label:"Front Full",    res:"5MP captured"},
                    {label:"Back Full",     res:"2MP / rear cam"},
                    {label:"Front Corners", res:"Stitched 2×2"},
                    {label:"Back Corners",  res:"Stitched 2×2"},
                  ].map((p, i) => (
                    <div key={i} style={{ background:C.surface, borderRadius:10,
                      overflow:"hidden", border:`1px solid ${C.border}` }}>
                      <div style={{ aspectRatio:"3/2", overflow:"hidden", position:"relative" }}>
                        {capturedImage ? (
                          <img src={capturedImage} alt={p.label}
                            style={{ width:"100%", height:"100%", objectFit:"cover",
                              filter: i>1?"saturate(0.7) contrast(1.1)":"none" }} />
                        ) : (
                          <div style={{ width:"100%", height:"100%", background:C.surface,
                            display:"flex", alignItems:"center",
                            justifyContent:"center", fontSize:24 }}>🃏</div>
                        )}
                      </div>
                      <div style={{ padding:"7px 8px" }}>
                        <div style={{ fontSize:11, fontWeight:600, marginBottom:1 }}>{p.label}</div>
                        <div style={{ fontSize:10, color:C.dim }}>{p.res}</div>
                        <div style={{ display:"flex", gap:3, marginTop:4 }}>
                          <Tag color={C.blue} style={{ fontSize:8 }}>WM</Tag>
                          <Tag color={C.green} style={{ fontSize:8 }}>Signed</Tag>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Quick price snapshot */}
            <div className="fu2">
              <Card>
                <SectionTitle>💰 Market Snapshot · SR Manga Alt</SectionTitle>
                <div style={{ padding:"12px", display:"grid",
                  gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {GRADE_BTNS.map(gb => {
                    const d = GRADE_DATA[gb.id];
                    return (
                      <button key={gb.id}
                        onClick={() => { setGradeId(gb.id); setTab("prices"); }}
                        style={{ background:C.bg, border:`1.5px solid ${C.border}`,
                          borderRadius:10, padding:"11px 10px", cursor:"pointer",
                          textAlign:"left", transition:"all 0.15s" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:gb.color, marginBottom:2 }}>
                          {gb.label}
                        </div>
                        <div style={{ fontSize:18, fontWeight:800, color:C.text, lineHeight:1.1, marginBottom:1 }}>
                          ฿{fmt(d.thbLow)}
                        </div>
                        <div style={{ fontSize:10, color:C.dim }}>to ฿{fmt(d.thbHigh)}</div>
                        <div style={{ fontSize:10, color:d.up ? C.green : C.red, marginTop:3 }}>
                          {d.up ? "▲" : "▼"} {d.trend}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding:"0 12px 12px" }}>
                  <button onClick={() => setTab("prices")}
                    style={{ width:"100%", background:C.blue, border:"none", borderRadius:10,
                      padding:"11px", fontSize:13, fontWeight:700, color:"white",
                      cursor:"pointer", boxShadow:"0 3px 14px rgba(26,111,255,0.28)" }}>
                    View Full Price History →
                  </button>
                </div>
              </Card>
            </div>

            {/* List on SwibSwap */}
            <div className="fu3">
              <Card>
                <SectionTitle>🏪 List on SwibSwap</SectionTitle>
                <div style={{ padding:"14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:12, color:C.sub, marginBottom:3 }}>
                        Suggested (RAW Mint)
                      </div>
                      <div style={{ fontSize:28, fontWeight:800, color:C.blue }}>
                        ฿{fmt(GRADE_DATA["raw_mint"].suggest)}
                      </div>
                      <div style={{ fontSize:11, color:C.dim }}>
                        Net after 5%: ฿{fmt(Math.round(GRADE_DATA["raw_mint"].suggest * 0.95))}
                      </div>
                    </div>
                    <button onClick={() => setShowGuide(true)}
                      style={{ background:C.blueSoft, border:`1px solid rgba(26,111,255,0.25)`,
                        borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:600,
                        color:C.blue, cursor:"pointer" }}>📋 Guide</button>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button style={{ flex:1, background:C.surface,
                      border:`1px solid ${C.border}`, borderRadius:10,
                      padding:"11px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      Draft
                    </button>
                    <button onClick={() => setShowGuide(true)}
                      style={{ flex:2, background:C.blue, border:"none", borderRadius:10,
                        padding:"11px", fontSize:13, fontWeight:700, color:"white",
                        cursor:"pointer", boxShadow:"0 3px 14px rgba(26,111,255,0.28)" }}>
                      Publish Now →
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ══ PRICES ═══════════════════════════════════════════════════════ */}
        {tab === "prices" && (
          <>
            {/* Grade selector */}
            <div className="fu1">
              <div style={{ fontSize:10, fontWeight:700, color:C.sub, marginBottom:8,
                letterSpacing:"0.06em", textTransform:"uppercase" }}>
                Price by Grade / Condition
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5 }}>
                {GRADE_BTNS.map(gb => (
                  <button key={gb.id} onClick={() => setGradeId(gb.id)} style={{
                    background: gradeId===gb.id ? gb.color : C.white,
                    color:      gradeId===gb.id ? "white"  : C.sub,
                    border:     `1.5px solid ${gradeId===gb.id ? gb.color : C.border}`,
                    borderRadius:8, padding:"8px 4px", cursor:"pointer",
                    transition:"all 0.15s", textAlign:"center",
                    boxShadow: gradeId===gb.id ? `0 2px 10px ${rgba(gb.color,0.3)}` : "none",
                  }}>
                    <div style={{ fontSize:10, fontWeight:700 }}>{gb.label}</div>
                    <div style={{ fontSize:9, opacity:0.7, marginTop:1 }}>{gb.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Price hero */}
            <div className="fu2">
              <Card style={{ border:`1.5px solid ${gd.color}` }}>
                <div style={{ padding:"16px" }}>
                  {gd.note && (
                    <div style={{ fontSize:11, color:C.dim, marginBottom:8 }}>{gd.note}</div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>
                        {gd.label} · Market Price
                      </div>
                      <div style={{ fontSize:34, fontWeight:800, color:gd.color,
                        lineHeight:1, letterSpacing:"-1px" }}>
                        ฿{fmt(gd.thbLow)}
                      </div>
                      <div style={{ fontSize:16, fontWeight:600, color:gd.color, opacity:0.7 }}>
                        – ฿{fmt(gd.thbHigh)}
                      </div>
                      <div style={{ fontSize:12, color:C.dim, marginTop:3 }}>
                        ({gd.usd} USD)
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:700,
                        color: gd.up ? C.green : C.red }}>
                        {gd.up ? "▲" : "▼"} {gd.trend}
                      </div>
                      <div style={{ fontSize:10, color:C.dim }}>vs last month</div>
                    </div>
                  </div>
                  <div style={{ marginTop:14, marginBottom:2 }}>
                    <MiniChart data={gd.history} color={gd.color} />
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    {["Oct","Nov","Dec","Jan","Feb","Mar","Mar","Apr","Apr","Now"].map((m,i) => (
                      <span key={i} style={{ fontSize:8, color:C.dim }}>{m}</span>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* SwibSwap sellers */}
            <div className="fu3">
              <Card>
                <SectionTitle>🏆 SwibSwap Sellers — Buy Here First</SectionTitle>
                {[
                  {name:"CardKing_BKK",  rating:4.9,sales:312,cond:"NM · Raw",   thb:1190,verified:true, badge:"SwibElite"},
                  {name:"OnePieceTH",    rating:4.8,sales:187,cond:"Mint · Raw", thb:1250,verified:true, badge:"SwibPro"},
                  {name:"MangaVaultBKK", rating:4.7,sales:94, cond:"PSA 10",     thb:2200,verified:true, badge:"SwibPro"},
                ].map((s, i, arr) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"11px 14px",
                    borderBottom: i < arr.length-1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:C.surface,
                      border:`2px solid ${s.verified ? C.green : C.border}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:14, flexShrink:0, fontWeight:700, color:C.sub }}>
                      {s.name[0]}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{s.name}</span>
                        {s.verified && <Tag color={C.green} style={{ fontSize:8,padding:"1px 4px" }}>✓</Tag>}
                        <Tag color={s.badge==="SwibElite"?C.purple:C.blue}
                          style={{ fontSize:8,padding:"1px 4px" }}>{s.badge}</Tag>
                      </div>
                      <div style={{ fontSize:10, color:C.dim }}>
                        ⭐{s.rating} · {s.sales} sales · {s.cond}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:17, fontWeight:800, color:C.blue }}>฿{fmt(s.thb)}</div>
                      <div style={{ fontSize:10, color:C.dim }}>{usdStr(s.thb/RATE)}</div>
                    </div>
                    <div style={{ color:C.lighter, fontSize:14 }}>›</div>
                  </div>
                ))}
                <div style={{ padding:"9px 14px", borderTop:`1px solid ${C.line}`, textAlign:"center" }}>
                  <button style={{ fontSize:11, color:C.blue, fontWeight:600,
                    background:"none", border:"none", cursor:"pointer" }}>
                    View all SwibSwap listings →
                  </button>
                </div>
              </Card>
            </div>

            {/* Recent sales */}
            <div className="fu4">
              <Card>
                <SectionTitle>Recent Sold · {gd.label} · eBay / PSA</SectionTitle>
                {sales.map((s, i) => (
                  <a key={i} href={EN_LINKS[0].url} target="_blank" rel="noopener noreferrer">
                    <div style={{ display:"flex", alignItems:"center", padding:"10px 14px",
                      borderBottom: i < sales.length-1 ? `1px solid ${C.line}` : "none" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{s.date}</div>
                        <div style={{ fontSize:10, color:C.dim }}>{s.cond}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:18, fontWeight:800, color:gd.color }}>{thbStr(s.usd)}</div>
                        <div style={{ fontSize:10, color:C.dim }}>{usdStr(s.usd)}</div>
                      </div>
                      <div style={{ color:C.lighter, fontSize:14, marginLeft:10 }}>›</div>
                    </div>
                  </a>
                ))}
              </Card>
            </div>

            {/* List CTA */}
            <div className="fu5">
              <Card style={{ border:`1.5px solid ${C.blue}` }}>
                <div style={{ padding:"14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>
                        List on SwibSwap
                      </div>
                      <div style={{ fontSize:11, color:C.sub }}>
                        Suggested: <strong style={{ color:C.blue }}>฿{fmt(gd.suggest)}</strong>
                        &nbsp;· Net: <strong style={{ color:C.green }}>฿{fmt(net)}</strong>
                      </div>
                    </div>
                    <button onClick={() => setShowGuide(true)}
                      style={{ background:C.blueSoft, border:`1px solid rgba(26,111,255,0.25)`,
                        borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:600,
                        color:C.blue, cursor:"pointer" }}>📋 Guide</button>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button style={{ flex:1, background:C.surface,
                      border:`1px solid ${C.border}`, borderRadius:9,
                      padding:"10px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      Save Draft
                    </button>
                    <button onClick={() => setShowGuide(true)}
                      style={{ flex:2, background:C.blue, border:"none", borderRadius:9,
                        padding:"10px", fontSize:13, fontWeight:700, color:"white",
                        cursor:"pointer", boxShadow:"0 3px 14px rgba(26,111,255,0.28)" }}>
                      Publish →
                    </button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Links */}
            <div className="fu5">
              <Card>
                <div style={{ display:"flex", gap:4, padding:"10px 14px",
                  borderBottom:`1px solid ${C.line}` }}>
                  <button onClick={() => setShowJP(false)} style={{
                    flex:1, background: !showJP ? C.blue : C.surface,
                    color: !showJP ? "white" : C.sub,
                    border:`1px solid ${!showJP ? C.blue : C.border}`,
                    borderRadius:7, padding:"7px", fontSize:11,
                    fontWeight:600, cursor:"pointer" }}>🌐 English Sites</button>
                  <button onClick={() => setShowJP(true)} style={{
                    flex:1, background: showJP ? C.blue : C.surface,
                    color: showJP ? "white" : C.sub,
                    border:`1px solid ${showJP ? C.blue : C.border}`,
                    borderRadius:7, padding:"7px", fontSize:11,
                    fontWeight:600, cursor:"pointer" }}>🇯🇵 Japan Sites</button>
                </div>
                {showJP && (
                  <div style={{ padding:"7px 14px", background:C.surface, fontSize:11,
                    color:C.sub, borderBottom:`1px solid ${C.line}` }}>
                    JP search: <span className="mono" style={{ color:C.text }}>{sr.jpName}</span>
                  </div>
                )}
                {(showJP ? JP_LINKS : EN_LINKS).map((l, i, arr) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
                    <div style={{ display:"flex", alignItems:"center", gap:10,
                      padding:"11px 14px",
                      borderBottom: i < arr.length-1 ? `1px solid ${C.line}` : "none" }}>
                      <span style={{ fontSize:18 }}>{l.icon}</span>
                      <span style={{ fontSize:13, fontWeight:500, flex:1, color:l.color }}>{l.label}</span>
                      <span style={{ fontSize:13, color:C.lighter }}>›</span>
                    </div>
                  </a>
                ))}
              </Card>
            </div>
          </>
        )}

        {/* ══ CONDITION ════════════════════════════════════════════════════ */}
        {tab === "condition" && (
          <>
            <div className="fu1">
              <Card style={{ border:`1.5px solid rgba(212,138,0,0.4)` }}>
                <div style={{ padding:"16px", display:"flex",
                  justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>AI Overall Grade</div>
                    <div style={{ fontSize:14, fontWeight:600, color:C.green, marginBottom:6 }}>
                      PSA 9–10 candidate
                    </div>
                    <Tag color={C.green}>PSA Submission Recommended</Tag>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:52, fontWeight:800, color:C.gold, lineHeight:1 }}>
                      {sr.aiScore}
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:C.gold }}>{sr.overall}</div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="fu2">
              <Card>
                <SectionTitle>Score Breakdown</SectionTitle>
                <ScoreRow label="Centering"     score={sr.condition.centering} note="F:49/51 · B:50/50"/>
                <ScoreRow label="Corners"       score={sr.condition.corners}   note="All NM · No whitening"/>
                <ScoreRow label="Surface"       score={sr.condition.surface}   note="No scratches"/>
                <ScoreRow label="Edges"         score={sr.condition.edges}     note="Clean cut"/>
                <ScoreRow label="Print Quality" score={sr.condition.print}     note="Manga art crisp"/>
                <ScoreRow label="Foil / Holo"   score={sr.condition.foil}      note="No peeling"/>
                <ScoreRow label="UV Test"       score={sr.condition.uv}        note="Genuine Bandai" isLast/>
              </Card>
            </div>

            <div className="fu3">
              <Card style={{ border:`1.5px solid rgba(124,58,237,0.3)` }}>
                <SectionTitle>🔬 UV Scan Result — 365nm</SectionTitle>
                <div style={{ display:"flex", gap:12, padding:"14px 16px", alignItems:"flex-start" }}>
                  <div style={{ width:42, height:42, borderRadius:"50%",
                    background:C.purpleSoft, border:`2px solid ${C.purple}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:20, flexShrink:0 }}>🔬</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:C.green, marginBottom:4 }}>
                      PASS — Confirmed Genuine Bandai
                    </div>
                    <div style={{ fontSize:12, color:C.sub, lineHeight:1.6 }}>
                      Standard blue-white fluorescence under 365nm UV. No proxy ink patterns
                      detected. Consistent with factory OP-07 Bandai card stock.
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="fu4">
              <Card>
                <SectionTitle>Card Ability</SectionTitle>
                <div style={{ padding:"12px 16px" }}>
                  <div className="mono" style={{ fontSize:11, color:C.sub, marginBottom:8 }}>
                    {sr.number} · {sr.rarity} · {sr.type} · Cost {sr.cost} · {sr.power} PWR
                  </div>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>
                    <strong>[On Play]</strong> {sr.ability}
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ══ CENTERING ════════════════════════════════════════════════════ */}
        {tab === "centering" && (
          <>
            <div className="fu1">
              <Card>
                <div style={{ padding:"12px 16px" }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                    How Centering Is Measured
                  </div>
                  <div style={{ fontSize:12, color:C.sub, lineHeight:1.6 }}>
                    Pixel distance from card edge to print border on all 4 sides, as a %
                    ratio. PSA 10 requires ≤55/45 front and ≤60/40 back. Accuracy ±0.5%.
                  </div>
                </div>
              </Card>
            </div>

            {[
              {label:"FRONT", data:sr.centering.front},
              {label:"BACK",  data:sr.centering.back},
            ].map((side, si) => {
              const {t,b,l,r} = side.data;
              const worst    = Math.max(Math.abs(t-b), Math.abs(l-r));
              const ctrGrade = worst<=2 ? "PSA 10 equiv." : worst<=5 ? "PSA 9 equiv." : "PSA 8 equiv.";
              const ctrColor = worst<=2 ? C.green : worst<=5 ? C.gold : C.red;
              return (
                <div key={si} className={`fu${si+2}`}>
                  <Card style={{ border:`1.5px solid ${ctrColor}` }}>
                    <div style={{ padding:"14px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"center", marginBottom:12 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:C.sub }}>
                          {side.label} CENTERING
                        </span>
                        <Tag color={ctrColor}>{ctrGrade}</Tag>
                      </div>
                      {/* Diagram */}
                      <div style={{ height:68, background:C.surface, borderRadius:8,
                        position:"relative", marginBottom:12,
                        border:`1px dashed ${C.border}` }}>
                        <div style={{ position:"absolute",
                          top:`${t-33}%`, bottom:`${100-b-33}%`,
                          left:"15%", right:"15%",
                          border:`2px solid ${ctrColor}`, borderRadius:3,
                          background:rgba(ctrColor,0.08),
                          display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontSize:10, color:ctrColor, fontWeight:600 }}>CARD</span>
                        </div>
                      </div>
                      {/* Measurements */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6 }}>
                        {[["T",t],["B",b],["L",l],["R",r]].map(([k,v]) => (
                          <div key={k} style={{ background:C.surface, borderRadius:8,
                            padding:"8px 4px", textAlign:"center" }}>
                            <div style={{ fontSize:10, color:C.sub }}>{k}</div>
                            <div style={{ fontSize:20, fontWeight:800, color:ctrColor }}>{v}%</div>
                          </div>
                        ))}
                      </div>
                      <div className="mono" style={{ marginTop:10, fontSize:10, color:ctrColor,
                        background:rgba(ctrColor,0.08),
                        border:`1px solid ${rgba(ctrColor,0.22)}`,
                        borderRadius:6, padding:"5px 10px" }}>
                        Vertical: {t}/{b} · Horizontal: {l}/{r}
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}

            <div className="fu4">
              <Card>
                <SectionTitle>PSA Centering Scale</SectionTitle>
                {[
                  {grade:"PSA 10",req:"≤55/45 front · ≤60/40 back",color:C.green},
                  {grade:"PSA 9", req:"≤60/40 front · ≤65/35 back",color:C.blue},
                  {grade:"PSA 8", req:"≤65/35 front · ≤70/30 back",color:C.gold},
                  {grade:"PSA 7–",req:"Worse than above",            color:C.red},
                ].map((r,i,arr) => (
                  <div key={r.grade} style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", padding:"11px 16px",
                    borderBottom: i < arr.length-1 ? `1px solid ${C.line}` : "none" }}>
                    <Tag color={r.color}>{r.grade}</Tag>
                    <span className="mono" style={{ fontSize:10, color:C.sub }}>{r.req}</span>
                  </div>
                ))}
              </Card>
            </div>
          </>
        )}
      </div>

      {/* ── STICKY BOTTOM BAR ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"rgba(255,255,255,0.96)", backdropFilter:"blur(16px)",
        borderTop:`1px solid ${C.border}`, padding:"10px 16px 28px",
        display:"flex", gap:8 }}>
        <button onClick={onRescan}
          style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:12, padding:"12px", fontSize:14, fontWeight:600,
            cursor:"pointer", color:C.text }}>
          📷 Re-Scan
        </button>
        <button onClick={() => setShowGuide(true)}
          style={{ flex:2, background:C.blue, border:"none", borderRadius:12,
            padding:"12px", fontSize:14, fontWeight:700, color:"white",
            cursor:"pointer", boxShadow:"0 4px 18px rgba(26,111,255,0.32)" }}>
          Push to Vault →
        </button>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,  setScreen]  = useState("camera");  // camera | result
  const [captured,setCaptured]= useState(null);

  const handleScanComplete = useCallback((imageUrl) => {
    setCaptured(imageUrl);
    setScreen("result");
  }, []);

  const handleRescan = useCallback(() => {
    setCaptured(null);
    setScreen("camera");
  }, []);

  return (
    <>
      <style>{GS}</style>
      {screen === "camera" && (
        <CameraScreen onScanComplete={handleScanComplete} />
      )}
      {screen === "result" && (
        <ResultScreen capturedImage={captured} onRescan={handleRescan} />
      )}
    </>
  );
}
