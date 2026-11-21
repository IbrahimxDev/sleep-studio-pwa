const CACHE='sleep-studio-962630c786dd';
const ASSETS=["./", "./index.html", "./ios.css", "./pwa.css", "./pwa.js", "./recording.js", "./storage.js", "./core.js", "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable.png", "./assets/icon.svg", "./audio/breath.wav", "./audio/chime.wav", "./audio/fire.wav", "./audio/forest.wav", "./audio/hum.wav", "./audio/ocean.wav", "./audio/rain.wav", "./audio/stream.wav", "./audio/warm.wav"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sleep-studio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const known=ASSETS.some(path=>new URL(path,self.registration.scope).href===url.href);
 if(event.request.mode==='navigate'){
   event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(new URL('./index.html',self.registration.scope),copy));}return response;}).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));return;
 }
 if(!known)return;
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
