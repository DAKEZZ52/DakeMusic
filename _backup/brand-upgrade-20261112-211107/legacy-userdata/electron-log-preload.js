
      try {
        (function r({contextBridge:e,ipcRenderer:t}){if(!t)return;t.on(`__ELECTRON_LOG_IPC__`,(e,t)=>{window.postMessage({cmd:`message`,...t})}),t.invoke(`__ELECTRON_LOG__`,{cmd:`getOptions`}).catch(e=>console.error(Error(`electron-log isn't initialized in the main process. Please call log.initialize() before. ${e.message}`)));let n={sendToMain(e){try{t.send(`__ELECTRON_LOG__`,e)}catch(n){console.error(`electronLog.sendToMain `,n,`data:`,e),t.send(`__ELECTRON_LOG__`,{cmd:`errorHandler`,error:{message:n?.message,stack:n?.stack},errorName:`sendToMain`})}},log(...e){n.sendToMain({data:e,level:`info`})}};for(let e of[`error`,`warn`,`info`,`verbose`,`debug`,`silly`])n[e]=(...t)=>n.sendToMain({data:t,level:e});if(e&&process.contextIsolated)try{e.exposeInMainWorld(`__electronLog`,n)}catch{}typeof window==`object`?window.__electronLog=n:__electronLog=n})(require('electron'));
      } catch(e) {
        console.error(e);
      }
    