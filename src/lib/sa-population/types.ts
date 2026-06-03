export type CensusPlace = {
  id: string;
  name: string;
  seat: string;
  province: string;
  population: number;
  level: "metro" | "district" | "local";
  aliases: string[];
};

export type CensusPlaceResult = CensusPlace & {
  label: string;
};
