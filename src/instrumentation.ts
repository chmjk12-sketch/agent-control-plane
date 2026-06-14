import { healthChecker } from "@/lib/health-checker";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    healthChecker.start();
  }
}
