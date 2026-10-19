(()=>{
  const settings={...document.currentScript.dataset};
  const root=document.getElementById('plan-model');
  const loading=document.querySelector('[data-model-loading]');
  const label=loading.querySelector('[data-loading-label]');
  const progress=loading.querySelector('progress');
  const controls=Array.from(root.querySelectorAll('button,input'));
  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  async function load(){
    try{
      const response=await fetch(settings.payload,{cache:'default'});
      if(!response.ok)throw new Error('下载模型失败，请稍后重试。');
      const total=Number(response.headers.get('content-length'))||0,chunks=[];
      let received=0;
      const reader=response.body.getReader();
      while(true){
        const {done,value}=await reader.read();if(done)break;
        chunks.push(value);received+=value.byteLength;
        if(total){progress.value=Math.min(1,received/total);label.textContent='正在加载模型… '+Math.min(100,Math.round(received/total*100))+'%';}
      }
      label.textContent='正在绘制模型…';progress.removeAttribute('value');
      await nextPaint();
      const blob=new Blob(chunks),magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());
      let stream=blob.stream();
      if(magic[0]===31&&magic[1]===139){
        if(!globalThis.DecompressionStream)throw new Error('请使用新版浏览器打开模型。');
        stream=stream.pipeThrough(new DecompressionStream('gzip'));
      }
      const payload=JSON.parse(await new Response(stream).text());
      document.querySelector('[data-scene="iso"]').innerHTML=payload.iso;
      await nextPaint();
      document.querySelector('[data-scene="plan"]').innerHTML=payload.plan;
      document.getElementById('model-data').textContent=JSON.stringify(payload.model);
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=settings.app;
        script.onload=resolve;script.onerror=()=>reject(new Error('交互程序加载失败，请重试。'));
        document.body.append(script);
      });
      if(!window.__planModel)throw new Error('模型启动失败，请重试。');
      controls.forEach(e=>e.disabled=false);
      root.setAttribute('aria-busy','false');loading.hidden=true;
      performance.mark('model-ready');
    }catch(error){
      label.textContent=error.message?.startsWith('请使用')?error.message:'模型暂未加载成功，请重试。';progress.hidden=true;
      const retry=document.createElement('button');retry.textContent='重新加载';retry.addEventListener('click',()=>location.reload());loading.append(retry);
      root.setAttribute('aria-busy','false');
    }
  }
  load();
})();
