import { describe, expect, it } from 'vitest'

// TEMPORAIRE — preuve SETUP-011 : ce test échoue volontairement pour vérifier
// que l'intégration continue passe au rouge et que la fusion est refusée.
// Cette branche n'a pas vocation à être fusionnée ; elle est supprimée ensuite.
describe('Preuve SETUP-011', () => {
  it('échoue volontairement pour faire rougir la CI', () => {
    expect(1).toBe(2)
  })
})
