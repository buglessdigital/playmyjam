import { Suspense } from "react";
import NewVenueForm from "./NewVenueForm";

// Form ?name= ile ön doldurulabildiği için useSearchParams kullanıyor —
// statik kabuk prerender edilebilsin diye Suspense sınırı burada.
export default function NewVenuePage() {
  return (
    <Suspense>
      <NewVenueForm />
    </Suspense>
  );
}
