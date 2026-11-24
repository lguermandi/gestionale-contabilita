import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvoiceAccounts } from '../domain/invoicing'
import type { AtecoActivity, SocialSecurityScheme } from '../domain/tax'

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
    regimeFiscale?: string
    cap?: string
    comune?: string
    provincia?: string
    nazione?: string
    codiceRea?: string
    codiceReaNumero?: string
    statoUfficio?: string
    capitaleSociale?: string
    socioUnico?: '' | 'SU' | 'SM'
    liquidazione?: '' | 'LS' | 'LN'
    tipoSoggetto?: 'persona_fisica' | 'societa' | 'ente'
    ateco?: string
    coefficienteRedditivita?: number
    aliquotaForfettario?: number
    nuovaAttivita?: boolean
    attivitaAteco?: AtecoActivity[]
    gestionePrevidenziale?: SocialSecurityScheme
    aliquotaGestioneSeparata?: number
    contributoFissoAnnuale?: number
    redditoMinimaleInps?: number
    aliquotaEccedenzaInps?: number
    saldoAnnoPrecedente?: number
    periodoIva?: 'mensile' | 'trimestrale'
    addizionaleRegionale?: number
    addizionaleComunale?: number
    conti: InvoiceAccounts
}

export const defaultCompanyProfile: CompanyProfile = {
    ragioneSociale: '',
    indirizzo: '',
    partitaIva: '',
    codiceFiscale: '',
    email: '',
    pec: '',
    codiceDestinatario: '',
    telefono: '',
    regimeFiscale: 'RF01',
    cap: '',
    comune: '',
    provincia: '',
    nazione: 'IT',
    tipoSoggetto: 'persona_fisica',
    ateco: '',
    coefficienteRedditivita: 78,
    aliquotaForfettario: 15,
    nuovaAttivita: false,
    attivitaAteco: [],
    gestionePrevidenziale: 'nessuna',
    aliquotaGestioneSeparata: 26.07,
    contributoFissoAnnuale: 4400,
    redditoMinimaleInps: 18555,
    aliquotaEccedenzaInps: 24,
    saldoAnnoPrecedente: 0,
    periodoIva: 'trimestrale',
    addizionaleRegionale: 0,
    addizionaleComunale: 0,
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

export function hasCustomCompanyProfile(profile: CompanyProfile) {
    return JSON.stringify(profile) !== JSON.stringify(defaultCompanyProfile)
}

interface ProfileState {
    activeProfile: Profile
    setActiveProfile: (profile: Profile) => void
    companyProfile: CompanyProfile
    companyProfileSpreadsheetId: string | null
    companyProfileStatus: 'idle' | 'loading' | 'ready' | 'error'
    companyProfileError: string | null
    companyProfileMigrated: boolean
    setCompanyProfile: (profile: CompanyProfile) => void
    setCompanyProfileForSpreadsheet: (profile: CompanyProfile, spreadsheetId: string, migrated?: boolean) => void
    setCompanyProfileStatus: (status: ProfileState['companyProfileStatus'], error?: string | null) => void
}

export const useProfileStore = create<ProfileState>()(
    persist(
        (set) => ({
            activeProfile: 'private',
            setActiveProfile: (profile) => set({ activeProfile: profile }),
            companyProfile: defaultCompanyProfile,
            companyProfileSpreadsheetId: null,
            companyProfileStatus: 'idle',
            companyProfileError: null,
            companyProfileMigrated: false,
            setCompanyProfile: (companyProfile) => set({ companyProfile }),
            setCompanyProfileForSpreadsheet: (companyProfile, companyProfileSpreadsheetId, migrated = false) => set({
                companyProfile,
                companyProfileSpreadsheetId,
                companyProfileStatus: 'ready',
                companyProfileError: null,
                companyProfileMigrated: migrated,
            }),
            setCompanyProfileStatus: (companyProfileStatus, companyProfileError = null) => set({
                companyProfileStatus,
                companyProfileError,
                companyProfileMigrated: false,
            }),
        }),
        {
            name: 'gestionale-active-profile',
            partialize: (state) => ({
                activeProfile: state.activeProfile,
                companyProfile: state.companyProfile,
                companyProfileSpreadsheetId: state.companyProfileSpreadsheetId,
            }),
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