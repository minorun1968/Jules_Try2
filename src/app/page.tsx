"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, LoadScriptNext } from '@react-google-maps/api';
import { DeckGL } from '@deck.gl/react'; // DeckGL component itself
import { IconLayer } from '@deck.gl/layers'; // IconLayer
import { MapProvider } from 'react-map-gl';

// Aircraft data interfaces (already defined in previous version, ensure they are present)
interface AircraftData {
  icao24: string;
  callsign?: string;
  origin_country: string;
  time_position?: number;
  last_contact: number;
  longitude?: number;
  latitude?: number;
  baro_altitude?: number;
  on_ground: boolean;
  velocity?: number;
  true_track?: number; // Angle in degrees clockwise from North
  vertical_rate?: number;
  sensors?: number[];
  geo_altitude?: number;
  squawk?: string;
  spi: boolean;
  position_source: number;
  category: number;
}

interface StateVector {
  0: string; // icao24
  1: string | null; // callsign
  2: string; // origin_country
  3: number | null; // time_position
  4: number; // last_contact
  5: number | null; // longitude
  6: number | null; // latitude
  7: number | null; // baro_altitude
  8: boolean; // on_ground
  9: number | null; // velocity
  10: number | null; // true_track
  11: number | null; // vertical_rate
  12: number[] | null; // sensors
  13: number | null; // geo_altitude
  14: string | null; // squawk
  15: boolean; // spi
  16: number; // position_source
  17?: number; // category
}

const mapContainerStyle = {
  width: '100vw',
  height: '100vh',
};

const initialCenter = {
  lat: 35.681236, // Tokyo Station
  lng: 139.767125,
};

const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
];

const PLANE_ICON_URL = '/plane-icon.png'; // Assuming plane-icon.png is in public folder

const HomePage: React.FC = () => {
  const [aircraftData, setAircraftData] = useState<AircraftData[]>([]);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const deckRef = useRef<DeckGL>(null);

  const API_KEY = process.env.NEXT_PUBLIC_Maps_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: API_KEY || '',
    libraries: ['maps'], // Ensure 'maps' is included
  });

  const fetchData = useCallback(async (currentMap: google.maps.Map | null) => {
    if (!currentMap) return;

    const currentZoom = currentMap.getZoom();
    if (currentZoom === undefined || currentZoom < 7) {
      setAircraftData([]);
      // console.log('Zoom level too low or undefined, clearing aircraft data.');
      return;
    }

    const bounds = currentMap.getBounds();
    if (!bounds) {
      // console.log('Map bounds not available, skipping fetch.');
      return;
    }

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const mapBounds = {
      lamin: sw.lat(),
      lomin: sw.lng(),
      lamax: ne.lat(),
      lomax: ne.lng(),
    };

    // console.log(`Fetching data for bounds: ${JSON.stringify(mapBounds)}, zoom: ${currentZoom}`);
    try {
      const response = await fetch(`/api/states?lamin=${mapBounds.lamin}&lomin=${mapBounds.lomin}&lamax=${mapBounds.lamax}&lomax=${mapBounds.lomax}`);
      if (!response.ok) {
        console.error('Failed to fetch aircraft data:', response.statusText);
        setAircraftData([]);
        return;
      }
      const data = await response.json();
      const formattedData: AircraftData[] = (data.states || [])
        .filter((state: StateVector) => state[5] !== null && state[6] !== null && state[5] !== undefined && state[6] !== undefined)
        .map((state: StateVector) => ({
          icao24: state[0],
          callsign: state[1] ?? undefined,
          origin_country: state[2],
          time_position: state[3] ?? undefined,
          last_contact: state[4],
          longitude: state[5] as number,
          latitude: state[6] as number,
          baro_altitude: state[7] ?? undefined,
          on_ground: state[8],
          velocity: state[9] ?? undefined,
          true_track: state[10] ?? 0, // Default to 0 if null for rotation
          vertical_rate: state[11] ?? undefined,
          sensors: state[12] ?? undefined,
          geo_altitude: state[13] ?? undefined,
          squawk: state[14] ?? undefined,
          spi: state[15],
          position_source: state[16],
          category: state[17] ?? 0,
        }));
      setAircraftData(formattedData);
      // console.log('Fetched aircraft data:', formattedData.length, 'aircraft');
    } catch (error) {
      console.error('Error fetching aircraft data:', error);
      setAircraftData([]);
    }
  }, []);

  const onMapLoad = useCallback((currentMap: google.maps.Map) => {
    setMap(currentMap);
    fetchData(currentMap); // Initial fetch
  }, [fetchData]);

  const onMapIdle = useCallback(() => {
    if (map) {
      fetchData(map);
    }
  }, [map, fetchData]);

  const [viewState, setViewState] = useState({
    longitude: initialCenter.lng,
    latitude: initialCenter.lat,
    zoom: 7,
    pitch: 0,
    bearing: 0
  });

  useEffect(() => {
    if (map) {
      const listener = map.addListener('bounds_changed', () => {
        const newZoom = map.getZoom();
        const newCenter = map.getCenter();
        if (newZoom !== undefined && newCenter) {
            setViewState({
                longitude: newCenter.lng(),
                latitude: newCenter.lat(),
                zoom: newZoom,
                pitch: 0,
                bearing: 0
            });
        }
      });
      // @ts-ignore
      return () => google.maps.event.removeListener(listener);
    }
  }, [map]);


  const layers = [
    new IconLayer<AircraftData>({
      id: 'icon-layer',
      data: aircraftData,
      pickable: true,
      iconAtlas: PLANE_ICON_URL,
      iconMapping: {
        airplane: { x: 0, y: 0, width: 128, height: 128, mask: true }, // mask: true if using a simple icon you want to color
      },
      getIcon: () => 'airplane',
      sizeScale: 15,
      getPosition: d => [d.longitude || 0, d.latitude || 0, d.baro_altitude || 0],
      getSize: d => d.on_ground ? 10 : 20,
      getColor: d => d.on_ground ? [255,0,0, 200] : [0,255,0, 200],
      getAngle: d => -(d.true_track || 0) + 90,
      // billboard: false, // Removed for now, default is true (icons face camera)
    }),
  ];

  if (loadError) {
    return <div>Error loading maps: {loadError.message} <p>Please ensure your Google Maps API key is correctly configured in .env.local (NEXT_PUBLIC_Maps_API_KEY).</p></div>;
  }

  if (!isLoaded || !API_KEY) {
    return <div>Loading Maps... <p>If this takes too long, ensure your Google Maps API key is set in .env.local (NEXT_PUBLIC_Maps_API_KEY).</p></div>;
  }

  return (
    <MapProvider>
      <DeckGL
        ref={deckRef}
        layers={layers}
        initialViewState={viewState} // Use the initial view state
        viewState={viewState} // Control the view state
        controller={false} // Google Maps will control the view
        style={{ mixBlendMode: 'normal' }} // Changed to normal, overlay can have issues
        // onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState)} // Sync back to React state if DeckGL interactions are enabled
      >
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          // center and zoom are now controlled by viewState effectively, but set initially
          center={initialCenter}
          zoom={viewState.zoom}
          options={{
            styles: darkMapStyle,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            zoomControl: true,
          }}
          onLoad={onMapLoad}
          onIdle={onMapIdle}
          // Sync Google map changes to DeckGL viewState
          onBoundsChanged={() => {
            if (map) {
              const newZoom = map.getZoom();
              const newCenter = map.getCenter();
              if (newZoom !== undefined && newCenter) {
                setViewState({
                  longitude: newCenter.lng(),
                  latitude: newCenter.lat(),
                  zoom: newZoom,
                  pitch: 0, // map.getTilt() if needed
                  bearing: 0 // map.getHeading() if needed
                });
              }
            }
          }}
        >
        </GoogleMap>
      </DeckGL>
    </MapProvider>
  );
};

export default HomePage;
