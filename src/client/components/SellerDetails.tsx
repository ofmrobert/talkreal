import { useTranslation } from 'react-i18next'
import offer from '../../../content/offer.json'
import seller from '../../../content/seller.json'

/** Who sells the paid plans: name, tax number and contacts, from content/seller.json. */
export default function SellerDetails() {
  const { i18n } = useTranslation()
  const text = i18n.language === 'en' ? offer.en : offer.ru
  const lines = [
    [text.sellerLabel, [seller.name, seller.status].filter(Boolean).join(', ')],
    [text.taxIdLabel, seller.taxId],
    ['', seller.registration],
    [text.addressLabel, seller.address],
    [text.contactLabel, seller.email],
    [text.phoneLabel, seller.phone],
  ].filter(([, value]) => value)

  if (lines.length === 0) return <p className="text-sm font-semibold leading-relaxed text-ink/55">{text.pending}</p>
  return (
    <p className="select-text text-sm font-semibold leading-relaxed text-ink/55">
      {lines.map(([label, value]) => (
        <span key={label + value} className="block">
          {label ? `${label}: ` : ''}
          {value}
        </span>
      ))}
    </p>
  )
}
