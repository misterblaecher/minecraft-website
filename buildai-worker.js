/* Execute a reduced GabCon BuildAI Python DSL in a disposable Pyodide worker.
 * The user's Python runs only inside their browser, never on the public website server.
 */
'use strict';
const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
let pyodidePromise = null;

async function loadRuntime() {
  postMessage({type:'progress',message:'Chargement de Python WebAssembly (première fois uniquement)…'});
  importScripts(CDN + 'pyodide.js');
  const pyodide = await loadPyodide({indexURL:CDN});
  postMessage({type:'progress',message:'Initialisation du moteur Python BuildAI Web…'});
  const runtime = await fetch('buildai-runtime.py', {cache:'no-store'});
  if (!runtime.ok) throw new Error('Moteur BuildAI Web introuvable.');
  pyodide.runPython(await runtime.text());
  return pyodide;
}

self.addEventListener('message',async event=>{
  if(event.data?.type!=='build')return;
  try{
    pyodidePromise ??= loadRuntime();
    const py = await pyodidePromise;
    postMessage({type:'progress',message:'Construction des blocs Minecraft…'});
    py.globals.set('WEB_BLUEPRINT_SOURCE',String(event.data.source || ''));
    py.globals.set('WEB_BLUEPRINT_SEED',Number(event.data.seed) || 0);
    const value=py.runPython('run_blueprint_web(WEB_BLUEPRINT_SOURCE,120000,WEB_BLUEPRINT_SEED)');
    postMessage({type:'result',data:JSON.parse(value)});
  }catch(error){
    postMessage({type:'error',message:String(error?.message || error).slice(0,2500)});
  }
});
