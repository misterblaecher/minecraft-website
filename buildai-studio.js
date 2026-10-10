/* GabCon BuildAI Studio on the static Minecraft website.
 * No remote generation API: Python executes client-side via Pyodide Worker.
 * The standalone site does not connect to or expose GabCon-BuildAI server.py.
 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const editor=$('code'),canvas=$('previewCanvas');
  const SAMPLE=[
    '# GabCon BuildAI — tour médiévale',
    'fill(-7, 0, -7, 7, 0, 7, "cobblestone")',
    'cylinder(0, 0, 1, 17, 5, "stone_bricks", hollow=True)',
    'for y in range(1, 17):',
    '    for x, z in [(-4,-4),(-4,4),(4,-4),(4,4)]:',
    '        set_block(x, y, z, "polished_andesite")',
    'fill(-1, 1, -5, 1, 3, -5, "air")',
    'for y in [7, 12]:',
    '    for x, z in [(0,-5),(0,5),(-5,0),(5,0)]:',
    '        set_block(x, y, z, "glass_pane")',
    'cylinder(0, 0, 18, 1, 7, "spruce_planks")',
    'cylinder(0, 0, 19, 1, 6, "spruce_planks")',
    'cylinder(0, 0, 20, 1, 5, "dark_oak_planks")',
    'cylinder(0, 0, 21, 1, 4, "dark_oak_planks")',
    'set_block(0, 22, 0, "lightning_rod")'
  ].join('\n');
  const cam={yaw:.68,elev:.55,zoom:1,px:0,py:0};
  let grid=null,visual=null,mode='3d',activeWorker=null,timeout=null,queued=false,toastTimeout=null;
  const MAX_3D_SURFACE=6000;

  function notify(message,error=false){
    const node=$('toast');
    node.textContent=message;
    node.classList.toggle('error',error);
    node.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>node.classList.remove('show'),error?6500:3500);
  }
  function updateEditor(){
    const n=editor.value.split('\n').length;
    $('lineNumbers').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');
    $('lineCount').textContent=n+' ligne'+(n>1?'s':'');
    try{localStorage.setItem('gabcon-buildai-code',editor.value);}catch(_){}
  }
  function promptText(){
    return [
      'Tu es architecte Minecraft spécialisé dans le DSL Python du projet GabCon-BuildAI.',
      'Mon idée de construction : '+($('idea').value.trim()||'Une construction Minecraft détaillée'),
      '',
      'Donne-moi UNIQUEMENT un bloc de code Python compatible GabCon-BuildAI, sans prose.',
      'Utilise les coordonnées entières x, y, z (y vertical), et les fonctions du DSL :',
      'set_block(x,y,z,"stone_bricks"), fill(x1,y1,z1,x2,y2,z2,"oak_planks"),',
      'walls(x1,z1,x2,z2,y1,y2,"cobblestone"), floor(x1,z1,x2,z2,y,"oak_planks"),',
      'hollow_box, clear, cylinder(cx,cz,y,height,r,block,hollow=False),',
      'sphere(cx,cy,cz,r,block,hollow=False), dome, pyramid, cone, line,',
      'frame, scatter, gable_roof, hip_roof, set_blocks, get_block.',
      'Boucles for/range, conditions, variables, fonctions simples et math/rng si nécessaire.',
      'Aucun import, aucun accès fichier ou réseau. Matériaux Minecraft valides.',
      'Privilégie les fonctions de base pour que le code marche aussi dans GabCon Studio Web.',
      'Dans le navigateur : maximum 120 000 blocs, une dimension de 512 et volume de 3 millions.',
      'Pour les constructions plus importantes, le blueprint sera exporté et exécuté avec GabCon-BuildAI local.',
      'Fais une architecture jolie, travaillée, avec ouvertures et détails.',
      'Référence du DSL : https://github.com/misterblaecher/GabCon-BuildAI/blob/main/src/mcbuild/dsl/REFERENCE.md'
    ].join('\n');
  }
  async function copyPrompt(){
    const text=promptText();
    try{await navigator.clipboard.writeText(text);notify('Prompt copié. Colle-le dans ChatGPT !');}
    catch(_){
      const node=document.createElement('textarea');node.value=text;document.body.appendChild(node);
      node.select();const ok=document.execCommand('copy');node.remove();
      notify(ok?'Prompt copié !':'Copie impossible : utilise le navigateur HTTPS.',!ok);
    }
  }
  function extractCode(s){
    const match=s.match(/```(?:python|py)?\s*\n([\s\S]*?)\n```/i);
    return match?match[1].trim()+'\n':s;
  }
  function setStatus(message,kind=''){
    $('status').textContent=message;$('status').className='status'+(kind?' '+kind:'');
  }
  function busy(value){
    $('runBuild').disabled=value;
    $('runLabel').textContent=value?'Calcul en cours…':'Générer & visualiser';
    $('loader').classList.toggle('hidden',!value);
  }
  function showError(message){
    const clean=String(message).replace(/^PythonError:\s*/,'').slice(0,2400);
    $('errorText').textContent=clean;
    $('errorPanel').classList.remove('hidden');
    setStatus('ERREUR','error');
    notify('Le blueprint comporte une erreur. Consulte le message sous l’éditeur.',true);
  }
  function endWorker(){
    if(activeWorker){activeWorker.terminate();activeWorker=null;}
    clearTimeout(timeout);timeout=null;busy(false);
  }
  function run(){
    if(activeWorker)return;
    const source=extractCode(editor.value);
    if(!source.trim())return showError('Colle du code Python avant de lancer.');
    if(source!==editor.value){editor.value=source;updateEditor();}
    const seed=Number($('seed').value);
    if(!Number.isInteger(seed)||seed<0||seed>2147483647)return showError('Seed invalide.');
    $('errorPanel').classList.add('hidden');
    if(!window.Worker || !window.WebAssembly)return showError('Ce navigateur ne prend pas en charge Python WebAssembly.');
    busy(true);setStatus('CALCUL…');
    $('loaderText').textContent='Chargement de Python…';
    let worker;
    try{worker=new Worker('buildai-worker.js?v=20261010-1');}
    catch(err){busy(false);return showError('Impossible de charger le moteur Python : '+err.message);}
    activeWorker=worker;
    // Kill the whole worker (including Python) if user code or WASM never returns.
    timeout=setTimeout(()=>{
      endWorker();
      showError('Délai maximal de 90 secondes atteint. Réduis ton blueprint ou utilise le moteur local.');
    },90000);
    worker.onmessage=event=>{
      if(activeWorker!==worker)return;
      const payload=event.data||{};
      if(payload.type==='progress'){$('loaderText').textContent=payload.message;return;}
      if(payload.type==='error'){
        endWorker();showError(payload.message||'Erreur du moteur Python.');return;
      }
      if(payload.type==='result'){
        endWorker();
        grid=payload.data;
        try{
          preparePreview();
          updateStats();
          setStatus('GÉNÉRÉ','ready');
          $('exportSchem').disabled=false;
          $('exportJson').disabled=false;
          $('exportStatus').textContent='PRÊT À EXPORTER';
          $('viewTitle').textContent='GAB CON / '+(grid.count||0).toLocaleString('fr-BE')+' BLOCS';
          notify('Ta construction est prête. Tu peux exporter le schematic !');
        }catch(err){showError(err.message||'Erreur de visualisation.');}
      }
    };
    worker.onerror=event=>{
      endWorker();showError('Moteur Python indisponible. Vérifie ta connexion Internet : '+(event.message||'Erreur de chargement.'));
    };
    worker.postMessage({type:'build',source,seed});
  }
  function download(filename,blob){
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function basename(){
    return ($('idea').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').slice(0,42).replace(/^-|-$/g,'')||'gabcon-buildai');
  }
  async function saveSchem(){
    if(!grid)return;
    const btn=$('exportSchem');btn.disabled=true;const text=btn.querySelector('strong').textContent;
    btn.querySelector('strong').textContent='Compression…';
    try{
      download(basename()+'.schem',await window.GabConSchem.encodeSchem(grid));
      notify('Schematic WorldEdit téléchargé.');
    }catch(e){showError('Export .schem : '+e.message);}
    finally{btn.disabled=false;btn.querySelector('strong').textContent=text;}
  }
  function savePython(){
    download(basename()+'.py',new Blob([extractCode(editor.value)],{type:'text/x-python;charset=utf-8'}));
  }
  function saveJSON(){
    if(grid)download(basename()+'.json',new Blob([JSON.stringify(grid)],{type:'application/json'}));
  }
  const tones={
    stone:[141,154,150],deepslate:[92,103,109],cobble:[122,132,126],
    andesite:[136,145,138],glass:[102,169,186],leaves:[71,131,78],
    grass:[95,145,75],spruce:[101,76,50],oak:[172,137,91],
    dark_oak:[83,60,47],birch:[206,187,143],planks:[165,121,82],
    copper:[178,112,73],quartz:[220,216,201],bricks:[155,87,75],
    terracotta:[173,116,84],gold:[224,191,82],lantern:[235,191,110],
    glowstone:[202,159,96],iron:[189,198,194],water:[73,113,186],
    air:[39,51,57],dirt:[114,89,63],sand:[206,188,129]
  };
  function rgb(id){
    const name=id.split(':').pop();
    for(const [key,color] of Object.entries(tones))if(name.includes(key))return color;
    let hash=0;for(const char of name)hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;
    return [90+Math.abs(hash%95),100+Math.abs((hash>>7)%80),90+Math.abs((hash>>15)%90)];
  }
  function cssColor(color,k=1){
    return 'rgb('+color.map(n=>Math.max(0,Math.min(255,Math.round(n*k)))).join(',')+')';
  }
  function updateStats(){
    $('statCount').textContent=Number(grid.count).toLocaleString('fr-BE');
    $('statDims').textContent=grid.dims.join(' × ');
    $('statMaterials').textContent=grid.palette.length;
    const bar=$('materialBar'),list=$('materialList');bar.replaceChildren();list.replaceChildren();
    let seen=0;
    for(const [id,count] of grid.materials){
      seen+=count;
      const part=document.createElement('span');
      part.style.background=cssColor(rgb(id));part.style.flex=String(count);
      bar.appendChild(part);
      const chip=document.createElement('span');
      const swatch=document.createElement('i');swatch.style.background=cssColor(rgb(id));
      chip.append(swatch,document.createTextNode(id.split(':').pop()+' · '+count.toLocaleString('fr-BE')));
      list.appendChild(chip);
    }
    if(seen<grid.count){const other=document.createElement('span');other.style.background='#52665e';other.style.flex=String(grid.count-seen);bar.appendChild(other);}
    $('materialLabel').textContent='Top '+grid.materials.length+' matériaux';
  }
  const DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const FACES=[
    {mask:1,normal:[1,0,0],factor:.78,p:[[1,0,0],[1,0,1],[1,1,1],[1,1,0]]},
    {mask:2,normal:[-1,0,0],factor:.67,p:[[0,0,0],[0,1,0],[0,1,1],[0,0,1]]},
    {mask:4,normal:[0,1,0],factor:1.09,p:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]]},
    {mask:8,normal:[0,-1,0],factor:.51,p:[[0,0,0],[0,0,1],[1,0,1],[1,0,0]]},
    {mask:16,normal:[0,0,1],factor:.90,p:[[0,0,1],[0,1,1],[1,1,1],[1,0,1]]},
    {mask:32,normal:[0,0,-1],factor:.73,p:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]},
  ];
  function demoGrid(){
    const blocks=[],palette=['minecraft:cobblestone','minecraft:stone_bricks','minecraft:spruce_planks','minecraft:glass'];
    const put=(x,y,z,p)=>blocks.push([x,y,z,p]);
    for(let x=0;x<13;x++)for(let z=0;z<13;z++)put(x,0,z,0);
    for(let y=1;y<=14;y++)for(let x=2;x<=10;x++)for(let z=2;z<=10;z++){
      if(x===2||x===10||z===2||z===10){
        if(!(z===2&&x>=5&&x<=7&&y<=3))put(x,y,z,1);
      }
    }
    for(let y=1;y<=4;y++){
      const radius=5-y;
      for(let x=6-radius;x<=6+radius;x++)for(let z=6-radius;z<=6+radius;z++){
        if(Math.abs(x-6)===radius||Math.abs(z-6)===radius)put(x,14+y,z,2);
      }
    }
    return {blocks,palette,dims:[13,20,13],count:blocks.length};
  }
  const DEMO=demoGrid();

  function preparePreview(){
    const data=grid||DEMO;
    const paletteRGB=data.palette.map(rgb);
    const blockLookup=new Set();
    for(const [x,y,z,index] of data.blocks){
      if(data.palette[index]==='minecraft:air')continue;
      blockLookup.add(x+','+y+','+z);
    }
    const cells=[];
    for(const [x,y,z,index] of data.blocks){
      if(data.palette[index]==='minecraft:air')continue;
      let mask=0;
      DIRS.forEach((delta,i)=>{
        if(!blockLookup.has((x+delta[0])+','+(y+delta[1])+','+(z+delta[2])))mask|=(1<<i);
      });
      if(mask)cells.push({x,y,z,rgb:paletteRGB[index],mask});
      if(cells.length>MAX_3D_SURFACE)break;
    }
    visual={cells,dims:data.dims,paletteRGB,tooLarge:cells.length>MAX_3D_SURFACE,top:new Map()};
    for(const [x,y,z,index] of data.blocks){
      if(data.palette[index]==='minecraft:air')continue;
      const key=x+','+z,old=visual.top.get(key);
      if(!old||y>=old.y)visual.top.set(key,{x,y,z,rgb:paletteRGB[index]});
    }
    if(visual.tooLarge){
      visual.cells=[];
      mode='top';notify('Construction volumineuse : vue du dessus activée (schématic complet).');
    }else mode='3d';
    cam.yaw=.68;cam.elev=.55;cam.zoom=1;cam.px=cam.py=0;
    updateTabUI();
    drawSoon();
  }
  function updateTabUI(){
    $('tab3d').classList.toggle('selected',mode==='3d');
    $('tabTop').classList.toggle('selected',mode==='top');
    $('tab3d').disabled=!!visual?.tooLarge;
    $('controlHint').textContent=mode==='top'?'Glisser pour déplacer · Pincer/molette pour zoomer':'Glisser pour pivoter · Pincer pour zoomer';
  }
  function drawSoon(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;draw();});
  }
  function draw(){
    const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height;
    if(!width||!height)return;
    const pixelRatio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*pixelRatio);canvas.height=Math.round(height*pixelRatio);
    const ctx=canvas.getContext('2d');
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    ctx.clearRect(0,0,width,height);
    const data=visual;
    if(!data)return;
    if(mode==='top')drawTop(ctx,width,height,data);
    else draw3d(ctx,width,height,data);
    $('zoomLabel').textContent=Math.round(cam.zoom*100)+'%';
  }
  function drawTop(ctx,w,h,data){
    const [sx,,sz]=data.dims;
    const scale=Math.min((w-40)/Math.max(1,sx),(h-55)/Math.max(1,sz))*cam.zoom;
    ctx.fillStyle='rgba(6,14,19,.27)';ctx.fillRect(0,0,w,h);
    const left=w/2-sx*scale/2+cam.px,top=h/2-sz*scale/2+cam.py;
    for(const cell of data.top.values()){
      const shade=.73+.27*cell.y/Math.max(1,data.dims[1]);
      ctx.fillStyle=cssColor(cell.rgb,shade);
      ctx.fillRect(left+cell.x*scale,top+cell.z*scale,Math.ceil(scale+.15),Math.ceil(scale+.15));
      if(scale>9){
        ctx.strokeStyle='rgba(10,15,18,.28)';ctx.lineWidth=.5;
        ctx.strokeRect(left+cell.x*scale,top+cell.z*scale,scale,scale);
      }
    }
  }
  function draw3d(ctx,w,h,data){
    const dims=data.dims,span=Math.max(dims[0],dims[2]);
    const scale=Math.min(22,w/(span*1.6+2),h/(dims[1]*1.25+span*.75+2))*cam.zoom;
    const sy=Math.sin(cam.yaw),cy=Math.cos(cam.yaw),se=Math.sin(cam.elev),ce=Math.cos(cam.elev);
    const vx=sy*ce,vy=se,vz=cy*ce;
    const cx=dims[0]/2,cyy=dims[1]/2,cz=dims[2]/2;
    const project=(x,y,z)=>{
      const dx=x-cx,dy=y-cyy,dz=z-cz,horiz=dx*sy+dz*cy;
      return [w/2+cam.px+(dx*cy-dz*sy)*scale,h/2+cam.py+(-dy*ce+horiz*se)*scale,horiz*ce+dy*se];
    };
    ctx.strokeStyle='rgba(192,217,171,.08)';ctx.lineWidth=1;
    const size=Math.ceil(span/2)+5;
    for(let i=-size;i<=size;i+=2){
      const a=project(cx-size,-.15,cz+i),b=project(cx+size,-.15,cz+i);
      const c=project(cx+i,-.15,cz-size),d=project(cx+i,-.15,cz+size);
      ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
      ctx.beginPath();ctx.moveTo(c[0],c[1]);ctx.lineTo(d[0],d[1]);ctx.stroke();
    }
    const faces=FACES.filter(f=>f.normal[0]*vx+f.normal[1]*vy+f.normal[2]*vz>.02);
    const shapes=[];
    for(const cell of data.cells){
      for(const f of faces){
        if(!(cell.mask&f.mask))continue;
        const pts=f.p.map(p=>project(cell.x+p[0],cell.y+p[1],cell.z+p[2]));
        shapes.push({pts,depth:pts.reduce((s,p)=>s+p[2],0)/4,fill:cssColor(cell.rgb,f.factor)});
      }
    }
    shapes.sort((a,b)=>a.depth-b.depth);
    ctx.lineWidth=Math.min(.7,Math.max(.25,scale*.06));
    for(const item of shapes){
      ctx.beginPath();ctx.moveTo(item.pts[0][0],item.pts[0][1]);
      for(let i=1;i<4;i++)ctx.lineTo(item.pts[i][0],item.pts[i][1]);
      ctx.closePath();ctx.fillStyle=item.fill;ctx.fill();
      ctx.strokeStyle='rgba(8,16,18,.26)';ctx.stroke();
    }
  }
  function setView(value){
    if(value==='3d'&&visual?.tooLarge)return notify('Vue 3D désactivée pour ce grand projet.');
    mode=value;updateTabUI();drawSoon();
  }
  function pointerEvents(){
    const pointers=new Map();let previousPinch=0;
    const distance=()=>{
      const p=[...pointers.values()];
      return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    };
    canvas.addEventListener('pointerdown',e=>{
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===2});
      canvas.setPointerCapture(e.pointerId);
      previousPinch=pointers.size===2?distance():0;
    });
    canvas.addEventListener('pointermove',e=>{
      const old=pointers.get(e.pointerId);if(!old)return;
      const dx=e.clientX-old.x,dy=e.clientY-old.y;
      pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
      if(pointers.size>=2){
        const next=distance();
        if(previousPinch&&next)cam.zoom=Math.max(.2,Math.min(10,cam.zoom*next/previousPinch));
        previousPinch=next;
      }else if(mode==='top'||old.pan){
        cam.px+=dx;cam.py+=dy;
      }else{
        cam.yaw+=dx*.011;cam.elev=Math.max(.10,Math.min(1.5,cam.elev-dy*.007));
      }
      drawSoon();
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,e=>{
      pointers.delete(e.pointerId);previousPinch=0;
    }));
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();cam.zoom=Math.max(.2,Math.min(10,cam.zoom*Math.exp(-e.deltaY*.0012)));
      drawSoon();
    },{passive:false});
    $('rotateLeft').addEventListener('click',()=>{if(mode==='3d')cam.yaw-=Math.PI/2;drawSoon();});
    $('rotateRight').addEventListener('click',()=>{if(mode==='3d')cam.yaw+=Math.PI/2;drawSoon();});
    $('resetView').addEventListener('click',()=>{
      cam.yaw=.68;cam.elev=.55;cam.zoom=1;cam.px=cam.py=0;drawSoon();
    });
    if(window.ResizeObserver)new ResizeObserver(drawSoon).observe(canvas);
    else window.addEventListener('resize',drawSoon);
  }
  function init(){
    try{editor.value=localStorage.getItem('gabcon-buildai-code')||SAMPLE;
      $('idea').value=localStorage.getItem('gabcon-buildai-idea')||$('idea').value;}
    catch(_){editor.value=SAMPLE;}
    editor.addEventListener('input',updateEditor);
    editor.addEventListener('scroll',()=>{$('lineNumbers').scrollTop=editor.scrollTop;});
    editor.addEventListener('keydown',e=>{
      if(e.key==='Tab'){e.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');updateEditor();}
    });
    $('idea').addEventListener('input',()=>{
      try{localStorage.setItem('gabcon-buildai-idea',$('idea').value);}catch(_){}
    });
    $('copyPrompt').addEventListener('click',copyPrompt);
    $('example').addEventListener('click',()=>{
      if(editor.value.trim()&&editor.value!==SAMPLE&&!confirm('Remplacer le code actuel par un exemple ?'))return;
      editor.value=SAMPLE;updateEditor();notify('Exemple chargé.');
    });
    $('importPy').addEventListener('change',async e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>200000){notify('Fichier trop volumineux pour le navigateur.',true);return;}
      editor.value=extractCode(await file.text());updateEditor();notify('Blueprint importé.');
      e.target.value='';
    });
    $('runBuild').addEventListener('click',run);
    $('cancelBuild').addEventListener('click',()=>{endWorker();setStatus('ANNULÉ');notify('Calcul interrompu.');});
    $('tab3d').addEventListener('click',()=>setView('3d'));
    $('tabTop').addEventListener('click',()=>setView('top'));
    $('exportSchem').addEventListener('click',saveSchem);
    $('exportPython').addEventListener('click',savePython);
    $('exportJson').addEventListener('click',saveJSON);
    pointerEvents();updateEditor();preparePreview();
  }
  init();
})();
