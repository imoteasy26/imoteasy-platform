import Link from 'next/link'

export function BrokerMigrationNotice() {
  return (
    <div className="rounded-2xl border border-brand/20 bg-brand/[0.04] p-5" role="status">
      <h2 className="font-semibold text-ink">Брокерската база все още не е активирана</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Не са направени промени в базата данни. P0 и P1 миграциите трябва първо да бъдат прегледани и приложени към изолирана тестова среда.
      </p>
      <Link className="mt-4 inline-flex font-semibold text-brand hover:underline" href="/broker/onboarding">Към въвеждането за брокери</Link>
    </div>
  )
}

export function BrokerErrorNotice({ children = 'Не успяхме да заредим работната среда.' }: { children?: string }) {
  return <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{children}</p>
}

export function BrokerStateNotice({ state }: { state?: string }) {
  const messages: Record<string, string> = {
    complete: 'Промяната е запазена.',
    created: 'Записът е създаден.',
    converted: 'Запитването е свързано с CRM лийд.',
    updated: 'Промените са запазени.',
    joined: 'Вече си част от екипа. Завърши въвеждането, за да активираш пробния период.',
    onboarding: 'Работното място е активирано. 30-дневният пробен период не изисква карта и не се подновява автоматично.',
    migration: 'Необходимата P1 миграция още не е налична в тази среда.',
    forbidden: 'Нямаш необходимите права за тази промяна.',
    invalid: 'Провери въведените данни и опитай отново.',
    error: 'Промяната не беше запазена. Опитай отново.',
  }
  const message = state ? messages[state] : undefined
  if (!message) return null
  return <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink" role="status">{message}</p>
}
