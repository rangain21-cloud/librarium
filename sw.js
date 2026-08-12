/* ============================================================================
 * BiblioApp — Service Worker
 * Rend l'application résiliente APRÈS un premier chargement réussi :
 * même si GitHub Pages (ou un CDN) devient lent/indisponible ensuite,
 * la page et ses ressources déjà vues se rechargent depuis le cache local.
 *
 * Stratégies :
 *  - Page HTML (navigation)      : réseau en priorité (avec délai court),
 *                                   repli sur le cache si le réseau échoue/traîne.
 *  - Scripts/styles/CDN connus   : cache d'abord, puis mise à jour silencieuse
 *                                   en arrière-plan (stale-while-revalidate).
 *  - Tout le reste (API Drive,
 *    OAuth, requêtes POST, etc.) : jamais mis en cache — on laisse passer
 *                                   directement vers le réseau.
 * ==========================================================================*/

const CACHE_NAME = 'biblioapp-shell-v1';

// Délai max accordé au réseau avant de basculer sur le cache pour la page HTML
const NETWORK_TIMEOUT_MS = 4000;

// Hôtes dont les scripts statiques peuvent être mis en cache sans risque
// (bibliothèques JS chargées en lecture seule, jamais de données perso)
const CACHEABLE_HOSTS = [
    'apis.google.com',
    'accounts.google.com',
    'cdn.jsdelivr.net'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // On ne touche jamais aux requêtes qui ne sont pas de simples lectures :
    // POST/PUT/DELETE vers l'API Google Drive, OAuth, etc. doivent partir
    // vers le réseau sans interception.
    if (req.method !== 'GET') return;

    let url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return;
    }

    // Jamais de cache pour les échanges d'authentification / API Drive dynamique
    if (url.hostname.includes('googleapis.com') && url.pathname.includes('/drive')) return;
    if (url.hostname.includes('accounts.google.com') && (url.pathname.includes('/o/') || url.pathname.includes('/gsi/select'))) return;

    // Navigation (chargement de la page elle-même)
    if (req.mode === 'navigate') {
        event.respondWith(networkFirst(req));
        return;
    }

    // Ressources statiques connues (scripts CDN, même origine)
    if (url.origin === self.location.origin || CACHEABLE_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(req));
    }
    // Sinon : on laisse passer sans intervention (comportement par défaut du navigateur)
});

/* Réseau en priorité, avec timeout court, repli sur le cache si besoin */
async function networkFirst(req) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const networkPromise = fetch(req);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('network-timeout')), NETWORK_TIMEOUT_MS)
        );
        const response = await Promise.race([networkPromise, timeoutPromise]);
        if (response && response.ok) {
            cache.put(req, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        // Dernier recours : essayer le réseau sans timeout (au cas où il était juste lent)
        try {
            const response = await fetch(req);
            if (response && response.ok) cache.put(req, response.clone());
            return response;
        } catch (e) {
            // Rien en cache et pas de réseau : impossible à éviter lors du tout premier
            // chargement échoué, comme convenu.
            return new Response(
                '<h1>Hors ligne</h1><p>BiblioApp n\'a pas encore de version en cache sur cet appareil.</p>',
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        }
    }
}

/* Sert le cache immédiatement si dispo, met à jour en arrière-plan */
async function staleWhileRevalidate(req) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const networkFetch = fetch(req)
        .then((response) => {
            if (response && response.ok) cache.put(req, response.clone());
            return response;
        })
        .catch(() => null);

    return cached || (await networkFetch) || Response.error();
}
