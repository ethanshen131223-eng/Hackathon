export const SHORE_THEME=`
:host { display:block; font-family:'DM Sans',sans-serif; color:#12384d; --sand:#f3dfb0; --sand-deep:#d9b882; --ocean:#168b9b; --ocean-deep:#17578e; --ink:#12384d; --card:#fff; --accent:#187f97; }
* { box-sizing:border-box; } [hidden] { display:none!important; }
button,input,select { font:inherit; } button { min-height:42px; } :focus-visible { outline:3px solid #ef9e45; outline-offset:3px; }
.shore-app { padding:0; } header { display:block; margin:0 0 18px; }
.stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
.stat { min-width:0; padding:13px 16px; border:1px solid #d3e6ed; border-radius:12px; background:linear-gradient(135deg,#fff,#eef8fc); box-shadow:none; backdrop-filter:none; }
.stat .label { font-size:14px; text-transform:none; letter-spacing:0; color:#5b7483; opacity:1; margin-bottom:5px; }
.stat .value { font-family:Manrope,sans-serif; font-size:20px; font-weight:800; line-height:1.25; }
.stat.money .value { color:#176881; } .stat.combo .value { color:#b16c38; }
.run-details { margin-top:10px; } summary { cursor:pointer; color:#456e80; font-size:14px; padding:8px 0; } .stats-secondary { margin-top:10px; grid-template-columns:repeat(3,minmax(0,1fr)); } .stats-secondary .stat { padding:9px 12px; } .stats-secondary .value { font-size:16px; }
.main { gap:22px; align-items:stretch; } .stage { flex:1; }
.canvas-wrap { border:1px solid #c5e0e9; border-radius:18px; background:#cfe9f4; box-shadow:0 8px 26px #194c6212; }
canvas { display:block; width:100%; height:auto; border-radius:17px; cursor:crosshair; }
.primary-controls { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
.primary-controls .hint { font-size:14px; color:#527489; } .primary-controls .buttons { display:flex; gap:8px; }
.btn,.buy,.hatch-btn,.modal .choice,.modal .start,.pet-row button,.modal .tab { border-radius:8px; box-shadow:none; font-family:'DM Sans',sans-serif; min-height:40px; font-size:14px; }
.btn { background:#edf6fb; border:1px solid #cfe2eb; padding:8px 13px; color:#245f77; }
.btn:hover { background:#dceef7; transform:none; }.btn:active { transform:none; }
.activities { margin-top:12px; } .stage-bar { display:block; margin:0; opacity:1; font-size:14px; }.stage-bar > span:first-child { display:block; color:#567887; line-height:1.7; margin:0 0 10px; }.stage-bar > span:last-child { display:flex; flex-wrap:wrap; gap:7px; }
.stage-bar kbd { font-size:13px; background:#fff; color:#365e74; border-color:#c7dbe6; padding:2px 5px; }
.shop { flex:0 0 305px; width:305px; max-height:660px; border:1px solid #d0e4ec; border-radius:16px; background:#fff; padding:18px; box-shadow:none; }
.shop h2 { font-family:Manrope,sans-serif; font-size:19px; margin-bottom:6px; }.shop .sub { font-size:13px; line-height:1.5; opacity:1; color:#607d8b; margin-bottom:15px; }
.shop-tabs { display:flex; gap:5px; margin-bottom:16px; border-bottom:1px solid #dceaf0; padding-bottom:9px; }.shop-tabs button { flex:1; border:0; border-radius:7px; padding:7px 5px; font-size:13px; color:#5a7c8c; background:transparent; }.shop-tabs [aria-selected=true] { background:#e6f5f7; color:#176b7c; font-weight:700; }
.card { border:1px solid #dce9ee; background:#fff; padding:12px; border-radius:11px; margin-bottom:10px; transition:none; }.card.afford { border-color:#73bdb3; box-shadow:none; }.card.maxed { border-color:#a2cebb; background:#f0f9f3; }
.card .name { font-size:14px; }.card .lvl { font-size:12px; opacity:1; color:#6f8793; }.card .desc { font-size:13px; line-height:1.5; color:#5e7987; opacity:1; margin:8px 0; }.card .icon { font-size:22px; }
.pips { gap:4px; margin-top:10px; }.pip { height:4px; background:#e0ebef; }
.buy,.hatch-btn,.modal .start,.choice.yes { background:linear-gradient(115deg,#246cba,#168f96); color:white; border:0; box-shadow:none; padding:9px 14px; font-weight:700; }.buy:disabled,.hatch-btn:disabled { background:#e7eef2; color:#7c919b; }.card.maxed .buy { background:#5b9c83; }
.hatch,.quests,.petbox { padding:13px; border:1px solid #d6e8ec; background:linear-gradient(135deg,#eff8fe,#f0f9f6); border-radius:11px; }.hatch-title,.petbox h3,.quests h3 { font-size:14px; color:#245e74; }.hatch-info { font-size:13px; line-height:1.6; color:#567383; opacity:1; }.egg-select { font-size:14px; border:1px solid #c9dce5; min-height:42px; }
.quest,.pet-row,.small-note,.rec-list,.ach { font-size:13px; line-height:1.5; opacity:1; }.small-note { color:#617c89; }.pet-row { flex-wrap:wrap; gap:6px; }.pet-row button { min-height:36px; font-size:12px; }.pet-row .pick { background:#e5f1f8; color:#315f76; }.pet-row .pick.on { background:#227e94; color:white; }.pet-row .merge { background:#bb774b; }
.modal { font-family:'DM Sans',sans-serif; text-align:left; background:#fffffff7; border:1px solid #d1e7ef; color:#12384d; padding:24px 28px; width:min(94%,460px); max-width:460px; max-height:94%; overflow:auto; box-shadow:0 12px 40px #0a314d38; border-radius:17px; }
.modal h2 { font-family:Manrope,sans-serif; font-size:23px; letter-spacing:-.04em; }.modal p { font-size:14px; line-height:1.65; color:#506e80; margin:9px 0; }.modal .big { font-size:30px; margin-bottom:8px; }.modal .choices { flex-wrap:wrap; gap:8px; justify-content:flex-start; }.modal .start { margin-top:13px; }.modal .choice.no { background:#eaf3f8; color:#315d74; }.modal .tabs { justify-content:flex-start; }
.overlay { background:#113f5a70; backdrop-filter:blur(2px); }.overlay.hidden { display:none; }
.ach-grid { grid-template-columns:1fr 1fr; }.rec-list b { color:#226f85; }
@media(max-width:1000px) { .main { flex-direction:column; }.shop { flex:auto; width:100%; max-height:none; }.shop-pane:not([hidden]) #shop-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }.card { margin:0; } }
@media(max-width:560px) { .stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }.stat { padding:11px 12px; }.stat .value { font-size:18px; }.stats-secondary { grid-template-columns:repeat(2,minmax(0,1fr)); }.primary-controls .hint { width:100%; }.shop-pane:not([hidden]) #shop-list { grid-template-columns:1fr; }.modal { padding:17px 18px; max-height:96%; }.modal h2 { font-size:19px; }.modal p { font-size:13px; line-height:1.45; }.modal .big { display:none; }.modal .start { margin-top:6px; }.shop { padding:16px; } }
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }
`;
