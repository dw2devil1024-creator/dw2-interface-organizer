/* DW2 · Interface Organizer | Private-use beta
 * Owns only three surfaces: native hamburger menu, magic-wand entries, and
 * the outer layout of the native Extensions settings drawer.
 * It does NOT edit chat, presets, world books, regex rules, or API data.
 */
const STORE = 'dw2InterfaceOrganizer';
const ROOT_ID = 'dw2io-dialog';
const MENU_ITEM_ID = 'dw2io-menu-entry';
const SETTINGS_ID = 'dw2io-settings';
const EXTRA_ID = 'dw2io-more-menu';
const EXT_HEADER_ID = 'dw2io-ext-more';
const VERSION = '0.1.0-beta.1';

const NATIVE_MENU = [
  ['option_toggle_AN', '作者注释'],
  ['option_toggle_CFG', 'CFG 缩放'],
  ['option_toggle_logprobs', 'Token 概率'],
  ['option_convert_to_group', '转换为群聊'],
  ['option_impersonate', 'AI 帮答'],
];
const DEFAULTS = Object.freeze({
  enabled: true,
  menuEnabled: true,
  menuFolded: NATIVE_MENU.map(pair => pair[0]),
  wandEnabled: true,
  wandHidden: [],
  extensionsEnabled: true,
  extensionsFolded: [],
  extensionsExpanded: false,
});
const allowedKeys = Object.keys(DEFAULTS);
let active = false, state = null, mounted = false, retries = 0, busy = false;
let ctx = null, overlay = null, settingsEntry = null, menuEntry = null;
let menuBox = null, menuPlan = '', menuExpanded = false;
let extParent = null, extMore = null;
let wandHidden = new Set(), extHidden = new Set();
const moved = new Map();
const observed = new Map();
const cleanup = [];
const openParts = new Set(['menu', 'wand', 'extensions']);
let refreshTimer = 0;

const $ = (s, base=document) => base.querySelector(s);
const byId = id => document.getElementById(id);
const el = (tag, className='', label) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (label != null) e.textContent = label;
  return e;
};
const defer = callback => { const id = setTimeout(callback,0); return id; };
function normalize(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = { ...DEFAULTS };
  for (const key of allowedKeys) {
    const fallback = DEFAULTS[key];
    if (Array.isArray(fallback)) out[key] = [...new Set((Array.isArray(raw[key]) ? raw[key] : fallback).filter(x => typeof x === 'string' && x.length < 240))].slice(0,400);
    else out[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  }
  return out;
}
function save(patch) {
  state = normalize({ ...state, ...patch });
  const latest = globalThis.SillyTavern?.getContext?.() || ctx;
  if (latest?.extensionSettings) {
    latest.extensionSettings[STORE] = state;
    latest.saveSettingsDebounced?.();
  }
  scan();
  if (overlay) renderPanel();
}
function tryLoadState() {
  ctx = globalThis.SillyTavern?.getContext?.() || null;
  if (!ctx?.extensionSettings) return false;
  state = normalize(ctx.extensionSettings[STORE]);
  ctx.extensionSettings[STORE] = state;
  return true;
}
function safeLabel(node) {
  return String(node?.querySelector?.('b,strong,span')?.textContent || node?.textContent || node?.getAttribute?.('title') || '')
    .replace(/\s+/g,' ').trim().slice(0,65);
}
function button(text, callback, cls='') {
  const b = el('button','dw2io-button '+cls,text);
  b.type = 'button'; b.addEventListener('click',callback); return b;
}
function checkbox(text, checked, callback, description='') {
  const row = el('label','dw2io-check');
  const input = el('input'); input.type = 'checkbox'; input.checked = !!checked;
  input.addEventListener('change',() => callback(input.checked));
  const span = el('span','dw2io-check-copy'); span.append(el('span','',text));
  if (description) span.append(el('small','',description));
  row.append(input,span);return row;
}
function notify(message) {
  if (globalThis.toastr?.info) globalThis.toastr.info(message,'DW2 · 界面整理');
}

// ---------- Surface 1: original native hamburger items ----------
// We move the SAME original elements; native click handlers and listeners survive.
// A placeholder records each original position and makes disable reversible.
function restoreMenu() {
  for (const [item, placeholder] of moved) {
    if (placeholder.isConnected) placeholder.replaceWith(item);
    placeholder.remove();
  }
  moved.clear(); menuBox?.remove(); menuBox = null; menuPlan='';
}
function updateMoreButton() {
  if (!menuBox) return;
  const trigger = $('.dw2io-more-trigger',menuBox);
  const content = $('.dw2io-more-body',menuBox);
  const isOpen = menuExpanded;
  content.hidden = !isOpen;
  trigger.setAttribute('aria-expanded',String(isOpen));
  trigger.textContent = isOpen ? '收起更多工具 ▴' : `更多工具（${moved.size}） ▾`;
}
function applyMenu() {
  const root = $('#options .options-content');
  const ids = state.enabled && state.menuEnabled ? state.menuFolded.filter(id=>NATIVE_MENU.some(pair=>pair[0]===id)) : [];
  const available = ids.map(id=>byId(id)).filter(item=>item && root?.contains(item));
  const wanted = root && available.length ? available.map(item=>item.id).join('|') + ':' + (root.id || 'options') : '';
  if (menuBox?.parentElement === root && wanted === menuPlan && moved.size === available.length) return;
  restoreMenu();
  if (!root || !available.length) return;
  menuBox = el('div','dw2io-more'); menuBox.id=EXTRA_ID;
  const trigger = button('',()=>{ menuExpanded=!menuExpanded;updateMoreButton(); },'dw2io-more-trigger');
  trigger.setAttribute('aria-controls','dw2io-more-body');
  const content = el('div','dw2io-more-body'); content.id='dw2io-more-body';
  menuBox.append(trigger,content); root.append(menuBox);
  for (const item of available) {
    const original = document.createComment('DW2 original menu position');
    item.before(original); moved.set(item,original); content.append(item);
  }
  menuPlan = wanted; updateMoreButton();
}

// ---------- Surface 2: wand entry visibility ----------
const keyFor = (e, context) => e.id ? 'id:'+e.id : context+':'+(e.dataset?.extension || e.getAttribute('title') || safeLabel(e));
function listWand() {
  const root = byId('extensionsMenu'); if (!root) return [];
  const found = [], seen = new Map();
  for (const outer of root.children) {
    if (outer.matches('script,style,hr,template,input,textarea,select')) continue;
    const entries = outer.classList.contains('extension_container') ? [...outer.children] : [outer];
    for (const e of entries) {
      if (e.matches('script,style,hr,template,input,textarea,select')) continue;
      // Do not hide whole containers that contain settings inputs.
      if (e.querySelector('input,textarea,select') && !e.matches('button,a,[role="menuitem"],.list-group-item')) continue;
      const label = safeLabel(e); if (!label) continue;
      const stem = keyFor(e,'wand');
      const count = (seen.get(stem)||0)+1;seen.set(stem,count);
      found.push({key:stem+(count>1?':'+count:''),label,element:e,wrapper:outer});
    }
  }
  return found;
}
function clearWand() {
  for (const node of wandHidden) node.classList.remove('dw2io-wand-hidden');
  wandHidden.clear();
}
function applyWand(choices) {
  const next=new Set();
  if (state.enabled && state.wandEnabled) {
    for (const c of choices) if (state.wandHidden.includes(c.key)) next.add(c.element);
  }
  for(const node of wandHidden) if(!next.has(node)) node.classList.remove('dw2io-wand-hidden');
  for(const node of next) node.classList.add('dw2io-wand-hidden');
  wandHidden = next;
}

// ---------- Surface 3: extension drawer's outer columns ONLY ----------
function listExtensionSettings() {
  const found=[];let i=0;
  for (const id of ['extensions_settings','extensions_settings2']) {
    const root=byId(id); if (!root) continue;
    for (const item of root.children) {
      if (item.id === SETTINGS_ID || item.id === EXT_HEADER_ID || item.matches('script,style,link,template')) continue;
      const header = $('.inline-drawer-header',item) || (item.matches('.inline-drawer-header')?item:null);
      if(!header) continue;
      const label=safeLabel(header) || '扩展设置 '+(++i);
      found.push({key:keyFor(item,'extension'),label,element:item,root});
    }
  }
  // Distinguish two unnamed items without changing their native IDs.
  const dupes=new Map();
  return found.map(item=>{const n=(dupes.get(item.key)||0)+1;dupes.set(item.key,n);return {...item,key:item.key+(n>1?':'+n:'')};});
}
function resetExtensionLayout() {
  for(const item of extHidden) item.classList.remove('dw2io-ext-low','dw2io-ext-invisible');
  extHidden.clear();
  extParent?.classList.remove('dw2io-ext-layout');
  extParent=null;extMore?.remove();extMore=null;
}
function syncExtensionLayout(choices) {
  const a=byId('extensions_settings'),b=byId('extensions_settings2');
  const parent=a?.parentElement;
  const valid=!!(a && b && parent && b.parentElement === parent && parent.matches('.extensions_block,#rm_extensions_block'));
  if (!state.enabled || !state.extensionsEnabled || !valid) {resetExtensionLayout();return;}
  if (extParent !== parent) {resetExtensionLayout();extParent=parent;parent.classList.add('dw2io-ext-layout');}
  const selected=choices.filter(x=>state.extensionsFolded.includes(x.key));
  const next = new Set(selected.map(x=>x.element));
  for(const node of extHidden) if(!next.has(node)) node.classList.remove('dw2io-ext-low','dw2io-ext-invisible');
  for(const node of next){node.classList.add('dw2io-ext-low');node.classList.toggle('dw2io-ext-invisible',!state.extensionsExpanded);}
  extHidden=next;
  if (!selected.length) {extMore?.remove();extMore=null;return;}
  if(!extMore || extMore.parentElement!==parent){
    extMore?.remove();extMore=button('',()=>save({extensionsExpanded:!state.extensionsExpanded}),'dw2io-ext-more');
    extMore.id=EXT_HEADER_ID;parent.prepend(extMore);
  }
  extMore.setAttribute('aria-expanded',String(state.extensionsExpanded));
  extMore.textContent=(state.extensionsExpanded?'▴ 收起低频扩展设置':'▾ 更多扩展设置')+`（${selected.length}）`;
}

// ---------- Scan only native menus/settings (never observe chat messages) ----------
function scheduleScan() {
  if (!active || busy || refreshTimer) return;
  refreshTimer=defer(()=>{refreshTimer=0;scan();});
}
function watch(root) {
  if (!root || observed.has(root)) return;
  const observer = new MutationObserver(records => {
    if (records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1 && !n.id?.startsWith('dw2io-') && !n.classList?.contains('dw2io-more')))) scheduleScan();
  });
  observer.observe(root,{childList:true,subtree:false});observed.set(root,observer);
}
function scan() {
  if (!active || busy || !state) return;
  busy=true;
  try {
    attachAccessPoints();
    const menu=$('#options .options-content');
    watch(menu);watch(byId('extensionsMenu'));
    watch(byId('extensions_settings'));watch(byId('extensions_settings2'));
    applyMenu();
    const wand=listWand(),extensions=listExtensionSettings();
    applyWand(wand);syncExtensionLayout(extensions);
    for(const observer of observed.values())observer.takeRecords();
  } catch(error) {
    console.error('[DW2 Interface Organizer] scan failed',error);
  } finally {busy=false;}
}
function mountRetry() {
  if (!active) return;
  if(!state && !tryLoadState()){
    if(retries++<28) { const t=setTimeout(mountRetry,500);cleanup.push(()=>clearTimeout(t)); }
    return;
  }
  scan();
  if(retries++<8) { const t=setTimeout(mountRetry,900);cleanup.push(()=>clearTimeout(t)); }
}
function attachAccessPoints() {
  const menu=$('#options .options-content');
  if(menu && (!menuEntry || !menuEntry.isConnected)){
    menuEntry=button('⚙ 界面整理',openPanel,'dw2io-entry');menuEntry.id=MENU_ITEM_ID;
    menu.prepend(menuEntry);
  }
  const root=byId('extensions_settings2') || byId('extensions_settings');
  if(root && (!settingsEntry || !settingsEntry.isConnected)){
    settingsEntry=el('div','extension_container dw2io-settings'); settingsEntry.id=SETTINGS_ID;
    const head=el('div','inline-drawer');
    const label=button('DW2 · 界面整理  ·  打开设置',openPanel,'dw2io-extension-launch');
    head.append(label);settingsEntry.append(head);root.append(settingsEntry);
  }
}
function openPanel(){
  if(!state || overlay)return;
  overlay=el('div','dw2io-backdrop');overlay.id=ROOT_ID;
  const dialog=el('section','dw2io-panel');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','dw2io-title');
  const head=el('div','dw2io-head');
  const info=el('div');info.append(el('div','dw2io-overline','DW2 · PERSONAL TOOLS'),el('h2','', '界面整理'));
  info.lastChild.id='dw2io-title';
  head.append(info,button('×',closePanel,'dw2io-close'));
  const body=el('div','dw2io-scroll');body.id='dw2io-panel-content';
  dialog.append(head,body);overlay.append(dialog);document.body.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closePanel();});
  renderPanel();
}
function closePanel(){ overlay?.remove();overlay=null; }
function renderPanel(){
  if(!overlay)return;
  const root=$('#dw2io-panel-content',overlay);if(!root)return;
  const pos=root.scrollTop;root.replaceChildren();
  root.append(el('p','dw2io-lead','只整理三个入口区域。隐藏 ≠ 停用插件；预设、正则、世界书、用户设置都不修改。'));
  root.append(checkbox('启用界面整理',state.enabled,v=>save({enabled:v})));
  const actions=el('div','dw2io-actions');
  actions.append(button('重新识别',()=>{scan();renderPanel();notify('已重新扫描入口');}),button('恢复原界面',()=>{
    save({enabled:false,menuFolded:[],wandHidden:[],extensionsFolded:[],extensionsExpanded:false});
    notify('已关闭整理并恢复所有入口');
  },'dw2io-quiet'));root.append(actions);
  const section=(key,title,desc)=>{
    const s=el('div','dw2io-section');
    const toggle=button((openParts.has(key)?'▾ ':'▸ ')+title,()=>{
      if(openParts.has(key)) openParts.delete(key);else openParts.add(key);
      renderPanel();
    },'dw2io-section-toggle');
    const hint=el('p','dw2io-hint',desc);s.append(toggle,hint);
    const inner=el('div','dw2io-section-body');if(!openParts.has(key))inner.hidden=true;
    s.append(inner);root.append(s);return inner;
  };
  const mb=section('menu','01 · 三横菜单','把原生低频项收进「更多工具」，仍然点击原按钮。');
  mb.append(checkbox('启用「更多工具」',state.menuEnabled,v=>save({menuEnabled:v})));
  for(const [id,label] of NATIVE_MENU){
    mb.append(checkbox('收纳 · '+label,state.menuFolded.includes(id),v=>{
      const next=new Set(state.menuFolded);v?next.add(id):next.delete(id);save({menuFolded:[...next]});
    },byId(id)?'已识别原生按钮':'当前页面未找到，仍可预设选择'));
  }
  const wb=section('wand','02 · 魔法棒入口','勾选要隐藏的入口，隐藏只影响可见性，不关闭插件。');
  wb.append(checkbox('启用魔法棒整理',state.wandEnabled,v=>save({wandEnabled:v})));
  const wand=listWand();
  if(!wand.length) wb.append(el('p','dw2io-muted','尚未识别入口。先展开一次魔法棒，再点「重新识别」。'));
  for(const c of wand) wb.append(checkbox('隐藏 · '+c.label,state.wandHidden.includes(c.key),v=>{
    const next=new Set(state.wandHidden);v?next.add(c.key):next.delete(c.key);save({wandHidden:[...next]});
  }));
  const eb=section('extensions','03 · 扩展设置收纳','外层单列排版；勾选低频设置后统一收进「更多扩展设置」。不改变正则卡片内部。');
  eb.append(checkbox('启用扩展页单列与收纳',state.extensionsEnabled,v=>save({extensionsEnabled:v})));
  const extensions=listExtensionSettings();
  if(!extensions.length)eb.append(el('p','dw2io-muted','未识别标准扩展设置布局；未知布局会保留原样。'));
  for(const c of extensions)eb.append(checkbox('收纳 · '+c.label,state.extensionsFolded.includes(c.key),v=>{
    const next=new Set(state.extensionsFolded);v?next.add(c.key):next.delete(c.key);save({extensionsFolded:[...next]});
  }));
  root.append(el('p','dw2io-foot',`DW2 · Interface Organizer ${VERSION} · 私用测试版 · 不自动更新`));
  root.scrollTop=pos;
}
function onKey(event){if(event.key==='Escape'&&overlay)closePanel();}
function onClick(event) {
  if(event.target.closest?.('#options_button,#extensionsMenuButton,#extensions-settings-button,#extensionsMenuButton')) scheduleScan();
}
function onReady(){scheduleScan();}
export function onEnable(){
  if(active)return;active=true;retries=0;tryLoadState();
  document.addEventListener('keydown',onKey);
  document.addEventListener('click',onClick,true);
  window.addEventListener('load',onReady);
  cleanup.push(()=>document.removeEventListener('keydown',onKey),()=>document.removeEventListener('click',onClick,true),()=>window.removeEventListener('load',onReady));
  const context=globalThis.SillyTavern?.getContext?.();
  for(const eventName of ['APP_READY','MAIN_API_CHANGED']){
    const event=context?.eventTypes?.[eventName] || context?.event_types?.[eventName];
    if(context?.eventSource?.on && event){context.eventSource.on(event,onReady);cleanup.push(()=>context.eventSource.off?.(event,onReady));}
  }
  mountRetry();
}
export function onDisable(){
  if(!active)return;active=false;
  clearTimeout(refreshTimer);refreshTimer=0;
  closePanel();restoreMenu();clearWand();resetExtensionLayout();
  menuEntry?.remove();settingsEntry?.remove();menuEntry=settingsEntry=null;
  for(const observer of observed.values()) observer.disconnect();observed.clear();
  for(const fn of cleanup.splice(0))fn();
  state=null;ctx=null;mounted=false;
}
if(globalThis.SillyTavern?.getContext)onEnable();
else window.addEventListener('load',onEnable,{once:true});
