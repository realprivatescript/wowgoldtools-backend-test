import { prisma } from "../db/db";
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

  await prisma.saddle_data_items.createMany({
    data: saddleArray.map((item) => ({
      itemID: item.itemID,
      itemName: item.itemName,
      itemQuality: item.itemQuality,
      itemClass: item.item_class,
      itemSubClass: item.item_subclass,
    })),
    skipDuplicates: true,
  });
};
