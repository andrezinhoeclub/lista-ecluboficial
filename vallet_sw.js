// ===== APOSENTADORIA DO OFFLINE ANTIGO DO VALLET =====
// Ate a mudanca, este arquivo ficava registrado na RAIZ do site, e por isso
// mandava em TODAS as telas — num celular que ja tinha aberto o vallet, ele
// interceptava tambem a portaria e as listas e guardava essas paginas dentro
// da memoria do vallet. O vallet agora tem o seu proprio, dentro da pasta
// /estacionamento, cuidando so dela.
//
// Este aqui nao guarda mais nada: ele apaga as copias antigas, se desregistra
// e manda cada aba aberta recarregar. Depois disso, some da vida do aparelho.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('eclub-vallet-')).map((n) => caches.delete(n)));
    await self.registration.unregister();
    const abas = await self.clients.matchAll({ type: 'window' });
    abas.forEach((aba) => aba.navigate(aba.url));
  })());
});

// Enquanto nao se desliga, nao intercepta nada: tudo vai direto para a internet.
