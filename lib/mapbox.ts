type StaticMapOptions = {
  lat: number;
  lng: number;
  token: string;
  zoom?: number;
  width?: number;
  height?: number;
  styleId?: string;
  markerColor?: string;
};

export function buildStaticMapUrl({
  lat,
  lng,
  token,
  zoom = 13,
  width = 640,
  height = 360,
  styleId = "mapbox/streets-v12",
  markerColor = "22c55e"
}: StaticMapOptions) {
  const safeLat = Number(lat.toFixed(6));
  const safeLng = Number(lng.toFixed(6));
  const overlay = `pin-s+${markerColor}(${safeLng},${safeLat})`;
  const encodedOverlay = encodeURIComponent(overlay);
  const center = `${safeLng},${safeLat},${zoom}`;
  return `https://api.mapbox.com/styles/v1/${styleId}/static/${encodedOverlay}/${center}/${width}x${height}?access_token=${token}`;
}
