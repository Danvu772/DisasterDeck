// The board lives on the landing page now. Old links still work.
import { redirect } from "next/navigation";

export default function BoardPage() {
  redirect("/");
}
