import {
  fetchTokenBlizz,
  fetchTokenTradeSkillMasterUnlimited,
} from "../helpers/helpers";

export async function loadInitialState() {
  const [tsmTokenData, blizzTokenData] = await Promise.all([
    fetchTokenTradeSkillMasterUnlimited(),
    fetchTokenBlizz(),
  ]).catch((err) => {
    console.log(err);
    return [null, null]; // Return default values if both promises fail
  });

  if (!tsmTokenData) {
    throw "Error fetching tsmTokenData";
  }

  if (!blizzTokenData) {
    throw "Error fetching blizzTokenData";
  }

  return {
    tsmToken: tsmTokenData.access_token,
    blizzToken: blizzTokenData.access_token,
  };
}
