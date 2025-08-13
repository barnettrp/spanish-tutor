
function escapeHtml(str){
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\"/g,"&quot;").replace(/'/g,"&#39;");
}
function linkifySpanish(text){
  const esc = escapeHtml(text || "");
  const tokens = esc.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) || [esc];
  return tokens.map(tok => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(tok) ? '<a href="#" class="wr-word" data-word="'+tok+'">'+tok+'</a>' : tok).join("");
}
// Popup dictionary
(function(){
  const pop = document.createElement("div");
  pop.id = "dict-pop"; pop.className="dict-pop"; pop.setAttribute("role","dialog"); pop.setAttribute("aria-modal","true");
  pop.innerHTML = '<button class="close" title="Close" aria-label="Close">×</button>\
    <div class="head" id="dict-word">word</div>\
    <div class="hint" id="dict-quick">(loading quick meaning…)</div>\
    <div class="row">\
      <a id="dict-wr" target="_blank" rel="noopener noreferrer">WordReference</a>\
      <a id="dict-gt" target="_blank" rel="noopener noreferrer">Google Translate</a>\
      <button id="dict-copy">Copy</button>\
    </div>';
  document.body.appendChild(pop);
  const wEl = document.getElementById("dict-word"); const hintEl = document.getElementById("dict-quick");
  const wrEl = document.getElementById("dict-wr"); const gtEl = document.getElementById("dict-gt");
  const copyBtn = document.getElementById("dict-copy"); const closeBtn = pop.querySelector(".close");
  function positionPop(x,y){ const pad=8,rect=pop.getBoundingClientRect(),vw=innerWidth,vh=innerHeight; let l=x,t=y; if(l+rect.width+pad>vw) l=vw-rect.width-pad; if(t+rect.height+pad>vh) t=vh-rect.height-pad; pop.style.left=l+'px'; pop.style.top=t+'px'; }
  async function quickLookup(word){ try{ const url="https://api.mymemory.translated.net/get?q="+encodeURIComponent(word)+"&langpair=es|en"; const res=await fetch(url,{mode:"cors"}); if(!res.ok) throw 0; const data=await res.json(); const text=data?.responseData?.translatedText; hintEl.textContent = (text&&text.toLowerCase()!==word.toLowerCase()) ? ("Quick meaning: "+text) : "(No quick meaning found. Use links.)"; }catch{ hintEl.textContent="(Not available. Use links.)"; } }
  function showPop(word,x,y){ wEl.textContent=word; hintEl.textContent="(loading quick meaning…)"; wrEl.href="https://www.wordreference.com/es/en/translation.asp?spen="+encodeURIComponent(word.toLowerCase()); gtEl.href="https://translate.google.com/?sl=es&tl=en&text="+encodeURIComponent(word)+"&op=translate"; positionPop(x,y); pop.style.display="block"; quickLookup(word); }
  function hidePop(){ pop.style.display="none"; }
  document.addEventListener("click",(e)=>{ const a=e.target.closest("a.wr-word"); if(a){ e.preventDefault(); const word=a.getAttribute("data-word")||a.textContent.trim(); const x=(e.clientX||40)+10, y=(e.clientY||40)+10; showPop(word,x,y);} else if(!e.target.closest("#dict-pop")){ hidePop(); } }); closeBtn.addEventListener("click", hidePop);
  copyBtn.addEventListener("click", async ()=>{ try{ await navigator.clipboard.writeText(wEl.textContent||""); hintEl.textContent="Copied to clipboard."; }catch{ hintEl.textContent="Could not copy."; } }); document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") hidePop(); });
})();

async function ensureSession(){
  const r = await fetch("/api/me"); if (r.ok){ const me = await r.json(); if(me?.name){ const tag = document.getElementById("whoami"); if(tag) tag.textContent = "Signed in as: " + me.name; return me; } }
  location.href = "join.html";
}
async function initChat({ mode }){
  await ensureSession();
  const chatEl = document.getElementById("chat");
  const inp = document.getElementById("inp");
  const btn = document.getElementById("send");
  const ttsChk = document.getElementById("tts");
  const micBtn = document.getElementById("mic");
  const corrEl = document.getElementById("corrections");
  const recapEl = document.getElementById("recap");
  const boostChk = document.getElementById("boost");

  function addMsg(role, html){
    const div = document.createElement("div"); div.className="bubble "+(role==="user"?"user":"assistant"); div.innerHTML=html;
    chatEl.appendChild(div); chatEl.scrollTop = chatEl.scrollHeight;
    if(role==="assistant" && ttsChk && ttsChk.checked){
      try{ const u=new SpeechSynthesisUtterance(div.textContent||""); u.lang="es-MX"; u.rate=(mode==="voice")?0.9:1.0; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch{}
    }
  }
  const intro = (mode === "conversation") ? "Hola, soy tu tutor. Empecemos una conversación." :
                (mode === "immersion") ? "Modo inmersión: hablemos solo en español." :
                "Modo voz: habla en frases cortas; te corregiré con suavidad.";
  addMsg("assistant", linkifySpanish(intro));

  (function(){
    let rec=null; micBtn.addEventListener("click", ()=>{
      if(rec){ rec.stop(); rec=null; micBtn.textContent="🎤 Speak"; return; }
      const SR = window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR){ alert("Your browser does not support speech recognition."); return; }
      rec = new SR(); rec.lang = (mode==="voice")?"es-MX":"en-US"; rec.interimResults=false; rec.maxAlternatives=1;
      rec.onresult = (e)=>{ const t=e.results?.[0]?.[0]?.transcript || ""; inp.value = (inp.value?inp.value+" ":"")+t; };
      rec.onend=()=>{ micBtn.textContent="🎤 Speak"; rec=null; }; rec.onerror=()=>{ micBtn.textContent="🎤 Speak"; rec=null; };
      rec.start(); micBtn.textContent="■ Stop";
    });
  })();

  btn.addEventListener("click", onSend);
  inp.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); onSend(); }});

  async function onSend(){
    const text = (inp.value||"").trim(); if(!text) return;
    addMsg("user", escapeHtml(text)); inp.value="";
    try{
      const r = await fetch("/api/chat", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ message: text, mode, useBoost: !!(boostChk && boostChk.checked) })
      });
      if(!r.ok){
        const err = await r.json().catch(()=>({}));
        addMsg("assistant", linkifySpanish(err.error || "Lo siento, has alcanzado el límite por hoy."));
        return;
      }
      const data = await r.json();
      addMsg("assistant", linkifySpanish(data.reply || "(sin respuesta)"));
      if(data.meta?.corrections?.length){
        corrEl.innerHTML = data.meta.corrections.map(c=>"<div><strong>Original:</strong> "+escapeHtml(c.original)+"<br/><strong>Corrected:</strong> "+escapeHtml(c.corrected)+"<br/><span class='small'>"+escapeHtml(c.note_en||"")+"</span></div>").join("<hr/>");
      }
      if(data.meta?.recap){
        const rcp = data.meta.recap;
        let html = "";
        if(rcp.new_words?.length){ html += "<div><strong>New words:</strong><ul>"+rcp.new_words.map(w=>"<li><strong>"+escapeHtml(w.word)+"</strong> = "+escapeHtml(w.meaning_en)+"</li>").join("")+"</ul></div>"; }
        if(rcp.grammar_point) html += "<div><strong>Grammar:</strong> "+escapeHtml(rcp.grammar_point)+"</div>";
        if(rcp.homework) html += "<div><strong>Homework:</strong> "+escapeHtml(rcp.homework)+"</div>";
        recapEl.innerHTML = html || "(Will appear after a reply)";
      }
      if(data.usage?.model){
        const badge = document.createElement("div"); badge.className = "small"; badge.textContent = "Model: " + data.usage.model;
        recapEl.appendChild(badge);
      }
    }catch(e){
      addMsg("assistant", linkifySpanish("Perdón, ocurrió un problema. Intenta de nuevo."));
    }
  }
}
