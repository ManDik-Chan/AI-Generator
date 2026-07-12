import { PersonaCard } from "@/features/persona/components/persona-card";
import type { PersonaView } from "@/features/persona/types";
export function PersonaList({ personas }: { personas: PersonaView[] }) { return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{personas.map((persona) => <PersonaCard key={persona.id} persona={persona} />)}</div>; }
