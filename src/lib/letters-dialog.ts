// A request to open the Letters dialog on the Characters page from elsewhere (the failure row's Open). Its own
// module so the app store can use it without importing the letters store (which imports the app store).
import { create } from 'zustand'

export const useLettersDialog = create<{ want: boolean }>(() => ({ want: false }))
export const openLettersDialog = () => useLettersDialog.setState({ want: true })
