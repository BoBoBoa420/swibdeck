import { useState, useRef, useCallback } from "react";

// ─── COLORS ──────────────────────────────────────────────────────────────────
const BLUE   = "#1A6FFF";
const GREEN  = "#12A05C";
const GOLD   = "#D48A00";
const PURPLE = "#7C3AED";
const RED    = "#DC2626";
const TEAL   = "#0891B2";
const WHITE  = "#FFFFFF";
const BG     = "#F8F9FB";
const SURF   = "#F1F3F7";
const BORD   = "#E3E7EE";
const LINE   = "#EEF1F6";
const TEXT   = "#111827";
const SUB    = "#6B7280";
const DIM    = "#9CA3AF";
const DARK   = "#0D111A";

const RATE = 35;
const fmt    = n => Number(n).toLocaleString();
const thb    = usd => "฿" + fmt(Math.round(usd * RATE));
const usd    = u => "($" + (u % 1 === 0 ? u.toFixed(0) : u.toFixed(2)) + ")";
const toRgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return "rgba("+r+","+g+","+b+","+a+")";
};

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body,#root{height:100%;background:#0D111A;}
body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;overscroll-behavior:none;touch-action:manipulation;}
::-webkit-scrollbar{display:none;}
.mono{font-family:'JetBrains Mono',monospace;}
a{text-decoration:none;color:inherit;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes scanLine{0%{transform:translateY(0)}100%{transform:translateY(260px)}}
@keyframes fu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.fu1{animation:fu 0.4s 0.0s ease both;}
.fu2{animation:fu 0.4s 0.08s ease both;}
.fu3{animation:fu 0.4s 0.16s ease both;}
`;

const PROC_STEPS = [
  "Detecting card frame…",
  "Perspective correction…",
  "Extracting corners…",
  "Stitching corner grid…",
  "Measuring centering…",
  "Applying watermark…",
  "Matching TCG database…",
  "Checking authenticity…",
  "Generating report…",
];

const GRADE_DATA = {
  raw_sealed: { label:"RAW Sealed",   color:TEAL,   thbLow:1890, thbHigh:2450, trend:"+8%",  up:true,  suggest:2100, history:[840,980,1120,1050,1260,1190,1400,1680,2100,2240] },
  raw_mint:   { label:"RAW Mint/NM",  color:BLUE,   thbLow:1050, thbHigh:1330, trend:"+8%",  up:true,  suggest:1150, history:[525,630,770,665,840,770,910,1050,1190,1260] },
  raw_played: { label:"RAW Played",   color:SUB,    thbLow:420,  thbHigh:840,  trend:"-3%",  up:false, suggest:600,  history:[210,280,350,315,420,385,455,490,700,770] },
  psa10:      { label:"PSA 10",       color:GREEN,  thbLow:1995, thbHigh:2975, trend:"−12%", up:false, suggest:2200, history:[4200,3675,3220,3080,3325,2800,2695,2450,2975,1995], note:"176 auctions" },
  bgs10:      { label:"BGS 10",       color:GOLD,   thbLow:3150, thbHigh:4550, trend:"+5%",  up:true,  suggest:3800, history:[2800,3150,3080,2870,3325,3430,3850,4130,4200,4375] },
  bgs10bl:    { label:"BGS 10 BL",    color:PURPLE, thbLow:9800, thbHigh:15750,trend:"+22%", up:true,  suggest:12000,history:[5600,6300,7000,7350,8050,8400,10850,11900,12600,13300], note:"Est. pop < 5" },
};

const SALES = {
  raw_mint: [{date:"22 Apr",usd:36,cond:"NM"},{date:"17 Apr",usd:34.5,cond:"NM"},{date:"9 Apr",usd:31,cond:"NM"},{date:"4 Apr",usd:29.99,cond:"NM"}],
  psa10:    [{date:"27 Sep",usd:57,cond:"Gem Mint"},{date:"16 Sep",usd:61,cond:"Gem Mint"},{date:"5 Sep",usd:84.99,cond:"Gem Mint"},{date:"28 Aug",usd:60,cond:"Gem Mint"}],
  bgs10:    [{date:"Apr 2025",usd:125,cond:"Pristine"},{date:"Mar 2025",usd:110,cond:"Pristine"}],
  bgs10bl:  [{date:"Apr 2025",usd:380,cond:"Black Label"},{date:"Mar 2025",usd:310,cond:"Black Label"}],
};

// ─── TAG ─────────────────────────────────────────────────────────────────────
function Tag({ children, color, style }) {
  color = color || BLUE;
  return (
    <span style={{
      background: toRgba(color, 0.1), color,
      border: "1px solid " + color,
      borderRadius: 5, padding: "2px 8px",
      fontSize: 10, fontWeight: 600,
      display: "inline-block", ...style,
    }}>{children}</span>
  );
}

// ─── MINI CHART ───────────────────────────────────────────────────────────────
function Chart({ data, color }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * 96 + 2,
    46 - ((v - min) / rng) * 38,
  ]);
  const line = pts.map(([x,y],i) => (i?"L":"M")+x.toFixed(1)+","+y.toFixed(1)).join(" ");
  const area = line + " L"+pts[pts.length-1][0].toFixed(1)+",50 L2,50 Z";
  const id = "cg" + color.replace(/[^a-z0-9]/gi,"");
  return (
    <svg viewBox="0 0 100 52" style={{width:"100%",height:56}} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={"url(#"+id+")"}/>
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map(([x,y],i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill={color}/>)}
    </svg>
  );
}

// ─── CARD ILLUSTRATION ────────────────────────────────────────────────────────
function CardIllustration({ captured, size }) {
  size = size || 90;
  const h = Math.round(size * 1.4);
  if (captured) {
    return (
      <div style={{
        width: size, height: h, borderRadius: 10, overflow: "hidden",
        flexShrink: 0, boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        position: "relative",
      }}>
        <img src={captured} alt="card" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        <div style={{
          position:"absolute", inset:0, display:"flex",
          alignItems:"center", justifyContent:"center", pointerEvents:"none",
        }}>
          <div style={{
            fontSize: size * 0.065, color: "white", opacity: 0.12,
            fontFamily: "monospace", fontWeight: 700,
            transform: "rotate(-35deg)", textAlign: "center", lineHeight: 1.6,
          }}>SWIBSWAP{"\n"}VERIFIED{"\n"}SW-5021</div>
        </div>
        <div style={{
          position:"absolute", bottom:5, right:5,
          background:"rgba(0,0,0,0.55)", borderRadius:3, padding:"2px 5px",
        }}>
          <span style={{fontSize:9, color:BLUE, fontFamily:"monospace"}}>⬡ SWIBSWAP</span>
        </div>
      </div>
    );
  }
  return (
    <svg width={size} height={h} viewBox="0 0 100 140"
      style={{borderRadius:10, display:"block", flexShrink:0, boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
      <defs>
        <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0D1E36"/>
          <stop offset="100%" stopColor="#060E1C"/>
        </linearGradient>
        <clipPath id="cclip"><rect width="100" height="140" rx="7"/></clipPath>
      </defs>
      <g clipPath="url(#cclip)">
        <rect width="100" height="140" fill="url(#cbg)"/>
        <rect x="2" y="2" width="96" height="100" fill="#EDE8DE" rx="3"/>
        {Array.from({length:12},(_,i)=>{
          const a=(i/12)*Math.PI*2;
          return <line key={i} x1={50} y1={52} x2={50+Math.cos(a)*56} y2={52+Math.sin(a)*56} stroke="#D5CEC0" strokeWidth="0.4" opacity="0.5"/>;
        })}
        <path d="M33 18 Q27 10 26 20 Q24 30 30 35" fill="#1A0E06"/>
        <path d="M67 18 Q73 10 74 20 Q76 30 70 35" fill="#1A0E06"/>
        <path d="M33 15 Q50 7 67 15 Q71 23 67 26 Q50 18 33 26 Q29 23 33 15Z" fill="#1A0E06"/>
        <path d="M27 35 Q19 56 21 74 Q23 86 26 96 L31 94 Q28 82 28 63 Q30 44 35 35Z" fill="#241408"/>
        <path d="M73 35 Q81 56 79 74 Q77 86 74 96 L69 94 Q72 82 72 63 Q70 44 65 35Z" fill="#241408"/>
        <ellipse cx="50" cy="37" rx="15" ry="17" fill="#F5E8D4" stroke="#2A1A0A" strokeWidth="0.5"/>
        <ellipse cx="43" cy="35" rx="4" ry="4.5" fill="#0A0400"/>
        <ellipse cx="57" cy="35" rx="4" ry="4.5" fill="#0A0400"/>
        <circle cx="44.5" cy="33.5" r="1.5" fill="white"/>
        <circle cx="58.5" cy="33.5" r="1.5" fill="white"/>
        <path d="M44 44 Q50 48 56 44" fill="#E07878" stroke="#C05050" strokeWidth="0.4"/>
        <ellipse cx="37" cy="39" rx="4.5" ry="2.2" fill="#FFB0A0" opacity="0.45"/>
        <ellipse cx="63" cy="39" rx="4.5" ry="2.2" fill="#FFB0A0" opacity="0.45"/>
        <path d="M43 16 L44.5 11 L46 15 L50 8 L54 15 L55.5 11 L57 16" fill="#D4A820" stroke="#A07010" strokeWidth="0.5"/>
        <path d="M36 53 Q41 57 50 55 Q59 57 64 53 Q61 67 50 69 Q39 67 36 53Z" fill="#2A1060"/>
        <path d="M64 60 Q75 55 78 63 Q81 71 73 74 Q65 77 63 69 Q61 61 69 59" fill="none" stroke="#4A8A4A" strokeWidth="2" strokeLinecap="round"/>
        <rect x="0" y="102" width="100" height="38" fill="#0A1628"/>
        <text x="5" y="114" fill="#5A8AAA" fontSize="5" fontFamily="monospace">CHARACTER · BLUE · COST 6</text>
        <text x="5" y="124" fill="#F0F4FA" fontSize="7" fontFamily="sans-serif" fontWeight="700">Boa Hancock</text>
        <text x="5" y="133" fill="#3A5A78" fontSize="4.5" fontFamily="monospace">OP07-051 · SR · MANGA ALT</text>
        <text x="94" y="124" textAnchor="end" fill="#F5A623" fontSize="8" fontFamily="monospace" fontWeight="700">8000</text>
        <rect x="1" y="1" width="98" height="138" rx="6.5" fill="none" stroke="#1E3A5A" strokeWidth="1"/>
        <rect x="62" y="92" width="34" height="9" rx="2" fill="#000" opacity="0.4"/>
        <text x="79" y="98.5" textAnchor="middle" fill={BLUE} fontSize="5" fontFamily="monospace">⬡ SWIBSWAP</text>
      </g>
    </svg>
  );
}

// ─── SCREEN 1: WELCOME ────────────────────────────────────────────────────────
function WelcomeScreen({ onStart }) {
  return (
    <div style={{
      minHeight:"100vh", minHeight:"-webkit-fill-available",
      background: DARK, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"40px 24px", gap:28,
    }}>
      <style>{CSS}</style>

      <div className="fu1" style={{textAlign:"center"}}>
        <div style={{
          width:72, height:72, background:BLUE, borderRadius:20,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:32, margin:"0 auto 16px",
          boxShadow:"0 8px 32px rgba(26,111,255,0.4)",
        }}>⬡</div>
        <div style={{fontSize:28, fontWeight:800, color:WHITE, letterSpacing:"-0.5px"}}>SwibDeck</div>
        <div style={{fontSize:14, color:"rgba(255,255,255,0.5)", marginTop:4}}>
          TCG Card Scanner · SwibSwap
        </div>
      </div>

      <div className="fu2" style={{width:"100%", maxWidth:340}}>
        {[
          {icon:"📸", title:"Point at your card", body:"Place card flat on a surface with good light."},
          {icon:"🔍", title:"Auto-identifies card",body:"Matched against One Piece, Pokémon, Yugioh database."},
          {icon:"💰", title:"Live prices in ฿ THB", body:"RAW, PSA 10, BGS 10, BGS 10 BL — all shown."},
          {icon:"📦", title:"Push to Vault",        body:"List directly on SwibSwap in one tap."},
        ].map((s,i) => (
          <div key={i} style={{
            display:"flex", gap:14, padding:"12px 0",
            borderBottom: i<3 ? "1px solid rgba(255,255,255,0.07)" : "none",
            alignItems:"flex-start",
          }}>
            <div style={{
              width:38, height:38, borderRadius:10,
              background:"rgba(255,255,255,0.06)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:18, flexShrink:0,
            }}>{s.icon}</div>
            <div>
              <div style={{fontSize:14, fontWeight:700, color:WHITE, marginBottom:2}}>{s.title}</div>
              <div style={{fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.5}}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="fu3" style={{width:"100%", maxWidth:340}}>
        <button
          onClick={onStart}
          style={{
            width:"100%", background:BLUE, border:"none", borderRadius:16,
            padding:"18px", fontSize:17, fontWeight:800, color:WHITE,
            cursor:"pointer", boxShadow:"0 8px 28px rgba(26,111,255,0.45)",
            display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            WebkitAppearance:"none",
          }}
        >
          <span style={{fontSize:22}}>📷</span> Start Scanning
        </button>
        <div style={{textAlign:"center", marginTop:12, fontSize:11, color:"rgba(255,255,255,0.25)"}}>
          Tap Allow when Safari asks for camera permission
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN 2: CAMERA ────────────────────────────────────────────────────────
function CameraScreen({ onCapture, onBack }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting|live|error
  const [errMsg, setErrMsg] = useState("");
  const [flash,  setFlash]  = useState(false);

  // Start camera immediately when this screen mounts
  const startCam = useCallback(async () => {
    try {
      // Simple constraints — most compatible with iPhone
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // iOS Safari needs these attributes
        video.setAttribute("playsinline", "true");
        video.setAttribute("muted",       "true");
        video.setAttribute("autoplay",    "true");
        video.muted = true;
        // Wait for metadata then play
        video.onloadedmetadata = () => {
          video.play().then(() => {
            setStatus("live");
          }).catch(e => {
            setErrMsg("Video play failed: " + e.message);
            setStatus("error");
          });
        };
      }
    } catch(e) {
      setErrMsg(
        e.name === "NotAllowedError"
          ? "Camera permission was denied.\n\nTo fix:\n1. Close Safari\n2. Go to iPhone Settings → Safari → Camera → Allow\n3. Come back and try again"
          : e.name === "NotFoundError"
          ? "No camera found on this device."
          : "Camera error: " + e.message
      );
      setStatus("error");
    }
  }, []);

  // Start camera on mount
  useState(() => { startCam(); });

  const stopCam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || status !== "live") return;

    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    // Watermark
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#000";
    ctx.font = "bold " + Math.round(canvas.width * 0.02) + "px monospace";
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(-0.6);
    ctx.fillText("SWIBSWAP · VERIFIED · SW-5021 · " + new Date().toLocaleDateString("en-GB"), -canvas.width*0.35, 0);
    ctx.restore();

    // Corner badge
    const bw = Math.round(canvas.width * 0.18);
    const bh = Math.round(canvas.height * 0.06);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(canvas.width - bw - 10, canvas.height - bh - 10, bw, bh);
    ctx.fillStyle = "#3B9EFF";
    ctx.font = "bold " + Math.round(canvas.height * 0.022) + "px monospace";
    ctx.fillText("⬡ SWIBSWAP", canvas.width - bw, canvas.height - 16);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    stopCam();
    onCapture(dataUrl);
  };

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"#000",
      display:"flex", flexDirection:"column",
    }}>
      <style>{CSS}</style>

      {/* Video */}
      <video
        ref={videoRef}
        playsInline muted autoPlay
        style={{
          position:"absolute", inset:0,
          width:"100%", height:"100%",
          objectFit:"cover",
          display: status === "live" ? "block" : "none",
        }}
      />

      {/* Flash */}
      {flash && (
        <div style={{position:"absolute",inset:0,background:"white",opacity:0.85,zIndex:10}}/>
      )}

      {/* Starting overlay */}
      {status === "starting" && (
        <div style={{
          position:"absolute", inset:0,
          background:DARK, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:16,
        }}>
          <div style={{
            width:48, height:48,
            border:"3px solid " + BLUE, borderTopColor:"transparent",
            borderRadius:"50%", animation:"spin 0.8s linear infinite",
          }}/>
          <div style={{color:WHITE, fontSize:15, fontWeight:600}}>Opening camera…</div>
          <div style={{fontSize:12, color:"rgba(255,255,255,0.45)", textAlign:"center", padding:"0 40px", lineHeight:1.7}}>
            If a permission popup appears,<br/>tap <strong style={{color:WHITE}}>Allow</strong>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div style={{
          position:"absolute", inset:0, background:DARK,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          padding:"32px 24px", gap:16, textAlign:"center",
        }}>
          <div style={{fontSize:48}}>📷</div>
          <div style={{fontSize:18, fontWeight:700, color:RED}}>Camera Error</div>
          <div style={{fontSize:13, color:"rgba(255,255,255,0.55)", lineHeight:1.8, whiteSpace:"pre-line"}}>{errMsg}</div>
          <button onClick={startCam} style={{
            background:BLUE, border:"none", borderRadius:12,
            padding:"14px 28px", fontSize:14, fontWeight:700,
            color:WHITE, cursor:"pointer", marginTop:8,
          }}>Try Again</button>
          <button onClick={onBack} style={{
            background:"transparent", border:"1px solid rgba(255,255,255,0.2)",
            borderRadius:12, padding:"12px 28px", fontSize:14,
            color:"rgba(255,255,255,0.6)", cursor:"pointer",
          }}>← Go Back</button>
        </div>
      )}

      {/* Live UI overlay */}
      {status === "live" && (
        <>
          {/* Top bar */}
          <div style={{
            position:"absolute", top:0, left:0, right:0, zIndex:5,
            padding:"52px 20px 16px",
            background:"linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <button onClick={() => { stopCam(); onBack(); }} style={{
              background:"rgba(255,255,255,0.15)", border:"none",
              borderRadius:10, padding:"8px 14px",
              fontSize:13, fontWeight:600, color:WHITE, cursor:"pointer",
            }}>← Back</button>
            <div style={{fontSize:14, fontWeight:700, color:WHITE}}>SwibDeck Scanner</div>
            <div style={{width:70}}/>
          </div>

          {/* Card guide frame */}
          <div style={{
            position:"absolute", inset:0,
            display:"flex", alignItems:"center", justifyContent:"center", zIndex:4,
          }}>
            <div style={{position:"relative", width:"68%", maxWidth:240, aspectRatio:"63/88"}}>
              {/* Corners */}
              {[
                {top:0,    left:0,    borderTop:"3px solid "+BLUE, borderLeft:"3px solid "+BLUE},
                {top:0,    right:0,   borderTop:"3px solid "+BLUE, borderRight:"3px solid "+BLUE},
                {bottom:0, left:0,    borderBottom:"3px solid "+BLUE, borderLeft:"3px solid "+BLUE},
                {bottom:0, right:0,   borderBottom:"3px solid "+BLUE, borderRight:"3px solid "+BLUE},
              ].map((s,i) => (
                <div key={i} style={{position:"absolute", width:26, height:26, ...s}}/>
              ))}
              {/* Guide border */}
              <div style={{
                position:"absolute", inset:0,
                border:"1.5px dashed rgba(26,111,255,0.4)", borderRadius:8,
              }}/>
              {/* Scan line */}
              <div style={{
                position:"absolute", left:0, right:0, height:2, top:0,
                background:"linear-gradient(90deg, transparent, "+BLUE+", transparent)",
                boxShadow:"0 0 8px "+BLUE,
                animation:"scanLine 2s ease-in-out infinite",
              }}/>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, zIndex:5,
            padding:"20px 24px 48px",
            background:"linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
          }}>
            <div style={{textAlign:"center", marginBottom:20, fontSize:13, color:"rgba(255,255,255,0.7)", fontWeight:500}}>
              Place card inside the frame
            </div>
            <div style={{display:"flex", justifyContent:"center"}}>
              <button
                onClick={capture}
                style={{
                  width:78, height:78, borderRadius:"50%",
                  background:WHITE, border:"4px solid rgba(255,255,255,0.3)",
                  cursor:"pointer", padding:0,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow:"0 4px 24px rgba(0,0,0,0.4)",
                  WebkitAppearance:"none",
                }}
              >
                <div style={{
                  width:60, height:60, borderRadius:"50%",
                  background:BLUE, boxShadow:"0 0 20px rgba(26,111,255,0.6)",
                }}/>
              </button>
            </div>
            <div style={{textAlign:"center", marginTop:14, fontSize:11, color:"rgba(255,255,255,0.35)"}}>
              Tap to capture
            </div>
          </div>
        </>
      )}

      <canvas ref={canvasRef} style={{display:"none"}}/>
    </div>
  );
}

// ─── SCREEN 3: PROCESSING ─────────────────────────────────────────────────────
function ProcessingScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [pct,  setPct]  = useState(0);

  useState(() => {
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStep(i);
      setPct(Math.round((i / PROC_STEPS.length) * 100));
      if (i >= PROC_STEPS.length) {
        clearInterval(iv);
        setTimeout(onDone, 500);
      }
    }, 320);
    return () => clearInterval(iv);
  });

  return (
    <div style={{
      minHeight:"100vh", minHeight:"-webkit-fill-available",
      background:DARK, display:"flex", alignItems:"center",
      justifyContent:"center", flexDirection:"column",
      gap:24, padding:"40px 32px",
    }}>
      <style>{CSS}</style>
      <div style={{position:"relative", width:80, height:80}}>
        <div style={{position:"absolute",inset:0,border:"3px solid rgba(26,111,255,0.2)",borderRadius:"50%"}}/>
        <div style={{position:"absolute",inset:0,border:"3px solid transparent",borderTopColor:BLUE,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:WHITE}}>{pct}%</div>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:18, fontWeight:700, color:WHITE, marginBottom:6}}>Analysing Card…</div>
        <div style={{fontSize:13, color:"rgba(255,255,255,0.45)"}}>{PROC_STEPS[step-1] || ""}</div>
      </div>
      <div style={{width:"100%", maxWidth:280, height:4, background:"rgba(255,255,255,0.1)", borderRadius:99}}>
        <div style={{height:"100%", width:pct+"%", background:BLUE, borderRadius:99, transition:"width 0.3s"}}/>
      </div>
      <div style={{width:"100%", maxWidth:280}}>
        {PROC_STEPS.map((s,i) => {
          const done   = i < step - 1;
          const active = i === step - 1;
          return (
            <div key={i} style={{display:"flex", gap:10, alignItems:"center", padding:"4px 0", opacity: done ? 0.45 : active ? 1 : 0.2}}>
              <div style={{
                width:18, height:18, borderRadius:"50%", flexShrink:0,
                background: done ? GREEN : active ? BLUE : "rgba(255,255,255,0.1)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, color:WHITE, fontWeight:700,
              }}>{done ? "✓" : active ? "●" : ""}</div>
              <span style={{fontSize:12, color:WHITE, fontWeight: active ? 600 : 400}}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SCREEN 4: RESULT ────────────────────────────────────────────────────────
function ResultScreen({ image, onRescan }) {
  const [tab,     setTab]     = useState("overview");
  const [gradeId, setGradeId] = useState("raw_mint");
  const [showJP,  setShowJP]  = useState(false);

  const gd      = GRADE_DATA[gradeId];
  const sales   = SALES[gradeId] || SALES["raw_mint"];
  const net     = Math.round(gd.suggest * 0.95);
  const jpName  = "ボア・ハンコック OP07-051 コミックパラレル";

  const TABS = [{id:"overview",label:"Overview"},{id:"prices",label:"Prices"},{id:"condition",label:"Condition"}];

  const GRADE_BTNS = [
    {id:"raw_sealed",label:"Sealed",   color:TEAL},
    {id:"raw_mint",  label:"Mint NM",  color:BLUE},
    {id:"raw_played",label:"Played",   color:SUB},
    {id:"psa10",     label:"PSA 10",   color:GREEN},
    {id:"bgs10",     label:"BGS 10",   color:GOLD},
    {id:"bgs10bl",   label:"BGS 10 BL",color:PURPLE},
  ];

  const EN_LINKS = [
    {icon:"🛒",label:"eBay Listings",        url:"https://www.ebay.com/p/11072893798",                                                                              color:GOLD},
    {icon:"📊",label:"PSA Auction History",  url:"https://www.psacard.com/auctionprices/tcg-cards/2024-one-piece-japanese-500-years-future/boa-hancock/10477464",    color:GREEN},
    {icon:"📈",label:"PriceCharting (EN)",   url:"https://www.pricecharting.com/game/one-piece-500-years-in-the-future/boa-hancock-alternate-art-manga-op07-051",    color:BLUE},
    {icon:"📈",label:"PriceCharting (JP)",   url:"https://www.pricecharting.com/game/one-piece-japanese-500-years-in-the-future/boa-hancock-alternate-art-manga-op07-051",color:BLUE},
    {icon:"🃏",label:"Limitless TCG",        url:"https://onepiece.limitlesstcg.com/cards/OP07-051",                                                                 color:TEAL},
  ];

  const JP_LINKS = [
    {icon:"🟠",label:"Mercari Japan",    url:"https://jp.mercari.com/search?keyword="+encodeURIComponent(jpName),                             color:RED},
    {icon:"🟡",label:"Yahoo Auctions JP",url:"https://auctions.yahoo.co.jp/search/search?p="+encodeURIComponent(jpName),                     color:GOLD},
    {icon:"🟣",label:"Rakuten Japan",    url:"https://search.rakuten.co.jp/search/mall/"+encodeURIComponent(jpName)+"/",                      color:PURPLE},
    {icon:"⬛",label:"Amazon Japan",     url:"https://www.amazon.co.jp/s?k="+encodeURIComponent(jpName),                                     color:TEXT},
  ];

  const card = (children, style) => (
    <div style={{background:WHITE, borderRadius:14, border:"1px solid "+BORD, overflow:"hidden", ...style}}>
      {children}
    </div>
  );
  const secTitle = label => (
    <div style={{padding:"9px 14px", borderBottom:"1px solid "+LINE, background:SURF, fontSize:10, fontWeight:700, color:SUB, letterSpacing:"0.06em", textTransform:"uppercase"}}>
      {label}
    </div>
  );

  return (
    <div style={{maxWidth:430, margin:"0 auto", background:BG, minHeight:"100vh", fontFamily:"'Inter',sans-serif"}}>
      <style>{CSS}</style>

      {/* ── STICKY HEADER ── */}
      <div style={{background:WHITE, borderBottom:"1px solid "+BORD, padding:"44px 14px 0", position:"sticky", top:0, zIndex:40}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
          <button onClick={onRescan} style={{background:"none", border:"1px solid "+BORD, borderRadius:7, padding:"5px 11px", fontSize:12, color:SUB, cursor:"pointer"}}>← Re-Scan</button>
          <div style={{display:"flex", gap:4}}>
            <Tag color={GREEN}>✓ Genuine</Tag>
            <Tag color={PURPLE}>UV Pass</Tag>
            <Tag color={GOLD}>NM 8.8</Tag>
          </div>
        </div>

        <div style={{display:"flex", gap:12, alignItems:"flex-start", marginBottom:10}}>
          <CardIllustration captured={image} size={86}/>
          <div style={{flex:1}}>
            <div className="mono" style={{fontSize:9, color:BLUE, letterSpacing:"0.1em", marginBottom:4}}>ONE PIECE TCG · OP07-051</div>
            <div style={{fontSize:22, fontWeight:800, lineHeight:1.15, marginBottom:6, letterSpacing:"-0.3px"}}>Boa Hancock</div>
            <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:6}}>
              <Tag color={BLUE}>SR Manga Alt</Tag>
              <Tag color={GOLD}>FOIL</Tag>
              <Tag color={SUB}>JPN</Tag>
            </div>
            <div style={{fontSize:11, color:SUB, lineHeight:1.8}}>
              <span style={{color:TEXT, fontWeight:600}}>500 Years in the Future</span><br/>
              Blue · Cost 6 · 8000 PWR · 7 Warlords<br/>
              <span className="mono" style={{fontSize:9, color:DIM}}>ボア・ハンコック OP07-051</span>
            </div>
          </div>
        </div>

        <div style={{background:SURF, border:"1px solid "+BORD, borderRadius:8, padding:"7px 10px", marginBottom:8, fontSize:11, color:SUB, lineHeight:1.5}}>
          <span style={{fontWeight:700, color:TEXT}}>On Play: </span>
          Up to 1 opponent's Character (not Luffy) can't attack next turn. Return 1 Cost-1 or less to bottom of deck.
        </div>

        <div style={{display:"flex", gap:5, marginBottom:8}}>
          {[{label:"Card ID",val:"99.8%",color:GREEN},{label:"UV Scan",val:"PASS ✓",color:GREEN},{label:"AI Grade",val:"NM 8.8",color:GOLD}].map((m,i) => (
            <div key={i} style={{flex:1, background:SURF, border:"1px solid "+BORD, borderRadius:9, padding:"8px 5px", textAlign:"center"}}>
              <div style={{fontSize:9, color:SUB, marginBottom:2}}>{m.label}</div>
              <div className="mono" style={{fontSize:12, color:m.color, fontWeight:700}}>{m.val}</div>
            </div>
          ))}
        </div>

        <div style={{display:"flex", borderTop:"1px solid "+BORD, margin:"0 -14px"}}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, background:"none", border:"none",
              borderTop: tab===t.id ? "2px solid "+BLUE : "2px solid transparent",
              color: tab===t.id ? BLUE : SUB,
              padding:"10px 2px", fontSize:11, fontWeight: tab===t.id ? 700 : 500,
              cursor:"pointer", fontFamily:"'Inter',sans-serif",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{padding:"14px 14px 100px", display:"flex", flexDirection:"column", gap:12}}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            {card(
              <>
                {secTitle("📸 Captured Photos · ⬡ Watermarked")}
                <div style={{padding:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                  {["Front Full","Back Full","Front Corners","Back Corners"].map((label,i) => (
                    <div key={i} style={{background:SURF, borderRadius:8, overflow:"hidden", border:"1px solid "+BORD}}>
                      <div style={{aspectRatio:"4/3", overflow:"hidden", position:"relative"}}>
                        {image
                          ? <img src={image} alt={label} style={{width:"100%",height:"100%",objectFit:"cover",filter:i>1?"saturate(0.6) contrast(1.1)":"none"}}/>
                          : <div style={{width:"100%",height:"100%",background:SURF,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🃏</div>
                        }
                      </div>
                      <div style={{padding:"6px 8px"}}>
                        <div style={{fontSize:11, fontWeight:600}}>{label}</div>
                        <div style={{display:"flex",gap:3,marginTop:3}}>
                          <Tag color={BLUE} style={{fontSize:7}}>WM</Tag>
                          <Tag color={GREEN} style={{fontSize:7}}>Signed</Tag>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {card(
              <>
                {secTitle("💰 Market Snapshot · SR Manga Alt")}
                <div style={{padding:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                  {GRADE_BTNS.map(gb => {
                    const d = GRADE_DATA[gb.id];
                    return (
                      <button key={gb.id} onClick={() => { setGradeId(gb.id); setTab("prices"); }} style={{
                        background:BG, border:"1.5px solid "+BORD,
                        borderRadius:10, padding:"10px 8px",
                        cursor:"pointer", textAlign:"left",
                        WebkitAppearance:"none",
                      }}>
                        <div style={{fontSize:10, fontWeight:700, color:gb.color, marginBottom:2}}>{gb.label}</div>
                        <div style={{fontSize:17, fontWeight:800, color:TEXT, lineHeight:1.1}}>฿{fmt(d.thbLow)}</div>
                        <div style={{fontSize:10, color:DIM}}>to ฿{fmt(d.thbHigh)}</div>
                        <div style={{fontSize:10, color: d.up ? GREEN : RED, marginTop:2}}>{d.up?"▲":"▼"} {d.trend}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{padding:"0 12px 12px"}}>
                  <button onClick={() => setTab("prices")} style={{
                    width:"100%", background:BLUE, border:"none", borderRadius:10,
                    padding:"11px", fontSize:13, fontWeight:700, color:WHITE,
                    cursor:"pointer", boxShadow:"0 3px 14px rgba(26,111,255,0.28)",
                    WebkitAppearance:"none",
                  }}>View Full Price History →</button>
                </div>
              </>
            )}

            {card(
              <div style={{padding:"14px"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:700, marginBottom:2}}>List on SwibSwap</div>
                    <div style={{fontSize:11, color:SUB}}>Suggested: <strong style={{color:BLUE}}>฿{fmt(GRADE_DATA["raw_mint"].suggest)}</strong> · Net: <strong style={{color:GREEN}}>฿{fmt(Math.round(GRADE_DATA["raw_mint"].suggest*0.95))}</strong></div>
                  </div>
                </div>
                <div style={{display:"flex", gap:8}}>
                  <button style={{flex:1, background:SURF, border:"1px solid "+BORD, borderRadius:9, padding:"11px", fontSize:13, fontWeight:600, cursor:"pointer", WebkitAppearance:"none"}}>Draft</button>
                  <button style={{flex:2, background:BLUE, border:"none", borderRadius:9, padding:"11px", fontSize:13, fontWeight:700, color:WHITE, cursor:"pointer", boxShadow:"0 3px 14px rgba(26,111,255,0.28)", WebkitAppearance:"none"}}>Publish Now →</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* PRICES */}
        {tab === "prices" && (
          <>
            <div>
              <div style={{fontSize:10, fontWeight:700, color:SUB, marginBottom:7, letterSpacing:"0.06em", textTransform:"uppercase"}}>Price by Grade / Condition</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5}}>
                {GRADE_BTNS.map(gb => (
                  <button key={gb.id} onClick={() => setGradeId(gb.id)} style={{
                    background: gradeId===gb.id ? gb.color : WHITE,
                    color:      gradeId===gb.id ? WHITE    : SUB,
                    border:     "1.5px solid "+(gradeId===gb.id ? gb.color : BORD),
                    borderRadius:8, padding:"8px 4px", cursor:"pointer",
                    fontSize:10, fontWeight:700, textAlign:"center",
                    WebkitAppearance:"none",
                  }}>{gb.label}</button>
                ))}
              </div>
            </div>

            {card(
              <div style={{padding:"14px", border:"1.5px solid "+gd.color, borderRadius:14}}>
                {gd.note && <div style={{fontSize:11, color:DIM, marginBottom:6}}>{gd.note}</div>}
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:11, color:SUB, marginBottom:4}}>{gd.label} · Market Price</div>
                    <div style={{fontSize:32, fontWeight:800, color:gd.color, lineHeight:1.1, letterSpacing:"-0.8px"}}>฿{fmt(gd.thbLow)}</div>
                    <div style={{fontSize:16, fontWeight:600, color:gd.color, opacity:0.7}}>– ฿{fmt(gd.thbHigh)}</div>
                    <div style={{fontSize:12, color:DIM, marginTop:2}}>(${Math.round(gd.thbLow/RATE)}–${Math.round(gd.thbHigh/RATE)} USD)</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14, fontWeight:700, color: gd.up ? GREEN : RED}}>{gd.up?"▲":"▼"} {gd.trend}</div>
                    <div style={{fontSize:10, color:DIM}}>vs last month</div>
                  </div>
                </div>
                <div style={{marginTop:12, marginBottom:2}}><Chart data={gd.history} color={gd.color}/></div>
                <div style={{display:"flex", justifyContent:"space-between"}}>
                  {["Oct","Nov","Dec","Jan","Feb","Mar","Mar","Apr","Apr","Now"].map((m,i) => (
                    <span key={i} style={{fontSize:8, color:DIM}}>{m}</span>
                  ))}
                </div>
              </div>,
              {border:"none", borderRadius:14}
            )}

            {card(
              <>
                {secTitle("Recent Sales · "+gd.label+" · eBay / PSA")}
                {sales.map((s,i) => (
                  <a key={i} href="https://www.ebay.com/p/11072893798" target="_blank" rel="noopener noreferrer">
                    <div style={{display:"flex", alignItems:"center", padding:"10px 14px", borderBottom: i<sales.length-1 ? "1px solid "+LINE : "none"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13, fontWeight:500}}>{s.date}</div>
                        <div style={{fontSize:10, color:DIM}}>{s.cond}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:17, fontWeight:800, color:gd.color}}>{thb(s.usd)}</div>
                        <div style={{fontSize:10, color:DIM}}>{usd(s.usd)}</div>
                      </div>
                      <div style={{color:"#D1D5DB", fontSize:13, marginLeft:8}}>›</div>
                    </div>
                  </a>
                ))}
              </>
            )}

            {card(
              <div style={{padding:"14px", border:"1.5px solid "+BLUE, borderRadius:14}}>
                <div style={{fontSize:13, fontWeight:700, marginBottom:4}}>List on SwibSwap</div>
                <div style={{fontSize:11, color:SUB, marginBottom:12}}>Suggested: <strong style={{color:BLUE}}>฿{fmt(gd.suggest)}</strong> · Net after 5%: <strong style={{color:GREEN}}>฿{fmt(net)}</strong></div>
                <div style={{display:"flex", gap:8}}>
                  <button style={{flex:1, background:SURF, border:"1px solid "+BORD, borderRadius:9, padding:"10px", fontSize:13, fontWeight:600, cursor:"pointer", WebkitAppearance:"none"}}>Draft</button>
                  <button style={{flex:2, background:BLUE, border:"none", borderRadius:9, padding:"10px", fontSize:13, fontWeight:700, color:WHITE, cursor:"pointer", WebkitAppearance:"none"}}>Publish →</button>
                </div>
              </div>,
              {border:"none", borderRadius:14}
            )}

            {card(
              <>
                <div style={{display:"flex", gap:4, padding:"10px 14px", borderBottom:"1px solid "+LINE}}>
                  <button onClick={() => setShowJP(false)} style={{flex:1, background: !showJP ? BLUE : SURF, color: !showJP ? WHITE : SUB, border:"1px solid "+(!showJP ? BLUE : BORD), borderRadius:7, padding:"7px", fontSize:11, fontWeight:600, cursor:"pointer", WebkitAppearance:"none"}}>🌐 English</button>
                  <button onClick={() => setShowJP(true)}  style={{flex:1, background:  showJP ? BLUE : SURF, color:  showJP ? WHITE : SUB, border:"1px solid "+( showJP ? BLUE : BORD), borderRadius:7, padding:"7px", fontSize:11, fontWeight:600, cursor:"pointer", WebkitAppearance:"none"}}>🇯🇵 Japan</button>
                </div>
                {showJP && <div style={{padding:"7px 14px", background:SURF, fontSize:11, color:SUB, borderBottom:"1px solid "+LINE}}>JP: <span className="mono" style={{color:TEXT}}>{jpName}</span></div>}
                {(showJP ? JP_LINKS : EN_LINKS).map((l,i,arr) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
                    <div style={{display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderBottom: i<arr.length-1 ? "1px solid "+LINE : "none"}}>
                      <span style={{fontSize:18}}>{l.icon}</span>
                      <span style={{fontSize:13, fontWeight:500, flex:1, color:l.color}}>{l.label}</span>
                      <span style={{fontSize:13, color:"#D1D5DB"}}>›</span>
                    </div>
                  </a>
                ))}
              </>
            )}
          </>
        )}

        {/* CONDITION */}
        {tab === "condition" && (
          <>
            {card(
              <div style={{padding:"14px", display:"flex", justifyContent:"space-between", alignItems:"center", border:"1.5px solid rgba(212,138,0,0.4)", borderRadius:14}}>
                <div>
                  <div style={{fontSize:11, color:SUB, marginBottom:3}}>AI Overall Grade</div>
                  <div style={{fontSize:14, fontWeight:600, color:GREEN, marginBottom:5}}>PSA 9–10 candidate</div>
                  <Tag color={GREEN}>PSA Submission Recommended</Tag>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:52, fontWeight:800, color:GOLD, lineHeight:1}}>8.8</div>
                  <div style={{fontSize:13, fontWeight:700, color:GOLD}}>NM</div>
                </div>
              </div>,
              {border:"none", borderRadius:14}
            )}

            {card(
              <>
                {secTitle("Score Breakdown")}
                {[
                  {label:"Centering",     score:91, note:"F:49/51 · B:50/50"},
                  {label:"Corners",       score:88, note:"All NM"},
                  {label:"Surface",       score:93, note:"No scratches"},
                  {label:"Edges",         score:90, note:"Clean cut"},
                  {label:"Print Quality", score:97, note:"Manga art crisp"},
                  {label:"Foil / Holo",   score:95, note:"No peeling"},
                  {label:"UV Test",       score:100,note:"Genuine Bandai"},
                ].map((r,i,arr) => {
                  const col = r.score>=90 ? GREEN : r.score>=80 ? GOLD : RED;
                  return (
                    <div key={i} style={{padding:"9px 14px", borderBottom: i<arr.length-1 ? "1px solid "+LINE : "none"}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5}}>
                        <span style={{fontSize:12, fontWeight:500}}>{r.label}</span>
                        <div style={{display:"flex", gap:8, alignItems:"center"}}>
                          <span style={{fontSize:10, color:DIM}}>{r.note}</span>
                          <span style={{fontSize:13, fontWeight:700, color:col}}>{r.score}</span>
                        </div>
                      </div>
                      <div style={{height:4, background:SURF, borderRadius:99, overflow:"hidden"}}>
                        <div style={{height:"100%", width:r.score+"%", background:col, borderRadius:99}}/>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {card(
              <div style={{display:"flex", gap:12, padding:"12px 14px", alignItems:"flex-start"}}>
                <div style={{width:42,height:42,borderRadius:"50%",background:toRgba(PURPLE,0.1),border:"2px solid "+PURPLE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔬</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:GREEN,marginBottom:3}}>UV PASS — Genuine Bandai Stock</div>
                  <div style={{fontSize:12,color:SUB,lineHeight:1.6}}>Standard blue-white fluorescence under 365nm UV. No proxy patterns detected. Consistent with factory OP-07 Bandai card stock.</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)",
        borderTop:"1px solid "+BORD, padding:"10px 14px 28px",
        display:"flex", gap:8,
      }}>
        <button onClick={onRescan} style={{flex:1,background:SURF,border:"1px solid "+BORD,borderRadius:12,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer",WebkitAppearance:"none"}}>📷 Re-Scan</button>
        <button style={{flex:2,background:BLUE,border:"none",borderRadius:12,padding:"12px",fontSize:14,fontWeight:700,color:WHITE,cursor:"pointer",boxShadow:"0 4px 18px rgba(26,111,255,0.32)",WebkitAppearance:"none"}}>Push to Vault →</button>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,  setScreen]  = useState("welcome");
  const [captured,setCaptured]= useState(null);

  const goCamera    = useCallback(() => setScreen("camera"),     []);
  const goBack      = useCallback(() => setScreen("welcome"),    []);
  const goProcess   = useCallback(img => { setCaptured(img); setScreen("processing"); }, []);
  const goResult    = useCallback(() => setScreen("result"),     []);
  const goRescan    = useCallback(() => { setCaptured(null); setScreen("welcome"); }, []);

  if (screen === "welcome")    return <WelcomeScreen   onStart={goCamera} />;
  if (screen === "camera")     return <CameraScreen    onCapture={goProcess} onBack={goBack} />;
  if (screen === "processing") return <ProcessingScreen onDone={goResult} />;
  if (screen === "result")     return <ResultScreen    image={captured} onRescan={goRescan} />;
  return null;
}
