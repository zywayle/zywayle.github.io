const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── Constants ────────────────────────────────────────────────────────────────
const LOGO_URL = "https://i.ibb.co/xSFJxP7F/wayle-dark.png";

const MODELS = [
  { id:'qwen2.5-0.5b', label:'Qwen 2.5 · 0.5B', family:'qwen', params:'0.5B', quantization:'INT4', ramGB:0.4, device:'both', tags:['fast','mobile'], description:'Ultra-fast, runs on any WebGPU device', tier:'nano' },
  { id:'qwen2.5-1.5b', label:'Qwen 2.5 · 1.5B', family:'qwen', params:'1.5B', quantization:'INT4', ramGB:1.0, device:'both', tags:['fast','mobile'], description:'Great balance for mobile — recommended', tier:'small' },
  { id:'qwen2.5-3b',   label:'Qwen 2.5 · 3B',   family:'qwen', params:'3B',   quantization:'INT4', ramGB:2.0, device:'both', tags:['balanced'], description:'Best mobile model — smart and still fast', tier:'medium' },
  { id:'llama3.2-1b',  label:'Llama 3.2 · 1B',  family:'llama', params:'1B', quantization:'INT4', ramGB:0.8, device:'both', tags:['fast','mobile'], description:"Meta's compact model, very fast on mobile", tier:'small' },
  { id:'llama3.2-3b',  label:'Llama 3.2 · 3B',  family:'llama', params:'3B', quantization:'INT4', ramGB:2.0, device:'desktop', tags:['balanced'], description:'Recommended for desktop Chrome', tier:'medium' },
  { id:'phi3.5-mini',  label:'Phi-3.5 Mini · 3.8B', family:'phi', params:'3.8B', quantization:'INT4', ramGB:2.4, device:'desktop', tags:['smart','desktop'], description:"Microsoft's best small model — highly capable", tier:'medium' },
];

const TIER_COLOR = {
  nano:   {bg:'#f0fdf4', color:'#16a34a'},
  small:  {bg:'#eff6ff', color:'#2563eb'},
  medium: {bg:'#faf5ff', color:'#7c3aed'},
  large:  {bg:'#fff7ed', color:'#c2410c'},
};

const PLANS = [
  {
    id:'free', name:'Free', price:'$0', period:'forever',
    description:'Run models locally in your browser. Your hardware, your data.',
    badge: null,
    features:[
      {text:'On-device inference (WebGPU)',included:true},
      {text:'Qwen 2.5 0.5B → 3B',included:true},
      {text:'Llama 3.2 1B & 3B',included:true},
      {text:'100% private — no data leaves device',included:true},
      {text:'Unlimited messages',included:true},
      {text:'Export chat history',included:true},
      {text:'Phi-3.5 Mini & 7B+ models',included:false},
      {text:'Cloud fallback inference',included:false},
      {text:'Priority model updates',included:false},
    ],
    cta:'Current Plan', ctaActive:true, featured:false,
  },
  {
    id:'pro', name:'Pro', price:'$8', period:'per month',
    description:'Bigger models, cloud fallback when WebGPU is unavailable.',
    badge:'Most Popular',
    features:[
      {text:'Everything in Free',included:true},
      {text:'Phi-3.5 Mini, Mistral 7B',included:true},
      {text:'Cloud fallback (Claude Haiku)',included:true},
      {text:'Faster model downloads (CDN)',included:true},
      {text:'Priority model updates',included:true},
      {text:'API access (1K req/day)',included:true},
      {text:'Custom system prompts',included:true},
      {text:'GPT-4 class models',included:false},
      {text:'Team sharing',included:false},
    ],
    cta:'Coming Soon', ctaActive:false, featured:true,
  },
  {
    id:'team', name:'Team', price:'$24', period:'per seat / mo',
    description:'Deploy Wayle across your org with centralized model control.',
    badge:null,
    features:[
      {text:'Everything in Pro',included:true},
      {text:'GPT-4o & Claude Sonnet access',included:true},
      {text:'Team model sharing',included:true},
      {text:'Admin dashboard',included:true},
      {text:'SSO / SAML',included:true},
      {text:'Audit logs',included:true},
      {text:'SLA guarantee',included:true},
      {text:'Custom fine-tuned models',included:false},
    ],
    cta:'Coming Soon', ctaActive:false, featured:false,
  },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
:root{
  --bg:#ffffff;--sidebar-bg:#f7f7f8;--surface:#ffffff;--s2:#f4f4f5;--s3:#e4e4e7;
  --border:#e4e4e7;--border2:#d1d1d6;
  --text:#09090b;--t2:#52525b;--t3:#a1a1aa;
  --purple:#7c3aed;--ph:#6d28d9;--pl:#8b5cf6;
  --pdim:#ede9fe;--pglow:rgba(124,58,237,.15);
  --green:#16a34a;--red:#dc2626;--blue:#2563eb;
  --font:'Space Grotesk',sans-serif;--serif:'Instrument Serif',serif;
  --sidebar-w:256px;--r:16px;--rsm:12px;--rxs:8px;
  --hh:56px;--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px);
  --bottom-nav-h:58px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:var(--font);background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
#root{height:100%}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}
::-webkit-scrollbar-track{background:transparent}
.material-symbols-rounded{font-variation-settings:'FILL' 0,'wght' 350,'GRAD' 0,'opsz' 24;font-size:20px;line-height:1;user-select:none;pointer-events:none}
.fill{font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24}
.s20{font-size:20px!important}.s18{font-size:18px!important}.s16{font-size:16px!important}.s14{font-size:14px!important}.s15{font-size:15px!important}.s12{font-size:12px!important}

@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes pulse{0%,100%{opacity:.25}50%{opacity:.9}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* ── APP SHELL ── */
.app{display:flex;height:100dvh;overflow:hidden;background:var(--bg)}

/* ── DESKTOP SIDEBAR ── */
.sidebar{
  width:var(--sidebar-w);flex-shrink:0;
  background:var(--sidebar-bg);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  padding:calc(var(--st) + 12px) 0 calc(var(--sb) + 12px);
  overflow:hidden;
}
.sidebar-brand{
  display:flex;align-items:center;gap:9px;
  padding:4px 16px 20px;text-decoration:none;
}
.sidebar-brand img{width:30px;height:30px;border-radius:8px;object-fit:contain}
.sidebar-brand-name{font-family:var(--serif);font-style:italic;font-size:20px;letter-spacing:-.3px;color:var(--text)}
.sidebar-nav{display:flex;flex-direction:column;gap:2px;padding:0 8px;flex:1}
.stab{
  display:flex;align-items:center;gap:10px;
  padding:9px 10px;border-radius:var(--rsm);border:none;
  background:transparent;cursor:pointer;font-family:var(--font);
  font-size:14px;font-weight:500;color:var(--t2);
  transition:all .15s;text-align:left;width:100%;
}
.stab.on{background:var(--s3);color:var(--text);font-weight:600}
.stab:hover:not(.on){background:var(--s2);color:var(--text)}
.stab .material-symbols-rounded{font-size:18px;flex-shrink:0;opacity:.8}
.stab.on .material-symbols-rounded{opacity:1}
.sidebar-bottom{padding:8px;border-top:1px solid var(--border);margin-top:auto}
.new-chat-btn{
  display:flex;align-items:center;gap:9px;
  width:100%;padding:9px 10px;border-radius:var(--rsm);border:none;
  background:var(--purple);color:#fff;font-family:var(--font);
  font-size:14px;font-weight:600;cursor:pointer;
  transition:all .15s;box-shadow:0 2px 12px var(--pglow);
}
.new-chat-btn:hover{background:var(--ph);box-shadow:0 3px 16px var(--pglow)}
.new-chat-btn:active{transform:scale(.97)}
.new-chat-btn .material-symbols-rounded{font-size:17px}

/* ── MAIN AREA ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* ── MOBILE TOP NAV ── */
.mob-nav{
  display:none;
  align-items:center;gap:8px;
  height:calc(var(--hh) + var(--st));padding:var(--st) 14px 0;
  background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);flex-shrink:0;z-index:20;
}
.mob-nav-brand{display:flex;align-items:center;gap:8px;flex:1}
.mob-nav-brand img{width:28px;height:28px;border-radius:7px;object-fit:contain}
.mob-nav-brand span{font-family:var(--serif);font-style:italic;font-size:19px;color:var(--text)}
.mob-nav-title{font-size:15px;font-weight:600;color:var(--text);flex:1;text-align:center}
.ibtn{
  width:36px;height:36px;border-radius:10px;border:none;
  display:flex;align-items:center;justify-content:center;
  background:transparent;cursor:pointer;color:var(--t2);transition:background .12s;flex-shrink:0;
}
.ibtn:active{background:var(--s3)}

/* ── MOBILE BOTTOM NAV ── */
.mob-bottom-nav{
  display:none;
  flex-shrink:0;
  height:calc(var(--bottom-nav-h) + var(--sb));
  padding-bottom:var(--sb);
  background:rgba(255,255,255,.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-top:1px solid var(--border);
  flex-direction:row;z-index:20;
}
.mbtab{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  border:none;background:transparent;cursor:pointer;font-family:var(--font);
  font-size:10.5px;font-weight:500;color:var(--t3);transition:color .15s;padding:0;
}
.mbtab.on{color:var(--purple)}
.mbtab .material-symbols-rounded{font-size:22px;transition:transform .2s}
.mbtab.on .material-symbols-rounded{transform:scale(1.05)}

/* ── CONTENT AREA ── */
.content{flex:1;overflow:hidden;display:flex;flex-direction:column}

/* ── CHAT ── */
.chat{display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0}

/* Model bar */
.model-bar{
  display:flex;align-items:center;gap:8px;
  padding:8px 16px;background:var(--surface);
  border-bottom:1px solid var(--border);flex-shrink:0;
}
.mpill{
  display:flex;align-items:center;gap:6px;
  padding:5px 11px 5px 9px;border-radius:20px;
  background:var(--s2);border:1px solid var(--border);
  font-size:12.5px;font-weight:500;color:var(--t2);
  cursor:pointer;transition:all .13s;white-space:nowrap;
}
.mpill .dot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
.mpill .dot.off{background:var(--t3)}
.mpill:hover{background:var(--s3);border-color:var(--border2)}
.tps{font-size:11px;color:var(--pl);font-weight:700;background:var(--pdim);padding:2px 7px;border-radius:20px}
.prog-sm{display:flex;align-items:center;gap:7px;flex:1;min-width:0}
.prog-sm span{font-size:11.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.prog-sm .track{width:60px;height:3px;background:#e0d9fb;border-radius:2px;overflow:hidden;flex-shrink:0}
.prog-sm .fill2{height:100%;background:var(--purple);border-radius:2px;transition:width .3s}
.spinner16{width:14px;height:14px;border-radius:50%;border:2px solid #e0d9fb;border-top-color:var(--purple);animation:spin .7s linear infinite;flex-shrink:0}

/* ── MESSAGES ── */
.msgs{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.msgs-in{
  max-width:720px;margin:0 auto;
  padding:20px 20px 8px;
  display:flex;flex-direction:column;gap:2px;min-height:100%;
}

/* Welcome screen */
.welcome{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  flex:1;gap:20px;padding:32px 16px 16px;
  animation:scaleIn .4s ease;
}
.welcome-logo{
  width:64px;height:64px;border-radius:18px;overflow:hidden;
  box-shadow:0 4px 24px rgba(124,58,237,.2),0 1px 4px rgba(0,0,0,.06);
}
.welcome-logo img{width:100%;height:100%;object-fit:contain}
.wtitle{
  font-family:var(--serif);font-style:italic;
  font-size:28px;color:var(--text);letter-spacing:-.5px;text-align:center;
}
.wsub{font-size:14px;color:var(--t3);text-align:center;max-width:240px;line-height:1.6;font-weight:400}
.wgpu{
  display:flex;align-items:center;gap:6px;
  padding:5px 12px;border-radius:20px;
  background:#f0fdf4;border:1px solid #bbf7d0;
  font-size:12px;color:var(--green);font-weight:600;
}
.wgpu .material-symbols-rounded{font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;max-width:480px}
.chip{
  padding:8px 14px;border-radius:20px;
  border:1.5px solid var(--border);
  background:var(--surface);font-size:13px;color:var(--t2);
  cursor:pointer;transition:all .15s;font-family:var(--font);font-weight:500;
  line-height:1.3;text-align:left;
}
.chip:hover{border-color:var(--pl);color:var(--purple);background:var(--pdim)}
.chip:active{transform:scale(.97)}

/* Message bubbles */
.msg{display:flex;flex-direction:column;animation:msgIn .2s ease;padding:4px 0}
.msg.user{align-items:flex-end}
.msg.asst{align-items:flex-start}
.mrow{display:flex;align-items:flex-end;gap:8px;max-width:100%}
.msg.user .mrow{flex-direction:row-reverse}
.av{
  width:28px;height:28px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  overflow:hidden;align-self:flex-end;flex-shrink:0;
}
.av.asst-av{background:var(--purple);border:none}
.av.asst-av img{width:18px;height:18px;object-fit:contain;filter:brightness(0) invert(1)}
.av.user-av{background:var(--s3);border:1.5px solid var(--border)}
.av.user-av .material-symbols-rounded{font-size:14px;color:var(--t2)}

/* User bubble */
.bub{
  padding:10px 15px;border-radius:18px;
  font-size:14.5px;line-height:1.65;
  max-width:min(520px, calc(100% - 42px));
  word-break:break-word;font-weight:400;
}
.msg.user .bub{
  background:var(--purple);color:#fff;
  border-bottom-right-radius:5px;
  font-weight:450;
}
.msg.asst .bub{
  background:transparent;color:var(--text);
  border:none;padding:4px 0;max-width:min(640px, calc(100% - 42px));
}

/* Markdown in bubbles */
.bub p{margin:0 0 6px}.bub p:last-child{margin:0}
.bub h1{font-size:17px;font-weight:700;margin:10px 0 4px;letter-spacing:-.3px}
.bub h2{font-size:15.5px;font-weight:700;margin:8px 0 4px;letter-spacing:-.2px}
.bub h3{font-size:14.5px;font-weight:600;margin:6px 0 3px}
.bub ul,.bub ol{padding-left:20px;margin:5px 0}.bub li{margin:3px 0}
.bub strong{font-weight:700}
.bub em{font-style:italic}
.bub hr{border:none;border-top:1px solid var(--border);margin:10px 0}

.code-block{
  position:relative;background:#18181b;border-radius:10px;
  padding:12px 14px;overflow-x:auto;margin:8px 0;
  border:1px solid rgba(255,255,255,.05);
}
.code-block code{font-family:'SF Mono','Fira Code','Cascadia Code',monospace;font-size:12.5px;line-height:1.65;color:#e4e4e7;white-space:pre;display:block}
.code-lang{
  position:absolute;top:7px;right:10px;
  font-size:10px;color:#71717a;
  font-family:var(--font);text-transform:uppercase;letter-spacing:.6px;font-weight:600;
}
.inline-code{
  font-family:'SF Mono','Fira Code',monospace;font-size:12.5px;
  padding:1px 5px;background:var(--s2);border-radius:5px;
  border:1px solid var(--border);color:var(--purple);
}
.msg.user .inline-code{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.2);color:#fff}
.msg.user .code-block{background:rgba(0,0,0,.25);border-color:rgba(255,255,255,.1)}

.cursor{
  display:inline-block;width:2px;height:.88em;
  background:var(--purple);margin-left:2px;
  vertical-align:text-bottom;animation:blink .75s step-end infinite;
}

/* Message metadata */
.mmeta{
  display:flex;align-items:center;gap:3px;
  margin-top:3px;padding:0 2px;
  opacity:0;transition:opacity .15s;
}
.msg:hover .mmeta,.msg:focus-within .mmeta{opacity:1}
.mbtn{
  width:26px;height:26px;border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  border:none;background:transparent;cursor:pointer;
  color:var(--t3);transition:all .12s;
}
.mbtn:hover{background:var(--s2);color:var(--t2)}
.mtime{font-size:10.5px;color:var(--t3);font-weight:400}
.tpsbadge{
  font-size:10px;color:var(--pl);font-weight:700;
  padding:1px 6px;background:var(--pdim);border-radius:6px;
}

/* Typing dots */
.tdots{display:flex;gap:4px;align-items:center;padding:4px 0;height:24px}
.tdots span{
  width:6px;height:6px;border-radius:50%;
  background:var(--t3);animation:pulse 1.2s ease-in-out infinite;
}
.tdots span:nth-child(2){animation-delay:.2s}
.tdots span:nth-child(3){animation-delay:.4s}

/* ── INPUT BAR ── */
.ibar{
  flex-shrink:0;padding:12px 16px;
  padding-bottom:calc(12px + var(--sb));
  background:var(--bg);
  border-top:1px solid var(--border);
}
.iwrap{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:0}
.ibox{
  display:flex;align-items:flex-end;gap:8px;
  background:var(--s2);border:1.5px solid var(--border);
  border-radius:16px;padding:4px 4px 4px 14px;
  transition:border-color .18s,box-shadow .18s;
}
.ibox:focus-within{border-color:var(--pl);box-shadow:0 0 0 3px var(--pglow)}
.ibox textarea{
  flex:1;border:none;outline:none;background:transparent;
  font-family:var(--font);font-size:15px;font-weight:400;
  line-height:1.55;color:var(--text);
  padding:8px 0;resize:none;max-height:140px;min-height:40px;
  overflow-y:auto;-webkit-overflow-scrolling:touch;
}
.ibox textarea::placeholder{color:var(--t3)}
.sbtn{
  width:38px;height:38px;border-radius:10px;border:none;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:var(--purple);color:#fff;cursor:pointer;
  transition:all .15s;box-shadow:0 2px 10px var(--pglow);
  margin-bottom:1px;
}
.sbtn:hover{background:var(--ph)}
.sbtn:active{transform:scale(.9)}
.sbtn:disabled{background:var(--s3);color:var(--t3);box-shadow:none;cursor:default}
.sbtn.stop{background:var(--red);box-shadow:0 2px 10px rgba(220,38,38,.25)}
.spspin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:spin .65s linear infinite}
.ihint{
  text-align:center;font-size:11.5px;color:var(--t3);
  padding:6px 0 0;font-weight:400;
}

/* ── MODELS TAB ── */
.modview{flex:1;overflow-y:auto;padding:20px 16px}
.modview-in{max-width:700px;margin:0 auto}
.stitle{
  font-size:11px;font-weight:700;color:var(--t3);
  letter-spacing:.8px;text-transform:uppercase;
  margin-bottom:10px;margin-top:24px;padding:0 2px;
}
.stitle:first-child{margin-top:0}
.hwbanner{
  display:flex;align-items:flex-start;gap:10px;
  padding:12px 14px;border-radius:var(--rsm);
  background:var(--pdim);border:1px solid rgba(124,58,237,.15);
  margin-bottom:16px;font-size:13px;color:var(--t2);line-height:1.55;
}
.hwbanner .material-symbols-rounded{color:var(--purple);font-size:18px;flex-shrink:0;margin-top:1px}
.hwbanner strong{font-weight:600;color:var(--text)}
.loadprog{
  background:var(--pdim);border-radius:var(--rsm);
  padding:12px 14px;margin-bottom:14px;
  display:flex;flex-direction:column;gap:8px;
  border:1px solid rgba(124,58,237,.12);
}
.loadprog .txt{font-size:12.5px;color:var(--t2);font-weight:500}
.loadprog .bar{height:4px;background:#d4c8fa;border-radius:2px;overflow:hidden}
.loadprog .fill3{height:100%;background:var(--purple);border-radius:2px;transition:width .35s}
.mcard{
  background:var(--surface);border:1.5px solid var(--border);
  border-radius:var(--rsm);padding:14px 16px;
  margin-bottom:8px;cursor:pointer;transition:all .15s;
  display:flex;align-items:center;gap:12px;
}
.mcard:hover{border-color:var(--border2);background:var(--s2)}
.mcard:active{background:var(--s3)}
.mcard.sel{border-color:var(--pl);background:var(--pdim)}
.mcard.loading-now{border-color:var(--purple)}
.micon{width:40px;height:40px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.5px}
.fq{background:#fef9c3;color:#a16207}
.fl{background:#dbeafe;color:#1d4ed8}
.fp{background:#fce7f3;color:#be185d}
.fm{background:#d1fae5;color:#065f46}
.minfo{flex:1;min-width:0}
.mname{font-size:14px;font-weight:600;color:var(--text);letter-spacing:-.2px}
.mdesc{font-size:12px;color:var(--t3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mtags{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
.mtag{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:6px;letter-spacing:.2px}
.mright{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.mram{font-size:11.5px;color:var(--t3);font-weight:500}
.mcheck{color:var(--green);font-size:18px!important}
.mloadbtn{
  padding:5px 12px;border-radius:8px;
  border:1.5px solid var(--purple);
  background:transparent;color:var(--purple);
  font-size:12px;font-weight:600;
  cursor:pointer;font-family:var(--font);transition:all .14s;
}
.mloadbtn:hover{background:var(--pdim)}
.mloadbtn:disabled{border-color:var(--border);color:var(--t3);cursor:default}

/* ── PLANS ── */
.plview{flex:1;overflow-y:auto;padding:20px 16px 40px}
.plview-in{max-width:700px;margin:0 auto}
.plhead{text-align:center;margin-bottom:28px}
.plhead h1{
  font-family:var(--serif);font-style:italic;
  font-size:30px;letter-spacing:-.5px;color:var(--text);
  margin-bottom:6px;
}
.plhead p{font-size:14px;color:var(--t3);font-weight:400}
.plgrid{display:flex;flex-direction:column;gap:14px}
.plcard{
  background:var(--surface);border:1.5px solid var(--border);
  border-radius:18px;padding:22px;position:relative;
  transition:border-color .2s,transform .2s;
  animation:fadeUp .35s ease both;
}
.plcard:hover{transform:translateY(-1px)}
.plcard.feat{border-color:var(--purple);box-shadow:0 4px 24px var(--pglow)}
.plbadge{
  position:absolute;top:-11px;left:50%;transform:translateX(-50%);
  background:var(--purple);color:#fff;
  padding:3px 13px;border-radius:20px;
  font-size:11px;font-weight:700;letter-spacing:.4px;white-space:nowrap;
}
.pltop{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.plname{font-size:17px;font-weight:700;color:var(--text);letter-spacing:-.3px}
.plprice{font-size:28px;font-weight:800;color:var(--text);letter-spacing:-1.5px;line-height:1}
.plperiod{font-size:12px;color:var(--t3);margin-top:3px;text-align:right;font-weight:400}
.pldesc{font-size:13.5px;color:var(--t2);margin-bottom:16px;line-height:1.55}
.plfeat{list-style:none;display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
.pff{display:flex;align-items:center;gap:9px;font-size:13.5px}
.pff .material-symbols-rounded{font-size:16px;flex-shrink:0}
.pff.y{color:var(--t2)}.pff.y .material-symbols-rounded{color:var(--green)}
.pff.n{color:var(--t3)}.pff.n .material-symbols-rounded{color:var(--border2)}
.plcta{
  width:100%;padding:11px;border-radius:10px;border:none;
  font-family:var(--font);font-size:14px;font-weight:600;
  cursor:pointer;transition:all .15s;letter-spacing:-.1px;
}
.plcta.pri{background:var(--purple);color:#fff;box-shadow:0 3px 14px var(--pglow)}
.plcta.pri:hover{background:var(--ph)}
.plcta.out{background:transparent;border:1.5px solid var(--border);color:var(--t2)}
.plcta.out:hover{background:var(--s2);border-color:var(--border2)}
.plcta:disabled{opacity:.45;cursor:default}
.plnote{text-align:center;font-size:12px;color:var(--t3);margin-top:20px;line-height:1.65}
.plnote a{color:var(--purple);text-decoration:none;font-weight:500}
.plnote a:hover{text-decoration:underline}

/* ── GATE ── */
.gate{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  height:100dvh;padding:28px;text-align:center;gap:16px;background:var(--bg);
  animation:scaleIn .4s ease;
}
.gate-logo{width:56px;height:56px;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.gate-logo img{width:100%;height:100%;object-fit:contain}
.gate-title{font-family:var(--serif);font-style:italic;font-size:26px;color:var(--text);letter-spacing:-.4px}
.gate-msg{font-size:14px;color:var(--t2);max-width:280px;line-height:1.6}
.gate-browsers{display:flex;gap:10px}
.gate-br{
  display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:14px 20px;background:var(--s2);border-radius:var(--rsm);
  border:1.5px solid var(--border);font-size:12px;color:var(--t2);font-weight:600;min-width:86px;
}
.gate-br .material-symbols-rounded{font-size:28px;color:var(--purple)}
.gate-note{font-size:12px;color:var(--t3);max-width:260px;line-height:1.55}

/* Toast */
.toast{
  position:fixed;bottom:calc(80px + var(--sb));left:50%;transform:translateX(-50%);
  background:#18181b;color:#fff;padding:7px 15px;border-radius:20px;
  font-size:13px;font-weight:500;z-index:999;white-space:nowrap;
  pointer-events:none;animation:fadeUp .2s ease;
  box-shadow:0 4px 20px rgba(0,0,0,.2);
}

/* Overlay / Drawer */
.overlay{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.3);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .2s ease}
.drawer{
  position:fixed;bottom:0;left:0;right:0;z-index:51;
  background:var(--surface);border-radius:22px 22px 0 0;
  padding:6px 0 calc(16px + var(--sb));
  animation:slideUp .27s cubic-bezier(.32,1.2,.6,1);
  max-height:80vh;overflow-y:auto;
}
.dhandle{width:36px;height:4px;border-radius:2px;background:var(--border2);margin:8px auto 14px}
.dtitle{font-size:15px;font-weight:700;color:var(--text);padding:0 18px 12px;border-bottom:1px solid var(--border);letter-spacing:-.2px}
.ditem{display:flex;align-items:center;gap:12px;padding:13px 18px;cursor:pointer;transition:background .1s}
.ditem:active{background:var(--s2)}.ditem.on{background:var(--pdim)}
.diname{font-size:14px;font-weight:500;color:var(--text)}
.dimeta{font-size:11.5px;color:var(--t3);margin-top:2px}

.spacer{height:16px;flex-shrink:0}
.anch{height:1px}

/* ── RESPONSIVE ── */
@media (max-width: 768px) {
  .sidebar{display:none}
  .mob-nav{display:flex}
  .mob-bottom-nav{display:flex}
  .msgs-in{padding:14px 14px 8px}
  .ibar{padding:8px 12px;padding-bottom:calc(8px + var(--sb))}
  .bub{font-size:14px}
  .iwrap{gap:0}
  .toast{bottom:calc(var(--bottom-nav-h) + var(--sb) + 10px)}
}
@media (min-width: 769px) {
  .mob-nav{display:none}
  .mob-bottom-nav{display:none}
  .msgs-in{padding:24px 24px 8px}
  .ibar{padding:14px 24px;padding-bottom:14px}
}
`;

function injectCSS() {
  if (document.getElementById('w-css')) return;
  const s = document.createElement('style');
  s.id = 'w-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
injectCSS();

// ─── Logo cache ───────────────────────────────────────────────────────────────
async function cachedLogo() {
  try {
    if ('caches' in window) {
      const c = await caches.open('wayle-assets-v1');
      const hit = await c.match(LOGO_URL);
      if (hit) return URL.createObjectURL(await hit.blob());
      const res = await fetch(LOGO_URL);
      if (res.ok) { c.put(LOGO_URL, res.clone()); return URL.createObjectURL(await res.blob()); }
    }
  } catch {}
  return LOGO_URL;
}

// ─── Browser detection ────────────────────────────────────────────────────────
async function detectCaps() {
  const ua = navigator.userAgent;
  const isChromium = /Chrome/.test(ua) || /Edg\//.test(ua) || /OPR\//.test(ua);
  const isMobile = /Mobi|Android|iPhone|iPad/.test(ua);
  let hasWebGPU = false, gpuInfo = null;
  try {
    if (navigator.gpu) {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (a) {
        hasWebGPU = true;
        const info = await a.requestAdapterInfo().catch(() => ({}));
        gpuInfo = info?.description || info?.vendor || 'GPU active';
      }
    }
  } catch {}
  return {
    isChromium, isMobile, hasWebGPU, gpuInfo,
    hasSAB: typeof SharedArrayBuffer !== 'undefined',
    ram: navigator.deviceMemory || 4,
  };
}

// ─── Worker bridge ────────────────────────────────────────────────────────────
class InferenceWorker {
  constructor() { this.w = null; this.pending = new Map(); this.streams = new Map(); this.n = 0; }
  init() {
    this.w = new Worker('inference.worker.js');
    this.w.onmessage = ({ data }) => {
      const { type, id } = data;
      const req = this.pending.get(id);
      const st = this.streams.get(id);
      switch (type) {
        case 'load_progress': req?.onProgress?.(data); break;
        case 'load_done': req?.resolve(data); this.pending.delete(id); break;
        case 'load_error': req?.reject(new Error(data.error)); this.pending.delete(id); break;
        case 'token': st?.onToken(data.token, data.stats); break;
        case 'done': st?.onDone(data.stats); this.streams.delete(id); this.pending.delete(id); break;
        case 'generate_error': st?.onError(new Error(data.error)); this.streams.delete(id); this.pending.delete(id); break;
        case 'aborted': st?.onDone({aborted:true}); this.streams.delete(id); this.pending.delete(id); break;
        default: req?.resolve(data); this.pending.delete(id);
      }
    };
    this.w.onerror = e => console.error('Worker:', e);
  }
  send(type, payload, onProgress) {
    return new Promise((resolve, reject) => {
      const id = ++this.n;
      this.pending.set(id, { resolve, reject, onProgress });
      this.w.postMessage({ type, id, ...payload });
    });
  }
  generate(prompt, opts, { onToken, onDone, onError }) {
    const id = ++this.n;
    this.streams.set(id, { onToken, onDone, onError });
    this.pending.set(id, {});
    this.w.postMessage({ type:'generate', id, prompt, options:opts });
    return id;
  }
  abort(id) { this.w.postMessage({ type:'abort', id }); }
  loadModel(mid, onProgress) { return this.send('load_model', { modelId:mid }, onProgress); }
  resetKV() { return this.send('reset_kv', {}); }
  terminate() { this.w?.terminate(); }
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return '';
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```([\w]*)\n?([\s\S]*?)```/g,(_,l,c)=>`<pre class="code-block"><span class="code-lang">${l||'code'}</span><code>${c.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g,'<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m}</ul>`)
    .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br/>')
    .replace(/^(?!<[hupol])(.+)/,'<p>$1').replace(/([^>])$/,'$1</p>');
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="mbtn" title="Copy" onClick={()=>{ navigator.clipboard?.writeText(text); setOk(true); setTimeout(()=>setOk(false),1500); }}>
      <span className="material-symbols-rounded s14">{ok?'check':'content_copy'}</span>
    </button>
  );
}

// ─── Message ──────────────────────────────────────────────────────────────────
const Msg = React.memo(({ msg, logo, streaming }) => {
  const isUser = msg.role === 'user';
  const html = useMemo(() => md(msg.content), [msg.content]);
  return (
    <div className={`msg ${isUser?'user':'asst'}`}>
      <div className="mrow">
        {!isUser && (
          <div className="av asst-av">
            <img src={logo} alt="W"/>
          </div>
        )}
        <div className="bub"
          dangerouslySetInnerHTML={isUser?undefined:{__html:html+(streaming?'<span class="cursor"></span>':'')}}>
          {isUser?msg.content:undefined}
        </div>
        {isUser && (
          <div className="av user-av">
            <span className="material-symbols-rounded fill s14">person</span>
          </div>
        )}
      </div>
      {!streaming && (
        <div className="mmeta" style={{justifyContent:isUser?'flex-end':'flex-start',paddingLeft:isUser?0:36}}>
          <CopyBtn text={msg.content}/>
          {msg.tps && <span className="tpsbadge">{msg.tps.toFixed(1)} t/s</span>}
          <span className="mtime">{new Date(msg.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
      )}
    </div>
  );
});

function Typing({ logo }) {
  return (
    <div className="msg asst">
      <div className="mrow">
        <div className="av asst-av"><img src={logo} alt="W"/></div>
        <div className="bub"><div className="tdots"><span/><span/><span/></div></div>
      </div>
    </div>
  );
}

// ─── Family icon ──────────────────────────────────────────────────────────────
function FIcon({ family }) {
  const map = { qwen:'Q', llama:'L', phi:'Φ', mistral:'M' };
  const cls = { qwen:'fq', llama:'fl', phi:'fp', mistral:'fm' }[family] || 'fq';
  return <div className={`micon ${cls}`}>{map[family]||'?'}</div>;
}

// ─── Models view ──────────────────────────────────────────────────────────────
function ModelsView({ caps, currentModel, loadedModel, engineState, loadProgress, onLoad }) {
  const mobile = MODELS.filter(m => m.device === 'both');
  const desktop = MODELS.filter(m => m.device === 'desktop');

  function Card({ m }) {
    const loaded = loadedModel === m.id;
    const loading = engineState === 'loading' && currentModel?.id === m.id;
    const tc = TIER_COLOR[m.tier] || TIER_COLOR.small;
    return (
      <div className={`mcard ${loaded?'sel':''} ${loading?'loading-now':''}`} onClick={()=>!loading&&onLoad(m)}>
        <FIcon family={m.family}/>
        <div className="minfo">
          <div className="mname">{m.label}</div>
          <div className="mdesc">{m.description}</div>
          <div className="mtags">
            {m.tags.map(t=><span key={t} className="mtag" style={{background:tc.bg,color:tc.color}}>{t}</span>)}
            <span className="mtag" style={{background:'#f1f5f9',color:'#64748b'}}>{m.quantization}</span>
          </div>
        </div>
        <div className="mright">
          <span className="mram">{m.ramGB} GB</span>
          {loaded
            ? <span className="material-symbols-rounded mcheck fill">check_circle</span>
            : loading
              ? <div style={{width:16,height:16,borderRadius:'50%',border:'2px solid #d4c8fa',borderTopColor:'var(--purple)',animation:'spin .7s linear infinite'}}/>
              : <button className="mloadbtn" disabled={engineState==='loading'}>Load</button>
          }
        </div>
      </div>
    );
  }

  return (
    <div className="modview">
      <div className="modview-in">
        {caps && (
          <div className="hwbanner">
            <span className="material-symbols-rounded fill s15">memory</span>
            <div>
              <strong>{caps.gpuInfo||(caps.hasWebGPU?'WebGPU Active':'No WebGPU detected')}</strong>
              {' · '}{caps.ram} GB RAM · {caps.isMobile?'Mobile':'Desktop'}
              {caps.hasSAB&&' · SharedArrayBuffer ✓'}
            </div>
          </div>
        )}
        {engineState==='loading' && (
          <div className="loadprog">
            <div className="txt">
              <span className="material-symbols-rounded fill s14" style={{verticalAlign:'middle',marginRight:5,color:'var(--purple)'}}>downloading</span>
              {loadProgress.text}
            </div>
            <div className="bar"><div className="fill3" style={{width:`${loadProgress.percent}%`}}/></div>
          </div>
        )}
        <div className="stitle">Mobile-Ready</div>
        {mobile.map(m=><Card key={m.id} m={m}/>)}
        <div className="stitle">Desktop Models</div>
        {desktop.map(m=><Card key={m.id} m={m}/>)}
      </div>
    </div>
  );
}

// ─── Plans view ───────────────────────────────────────────────────────────────
function PlansView() {
  return (
    <div className="plview">
      <div className="plview-in">
        <div className="plhead">
          <h1>Choose your plan</h1>
          <p>Start free. Your device does the thinking.</p>
        </div>
        <div className="plgrid">
          {PLANS.map((p, i) => (
            <div key={p.id} className={`plcard ${p.featured?'feat':''}`} style={{animationDelay:`${i*.08}s`}}>
              {p.badge && <div className="plbadge">{p.badge}</div>}
              <div className="pltop">
                <div>
                  <div className="plname">{p.name}</div>
                  <div style={{fontSize:12,color:'var(--t3)',marginTop:2,fontWeight:400}}>{p.description}</div>
                </div>
                <div style={{textAlign:'right',flexShrink:0,marginLeft:16}}>
                  <div className="plprice">{p.price}</div>
                  <div className="plperiod">{p.period}</div>
                </div>
              </div>
              <ul className="plfeat">
                {p.features.map((f,j) => (
                  <li key={j} className={`pff ${f.included?'y':'n'}`}>
                    <span className="material-symbols-rounded fill s16">{f.included?'check_circle':'cancel'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <button className={`plcta ${p.id==='free'?'pri':'out'}`} disabled={!p.ctaActive}>{p.cta}</button>
            </div>
          ))}
        </div>
        <div className="plnote">
          All on-device inference is <strong>100% private</strong> — no data leaves your device.<br/>
          Cloud features require an account. <a href="#">Learn more →</a>
        </div>
      </div>
    </div>
  );
}

// ─── Chrome gate ──────────────────────────────────────────────────────────────
function Gate({ logo }) {
  return (
    <div className="gate">
      <div className="gate-logo"><img src={logo} alt="Wayle"/></div>
      <div className="gate-title">WebGPU Required</div>
      <p className="gate-msg">Wayle runs AI entirely on your device using WebGPU. Please open it in a supported browser.</p>
      <div className="gate-browsers">
        {[['public','Chrome'],['explore','Edge'],['open_in_new','Opera']].map(([ic,lb])=>(
          <div key={lb} className="gate-br">
            <span className="material-symbols-rounded fill">{ic}</span>{lb}
          </div>
        ))}
      </div>
      <p className="gate-note">Chrome 113+, Edge 113+, or Opera 99+. You may need to enable <code style={{fontSize:10,background:'#f4f4f5',padding:'1px 4px',borderRadius:4}}>chrome://flags/#enable-unsafe-webgpu</code></p>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ logo, view, setView, onNewChat }) {
  const tabs = [
    ['chat','chat_bubble','Chat'],
    ['models','memory','Models'],
    ['plans','diamond','Plans'],
  ];
  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href="#" onClick={e=>{e.preventDefault();setView('chat')}}>
        <img src={logo} alt="Wayle"/>
        <span className="sidebar-brand-name">Wayle</span>
      </a>
      <nav className="sidebar-nav">
        {tabs.map(([id,ic,lb])=>(
          <button key={id} className={`stab ${view===id?'on':''}`} onClick={()=>setView(id)}>
            <span className={`material-symbols-rounded ${view===id?'fill':''}`}>{ic}</span>
            {lb}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="new-chat-btn" onClick={onNewChat}>
          <span className="material-symbols-rounded">add_comment</span>
          New chat
        </button>
      </div>
    </aside>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [view, setView] = useState('chat');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [curModel, setCurModel] = useState(MODELS[1]);
  const [loadedModel, setLoadedModel] = useState(null);
  const [engState, setEngState] = useState('idle');
  const [loadProg, setLoadProg] = useState({ text:'', percent:0 });
  const [streaming, setStreaming] = useState(false);
  const [streamStats, setStreamStats] = useState(null);
  const [logo, setLogo] = useState(LOGO_URL);
  const [toast, setToast] = useState(null);
  const [caps, setCaps] = useState(null);
  const [gated, setGated] = useState(false);

  const wRef = useRef(null);
  const genIdRef = useRef(null);
  const taRef = useRef(null);
  const botRef = useRef(null);

  useEffect(() => {
    cachedLogo().then(setLogo);
    detectCaps().then(c => { setCaps(c); if (!c.hasWebGPU) setGated(true); });
    try { const w = new InferenceWorker(); w.init(); wRef.current = w; } catch {}
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
    return () => wRef.current?.terminate();
  }, []);

  const toast$ = useCallback((msg, ms=2800) => { setToast(msg); setTimeout(()=>setToast(null), ms); }, []);

  useEffect(() => {
    requestAnimationFrame(() => botRef.current?.scrollIntoView({ behavior:'smooth', block:'end' }));
  }, [msgs.length, streaming]);

  const resize = useCallback(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, []);

  const loadModel = useCallback(async (m) => {
    if (!wRef.current) return;
    setCurModel(m); setEngState('loading'); setLoadProg({ text:'Initializing…', percent:0 });
    try {
      await wRef.current.loadModel(m.id, p => setLoadProg({ text:p.text, percent:p.percent }));
      setLoadedModel(m.id); setEngState('ready'); toast$(`${m.label} loaded ✓`);
    } catch (e) {
      setEngState('error');
      if (e.message === 'NO_WEBGPU') setGated(true);
      else toast$(`Load failed: ${e.message}`);
    }
  }, [toast$]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (engState === 'idle') { setInput(''); await loadModel(curModel); }
    if (engState === 'loading') { toast$('Still loading — please wait'); return; }

    const uid = () => (crypto.randomUUID?.() || Math.random().toString(36));
    const userMsg = { role:'user', content:text, ts:Date.now(), id:uid() };
    setMsgs(prev => [...prev, userMsg]);
    setInput(''); if (taRef.current) taRef.current.style.height = 'auto';

    const aMsg = { role:'assistant', content:'', ts:Date.now(), id:uid() };
    setMsgs(prev => [...prev, aMsg]);
    setStreaming(true); setStreamStats(null);

    const genId = wRef.current.generate(text, { maxTokens:512, temperature:0.7, topP:0.9, topK:40 }, {
      onToken: (tok, stats) => {
        setStreamStats(stats);
        setMsgs(prev => { const c=[...prev]; const l=c[c.length-1]; if(l.role==='assistant') c[c.length-1]={...l,content:l.content+tok}; return c; });
      },
      onDone: (stats) => {
        setStreaming(false); genIdRef.current = null;
        setMsgs(prev => { const c=[...prev]; const l=c[c.length-1]; if(l.role==='assistant') c[c.length-1]={...l,tps:stats?.totalMs?(stats.totalTokens/stats.totalMs*1000):null}; return c; });
      },
      onError: (e) => {
        setStreaming(false); genIdRef.current = null; toast$(`Error: ${e.message}`);
        setMsgs(prev => { const c=[...prev]; const l=c[c.length-1]; if(l.role==='assistant'&&!l.content) c[c.length-1]={...l,content:'⚠️ Generation failed.'}; return c; });
      },
    });
    genIdRef.current = genId;
  }, [input, streaming, engState, curModel, loadModel, toast$]);

  const handleStop = () => { if (genIdRef.current) wRef.current?.abort(genIdRef.current); setStreaming(false); };
  const handleKey = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const canSend = input.trim().length > 0 && !streaming && engState !== 'loading';
  const onNewChat = () => { setMsgs([]); wRef.current?.resetKV(); setView('chat'); };

  const SUGGESTIONS = [
    'Explain transformers simply',
    'Write a haiku about code',
    "What's 17 × 23?",
    'Help me debug my app',
  ];

  if (gated) return <Gate logo={logo}/>;

  const ChatView = (
    <div className="chat">
      {/* Desktop model bar */}
      <div className="model-bar">
        <button className="mpill" onClick={()=>setView('models')}>
          <span className={`dot ${loadedModel?'':'off'}`}/>
          {loadedModel ? curModel.label : 'No model loaded'}
          <span className="material-symbols-rounded s14" style={{marginLeft:2,color:'var(--t3)'}}>expand_more</span>
        </button>
        {streamStats && streaming && <span className="tps">{streamStats.tokensPerSec?.toFixed(1)} t/s</span>}
        {engState==='loading' && (
          <div className="prog-sm">
            <div className="spinner16"/>
            <span>{loadProg.text}</span>
            <div className="track"><div className="fill2" style={{width:`${loadProg.percent}%`}}/></div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="msgs">
        <div className="msgs-in">
          {msgs.length===0 ? (
            <div className="welcome">
              <div className="welcome-logo"><img src={logo} alt="Wayle"/></div>
              <div className="wtitle">How can I help?</div>
              {caps?.hasWebGPU && (
                <div className="wgpu">
                  <span className="material-symbols-rounded fill" style={{fontSize:13}}>bolt</span>
                  WebGPU · {caps.gpuInfo||'GPU Ready'}
                </div>
              )}
              <div className="wsub">{loadedModel?`${curModel.label} · fully offline`:'Pick a model in the Models tab to start'}</div>
              <div className="chips">
                {SUGGESTIONS.map(s=>(
                  <button key={s} className="chip" onClick={()=>{setInput(s);taRef.current?.focus();}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {msgs.map((m,i)=>(
                <Msg key={m.id||i} msg={m} logo={logo}
                  streaming={streaming && i===msgs.length-1 && m.role==='assistant'}/>
              ))}
              {streaming && msgs[msgs.length-1]?.role!=='assistant' && <Typing logo={logo}/>}
            </>
          )}
          <div className="spacer"/>
          <div ref={botRef} className="anch"/>
        </div>
      </div>

      {/* Input */}
      <div className="ibar">
        <div className="iwrap">
          <div className="ibox">
            <textarea ref={taRef} value={input}
              onChange={e=>{setInput(e.target.value);resize();}}
              onKeyDown={handleKey}
              placeholder={loadedModel?'Message Wayle…':'Load a model to start chatting…'}
              rows={1} disabled={streaming} autoComplete="off" autoCorrect="on" spellCheck/>
            {streaming
              ? <button className="sbtn stop" onClick={handleStop} title="Stop">
                  <span className="material-symbols-rounded fill s18">stop</span>
                </button>
              : <button className="sbtn" onClick={handleSend} disabled={!canSend} title="Send">
                  {engState==='loading'
                    ? <div className="spspin"/>
                    : <span className="material-symbols-rounded fill s18">arrow_upward</span>
                  }
                </button>
            }
          </div>
          <div className="ihint">Wayle runs 100% on your device · no data leaves your browser</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Desktop sidebar */}
      <Sidebar logo={logo} view={view} setView={setView} onNewChat={onNewChat}/>

      {/* Right side: mobile nav + content + bottom nav */}
      <div className="main">
        <div className="mob-nav">
          <div className="mob-nav-brand">
            <img src={logo} alt="Wayle"/>
            <span>Wayle</span>
          </div>
          <button className="ibtn" onClick={onNewChat} title="New chat">
            <span className="material-symbols-rounded s18">add_comment</span>
          </button>
        </div>
        <div className="content">
          {view==='chat' && ChatView}
          {view==='models' && (
            <ModelsView caps={caps} currentModel={curModel} loadedModel={loadedModel}
              engineState={engState} loadProgress={loadProg}
              onLoad={m=>{ loadModel(m); setView('chat'); }}/>
          )}
          {view==='plans' && <PlansView/>}
        </div>

        {/* Mobile bottom nav */}
        <nav className="mob-bottom-nav">
          {[['chat','chat_bubble','Chat'],['models','memory','Models'],['plans','diamond','Plans']].map(([id,ic,lb])=>(
            <button key={id} className={`mbtab ${view===id?'on':''}`} onClick={()=>setView(id)}>
              <span className={`material-symbols-rounded ${view===id?'fill':''}`}>{ic}</span>
              {lb}
            </button>
          ))}
        </nav>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
