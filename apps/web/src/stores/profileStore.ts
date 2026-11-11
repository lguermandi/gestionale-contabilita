import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvoiceAccounts } from '../domain/invoicing'

type Profile = 'private' | 'business'

export interface CompanyProfile {
    ragioneSociale: string
    indirizzo: string
    partitaIva: string
    codiceFiscale: string
    email: string
    pec: string
    codiceDestinatario: string
    telefono: string
    conti: InvoiceAccounts
}

const defaultCompanyProfile: CompanyProfile = {
    ragioneSociale: '',
    indirizzo: '',
    partitaIva: '',
    codiceFiscale: '',
    email: '',
    pec: '',
    codiceDestinatario: '',
    telefono: '',
    conti: {
        clienti: 'Crediti v/clienti',
        ricavi: 'Ricavi da servizi',
        iva: 'IVA a debito',
        ritenute: 'Erario c/ritenute subite',
        cassa: 'Contributi previdenziali',
        gestione: 'Tipica',
        bollo: 'Debiti per imposta di bollo',
        incassi: 'Banca c/c',
        costi: 'Costi per acquisti',
        ivaCredito: 'IVA a credito',
        fornitori: 'Debiti v/fornitori',
    },
}

interface ProfileState {
    activeProfile: Profile
    setActiveProfile: (profile: Profile) => void
    companyProfile: CompanyProfile
    setCompanyProfile: (profile: CompanyProfile) => void
}

export const useProfileStore = create<ProfileState>()(
    persist(
        (set) => ({
            activeProfile: 'private',
            setActiveProfile: (profile) => set({ activeProfile: profile }),
            companyProfile: defaultCompanyProfile,
            setCompanyProfile: (companyProfile) => set({ companyProfile }),
        }),
        {
            name: 'gestionale-active-profile',
            merge: (persistedState, currentState) => {
                const persisted = persistedState as Partial<ProfileState> | undefined
                return {
                    ...currentState,
                    ...persisted,
                    companyProfile: {
                        ...currentState.companyProfile,
                        ...persisted?.companyProfile,
                        conti: {
                            ...currentState.companyProfile.conti,
                            ...persisted?.companyProfile?.conti,
                        },
                    },
                }
            },
        },
    ),
)