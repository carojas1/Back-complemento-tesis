// Routes of the public ARASAAC API (https://arasaac.org/developers): search, details and image of a pictogram.
export const arasaacApi = {
  baseUrl: 'https://api.arasaac.org/v1',
  search: (query: string) => `/pictograms/es/search/${encodeURIComponent(query)}`,
  pictogram: (id: number) => `/pictograms/es/${id}`,
};
export const arasaacStatic = {
  baseUrl: 'https://static.arasaac.org',
  image: (id: number, size: 300 | 500) => `/pictograms/${id}/${id}_${size}.png`,
};
