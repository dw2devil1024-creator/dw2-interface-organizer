import { extensionTypes, openThirdPartyExtensionMenu } from '../../../extensions.js';
import { getRequestHeaders } from '../../../../script.js';
/* DW2 · Interface Organizer | Private-use beta
 * Owns only three surfaces: native hamburger menu, magic-wand entries, and
 * the outer layout of the native Extensions settings drawer.
 * It does NOT edit chat, presets, world books, regex rules, or API data.
 */
const STORE = 'dw2InterfaceOrganizer';
const ROOT_ID = 'dw2io-dialog';
const WAND_MORE_ID = 'dw2io-wand-more';
const SETTINGS_ID = 'dw2io-settings';
const EXTRA_ID = 'dw2io-more-menu';
const EXT_HEADER_ID = 'dw2io-ext-more';
const VERSION = '0.1.2-beta.1';

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
  wandExpanded: false,
  extensionsEnabled: true,
  extensionsFolded: [],
  extensionsExpanded: false,
  foldExtras: true,
});
const allowedKeys = Object.keys(DEFAULTS);
let active = false, state = null, retries = 0, busy = false;
let ctx = null, overlay = null, settingsEntry = null, wandMore = null;
let menuBox = null, menuBody = null, menuPlan = '', menuExpanded = false;
let extParent = null, extMore = null;
const extOrders = new Map();
let extExtraNodes = new Set();
let extHidden = new Set(), wandBody = null;
const wandMoved = new Map();
const wandHolders = new Map();
const wandEmptyWrappers = new Set();
const moved = new Map();
const observed = new Map();
const cleanup = [];
const openParts = new Set(['menu', 'wand', 'extensions']);
let refreshTimer = 0;
let updateInProgress = false;

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
function notify(message,kind='info') {
  if(globalThis.toastr?.[kind])globalThis.toastr[kind](String(message),'DW2 · 界面整理');
  else console[kind==='warning'?'warn':'info']('[DW2 Interface Organizer]',message);
}

// ---------- Surface 1: original native hamburger items ----------
// We move the SAME original elements; native click handlers and listeners survive.
// A placeholder records each original position and makes disable reversible.
function restoreMenu() {
  for (const [item, placeholder] of moved) {
    if (placeholder.isConnected) placeholder.replaceWith(item);
    placeholder.remove();
  }
  moved.clear();
  menuBox?.remove(); menuBody?.remove();
  menuBox = menuBody = null;
  menuPlan = '';
}
function updateMoreButton() {
  if (!menuBox || !menuBody) return;
  menuBody.hidden = !menuExpanded;
  menuBox.setAttribute('aria-expanded',String(menuExpanded));
  const ico=el('i','fa-solid fa-ellipsis fa-lg');
  ico.setAttribute('aria-hidden','true');
  menuBox.replaceChildren(ico,el('span','',menuExpanded?'收起更多工具 ▴':`更多工具（${moved.size}） ▾`));
}
function applyMenu() {
  const root = $('#options .options-content');
  const ids = state.enabled && state.menuEnabled
    ? state.menuFolded.filter(id=>NATIVE_MENU.some(pair=>pair[0]===id)) : [];
  const available = ids.map(id=>byId(id)).filter(item=>item && root?.contains(item));
  const wanted = root && available.length ? available.map(item=>item.id).join('|') : '';
  if (menuBox?.parentElement===root && menuBody?.parentElement===root
      && wanted===menuPlan && moved.size===available.length) return;
  restoreMenu();
  if (!root || !available.length) return;
  // Direct child like native TT menu items: allow active theme rules to style it.
  const native=available.find(item=>item.matches('a,button')) || root.querySelector('a,button');
  menuBox=el('a',native?.className || 'interactable');
  menuBox.id=EXTRA_ID;
  menuBox.classList.add('dw2io-more-trigger');
  menuBox.setAttribute('role','button');menuBox.tabIndex=0;
  menuBox.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    menuExpanded=!menuExpanded;updateMoreButton();
  });
  menuBox.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();menuBox.click();}
  });
  menuBody=el('div','dw2io-more-body');
  menuBody.id='dw2io-more-body';
  root.append(menuBox,menuBody);
  for(const item of available){
    const original=document.createComment('DW2 original menu position');
    item.before(original);moved.set(item,original);menuBody.append(item);
  }
  menuPlan=wanted;updateMoreButton();
}
// ---------- Surface 2: wand entry visibility ----------
const keyFor = (e, context) => e.id ? 'id:'+e.id : context+':'+(e.dataset?.extension || e.getAttribute('title') || safeLabel(e));
function listWand() {
  const root = byId('extensionsMenu'); if (!root) return [];
  const found = [], seen = new Map();
  for (const outer of root.children) {
    if (outer.id === WAND_MORE_ID || outer.id === 'dw2io-wand-body' || outer.matches('script,style,hr,template,input,textarea,select')) continue;
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
  // Entries currently inside our folded body still belong to the wand inventory.
  // Keep the original key stable while the DOM node is moved.
  const keys=new Set(found.map(c=>c.key));
  for(const entry of wandMoved.values()){
    const c=entry.choice;
    if(c.element.isConnected && root.contains(c.element) && !keys.has(c.key)){
      found.push(c);keys.add(c.key);
    }
  }
  return found;
}
function restoreWandItem(node,record){
  if(record.marker.parentNode)record.marker.replaceWith(node);
  else node.remove(); // The original plugin rebuilt or removed its source container.
  record.marker.remove();
  wandMoved.delete(node);
}
function clearWand(){
  for(const [node,record] of [...wandMoved])restoreWandItem(node,record);
  for(const node of wandEmptyWrappers)node.classList.remove('dw2io-wand-empty');
  wandEmptyWrappers.clear();
  for(const holder of wandHolders.values())holder.remove();
  wandHolders.clear();
  wandBody?.remove();wandBody=null;
  wandMore?.remove();wandMore=null;
}
function ensureWandMore(root){
  if(wandMore?.parentElement===root && wandBody?.parentElement===root)return;
  // On native menu replacement, restore before constructing a new section.
  clearWand();
  wandMore=el('a','interactable dw2io-wand-more');
  wandMore.id=WAND_MORE_ID;
  wandMore.setAttribute('role','button');wandMore.tabIndex=0;
  wandBody=el('div','dw2io-wand-body');
  wandBody.id='dw2io-wand-body';
  wandMore.setAttribute('aria-controls',wandBody.id);
  wandMore.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    save({wandExpanded:!state.wandExpanded});
  });
  wandMore.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();wandMore.click();}
  });
  root.append(wandMore,wandBody);
}
function moveWandItem(choice){
  const node=choice.element;
  if(wandMoved.has(node))return;
  if(!node.parentNode)return;
  const parent=node.parentNode;
  const marker=document.createComment('DW2 original wand position');
  node.before(marker);
  wandMoved.set(node,{choice,marker});
  if(choice.wrapper!==node && choice.wrapper?.classList?.contains('extension_container')){
    let holder=wandHolders.get(parent);
    if(!holder){
      // Preserve the original native extension-container class for child entries.
      holder=el('div',parent.className);
      holder.classList.add('dw2io-wand-group');
      holder.removeAttribute('id');
      wandHolders.set(parent,holder);
      wandBody.append(holder);
    }
    holder.append(node);
  }else{
    wandBody.append(node);
  }
}
function applyWand(choices){
  const root=byId('extensionsMenu');
  const selected=state.enabled && state.wandEnabled
    ?choices.filter(c=>state.wandHidden.includes(c.key)):[];
  if(!root || !selected.length){clearWand();return;}
  ensureWandMore(root);
  const wanted=new Set(selected.map(c=>c.element));
  for(const [node,record] of [...wandMoved]){
    if(!wanted.has(node) || !node.isConnected || !root.contains(node))restoreWandItem(node,record);
  }
  for(const choice of selected)moveWandItem(choice);
  for(const [parent,holder] of [...wandHolders]){
    if(!holder.children.length){holder.remove();wandHolders.delete(parent);}
  }
  for(const outer of wandEmptyWrappers)outer.classList.remove('dw2io-wand-empty');
  wandEmptyWrappers.clear();
  for(const record of wandMoved.values()){
    const outer=record.choice.wrapper;
    if(outer?.classList?.contains('extension_container') && !outer.childElementCount){
      outer.classList.add('dw2io-wand-empty');wandEmptyWrappers.add(outer);
    }
  }
  // Downwards expansion: the ORIGINAL entries live after the trigger,
  // instead of reappearing above their control.
  wandBody.hidden=!state.wandExpanded;
  wandMore.setAttribute('aria-expanded',String(state.wandExpanded));
  wandMore.replaceChildren(
    el('i','fa-solid fa-ellipsis fa-lg'),
    el('span','',`${state.wandExpanded?'收起更多工具':'更多工具'}（${selected.length}）${state.wandExpanded?' ▴':' ▾'}`)
  );
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
// Preserve a theme's pre-existing inline order. Do not overwrite it permanently.
function setOrder(node,value){
  const applied=String(value);
  if(!extOrders.has(node)){
    extOrders.set(node,{before:node.style.getPropertyValue('order'),
      priority:node.style.getPropertyPriority('order')});
  }
  if(node.style.getPropertyValue('order')!==applied || node.style.getPropertyPriority('order')!=='important'){
    node.style.setProperty('order',applied,'important');
  }
}
function resetOrders(){
  for(const [node,record] of extOrders){
    if(record.before)node.style.setProperty('order',record.before,record.priority);
    else node.style.removeProperty('order');
  }
  extOrders.clear();
}
const SYSTEM_IDS = [
  'regex_container','vectors_container','assets_container','expressions_container',
  'sd_container','tts_container','qr_container','translation_container','caption_container',
  'summarize_container','typing_indicator_container','rvc_container','stt_container',
  'audio_container','objective_container','silence_container','live2d_container',
  'vrm_container','timelines_container','webllm_container','websearch_container',
];
function extensionRank(choice,index){
  if(SYSTEM_IDS.includes(choice.element.id))return 2000+SYSTEM_IDS.indexOf(choice.element.id);
  if(/^酒馆助手|^Tavern\s*Helper\b/i.test(choice.label)
    || /^(TH-settings|tavern[-_]helper[-_]settings)$/i.test(choice.element.id))return 3000+index;
  if(/^DW2\b|^DW2 ·/i.test(choice.label))return 3500+index;
  return 4000+index;
}
// Native obsolete Extras API rows may live outside both extension settings columns.
function findExtras(parent,roots){
  if(!parent || !state.foldExtras)return [];
  const direct=(node)=>{
    while(node && node.parentElement!==parent)node=node.parentElement;
    return node && !roots.includes(node)?node:null;
  };
  const url=direct(byId('extensions_url')),status=direct(byId('extensions_status'));
  if(!url || !status)return [];
  const wanted=new Set([url,status]);
  for(const id of ['extensions_api_key','extensions_connect','extensions_autoconnect']){
    const row=direct(byId(id));if(row)wanted.add(row);
  }
  if(status.previousElementSibling?.matches('hr'))wanted.add(status.previousElementSibling);
  return [...parent.children].filter(e=>wanted.has(e));
}
function resetExtensionLayout(){
  for(const item of extHidden)item.classList.remove('dw2io-ext-invisible');
  for(const item of extExtraNodes)item.classList.remove('dw2io-ext-invisible');
  extHidden.clear();extExtraNodes.clear();
  resetOrders();
  extParent?.classList.remove('dw2io-ext-layout');
  extParent=null;extMore?.remove();extMore=null;
}
function syncExtensionLayout(choices){
  const a=byId('extensions_settings'),b=byId('extensions_settings2');
  const parent=a?.parentElement,roots=[a,b].filter(Boolean);
  const valid=!!(a && b && parent && b.parentElement===parent &&
    parent.matches('.extensions_block,#rm_extensions_block'));
  if(!state.enabled || !state.extensionsEnabled || !valid){resetExtensionLayout();return;}
  if(extParent!==parent){resetExtensionLayout();extParent=parent;parent.classList.add('dw2io-ext-layout');}
  const selected=choices.filter(x=>state.extensionsFolded.includes(x.key));
  const extras=findExtras(parent,roots);
  const next=new Set(selected.map(x=>x.element)), extraSet=new Set(extras);
  for(const node of extHidden)if(!next.has(node))node.classList.remove('dw2io-ext-invisible');
  for(const node of extExtraNodes)if(!extraSet.has(node))node.classList.remove('dw2io-ext-invisible');
  for(const node of next)node.classList.toggle('dw2io-ext-invisible',!state.extensionsExpanded);
  for(const node of extraSet)node.classList.toggle('dw2io-ext-invisible',!state.extensionsExpanded);
  extHidden=next;extExtraNodes=extraSet;
  const count=selected.length+(extras.length?1:0);
  if(!count){extMore?.remove();extMore=null;}else{
    if(!extMore || extMore.parentElement!==parent){
      extMore?.remove();
      extMore=el('div','inline-drawer dw2io-native-extension-more');
      extMore.id=EXT_HEADER_ID;
      const header=el('div','inline-drawer-toggle inline-drawer-header');
      header.setAttribute('role','button');header.tabIndex=0;
      header.setAttribute('aria-controls','extensions_settings');
      const title=el('b'),icon=el('div','fa-solid inline-drawer-icon fa-circle-chevron-down down');
      header.append(title,icon);extMore.append(header);
      header.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        save({extensionsExpanded:!state.extensionsExpanded});
      });
      header.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();header.click();}
      });
      parent.prepend(extMore);
    }
    const header=$('.inline-drawer-header',extMore);
    $('b',header).textContent=`更多扩展设置（${count}）`;
    header.setAttribute('aria-expanded',String(state.extensionsExpanded));
    $('.inline-drawer-icon',header).className='fa-solid inline-drawer-icon fa-circle-chevron-'+
      (state.extensionsExpanded?'up up':'down down');
    setOrder(extMore,9000);
  }
  // Keep original ST extension containers in place. Only give their immediate
  // rows stable visual order: native systems → Tavern Helper → DW2 → others.
  choices.forEach((choice,index)=>{
    setOrder(choice.element,next.has(choice.element)?(9100+index):extensionRank(choice,index));
  });
  if(settingsEntry?.isConnected)setOrder(settingsEntry,3400);
  extras.forEach((node,index)=>setOrder(node,9200+index));
  for(const child of parent.children){
    if(child===extMore || roots.includes(child) || extras.includes(child))continue;
    if(!extOrders.has(child))setOrder(child,0);
  }
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
async function checkAndUpdate() {
  if(updateInProgress)return;
  const button=byId('dw2io-check-update');
  updateInProgress=true;
  if(button){button.disabled=true;button.textContent='正在检查…';}
  try{
    const id=Object.keys(extensionTypes||{}).find(key=>
      key==='third-party/dw2-interface-organizer' ||
      key.endsWith('/dw2-interface-organizer')
    );
    if(!id)throw new Error('无法识别安装目录，请到 TT 的「管理扩展」检查更新');
    const res=await fetch('/api/extensions/update',{
      method:'POST',
      headers:getRequestHeaders(),
      body:JSON.stringify({
        extensionName:id.replace(/^third-party/,''),
        global:extensionTypes[id]==='global',
      }),
    });
    if(!res.ok)throw new Error((await res.text() || 'HTTP '+res.status).slice(0,200));
    const data=await res.json();
    notify(data.isUpToDate?'已是最新版本':'更新已安装，请刷新 TT 酒馆', 'success');
  }catch(error){
    notify('更新检查失败：'+(error?.message||String(error)),'warning');
  }finally{
    updateInProgress=false;
    if(button?.isConnected){button.disabled=false;button.textContent='检查并更新';}
  }
}
function refreshTavern(){
  if(window.confirm('重新加载 TT 酒馆？请先保存尚未保存的预设修改。')){
    window.location.reload();
  }
}
function attachAccessPoints() {
  // Drop the one-off hamburger launch entry from v0.1.0.
  byId('dw2io-menu-entry')?.remove();
  const root=byId('extensions_settings2') || byId('extensions_settings');
  if(!root)return;
  if(settingsEntry?.isConnected){
    const checkbox=byId('dw2io-enabled-toggle');
    if(checkbox && checkbox.checked!==state.enabled)checkbox.checked=state.enabled;
    return;
  }
  settingsEntry=el('div','extension_container dw2io-settings');
  settingsEntry.id=SETTINGS_ID;
  const drawer=el('div','inline-drawer');
  const header=el('div','inline-drawer-toggle inline-drawer-header');
  header.setAttribute('role','button');header.tabIndex=0;
  const heading=el('div','dw2io-settings-heading');
  heading.append(el('b','','DW2 · 界面整理'),el('small','dw2io-credits','S.A. · DW2'));
  const arrow=el('div','fa-solid inline-drawer-icon fa-circle-chevron-down down');
  header.append(heading,arrow);
  const body=el('div','inline-drawer-content dw2io-settings-content');
  body.hidden=true;
  const toggleRow=el('label','dw2io-native-switch');
  const checkbox=el('input');checkbox.type='checkbox';checkbox.id='dw2io-enabled-toggle';
  checkbox.checked=state.enabled;
  checkbox.addEventListener('change',()=>save({enabled:checkbox.checked}));
  toggleRow.append(checkbox,el('span','','启用界面整理'));
  const actions=el('div','dw2io-native-actions');
  const launch=button('打开界面整理',openPanel,'menu_button dw2io-extension-launch');
  const update=button('检查并更新',checkAndUpdate,'menu_button dw2io-check-update');
  update.id='dw2io-check-update';
  const manage=button('管理扩展',()=>void openThirdPartyExtensionMenu(),'menu_button');
  const refresh=button('刷新酒馆',refreshTavern,'menu_button');
  actions.append(launch,update,manage,refresh);
  body.append(toggleRow,actions,el('div','dw2io-settings-caption',
    '仅整理三横菜单、魔法棒与扩展设置的布局，不修改各扩展的功能。'));
  drawer.append(header,body);settingsEntry.append(drawer);root.append(settingsEntry);
  let expanded=false;
  const expand=(e)=>{
    e.preventDefault();e.stopPropagation();
    expanded=!expanded;body.hidden=!expanded;
    header.setAttribute('aria-expanded',String(expanded));
    arrow.className='fa-solid inline-drawer-icon fa-circle-chevron-'+
      (expanded?'up up':'down down');
  };
  header.addEventListener('click',expand);
  header.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();header.click();}
  });
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
    save({enabled:false,menuFolded:[],wandHidden:[],wandExpanded:false,extensionsFolded:[],extensionsExpanded:false,foldExtras:false});
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
  wb.append(el('p','dw2io-muted','选中的入口会收入魔法棒「更多工具」，需要时可展开。'));
  if(!wand.length) wb.append(el('p','dw2io-muted','尚未识别入口。先展开一次魔法棒，再点「重新识别」。'));
  for(const c of wand) wb.append(checkbox('收进更多 · '+c.label,state.wandHidden.includes(c.key),v=>{
    const next=new Set(state.wandHidden);v?next.add(c.key):next.delete(c.key);save({wandHidden:[...next],wandExpanded:false});
  }));
  const eb=section('extensions','03 · 扩展设置收纳','外层单列排版；勾选低频设置后统一收进「更多扩展设置」。不改变正则卡片内部。');
  eb.append(checkbox('启用扩展页单列与收纳',state.extensionsEnabled,v=>save({extensionsEnabled:v})));
  eb.append(checkbox('把旧 Extras API 设置收进「更多」',state.foldExtras,v=>save({foldExtras:v})));
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
  if(event.target.closest?.('#options_button,#extensionsMenuButton,#extensions-settings-button')) scheduleScan();
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
  settingsEntry?.remove();settingsEntry=null;byId('dw2io-menu-entry')?.remove();
  for(const observer of observed.values()) observer.disconnect();observed.clear();
  for(const fn of cleanup.splice(0))fn();
  state=null;ctx=null;
}
if(globalThis.SillyTavern?.getContext)onEnable();
else window.addEventListener('load',onEnable,{once:true});
