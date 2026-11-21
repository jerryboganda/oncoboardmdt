/* OncoBoard marketing site: shared chrome (header, footer, menu, theme) and motion.
   Load after GSAP + ScrollTrigger and before each page's own script. Pages read helpers from window.OB. */
(()=>{
const I={
arrow:'<path d="M5 12h14M13 5l7 7-7 7"/>',left:'<path d="M19 12H5M11 19l-7-7 7-7"/>',check:'<path d="M20 6 9 17l-5-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
sparkles:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',key:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',server:'<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',replay:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
clipboard:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6"/>',calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',chart:'<path d="M3 3v18h18M7 16v-5M12 16V8M17 16v-8"/>',database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
radio:'<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',command:'<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
vote:'<path d="m9 12 2 2 4-4"/><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12H5z"/><path d="M22 19H2"/>',book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',ext:'<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',layers:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',dna:'<path d="M2 15c6.7-6 13.3 0 20-6M2 9c6.7 6 13.3 0 20 6"/><path d="M6 10.5v3M10 9.2v5.6M14 9.2v5.6M18 10.5v3"/>',building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',keyboard:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',ruler:'<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2"/>',flask:'<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>'};
const svg=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]||''}</svg>`;
const paintIcons=(r=document)=>r.querySelectorAll('[data-i]').forEach(e=>e.innerHTML=svg(e.dataset.i));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches,FINE=matchMedia('(pointer:fine)').matches,root=document.documentElement,G=!!window.gsap&&!RM;
const pg=document.querySelector('[data-page]'),page=pg?pg.dataset.page:'home';

/* ---------- header, menu sheet, footer ---------- */
const NAV=[['product','product.html','Product'],['solutions','solutions.html','Boards'],['security','security.html','Security'],['pricing','pricing.html','Pricing'],['resources','resources.html','Resources'],['about','about.html','About']];
const on=k=>page===k||(page==='article'&&k==='resources');
const mark='<span class="mark" aria-hidden="true"><i style="height:42%;background:var(--thor)"></i><i style="height:76%;background:var(--neuro)"></i><i style="height:100%;background:var(--breast)"></i><i style="height:60%;background:var(--gi)"></i><i style="height:86%;background:var(--heme)"></i></span>';
const hdr=$('#site-header');
if(hdr)hdr.outerHTML=`<div class="prog" id="prog" aria-hidden="true"></div>
<a class="sr" href="#main" style="position:absolute;left:12px;top:12px;z-index:100" onfocus="this.classList.remove('sr')" onblur="this.classList.add('sr')">Skip to content</a>
<header class="nav" id="nav"><div class="wrap">
<a class="brand" href="./" aria-label="OncoBoard MDT home">${mark}OncoBoard<small>MDT</small></a>
<nav class="links" aria-label="Primary">${NAV.map(n=>`<a href="${n[1]}"${on(n[0])?' class="on" aria-current="page"':''}>${n[2]}</a>`).join('')}</nav>
<div class="nav-r"><button class="ib" id="theme" type="button" aria-label="Switch theme"></button><a class="btn btn-s btn-sm signin" href="/app/">Sign In</a><a class="btn btn-p btn-sm mag" href="contact.html">Book a Demo</a><button class="ib menu-btn" id="menu" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="sheet"><span data-i="menu"></span></button></div>
</div></header>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Menu" hidden>
<div class="sheet-top"><span class="brand">${mark}OncoBoard</span><button class="ib" id="close" type="button" aria-label="Close menu"><span data-i="x"></span></button></div>
${[['home','./','Home'],...NAV].map((n,i)=>`<a class="big" href="${n[1]}"${on(n[0])?' aria-current="page"':''}>${n[2]} <span>${String(i+1).padStart(2,'0')}</span></a>`).join('')}
<div class="foot"><a class="btn btn-p" href="contact.html">Book a Demo <span class="ar" data-i="arrow"></span></a><a class="btn btn-s" href="/app/">Sign In</a></div></div>`;
const ftr=$('#site-footer');
if(ftr)ftr.outerHTML=`<footer><div class="wrap">
<div class="fgrid">
<div><a class="brand" href="./" style="text-decoration:none">${mark}OncoBoard<small>MDT</small></a><p class="blurb">The live workspace for multidisciplinary tumour boards. Prepare the case, read the same image, record the decision.</p></div>
<div><h4>Product</h4><nav aria-label="Product"><a href="product.html">Platform</a><a href="solutions.html">Organ boards</a><a href="product.html#ai">AI Decision Support</a><a href="product.html#analytics">Clinical Analytics</a><a href="pricing.html">Pricing</a></nav></div>
<div><h4>Company</h4><nav aria-label="Company"><a href="about.html">About</a><a href="resources.html">Resources</a><a href="contact.html">Book a Demo</a><a href="/app/">Sign In</a></nav></div>
<div><h4>Trust</h4><nav aria-label="Trust"><a href="security.html">Security &amp; governance</a><a href="legal.html#privacy">Privacy notice</a><a href="legal.html#terms">Terms of use</a><a href="legal.html#clinical">Clinical disclaimer</a></nav></div>
</div>
<div class="wordmark" aria-hidden="true">OncoBoard</div>
<div class="fbot"><span>© 2026 OncoBoard MDT. Clinical decision support. Treatment decisions remain with the treating clinicians.</span><span>Clinical Light · Dark Radiology</span></div>
</div></footer>`;
const main=$('main');if(main&&!main.id)main.id='main';
paintIcons();

/* ---------- theme ---------- */
const themeCbs=[];const tb=$('#theme');
const isDark=()=>root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
function paintTheme(){if(tb){tb.innerHTML=svg(isDark()?'sun':'moon');tb.setAttribute('aria-label',isDark()?'Switch to light theme':'Switch to dark theme')}themeCbs.forEach(f=>f(isDark()))}
try{const t=localStorage.getItem('ob-b-theme');if(t)root.dataset.theme=t}catch(e){}
if(tb)tb.onclick=()=>{root.dataset.theme=isDark()?'light':'dark';try{localStorage.setItem('ob-b-theme',root.dataset.theme)}catch(e){}paintTheme()};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paintTheme);
paintTheme();

/* ---------- nav state + reading progress ---------- */
const nav=$('#nav'),prog=$('#prog');
const onScroll=()=>{if(nav)nav.classList.toggle('solid',scrollY>8);const m=root.scrollHeight-innerHeight;if(prog)prog.style.transform=`scaleX(${m>0?Math.min(1,scrollY/m):0})`};
addEventListener('scroll',onScroll,{passive:true});onScroll();

/* ---------- mobile menu ---------- */
const sheet=$('#sheet'),mb=$('#menu');
function openSheet(o){if(!sheet)return;if(o){sheet.hidden=false;requestAnimationFrame(()=>sheet.classList.add('open'));$$('.sheet a.big').forEach((a,i)=>a.style.transitionDelay=(60+i*40)+'ms');$('#close').focus()}else{sheet.classList.remove('open');setTimeout(()=>sheet.hidden=true,300);mb&&mb.focus()}mb&&mb.setAttribute('aria-expanded',o);document.body.style.overflow=o?'hidden':''}
if(mb)mb.onclick=()=>openSheet(true);
const cl=$('#close');if(cl)cl.onclick=()=>openSheet(false);
$$('.sheet a').forEach(a=>a.addEventListener('click',()=>openSheet(false)));
addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet&&!sheet.hidden)openSheet(false)});

/* ---------- helpers ---------- */
const placePill=(p,b)=>{if(!p||!b)return;p.style.width=b.offsetWidth+'px';p.style.transform=`translateX(${b.offsetLeft}px)`};
const counter=(el,to,fmt=v=>Math.round(v))=>{if(!G){el.textContent=fmt(to);return}const o={v:0};gsap.to(o,{v:to,duration:1.4,ease:'power2.out',onUpdate:()=>el.textContent=fmt(o.v),scrollTrigger:{trigger:el,start:'top 92%',once:true}})};

/* sticky in-page nav: highlight the section in view */
const sub=$('.subnav');
if(sub){document.body.classList.add('has-subnav');const ls=[...sub.querySelectorAll('a[href^="#"]')];const ids=ls.map(a=>a.getAttribute('href').slice(1)).filter(id=>document.getElementById(id));
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;ls.forEach(a=>{const hit=a.getAttribute('href')==='#'+e.target.id;a.classList.toggle('on',hit);if(hit){a.setAttribute('aria-current','true');const w=sub.querySelector('.wrap');w.scrollTo({left:a.offsetLeft-w.clientWidth/2+a.offsetWidth/2,behavior:RM?'auto':'smooth'})}else a.removeAttribute('aria-current')})}),{rootMargin:'-40% 0px -55% 0px'});
 ids.forEach(id=>io.observe(document.getElementById(id)))}

/* magnetic primary buttons */
if(!RM&&FINE)$$('.mag').forEach(b=>{b.addEventListener('pointermove',e=>{const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.16}px,${(e.clientY-r.top-r.height/2)*.28}px)`});b.addEventListener('pointerleave',()=>{b.style.transition='transform .5s cubic-bezier(.2,.9,.2,1),background-color .25s,color .25s,border-color .25s';b.style.transform='';setTimeout(()=>b.style.transition='',500)})});

/* ---------- motion (page is complete and static without GSAP) ---------- */
if(G){
 gsap.registerPlugin(ScrollTrigger);
 // Default lag smoothing counts any frame gap over 500 ms as 33 ms, so throttled tabs (background,
 // power saving) would crawl and keep content hidden; follow real time so reveals always finish on schedule.
 gsap.ticker.lagSmoothing(0);
 document.fonts&&document.fonts.ready.then(()=>ScrollTrigger.refresh());
 const ph=$('.phero');
 if(ph){const t=gsap.timeline({defaults:{ease:'expo.out'}});
  t.fromTo('.ptitle .ln>span',{yPercent:108},{yPercent:0,duration:1.2,stagger:.1})
   .fromTo('.phero .crumb',{y:12,opacity:0},{y:0,opacity:1,duration:.8},.1)
   .fromTo('.phero .plede,.phero .cta-row,.phero .pstats',{y:22,opacity:0},{y:0,opacity:1,duration:1,stagger:.1},.45)
   .fromTo('.phero .spectrum',{scaleX:0},{scaleX:1,duration:1.4,ease:'expo.inOut'},.5)}
 // fromTo with explicit end values: a re-fired reveal can never strand an element at opacity 0
 $$('.h2,.h3big').forEach(t=>gsap.fromTo(t,{y:60,opacity:0},{y:0,opacity:1,duration:1.1,ease:'expo.out',scrollTrigger:{trigger:t,start:'top 90%',once:true,toggleActions:'play complete complete complete'}}));
 ScrollTrigger.batch('.rv,.intro,.stat p,.tool,.guard>div,.ti,.faq-list details,.kpi,.chart,.card,.tier,.steps>div,.frow .mock,.specs,.checks',{start:'top 92%',once:true,onEnter:b=>gsap.fromTo(b,{y:30,opacity:0},{y:0,opacity:1,duration:.9,stagger:.07,ease:'power3.out',overwrite:true,clearProps:'transform'})});
 $$('.mesh .blob').forEach((b,i)=>gsap.to(b,{x:i%2?-140:140,y:i<2?90:-70,duration:8+i*1.5,repeat:-1,yoyo:true,ease:'sine.inOut'}));
 const wm=$('.wordmark');if(wm)gsap.fromTo(wm,{yPercent:40,opacity:0},{yPercent:0,opacity:.9,ease:'none',scrollTrigger:{trigger:wm,start:'top bottom',end:'bottom bottom',scrub:true}});
}

window.OB={I,svg,paintIcons,$,$$,RM,FINE,G,root,page,isDark,onTheme:f=>themeCbs.push(f),placePill,counter};
})();
