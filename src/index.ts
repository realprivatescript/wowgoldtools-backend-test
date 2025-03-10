import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { prisma } from "./db/db";
import { checkMemoryUsage } from "./debug/debug";
import { loadInitialState } from "./state/functions";
import { saveSaddleDataToDB } from "./helpers/helpers";

const app = new Elysia()
  .state("state", {})
  .onStart(async () => {
    const initialStateData = await loadInitialState();
    app.store.state = initialStateData;
    checkMemoryUsage(process.memoryUsage());

    try {
      console.log("Before saving saddle data");
      await saveSaddleDataToDB();
      console.log("456 - Saddle data saved");
    } catch (error) {
      console.error("Error in saveSaddleDataToDB:", error);
    }

    checkMemoryUsage(process.memoryUsage());
  })
  .use(cors())
  .get("/", async () => {})
  .listen(3500);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
