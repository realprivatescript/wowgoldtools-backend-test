import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { checkMemoryUsage } from "./debug/debug";
import { loadInitialState } from "./state/functions";
import {
  calculateFlippingScore,
  saveSaddleDataToDB,
  saveToDatabaseTSMClassicDataFromAllAuctionHouses,
} from "./helpers/helpers";
import { prisma } from "./db/db";

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
  .group("/classic", (app) =>
    app
      .get("/all-realms-data", async ({}) => {
        return await prisma.extended_auction_data_items.findMany({
          distinct: ["auctionHouseId"],
          select: {
            auctionHouseId: true,
            name: true,
            regionId: true,
            realmId: true,
            regionPrefix: true,
            gameVersion: true,
            lastModified: true,
            type: true,
          },
        });
      })
      .get(
        "/ah-data/:auctionHouseId",
        async ({ params }) => {
          const pricingData = await prisma.extended_auction_data_items.findMany(
            {
              where: {
                auctionHouseId: params.auctionHouseId,
              },
            }
          );

          const customisedPricingData = pricingData.map((item) => ({
            ...item,
            profitMarginVsMarketValue:
              ((item.marketValue.toNumber() - item.minBuyout.toNumber()) /
                item.marketValue.toNumber()) *
              1000,

            profitMarginVsHistorical:
              ((item.historical.toNumber() - item.minBuyout.toNumber()) /
                item.historical.toNumber()) *
              1000,
            marketToHistoricalRatio:
              item.marketValue.toNumber() / item.historical.toNumber(),
            flippingScore: calculateFlippingScore(
              item.marketValue.toNumber(),
              item.historical.toNumber(),
              item.minBuyout.toNumber(),
              item.quantity
            ),
          }));
          return customisedPricingData;
        },
        {
          params: t.Object({
            auctionHouseId: t.Number(),
          }),
        }
      )
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
