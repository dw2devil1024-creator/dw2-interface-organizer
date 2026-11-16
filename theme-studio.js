/* DW2 CSS Studio: scoped enhancement for TT's native #customCSS editor.
 * Color edits are exact-span replacements with validation and single-step undo.
 */
const ID='dw2io-css-studio';
const HEX=/^#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})\b/i;
const NAMED=/^(?:transparent|black|white|red|green|blue|yellow|cyan|magenta|gray|grey|orange|pink|purple|brown|silver|gold|navy|olive|teal|rebeccapurple)\b/i;
const FUN=/^(?:rgba?|hsla?)\(/i;
function validColor(v) {
  try { return CSS.supports('color',v); } catch {}
  const test=document.createElement('span');test.style.color=v;return !!test.style.color;
}
function tokens(value,offset) {
  const found=[];let quote='',comment=false;
  for(let i=0;i<value.length;i++){
    const c=value[i],n=value[i+1],prev=value[i-1]||'';
    if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(/[\w-]/.test(prev))continue;
    if(/^url\(/i.test(value.slice(i))){
      let depth=0,q='';
      for(;i<value.length;i++){
        const v=value[i];
        if(q){if(v==='\\'){i++;continue;}if(v===q)q='';continue;}
        if(v==='"'||v==="'"){q=v;continue;}
        if(v==='(')depth++;
        if(v===')'&&--depth===0)break;
      }
      continue;
    }
    let raw=value.slice(i).match(HEX)?.[0]||value.slice(i).match(NAMED)?.[0]||'';
    if(!raw && FUN.test(value.slice(i))){
      let depth=0,q='',j=i;
      for(;j<value.length;j++){
        const v=value[j];
        if(q){if(v==='\\'){j++;continue;}if(v===q)q='';continue;}
        if(v==='"'||v==="'"){q=v;continue;}
        if(v==='(')depth++;
        if(v===')'&&--depth===0){j++;break;}
      }
      if(depth===0)raw=value.slice(i,j);
    }
    if(raw && validColor(raw)){
      found.push({start:offset+i,end:offset+i+raw.length,color:raw});
      i+=raw.length-1;
    }
  }
  return found;
}
function extract(css) {
  const found=[],stack=[];let comment=false,quote='',paren=0,start=0;
  const process=(s,e)=>{
    if(!stack.length)return;
    const part=css.slice(s,e),sep=part.indexOf(':');
    if(sep<0)return;
    const property=part.slice(0,sep).replace(/\/\*[\s\S]*?\*\//g,'').trim();
    if(!/^(?:--[\w-]+|-?[a-z][\w-]*)$/i.test(property))return;
    const tail=part.slice(sep+1),space=tail.match(/^\s*/)?.[0].length||0;
    const val=tail.slice(space);
    const selector=stack.map(x=>x.replace(/\/\*[\s\S]*?\*\//g,'').trim()).filter(Boolean).join(' / ');
    for(const item of tokens(val,s+sep+1+space)){
      found.push({...item,property,selector,line:css.slice(0,item.start).split('\n').length});
    }
  };
  for(let i=0;i<css.length;i++){
    const c=css[i],n=css[i+1];
    if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='('){paren++;continue;}
    if(c===')'){paren=Math.max(0,paren-1);continue;}
    if(paren)continue;
    if(c==='{'){stack.push(css.slice(start,i));start=i+1;}
    else if(c===';'){process(start,i);start=i+1;}
    else if(c==='}'){process(start,i);stack.pop();start=i+1;}
  }
  return {items:stack.length?[]:found,unbalanced:!!stack.length};
}
function el(tag,cls='',text) {
  const node=document.createElement(tag);
  if(cls)node.className='dw2io-cs-'+cls;
  if(text!=null)node.textContent=text;
  return node;
}
function btn(text,fn,title='') {
  const node=el('button','btn',text);node.type='button';node.title=title||text;node.addEventListener('click',fn);return node;
}
function iconBtn(iconName,label,fn) {
  const node=btn('',fn,label);
  node.classList.add('dw2io-cs-icon-btn');
  node.setAttribute('aria-label',label);
  const icon=document.createElement('i');
  icon.className='fa-solid '+iconName;
  icon.setAttribute('aria-hidden','true');
  node.append(icon);
  return node;
}
function hexColor(v){
  const ctx=document.createElement('canvas').getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#000000';ctx.fillStyle=v;
  const raw=ctx.fillStyle;
  if(/^#[\da-f]{6}$/i.test(raw))return raw;
  if(/^#[\da-f]{3}$/i.test(raw))return '#'+[...raw.slice(1)].map(c=>c+c).join('');
  const rgb=raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return rgb?'#'+rgb.slice(1,4).map(x=>Number(x).toString(16).padStart(2,'0')).join(''):null;
}
function alphaOf(v){
  if(/^#[\da-f]{8}$/i.test(v))return +(parseInt(v.slice(7),16)/255).toFixed(3);
  if(/^#[\da-f]{4}$/i.test(v))return +(parseInt(v.slice(4).repeat(2),16)/255).toFixed(3);
  if(/^transparent$/i.test(v))return 0;
  const old=v.match(/,\s*([\d.]+)\s*\)$/);
  if(/^(?:rgba|hsla)\(/i.test(v)&&old)return Number(old[1]);
  const modern=v.match(/\/\s*([\d.]+)(%)?\s*\)$/);
  if(modern)return Number(modern[1])/(modern[2]?100:1);
  return null;
}
function maintainAlpha(hex,original){
  const a=alphaOf(original);if(a==null||!Number.isFinite(a))return hex;
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return 'rgba('+rgb.join(', ')+', '+a+')';
}
export function createThemeStudio({notify=()=>{}}={}){
  let root=null,textarea=null,results=null,search=null,hint=null,undoControl=null;
  let enabled=false,expanded=false,large=false,dark=false,timer=0;
  let originalHeight=null,undo=[],lastTheme='',warned=false;
  const currentTheme=()=>document.getElementById('themes')?.value||'';
  const message=(text,warning=false)=>{if(hint)hint.textContent=text;if(warning)notify(text,'warning');};
  function jump(start,length=0){
    if(!textarea)return;
    const pos=Math.min(Math.max(0,start),textarea.value.length);
    const row=textarea.value.slice(0,pos).split('\n').length;
    const size=parseFloat(getComputedStyle(textarea).lineHeight)||18;
    textarea.focus();textarea.setSelectionRange(pos,pos+length);
    textarea.scrollTop=Math.max(0,(row-4)*size);
    textarea.scrollIntoView({block:'center',behavior:'smooth'});
  }
  function writeCSS(code){
    textarea.value=code;
    textarea.dispatchEvent(new Event('input',{bubbles:true}));
    textarea.dispatchEvent(new Event('change',{bubbles:true}));
    const native=document.getElementById('custom-style');
    if(native)native.textContent=code;
    draw();
  }
  function apply(item,value){
    const existing=textarea.value;
    if(existing.slice(item.start,item.end)!==item.color){
      message('代码已变化，请刷新后重新定位颜色。',true);draw();return;
    }
    if(!validColor(value)){message('颜色格式无效，未修改 CSS。',true);return;}
    if(value===item.color)return;
    undo.push({theme:currentTheme(),css:existing,after:existing.slice(0,item.start)+value+existing.slice(item.end)});
    if(undo.length>12)undo.shift();
    if(undoControl)undoControl.disabled=false;
    writeCSS(existing.slice(0,item.start)+value+existing.slice(item.end));
    message('已精确修改这一处颜色。记得保存到 TT 主题。');
  }
  function revert(){
    const previous=undo.pop();
    if(!previous)return;
    if(previous.theme!==currentTheme()){
      undo=[];undoControl.disabled=true;
      message('已切换主题，不能跨主题撤销。',true);return;
    }
    if(textarea.value!==previous.after){
      undo=[];undoControl.disabled=true;
      message('你已手动修改 CSS，为防止覆盖新内容，本次撤销已取消。',true);return;
    }
    writeCSS(previous.css);
    undoControl.disabled=!undo.length;
    message('已撤销上一处通过工作台应用的颜色修改。');
  }
  function draw(){
    if(!expanded||!root||!textarea)return;
    results.replaceChildren();
    const code=textarea.value,query=search.value.trim().toLowerCase();
    const parsed=extract(code);
    if(parsed.unbalanced){
      results.append(el('p','empty','CSS 存在未闭合的代码块，颜色编辑已暂时停用。'));return;
    }
    const filtered=parsed.items.filter(x=>!query||(x.selector+' '+x.property+' '+x.color).toLowerCase().includes(query));
    results.append(el('div','result-title','可编辑颜色 · '+filtered.length+' 项'));
    for(const item of filtered.slice(0,150)){
      const row=el('div','row');
      const meta=el('div','meta');
      meta.append(el('span','selector',item.selector||'CSS 规则'),el('span','property',item.property+' · 第 '+item.line+' 行'));
      const tools=el('div','controls');
      const chip=el('span','chip');chip.style.backgroundColor=item.color;
      const value=el('input','value');value.type='text';value.value=item.color;value.spellcheck=false;
      const h=hexColor(item.color);
      if(h){
        const picker=el('input','picker');picker.type='color';picker.value=h;picker.title='挑选新颜色（保留原透明度）';
        picker.addEventListener('input',()=>{value.value=maintainAlpha(picker.value,item.color);chip.style.backgroundColor=value.value;});
        tools.append(picker);
      }
      value.addEventListener('input',()=>{chip.style.backgroundColor=validColor(value.value)?value.value:'transparent';});
      value.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply(item,value.value.trim());}});
      tools.append(chip,value,btn('应用',()=>apply(item,value.value.trim())),btn('定位',()=>jump(item.start,item.color.length)));
      row.append(meta,tools);results.append(row);
    }
    if(filtered.length>150)results.append(el('p','empty','为保证手机流畅，仅显示前 150 项；输入关键词可缩小范围。'));
    if(!filtered.length)results.append(el('p','empty','没有匹配的颜色。'));
    if(query){
      results.append(el('div','result-title','原始 CSS 搜索结果'));
      let from=0,count=0;const lower=code.toLowerCase();
      while(count<30){
        const pos=lower.indexOf(query,from);if(pos<0)break;
        const start=code.lastIndexOf('\n',pos-1)+1,end=code.indexOf('\n',pos);
        const row=code.slice(0,pos).split('\n').length;
        const snippet=code.slice(start,end<0?code.length:end).trim().slice(0,100);
        results.append(btn('第 '+row+' 行 · '+snippet,()=>jump(pos,query.length)));
        from=pos+Math.max(1,query.length);count++;
      }
      if(!count)results.append(el('p','empty','原始 CSS 没有匹配内容。'));
    }
    undoControl.disabled=!undo.length;
  }
  function save(asNew=false){
    const native=document.getElementById(asNew?'ui-preset-save-button':'ui-preset-update-button');
    if(!native||getComputedStyle(native).display==='none'){
      message('找不到 TT 原生主题保存按钮，请切换到主题设置页面。',true);return;
    }
    native.click();
    message('已触发 TT 原生'+(asNew?'另存为':'更新主题')+'操作，请以 TT 提示为准。');
  }
  function setLarge(value){
    large=!!value;if(!textarea)return;
    if(large){
      if(!originalHeight)originalHeight={value:textarea.style.getPropertyValue('min-height'),priority:textarea.style.getPropertyPriority('min-height')};
      textarea.style.setProperty('min-height','min(60dvh, 680px)','important');
    }else if(originalHeight){
      if(originalHeight.value)textarea.style.setProperty('min-height',originalHeight.value,originalHeight.priority);
      else textarea.style.removeProperty('min-height');
      originalHeight=null;
    }
  }
  // A deterministic top/bottom action for iOS textareas. Do not focus the
  // textarea here: focusing can re-scroll to the old caret and summon the
  // on-screen keyboard, making "go to top" appear broken.
  function scrollEditor(toBottom){
    if(!textarea)return;
    const target=textarea;
    const position=toBottom?target.value.length:0;
    try{target.setSelectionRange(position,position);}catch{}
    const scroll=()=>{if(target.isConnected)target.scrollTop=toBottom?target.scrollHeight:0;};
    scroll();
    requestAnimationFrame(scroll);
  }
  function inputChanged(){clearTimeout(timer);if(expanded)timer=setTimeout(draw,240);}
  function themeChanged(event){
    if(event.target?.id!=='themes')return;
    undo=[];lastTheme=currentTheme();
    if(undoControl)undoControl.disabled=true;
    clearTimeout(timer);if(expanded)timer=setTimeout(draw,180);
  }
  function mount(){
    const t=document.getElementById('customCSS'),block=document.getElementById('CustomCSS-textAreaBlock');
    if(!(t instanceof HTMLTextAreaElement)||!block?.parentNode)return false;
    if(document.querySelector('#visual-css-editor-new,#native-css-toolbar-new')){
      if(!warned){notify('检测到旧 ThemeEditor。请先停用它并刷新 TT，再开启 DW2 CSS 工作台。','warning');warned=true;}
      return false; // Never stack two editing panels on the same native textarea.
    }
    textarea=t;root=el('section','root');root.id=ID;
    const bar=el('div','toolbar'),title=el('strong','title','DW2 · CSS 工作台');
    const actions=el('div','actions'),body=el('div','body');
    body.hidden=true;
    let toggle;
    const setExpanded=(value)=>{
      expanded=!!value;
      body.hidden=!expanded;
      if(toggle){
        const label=expanded?'收起颜色结果':'展开颜色结果';
        toggle.title=label;
        toggle.setAttribute('aria-label',label);
        toggle.setAttribute('aria-expanded',String(expanded));
        toggle.firstElementChild.className='fa-solid '+(expanded?'fa-chevron-up':'fa-chevron-down');
      }
      if(expanded)draw();
    };
    toggle=iconBtn('fa-chevron-down','展开颜色结果',()=>setExpanded(!expanded));
    const height=iconBtn('fa-maximize','扩大 CSS 编辑框',()=>{
      setLarge(!large);
      const label=large?'恢复 CSS 编辑框高度':'扩大 CSS 编辑框';
      height.title=label;
      height.setAttribute('aria-label',label);
      height.firstElementChild.className='fa-solid '+(large?'fa-minimize':'fa-maximize');
    });
    const goTop=iconBtn('fa-arrow-up','CSS 代码回到顶部',()=>scrollEditor(false));
    const goBottom=iconBtn('fa-arrow-down','CSS 代码跳到底部',()=>scrollEditor(true));
    const mode=iconBtn('fa-moon','切换工作台为夜间外观',()=>{
      dark=!dark;
      root.dataset.mode=dark?'dark':'light';
      const newLabel=dark?'切换工作台为日间外观':'切换工作台为夜间外观';
      mode.title=newLabel;
      mode.setAttribute('aria-label',newLabel);
      mode.firstElementChild.className='fa-solid '+(dark?'fa-sun':'fa-moon');
    });
    actions.append(
      btn('保存',()=>save()),btn('另存',()=>save(true)),
      btn('刷新',draw),goTop,goBottom,
      height,mode,toggle
    );
    bar.append(title,actions);
    const filters=el('div','filters');
    search=el('input','search');search.type='search';search.placeholder='搜索颜色、选择器、原始 CSS';
    search.setAttribute('aria-label','搜索 CSS 代码、颜色、选择器');
    search.addEventListener('input',()=>{
      if(!expanded && search.value.trim())setExpanded(true);
      else draw();
    });
    // Undo belongs beside search, not inside the collapsible results.
    undoControl=btn('↶ 撤销',revert,'撤销最近一次通过工作台「应用」的颜色修改（最多12次）');
    undoControl.disabled=true;
    filters.append(search,undoControl);
    results=el('div','results');
    hint=el('p','hint','调色后点「应用」才会修改 CSS；「撤销」仅撤回工作台已应用的颜色。记得保存主题。');
    body.append(results,hint);
    // Search remains available even while the color results are collapsed.
    root.append(bar,filters,body);
    // Mount above the original CSS textarea, directly below "自定义 CSS".
    // Leave TT's heading, maximize icon, textarea, and native handlers intact.
    block.insertAdjacentElement('beforebegin',root);
    lastTheme=currentTheme();
    textarea.addEventListener('input',inputChanged);
    document.addEventListener('change',themeChanged);
    return true;
  }
  function disable(){
    enabled=false;clearTimeout(timer);timer=0;
    textarea?.removeEventListener('input',inputChanged);
    document.removeEventListener('change',themeChanged);
    setLarge(false);root?.remove();
    root=textarea=results=search=hint=undoControl=null;
    undo=[];expanded=false;large=false;
  }
  function sync(on){
    if(!on){if(root||enabled)disable();return;}
    if(root && (!root.isConnected||textarea!==document.getElementById('customCSS')))disable();
    enabled=true;if(!root)mount();
  }
  return {sync,disable};
}
