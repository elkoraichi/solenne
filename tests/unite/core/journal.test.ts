import { afterEach, describe, expect, it } from 'vitest'

import { versEchec } from '@/server/errors'
import {
  configurerSortieJournal,
  journal,
  retablirSortieJournalParDefaut,
  type EntreeJournal,
} from '@/server/logging/logger'
import {
  estChampSensible,
  MARQUEUR_MASQUE,
  masquerSecrets,
} from '@/server/logging/redaction'

function capturer() {
  const entrees: EntreeJournal[] = []
  const restaurer = configurerSortieJournal((entree) => entrees.push(entree))
  return { entrees, restaurer }
}

afterEach(() => {
  retablirSortieJournalParDefaut()
})

describe('CORE-004 — journalisation complète', () => {
  it('porte niveau, horodatage, utilisateur, action et détail technique', () => {
    const { entrees, restaurer } = capturer()
    versEchec(new Error('boum'), {
      action: 'accepterDemande',
      utilisateurId: 'utilisateur-1',
    })
    restaurer()

    const entree = entrees[0]
    expect(entree).toBeDefined()
    expect(entree?.niveau).toBe('error')
    expect(entree?.action).toBe('accepterDemande')
    expect(entree?.utilisateurId).toBe('utilisateur-1')
    expect(new Date(entree?.horodatage ?? '').toString()).not.toBe(
      'Invalid Date',
    )
    expect(JSON.stringify(entree?.detail)).toContain('boum')
    // Le détail technique complet est conservé : c'est le but du journal.
    expect(JSON.stringify(entree?.detail)).toContain('pile')
  })

  it('renseigne utilisateur et action à null plutôt que de les omettre', () => {
    const { entrees, restaurer } = capturer()
    journal.info('Sonde')
    restaurer()

    expect(entrees[0]).toMatchObject({
      niveau: 'info',
      utilisateurId: null,
      action: null,
      detail: null,
    })
  })
})

describe('CORE-006 — aucun secret journalisé', () => {
  it('masque les champs sensibles quel que soit leur nom exact', () => {
    for (const nom of [
      'password',
      'passwordHash',
      'motDePasse',
      'mot_de_passe',
      'token',
      'tokenHash',
      'resetToken',
      'sessionToken',
      'AUTH_SECRET',
      'apiKey',
      'Authorization',
      'cookie',
      'jetonInvitation',
    ]) {
      expect(estChampSensible(nom), nom).toBe(true)
    }
  })

  it('laisse passer les champs ordinaires', () => {
    for (const nom of ['email', 'prenom', 'arrivalDate', 'adults', 'statut']) {
      expect(estChampSensible(nom), nom).toBe(false)
    }
  })

  it('remplace le contenu sensible par [masqué], y compris en profondeur', () => {
    const { entrees, restaurer } = capturer()
    journal.info('Connexion', {
      action: 'seConnecter',
      utilisateurId: 'utilisateur-1',
      detail: {
        email: 'solenne@exemple.test',
        password: 'Tr3sSecret!',
        session: {
          sessionToken: 'abcdef0123456789',
          expire: '2026-09-01',
        },
        invitation: { tokenHash: 'e3b0c44298fc1c14' },
      },
    })
    restaurer()

    const serialise = JSON.stringify(entrees[0])
    expect(serialise).not.toContain('Tr3sSecret!')
    expect(serialise).not.toContain('abcdef0123456789')
    expect(serialise).not.toContain('e3b0c44298fc1c14')
    expect(serialise).toContain(MARQUEUR_MASQUE)
    // Ce qui n'est pas sensible reste lisible : le journal doit rester utile.
    expect(serialise).toContain('solenne@exemple.test')
    expect(serialise).toContain('2026-09-01')
  })

  it('ne modifie pas l’objet d’origine', () => {
    const origine = { password: 'secret' }
    masquerSecrets(origine)
    expect(origine.password).toBe('secret')
  })

  it('coupe les références circulaires sans planter', () => {
    const boucle: Record<string, unknown> = { nom: 'maison' }
    boucle.soiMeme = boucle
    expect(() => JSON.stringify(masquerSecrets(boucle))).not.toThrow()
  })

  it('tronque un champ démesuré au lieu de saturer le journal', () => {
    const enorme = 'x'.repeat(100_000)
    const masque = masquerSecrets({ commentaire: enorme }) as {
      commentaire: string
    }
    expect(masque.commentaire.length).toBeLessThan(2_100)
    expect(masque.commentaire).toContain('100000 caractères')
  })
})
