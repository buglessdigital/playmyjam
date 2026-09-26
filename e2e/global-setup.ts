import { seedVenue } from "./db";

export default async function globalSetup() {
  await seedVenue();
}
