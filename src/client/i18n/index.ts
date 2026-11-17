import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './ru.json'
import en from './en.json'

const STORAGE_KEY = 'talkreal.lang'

function savedLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'ru'
  } catch {
    return 'ru'
  }
}

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: savedLanguage(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // Private mode: the choice just won't be remembered.
  }
})
document.documentElement.lang = i18n.language

export default i18n
