// Push for house alerts (FCM). Firebase shows notifications that arrive while the app is closed.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAXouXyBkc1p_SbyHCUc6hhqSAazofVED0',
  authDomain: 'home-app-f94e4.firebaseapp.com',
  projectId: 'home-app-f94e4',
  storageBucket: 'home-app-f94e4.firebasestorage.app',
  messagingSenderId: '946405829381',
  appId: '1:946405829381:web:c66c88f7936ba84ab2656c',
});
firebase.messaging();

// tapping the notification opens (or focuses) the app
self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  ev.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => new URL(c.url).origin === self.location.origin);
    return w ? w.focus() : clients.openWindow('/');
  }));
});
