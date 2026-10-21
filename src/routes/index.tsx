import { createFileRoute } from "@tanstack/react-router";
import { TowerGame } from "@/components/tower-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TowerGame />;
}
