import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { checkMemoryUsage } from "./debug/debug";
import { loadInitialState } from "./state/functions";
import {
  saveSaddleDataToDB,
  saveToDatabaseTSMClassicDataFromAllAuctionHouses,
} from "./helpers/helpers";

const app = new Elysia()
  .state("state", {})
  .onStart(async () => {
    const initialStateData = await loadInitialState();
    app.store.state = initialStateData;

    try {
      checkMemoryUsage(process.memoryUsage());
      console.log("Before saving saddle data");
      await saveSaddleDataToDB();
      console.log("Saddle data saved");
      checkMemoryUsage(process.memoryUsage());
      await saveToDatabaseTSMClassicDataFromAllAuctionHouses(
        initialStateData.tsmToken,
        initialStateData.blizzToken
      );
      console.log("Full AH data items fetched");
      checkMemoryUsage(process.memoryUsage());
    } catch (error) {
      console.error("Error:", error);
    }
  })
  .use(cors())
  .get("/", async () => {})
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
