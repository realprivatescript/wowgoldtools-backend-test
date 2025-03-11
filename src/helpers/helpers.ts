import { prisma } from "../db/db";
import { BATCH_SIZE, limit } from "../globals/globals";
import { SaddleItemDTO } from "../models/models";

export const fetchTokenTradeSkillMasterUnlimited = async () => {
  const clientId = process.env.TSM_UNLIMITED_CLIENT_ID!;
  const clientSecret = process.env.TSM_UNLIMITED_CLIENT_SECRET!;
  const tokenUrl =
    "https://id.tradeskillmaster.com/realms/app/protocol/openid-connect/token";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch token of TradeSkillMaster");
    }

    const tokenData = await response.json();
    return tokenData;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const fetchTokenBlizz = async () => {
  const clientId = process.env.BLIZZ_CLIENT_ID;
  const clientSecret = process.env.BLIZZ_CLIENT_SECRET;
  const region = "eu"; // eu here is just for token generation, this still allows for fetching US and EU data
  const tokenUrl = `https://${region}.battle.net/oauth/token`;

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      return {
        error:
          "Error fetching Blizz Token Data. Verify that your client ID and client secret are correct and/or wait a few hours.",
      };
    }

    const tokenData = await response.json();
    return tokenData;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const fetchSaddleData = async () => {
  try {
    const response = await fetch(
      "http://api.saddlebagexchange.com/api/wow/itemdata",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ilvl: 1,
          itemQuality: -1,
          required_level: -1,
          item_class: [-1],
          item_subclass: [-1],
        }),
      }
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching Saddlebag data:", error);
    return null;
  }
};

export const saveSaddleDataToDB = async (): Promise<void> => {
  const saddleData: Record<string, SaddleItemDTO> = await fetchSaddleData();
  const saddleArray: SaddleItemDTO[] = Object.values(saddleData);

  for (let i = 0; i < saddleArray.length; i += BATCH_SIZE) {
    const batch = saddleArray.slice(i, i + BATCH_SIZE);

    await prisma.saddle_data_items.createMany({
      data: batch.map((item) => ({
        itemID: item.itemID,
        itemName: item.itemName,
        itemQuality: item.itemQuality,
        itemClass: item.item_class,
        itemSubClass: item.item_subclass,
      })),
      skipDuplicates: true,
    });
  }
};

export const saveToDatabaseTSMClassicDataFromAllAuctionHouses = async (
  tsmToken: string,
  blizzToken: string
) => {
  const saddleData = await prisma.saddle_data_items.findMany();

  // Fetch all regions
  const allRegions = await fetch(
    `https://realm-api.tradeskillmaster.com/regions`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tsmToken}`,
        "Content-Type": "application/json",
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items);

  // Filter regions (EU/US & non-Retail)
  const filteredRegions = allRegions.filter(
    (region: {
      regionId: number;
      regionPrefix: string;
      gameVersion: string;
      lastModified: number;
    }) =>
      (region.regionPrefix === "eu" || region.regionPrefix === "us") &&
      region.gameVersion !== "Retail"
  );

  // Fetch all realms for the filtered regions
  const allRealms = await Promise.all(
    filteredRegions.map(
      async (region: {
        regionId: number;
        regionPrefix: string;
        gameVersion: string;
        lastModified: number;
      }) => {
        const res = await fetch(
          `https://realm-api.tradeskillmaster.com/regions/${region.regionId}/realms`,
          { headers: { Authorization: `Bearer ${tsmToken}` } }
        );
        const data = await res.json();
        return data.items.map(
          (realm: {
            realmId: number;
            regionId: number;
            name: string;
            localizedName: string;
            locale: string;
            auctionHouses: {
              auctionHouseId: number;
              type: string;
              lastModified: number;
            }[];
          }) => ({
            ...realm,
            regionPrefix: region.regionPrefix,
            gameVersion: region.gameVersion,
          })
        );
      }
    )
  ).then((realms) => realms.flat());

  // Fetch all auction house pricing data
  const allPricingData = await Promise.all(
    allRealms.flatMap((realm) =>
      realm.auctionHouses.map(
        async (ah: {
          auctionHouseId: number;
          type: string;
          lastModified: number;
        }) => {
          const res = await fetch(
            `https://pricing-api.tradeskillmaster.com/ah/${ah.auctionHouseId}`,
            {
              headers: { Authorization: `Bearer ${tsmToken}` },
            }
          );

          const pricing = await res.json();

          return pricing.map(
            (item: {
              auctionHouseId: number;
              itemId: number;
              petSpeciesId: number | null; // petSpeciesId can either be a number or null
              minBuyout: number;
              quantity: number;
              marketValue: number;
              historical: number;
              numAuctions: number;
              name: string;
              regionId: number;
              realmId: number;
              regionPrefix: string;
              gameVersion: string;
              lastModified: number; // Unix timestamp
              type: string;
            }) => ({
              ...item,
              name: realm.name,
              regionId: realm.regionId,
              realmId: realm.realmId,
              regionPrefix: realm.regionPrefix,
              gameVersion: realm.gameVersion,
              lastModified: ah.lastModified,
              type: ah.type,
            })
          );
        }
      )
    )
  ).then((data) => data.flat().filter(Boolean));

  // Filter and sort pricing data
  const filteredAllPricingData = allPricingData
    .filter((auction) => auction.marketValue > 0 && auction.historical > 0)
    .sort((a, b) =>
      a.regionId === b.regionId
        ? a.realmId - b.realmId
        : a.regionId - b.regionId
    );

  // Filter out auction houses with low item count
  const filteredAllPricingDataHighCount = (() => {
    const counts = filteredAllPricingData.reduce((acc, { auctionHouseId }) => {
      acc[auctionHouseId] = (acc[auctionHouseId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return filteredAllPricingData.filter(
      ({ auctionHouseId }) => counts[auctionHouseId] >= 5000
    );
  })();

  // Get unique item IDs for media fetch
  const uniqueItemIds = [
    ...new Set(
      filteredAllPricingDataHighCount.map((auction) => auction.itemId)
    ),
  ];

  // Fetch existing item media
  const findAllItemMediaCaches = await prisma.item_media_caches.findMany();
  const itemMediaCachesIds = new Set(
    findAllItemMediaCaches.map((item) => item.itemId)
  );
  const itemIdsToFetch = uniqueItemIds.filter(
    (itemId) => !itemMediaCachesIds.has(itemId)
  );

  // Fetch missing media data
  const fetchItemMedia = async (itemId: number) => {
    const res = await fetch(
      `https://us.api.blizzard.com/data/wow/media/item/${itemId}?namespace=static-us&locale=en_US`,
      {
        headers: { Authorization: `Bearer ${blizzToken}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.assets?.[0]?.value
      ? { itemId, itemMediaUrl: data.assets[0].value }
      : null;
  };

  const newMediaData = await Promise.all(
    itemIdsToFetch.map((id) => fetchItemMedia(id))
  ).then((results) => results.filter((item) => item !== null));

  // Save new media data
  for (let i = 0; i < newMediaData.length; i += BATCH_SIZE) {
    const batch = newMediaData.slice(i, i + BATCH_SIZE);
    await prisma.item_media_caches.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }

  // Merge new and existing media caches
  const allMediaCaches = [...findAllItemMediaCaches, ...newMediaData];

  // Merge pricing data with media
  const filteredAllPricingDataHighCountWithItemMedia =
    filteredAllPricingDataHighCount
      .map((auctionItem) => {
        const mediaItem = allMediaCaches.find(
          (media) => media.itemId === auctionItem.itemId
        );
        return {
          ...auctionItem,
          itemMediaUrl: mediaItem?.itemMediaUrl || null,
        };
      })
      .filter((item) => item.itemMediaUrl !== null);

  // Merge with saddle data
  const filteredAllPricingDataHighCountWithItemMediaAndSaddleData =
    filteredAllPricingDataHighCountWithItemMedia
      .map((auctionItem) => {
        const saddleItem = saddleData.find(
          (s) => s.itemID === auctionItem.itemId
        );
        return saddleItem
          ? {
              ...auctionItem,
              itemName: saddleItem.itemName,
              itemQuality: saddleItem.itemQuality,
              itemClass: saddleItem.itemClass,
              itemSubClass: saddleItem.itemSubClass,
            }
          : null;
      })
      .filter((item) => item !== null);

  // Save data to the database with batching
  for (
    let i = 0;
    i < filteredAllPricingDataHighCountWithItemMediaAndSaddleData.length;
    i += BATCH_SIZE
  ) {
    const batch =
      filteredAllPricingDataHighCountWithItemMediaAndSaddleData.slice(
        i,
        i + BATCH_SIZE
      );
    await prisma.extended_auction_data_items.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }

  // Trigger garbage collection if available
  if (global.gc) {
    global.gc();
    console.log("Garbage collection triggered.");
  }
};

export function calculateFlippingScore(
  marketValue: number,
  historical: number,
  minBuyout: number,
  quantity: number
) {
  // Calculate the price proximity score (how close marketValue is to historical)
  const priceProximityScore =
    1 - Math.abs(marketValue - historical) / marketValue;

  // Normalize the price proximity score to 0-999 range
  const normalizedPriceProximityScore = Math.min(
    Math.max(priceProximityScore * 999, 0),
    999
  );

  // Calculate the potential gold earned per unit
  const goldEarned = (marketValue - minBuyout) * quantity;

  // Normalize gold earned to 0-999 range
  const normalizedGoldEarnedScore = Math.min(
    Math.max(goldEarned / 1000, 0),
    999
  ); // Adjust the divisor as needed for scaling

  // We can combine these scores by giving them weights
  const weightPrice = 0.7; // Price proximity score weight (60% of the final score)
  const weightGold = 0.3; // Gold earned score weight (40% of the final score)

  // Calculate final flipping score
  const flippingScore = Math.round(
    normalizedPriceProximityScore * weightPrice +
      normalizedGoldEarnedScore * weightGold
  );

  return flippingScore;
}
