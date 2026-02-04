type What3WordsResponse = {
  words?: string;
  error?: { code: string; message: string };
};

export async function convertTo3wa(lat: number, lng: number): Promise<string | null> {
  const apiKey = process.env.WHAT3WORDS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const coords = `${lat},${lng}`;
  const url = new URL("https://api.what3words.com/v3/convert-to-3wa");
  url.searchParams.set("coordinates", coords);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as What3WordsResponse;
  if (data.error) {
    return null;
  }

  return data.words ?? null;
}
