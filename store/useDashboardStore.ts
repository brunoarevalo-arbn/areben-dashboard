import { create } from 'zustand'
interface DashboardState {
  isLoading: boolean
  setIsLoading: (val: boolean) => void
}
export const useDashboardStore = create<DashboardState>((set) => ({
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
}))
