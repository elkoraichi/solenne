/**
 * Remplaçant de `server-only` pendant les tests.
 *
 * Le vrai module lève dès qu'il est importé hors d'un composant serveur React.
 * Sa raison d'être — empêcher du code serveur d'atterrir dans le navigateur —
 * est vérifiée par le build, pas par les tests.
 */
export {}
