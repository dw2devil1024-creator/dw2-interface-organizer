/* DW2 · CSS 工作台
 * A lightweight toolbar for TT's native Custom CSS textarea.
 * Search in original text (including comments), navigate, and use TT's own theme save.
 * No theme rewrites, visual color editor, or parallel CSS dataset.
 */
const ROOT_ID='dw2io-css-studio';
const LIMIT=65;
function findMatches(text,query,limit=LIMIT){
  const word=String(query||'').trim().toLowerCase();
  if(!word)return {matches:[],total:0};
  const lines=text.split('\n');
  const matches=[];let total=0,offset=0;
  for(let index=0;index<lines.length;index++){
    const line=lines[index],col=line.toLowerCase().indexOf(word);
    if(col>=0){
      total++;
      if(matches.length<limit){
        const from=Math.max(0,col-35);
        const to=Math.min(line.length,col+word.length+78);
        const snippet=(from?'…':'')+line.slice(from,to).trim()+(to<line.length?'…':'');
        const trimmed=line.trimStart();
        const isComment=/^(?:\/\*|\*|\/\/|#{2,}\s)/.test(trimmed)||trimmed.includes('【区域索引】');
        matches.push({line:index+1,start:offset+col,length:word.length,
          snippet:snippet||'(空白行)',type:isComment?'注释':'代码'});
      }
    }
    offset+=line.length+1;
  }
  return {matches,total};
}
function el(tag,cls='',text){
  const node=document.createElement(tag);
  if(cls)node.className='dw2io-cs-'+cls;
  if(text!=null)node.textContent=text;
  return node;
}
function btn(text,handler,title=''){
  const node=el('button','btn',text);
  node.type='button';
  node.title=title||text;
  node.addEventListener('click',handler);
  return node;
}
function iconBtn(iconName,label,handler){
  const node=btn('',handler,label);
  node.classList.add('dw2io-cs-icon-btn');
  node.setAttribute('aria-label',label);
  const icon=document.createElement('i');
  icon.className='fa-solid '+iconName;
  icon.setAttribute('aria-hidden','true');
  node.append(icon);
  return node;
}
export function createThemeStudio({notify=()=>{}}={}){
  let root=null,textarea=null,search=null,results=null,status=null;
  let timer=0,large=false,originalHeight=null,appearance='auto',warned=false;
  const message=(text,kind)=>{if(status)status.textContent=text;if(kind)notify(text,kind);};
  function render(){
    if(!root||!textarea||!search||!results)return;
    const q=search.value.trim();
    results.replaceChildren();
    if(!q){
      results.hidden=true;
      message('按中文注释、区域名或 CSS 代码搜索；点击结果可直接跳转。');
      return;
    }
    const found=findMatches(textarea.value,q);
    results.hidden=false;
    results.append(el('div','result-title','找到 '+found.total+' 行'+(found.total>LIMIT?' · 显示前 '+LIMIT+' 条':'')));
    if(!found.total){
      results.append(el('p','empty','没有找到这个关键词。换一个区域名试试，比如「顶栏」「正文」「世界书」。'));
    }
    for(const row of found.matches){
      const entry=btn('',()=>jump(row.start,row.length),'跳转到 CSS 第 '+row.line+' 行');
      entry.classList.add('dw2io-cs-match');
      const info=el('span','match-label','第 '+row.line+' 行 · '+row.type);
      const code=el('span','match-text',row.snippet);
      entry.append(info,code);
      results.append(entry);
    }
    message('仅搜索并定位原生 CSS，不修改代码。');
  }
  function jump(start,length=0){
    if(!textarea)return;
    const t=textarea,pos=Math.min(t.value.length,Math.max(0,start));
    const line=t.value.slice(0,pos).split('\n').length;
    const computed=getComputedStyle(t);
    const height=parseFloat(computed.lineHeight)||((parseFloat(computed.fontSize)||14)*1.5);
    try{t.focus({preventScroll:true});}catch{t.focus();}
    t.setSelectionRange(pos,Math.min(t.value.length,pos+length));
    t.scrollIntoView({block:'center',behavior:'smooth'});
    // iOS WebKit can scroll back to the former cursor; correct after caret moves.
    const scroll=()=>{if(t.isConnected)t.scrollTop=Math.max(0,(line-3)*height);};
    scroll();requestAnimationFrame(scroll);
  }
  function scrollEditor(bottom){
    if(!textarea)return;
    const t=textarea,pos=bottom?t.value.length:0;
    try{t.setSelectionRange(pos,pos);}catch{}
    const scroll=()=>{if(t.isConnected)t.scrollTop=bottom?t.scrollHeight:0;};
    scroll();requestAnimationFrame(scroll);
  }
  function saveTheme(asNew=false){
    const id=asNew?'ui-preset-save-button':'ui-preset-update-button';
    const native=document.getElementById(id);
    if(!native||getComputedStyle(native).display==='none'){
      message('未找到 TT 原生主题保存按钮，请检查主题设置。','warning');return;
    }
    native.click();
    message('已触发 TT 原生'+(asNew?'另存为':'更新主题')+'，请以 TT 的保存提示为准。');
  }
  function resizeEditor(on){
    large=!!on;if(!textarea)return;
    if(large){
      if(!originalHeight)originalHeight={
        value:textarea.style.getPropertyValue('min-height'),
        priority:textarea.style.getPropertyPriority('min-height')
      };
      textarea.style.setProperty('min-height','min(60dvh,680px)','important');
    }else if(originalHeight){
      if(originalHeight.value)textarea.style.setProperty('min-height',originalHeight.value,originalHeight.priority);
      else textarea.style.removeProperty('min-height');
      originalHeight=null;
    }
  }
  function syncSearch(){
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;render();},180);
  }
  function themeChange(event){
    if(event.target?.id!=='themes')return;
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;render();},250);
  }
  function mount(){
    const native=document.getElementById('customCSS');
    const block=document.getElementById('CustomCSS-textAreaBlock');
    if(!(native instanceof HTMLTextAreaElement)||!block?.parentNode)return false;
    if(document.querySelector('#visual-css-editor-new,#native-css-toolbar-new')){
      if(!warned){
        notify('检测到旧 ThemeEditor，请先停用旧插件并刷新酒馆。','warning');
        warned=true;
      }
      return false;
    }
    textarea=native;root=el('section','root');root.id=ROOT_ID;
    root.dataset.mode='auto';
    const toolbar=el('div','toolbar');
    const title=el('strong','title','DW2 · CSS 工作台');
    const actions=el('div','actions');
    const resize=iconBtn('fa-maximize','扩大 CSS 编辑框',()=>{
      resizeEditor(!large);
      const label=large?'恢复 CSS 编辑框高度':'扩大 CSS 编辑框';
      resize.title=label;resize.setAttribute('aria-label',label);
      resize.firstElementChild.className='fa-solid '+(large?'fa-minimize':'fa-maximize');
    });
    const mode=iconBtn('fa-circle-half-stroke','工作台外观：跟随 TT 主题',()=>{
      appearance=appearance==='auto'?'dark':appearance==='dark'?'light':'auto';
      root.dataset.mode=appearance;
      const map={auto:['fa-circle-half-stroke','跟随 TT 主题'],
        dark:['fa-moon','夜间'],light:['fa-sun','日间']};
      const pair=map[appearance],icon=pair[0],label=pair[1];
      mode.firstElementChild.className='fa-solid '+icon;
      mode.title='工作台外观：'+label;mode.setAttribute('aria-label',mode.title);
    });
    actions.append(
      btn('保存',()=>saveTheme(false)),
      btn('另存',()=>saveTheme(true)),
      btn('刷新',render),
      iconBtn('fa-arrow-up','CSS 代码回到顶部',()=>scrollEditor(false)),
      iconBtn('fa-arrow-down','CSS 代码跳到底部',()=>scrollEditor(true)),
      resize,mode
    );
    toolbar.append(title,actions);
    const filters=el('div','filters');
    search=el('input','search');
    search.type='search';
    search.placeholder='搜索注释、顶栏、正文、世界书或 CSS';
    search.setAttribute('aria-label','搜索原始 CSS 代码与中文区域注释');
    search.addEventListener('input',render);
    filters.append(search);
    results=el('div','results');results.hidden=true;
    status=el('p','hint','搜索代码或注释，点击结果定位；不修改 CSS 内容。');
    root.append(toolbar,filters,results,status);
    // The native editor stays in place, with all TT original events intact.
    block.insertAdjacentElement('beforebegin',root);
    native.addEventListener('input',syncSearch);
    document.addEventListener('change',themeChange);
    return true;
  }
  function disable(){
    clearTimeout(timer);timer=0;
    textarea?.removeEventListener('input',syncSearch);
    document.removeEventListener('change',themeChange);
    resizeEditor(false);
    root?.remove();
    root=textarea=search=results=status=null;
    large=false;originalHeight=null;appearance='auto';
  }
  function sync(on){
    if(!on){if(root)disable();return;}
    if(root&&(!root.isConnected||textarea!==document.getElementById('customCSS')))disable();
    if(!root)mount();
  }
  return {sync,disable};
}
