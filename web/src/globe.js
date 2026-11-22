// Preserve old globe bookmarks while all explorer views now share one page.
const destination=new URL('/map.html',window.location.origin);
destination.search=window.location.search;destination.searchParams.set('view','globe');
window.location.replace(destination.href);
