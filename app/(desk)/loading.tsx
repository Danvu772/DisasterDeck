// First paint of the desk: the server reads the board from the database, so the page waits on it.
// Only this route group has a loading state. The other tabs keep the screen they show until their page is ready.
import { Loading } from "@/components/ui";

export default function DeskLoading() {
  return <Loading label="Loading the desk" />;
}
