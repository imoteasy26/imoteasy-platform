import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'

export function HomeSearch() {
  return (
    <form action="/imoti" className="search-panel p-4 sm:p-5" method="get">
      <FieldGroup className="grid gap-3 md:grid-cols-[1.15fr_1.15fr_1fr_1fr_auto] md:items-end">
        <Field>
          <FieldLabel htmlFor="home-city">Град или квартал</FieldLabel>
          <input className="form-control" id="home-city" name="city" placeholder="Например, София" />
        </Field>
        <Field>
          <FieldLabel htmlFor="home-transaction">Търся</FieldLabel>
          <select className="form-control" defaultValue="sale" id="home-transaction" name="transaction_type">
            <option value="sale">За покупка</option>
            <option value="rent">Под наем</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="home-type">Тип имот</FieldLabel>
          <select className="form-control" defaultValue="" id="home-type" name="property_type">
            <option value="">Всички типове</option>
            <option value="apartment">Апартамент</option>
            <option value="house">Къща</option>
            <option value="land">Парцел</option>
            <option value="office">Офис</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="home-budget">До цена</FieldLabel>
          <input className="form-control" id="home-budget" inputMode="numeric" min="0" name="max_price" placeholder="Без ограничение" type="number" />
        </Field>
        <Button className="min-h-12 rounded-xl px-5" type="submit">
          <Search aria-hidden data-icon="inline-start" /> Търси
        </Button>
      </FieldGroup>
    </form>
  )
}
