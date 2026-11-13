/**
 * Shared by every environment file (never file-replaced, so the
 * environment files can't import each other in a loop). The Firebase web
 * client config is public by design: security comes from Auth + rules.
 * Never put server secrets (PayU, Places keys) in this app.
 */
export const baseEnvironment = {
  production: true,
  useEmulators: false,
  functionsRegion: 'asia-south1',
  firebase: {
    apiKey: 'AIzaSyBeeSEObnfOYUwAT67tf1YUkyz8rTPTH_4',
    authDomain: 'zippy-app-2024.firebaseapp.com',
    projectId: 'zippy-app-2024',
    storageBucket: 'zippy-app-2024.firebasestorage.app',
    messagingSenderId: '182229138750',
    appId: '1:182229138750:web:7a5543f4598d56db9a806f',
    measurementId: 'G-GZF8PTXNZD',
  },
};
