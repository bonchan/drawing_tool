import { createContext } from 'react'

/** Bottom sheets show a single section, so it is always expanded there. */
export const SectionContext = createContext<{ forceOpen: boolean }>({ forceOpen: false })
