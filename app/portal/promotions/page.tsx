import { redirect } from 'next/navigation';

export default function LegacyPromotionsPage() {
  redirect('/dashboard/promotions');
}
