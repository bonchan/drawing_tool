import { useSyncExternalStore } from 'react'
import { analyzer, engine } from '../session'
import type { AnalysisState } from '../analysis/analyzer'
import type { DocState } from '../engine/Engine'

export function useDoc<U>(selector: (s: DocState) => U): U {
  return useSyncExternalStore(engine.subscribe, () => selector(engine.getState()))
}

export function useAnalysis<U>(selector: (s: AnalysisState) => U): U {
  return useSyncExternalStore(analyzer.subscribe, () => selector(analyzer.getState()))
}
