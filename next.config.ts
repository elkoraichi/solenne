import type { NextConfig } from 'next'

import { verifierEnvironnementAuDemarrage } from './src/env/boot'

// Déclenché au chargement de la configuration : le serveur n'écoute pas et le
// build ne démarre pas si une variable obligatoire manque (SETUP-004).
verifierEnvironnementAuDemarrage()

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // L'indicateur de développement se superpose à la navigation basse et fausse
  // la mesure des cibles tactiles. On juge l'interface, pas l'outillage.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    // La limite par défaut (1 Mo) est plus basse que `TAILLE_MAX_OCTETS`
    // (5 Mo, cf. `@/domain/core/images`) : une photo de profil ordinaire la
    // dépassait avant même d'atteindre la validation métier.
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
}

export default nextConfig
